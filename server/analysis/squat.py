"""Squat counting and grading, ported from notebooks/01 with the same formulas and thresholds."""

import math

import numpy as np
import pandas as pd

from analysis.reps import count_reps_peaks, find_rep_bottom_index, measure_rep_tempo
from analysis.timeline import LandmarkTimeline
from schemas import AnalyzeResponse, DepthSignal, Feedback, RepResult

# ---- Notebook constants ----
# Shoulders, hips, knees: all must be seen for a frame to count as trusted.
TRUSTED_LANDMARKS = (11, 12, 23, 24, 25, 26)
MIN_LANDMARK_VISIBILITY = 0.3
MIN_TRUSTED_FRAMES = 10
MIN_TRUSTED = 0.30

TORSO_WINDOW_SECONDS = 4.0
SMOOTHING_SECONDS = 0.17
MIN_SMOOTHING_FRAMES = 3

LOW_VISIBILITY_MESSAGE = "Step back so your whole body (hips and knees) is visible."

# ---- Feedback (stable codes + text; the notebook's wording without emoji) ----

GOOD_DEPTH = Feedback(code="good_depth", text="Good depth")
ALMOST_DEPTH = Feedback(code="almost_depth", text="Almost, go a little lower")
TOO_SHALLOW = Feedback(code="too_shallow", text="Too shallow, go lower")

TOO_FAST = Feedback(code="too_fast", text="Too fast, slow the whole rep down")
DROPPING_TOO_FAST = Feedback(code="dropping_too_fast", text="Dropping too fast, control the way down")
CONTROLLED = Feedback(code="controlled", text="Controlled")


def depth_grade(bottom_depth: float) -> Feedback:
    """Notebook's depth_grade: 0.9+ = hips at knee height, 0.6+ = close."""
    if bottom_depth >= 0.9:
        return GOOD_DEPTH
    if bottom_depth >= 0.6:
        return ALMOST_DEPTH
    return TOO_SHALLOW


def tempo_grade(down_seconds: float, total_seconds: float) -> Feedback:
    """Notebook's tempo_grade."""
    if total_seconds < 1.0:
        return TOO_FAST
    if down_seconds < 0.7:
        return DROPPING_TOO_FAST
    return CONTROLLED


# ---- Depth signal ----


def squat_depth(
    landmarks: pd.DataFrame, video_width: int, video_height: int, fps: float
) -> tuple[np.ndarray | None, float]:
    """Notebook's squat_depth: 0 = standing, ~1 = hips at knee height.

    Returns (depth per frame, share of trusted frames). Depth is None when fewer
    than MIN_TRUSTED_FRAMES frames can be trusted.
    """

    def to_pixels(landmark_index: int, axis: str) -> pd.Series:
        scale = video_width if axis == "x" else video_height
        return landmarks[f"{landmark_index}_{axis}"] * scale

    # Middle of the shoulders, hips and knees, in pixels.
    shoulder_x = (to_pixels(11, "x") + to_pixels(12, "x")) / 2
    shoulder_y = (to_pixels(11, "y") + to_pixels(12, "y")) / 2
    hip_x = (to_pixels(23, "x") + to_pixels(24, "x")) / 2
    hip_y = (to_pixels(23, "y") + to_pixels(24, "y")) / 2
    knee_y = (to_pixels(25, "y") + to_pixels(26, "y")) / 2

    body_parts = pd.DataFrame(
        {"hip_y": hip_y, "knee_y": knee_y, "torso": np.hypot(shoulder_x - hip_x, shoulder_y - hip_y)}
    )

    # Trusted = every key landmark is reasonably visible (NaN rows are never trusted).
    visibility_columns = [f"{landmark_index}_vis" for landmark_index in TRUSTED_LANDMARKS]
    is_trusted = landmarks[visibility_columns].min(axis=1) > MIN_LANDMARK_VISIBILITY
    trusted_fraction = float(is_trusted.mean())
    if is_trusted.sum() < MIN_TRUSTED_FRAMES:
        return None, trusted_fraction

    # Blank untrusted frames and fill them from their neighbours.
    body_parts = body_parts.where(is_trusted).interpolate(limit_direction="both")

    # Torso length as a slow-moving ruler (4 s rolling median), then depth smoothed over ~0.17 s.
    torso_window_frames = max(int(fps * TORSO_WINDOW_SECONDS), 1)
    torso_length = body_parts["torso"].rolling(torso_window_frames, center=True, min_periods=1).median()
    smoothing_frames = max(MIN_SMOOTHING_FRAMES, round(fps * SMOOTHING_SECONDS))
    depth = (
        (1 - (body_parts["knee_y"] - body_parts["hip_y"]) / torso_length)
        .rolling(smoothing_frames, center=True, min_periods=1)
        .mean()
    )
    return depth.to_numpy(), trusted_fraction


# ---- Full analysis ----


def json_safe(value: float) -> float | None:
    """NaN/inf can't go into JSON; send null instead."""
    return value if math.isfinite(value) else None


def analyze_squat(timeline: LandmarkTimeline, video_width: int, video_height: int) -> AnalyzeResponse:
    """Count squats and grade each rep's depth and tempo (notebook's count_squats + reports)."""
    fps = timeline.fps
    depth, trusted_fraction = squat_depth(timeline.landmarks, video_width, video_height, fps)

    # Not enough of the body visible: no count, ask the user to step back.
    if depth is None or trusted_fraction < MIN_TRUSTED:
        return AnalyzeResponse(
            exercise="squat",
            status="low_visibility",
            message=LOW_VISIBILITY_MESSAGE,
            rep_count=0,
            trusted_fraction=trusted_fraction,
            fps=fps,
            reps=[],
            depth_signal=None,
        )

    # Count, then grade every rep.
    rep_results: list[RepResult] = []
    for rep_number, detected_rep in enumerate(count_reps_peaks(depth, fps), start=1):
        bottom_index = find_rep_bottom_index(depth, detected_rep)
        bottom_depth = float(depth[bottom_index])
        tempo = measure_rep_tempo(depth, bottom_index, fps)
        rep_results.append(
            RepResult(
                rep_number=rep_number,
                start_seconds=timeline.slot_time_seconds(detected_rep.start_index),
                bottom_seconds=timeline.slot_time_seconds(bottom_index),
                end_seconds=timeline.slot_time_seconds(detected_rep.end_index),
                bottom_depth=bottom_depth,
                depth_feedback=depth_grade(bottom_depth),
                down_seconds=tempo.down_seconds,
                up_seconds=tempo.up_seconds,
                tempo_feedback=tempo_grade(tempo.down_seconds, tempo.total_seconds),
            )
        )

    rep_count = len(rep_results)
    return AnalyzeResponse(
        exercise="squat",
        status="ok",
        message=f"{rep_count} squat{'' if rep_count == 1 else 's'} counted",
        rep_count=rep_count,
        trusted_fraction=trusted_fraction,
        fps=fps,
        reps=rep_results,
        depth_signal=DepthSignal(
            times_seconds=[timeline.slot_time_seconds(slot_index) for slot_index in range(len(depth))],
            values=[json_safe(float(depth_value)) for depth_value in depth],
        ),
    )
