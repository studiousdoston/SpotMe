"""Push-up counting and depth grading, adapted from notebooks/03 (pushup_signals, count_pushups, 3.14).

Counting uses the notebook's shoulder-height signal in every view. Depth is graded from the
front only, with the smallest elbow angle around each rep's bottom.

Intentional changes from the notebook (approved):
- Reps are counted with the height signal only. The notebook also counted elbow-angle dips (>= 25°)
  as a cross-check, but a half rep can bend the elbows only ~16°, so the angle would miss it.
- Depth uses the MORE-BENT arm (min of left/right, visible arms only). The notebook averaged both
  arms; on a real recording one arm alone read 92° on a rep the other arm took to 80°.
- The arm-length median window is 2 s (the notebook's 60 frames at 30 fps), so it stays the same
  duration at other frame rates.
- View zones are the same as curls: front (count + grade), turned (count + grade + warning),
  side (count only, depth not graded).
"""

from typing import Literal

import numpy as np
import pandas as pd

from analysis.curl import (
    FRONT_VIEW_MAX_ANGLE,
    LEFT_ARM,
    RIGHT_ARM,
    TURNED_VIEW_MAX_ANGLE,
    ArmLandmarks,
    arm_visibility,
    body_turn_angle,
    landmark_pixels,
)
from analysis.reps import count_reps_peaks
from analysis.timeline import LandmarkTimeline, build_time_series, describe_incomplete_recording
from schemas import Feedback, PushupAnalyzeResponse, PushupRepResult

# ---- Counting constants (notebook 3.11 / 3.13) ----

# Both arms averaged when both are seen this well (shoulder, elbow, wrist); else the better arm.
BOTH_ARMS_MIN_VISIBILITY = 0.6
# Arm length = rolling median over ~2 s, so one bad frame doesn't change the scale.
ARM_LENGTH_MEDIAN_SECONDS = 2.0
# Smoothed over a fixed 5 frames (not a duration), like the notebook.
SIGNAL_SMOOTHING_FRAMES = 5
# v2 counter: a dip of >= 0.1 arm lengths is a push-up, reps at least 0.5 s apart.
MIN_DIP_ARM_LENGTHS = 0.1
MIN_GAP_SECONDS = 0.5

# ---- Depth grading constants (notebook 3.14) ----

# Only arms whose elbow + wrist are seen at least this well are used for the elbow angle.
MIN_GRADING_ARM_VISIBILITY = 0.5
# The smallest elbow angle within ±0.3 s of each bottom is the rep's depth.
BOTTOM_WINDOW_SECONDS = 0.3
# Elbow angle <= 90° at the bottom = good depth.
GOOD_DEPTH_MAX_ANGLE = 90

# ---- Messages and feedback ----

LOW_VISIBILITY_MESSAGE = "Keep your shoulders and arms in view of the camera"
SIDE_VIEW_WARNING = "Film from the front to get depth feedback."
TURNED_WARNING = "Turn the camera to face you for more accurate depth feedback"

GOOD_DEPTH = Feedback(code="good_depth", text="Good depth")
TOO_SHALLOW = Feedback(code="too_shallow", text="Too shallow, bend your elbows to 90°")
NOT_GRADED = Feedback(code="not_graded", text="Depth not graded (side view)")


def depth_grade(bottom_elbow_angle: float) -> Feedback:
    """Notebook's push-up cutoff: the elbows must bend to 90° or less."""
    return GOOD_DEPTH if bottom_elbow_angle <= GOOD_DEPTH_MAX_ANGLE else TOO_SHALLOW


# ---- Signals ----


def smooth(signal: pd.Series) -> np.ndarray:
    """Notebook clean-up: fill missing frames from neighbours, then a centered 5-frame rolling mean."""
    filled_signal = signal.interpolate(limit_direction="both")
    return filled_signal.rolling(SIGNAL_SMOOTHING_FRAMES, center=True, min_periods=1).mean().to_numpy()


def full_arm_visibility(landmarks: pd.DataFrame, arm: ArmLandmarks) -> float:
    """Notebook's arm_signals visibility: mean over frames of min(shoulder, elbow, wrist) visibility."""
    visibility_columns = [f"{arm.shoulder}_vis", f"{arm.elbow}_vis", f"{arm.wrist}_vis"]
    visibility = landmarks[visibility_columns].min(axis=1).mean()
    # No frame with a person at all: NaN, treated as 0 (hidden).
    return float(visibility) if pd.notna(visibility) else 0.0


def shoulder_height(
    landmarks: pd.DataFrame, arm: ArmLandmarks, fps: float, video_width: int, video_height: int
) -> pd.Series:
    """Notebook's shoulder_above_wrist: how far the shoulder is above the wrist, in arm lengths.

    Arm length = shoulder→elbow + elbow→wrist in pixels (rolling median), so the signal works
    from any angle. It drops towards 0 as the chest goes down to the floor.
    """

    def pixels(landmark_index: int, axis: str) -> pd.Series:
        return landmark_pixels(landmarks, landmark_index, axis, video_width, video_height)

    arm_length = np.hypot(
        pixels(arm.shoulder, "x") - pixels(arm.elbow, "x"), pixels(arm.shoulder, "y") - pixels(arm.elbow, "y")
    ) + np.hypot(
        pixels(arm.elbow, "x") - pixels(arm.wrist, "x"), pixels(arm.elbow, "y") - pixels(arm.wrist, "y")
    )
    median_window_frames = max(round(ARM_LENGTH_MEDIAN_SECONDS * fps), 1)
    typical_arm_length = arm_length.rolling(median_window_frames, center=True, min_periods=1).median()
    return (pixels(arm.wrist, "y") - pixels(arm.shoulder, "y")) / typical_arm_length


def body_height_signal(
    landmarks: pd.DataFrame, fps: float, video_width: int, video_height: int
) -> np.ndarray:
    """Notebook's pushup_signals (height part): both arms averaged, or only the better-seen arm."""
    left_visibility = full_arm_visibility(landmarks, LEFT_ARM)
    right_visibility = full_arm_visibility(landmarks, RIGHT_ARM)
    left_height = shoulder_height(landmarks, LEFT_ARM, fps, video_width, video_height)
    right_height = shoulder_height(landmarks, RIGHT_ARM, fps, video_width, video_height)
    if min(left_visibility, right_visibility) > BOTH_ARMS_MIN_VISIBILITY:
        return smooth((left_height + right_height) / 2)
    return smooth(left_height if left_visibility >= right_visibility else right_height)


def elbow_angle(landmarks: pd.DataFrame, arm: ArmLandmarks, video_width: int, video_height: int) -> pd.Series:
    """Notebook's elbow_angle: angle between upper arm and forearm in pixels (180° = straight arm)."""

    def pixels(landmark_index: int, axis: str) -> pd.Series:
        return landmark_pixels(landmarks, landmark_index, axis, video_width, video_height)

    upper_arm_x = pixels(arm.shoulder, "x") - pixels(arm.elbow, "x")
    upper_arm_y = pixels(arm.shoulder, "y") - pixels(arm.elbow, "y")
    forearm_x = pixels(arm.wrist, "x") - pixels(arm.elbow, "x")
    forearm_y = pixels(arm.wrist, "y") - pixels(arm.elbow, "y")
    cosine = (upper_arm_x * forearm_x + upper_arm_y * forearm_y) / (
        np.hypot(upper_arm_x, upper_arm_y) * np.hypot(forearm_x, forearm_y) + 1e-8
    )
    return pd.Series(np.degrees(np.arccos(np.clip(cosine.to_numpy(), -1, 1))), index=landmarks.index)


def grading_arms(landmarks: pd.DataFrame) -> list[ArmLandmarks]:
    """Arms whose elbow and wrist are visible enough to measure the elbow angle."""
    return [
        arm for arm in (LEFT_ARM, RIGHT_ARM) if arm_visibility(landmarks, arm) >= MIN_GRADING_ARM_VISIBILITY
    ]


def more_bent_elbow_angle(
    landmarks: pd.DataFrame, arms: list[ArmLandmarks], video_width: int, video_height: int
) -> np.ndarray:
    """Per frame, the smaller (more bent) of the given arms' smoothed elbow angles."""
    smoothed_angles = [smooth(elbow_angle(landmarks, arm, video_width, video_height)) for arm in arms]
    return np.fmin.reduce(smoothed_angles)


def bottom_elbow_angle(more_bent_angle: np.ndarray, bottom_index: int, fps: float) -> float:
    """Notebook 3.14: the smallest elbow angle within ±0.3 s of the rep's bottom."""
    window_frames = int(fps * BOTTOM_WINDOW_SECONDS)
    nearby_angles = more_bent_angle[max(bottom_index - window_frames, 0) : bottom_index + window_frames + 1]
    return float(np.min(nearby_angles))


# ---- Full analysis ----


def counted_message(rep_count: int) -> str:
    """'7 push-ups' / '1 push-up'."""
    return f"{rep_count} push-up{'' if rep_count == 1 else 's'}"


def analyze_pushup(timeline: LandmarkTimeline, video_width: int, video_height: int) -> PushupAnalyzeResponse:
    """Count push-ups by body height in any view; grade depth by the elbows when filmed from the front."""
    landmarks = timeline.landmarks
    turn_angle = body_turn_angle(landmarks)
    arms_for_grading = grading_arms(landmarks)

    def not_counted(
        status: Literal["low_visibility", "incomplete_recording"], message: str
    ) -> PushupAnalyzeResponse:
        return PushupAnalyzeResponse(
            exercise="push_up",
            status=status,
            message=message,
            warnings=[],
            body_turn_angle=turn_angle,
            depth_graded=False,
            rep_count=0,
            fps=timeline.fps,
            reps=[],
            body_height_signal=None,
            elbow_angle_signal=None,
        )

    # Part of the video has no frames: don't bridge the gap, ask for a re-run.
    if timeline.long_gaps:
        return not_counted("incomplete_recording", describe_incomplete_recording(timeline.long_gaps))

    # Shoulders never seen, or no arm (elbow + wrist) seen: nothing to count.
    if turn_angle is None or not arms_for_grading:
        return not_counted("low_visibility", LOW_VISIBILITY_MESSAGE)

    # Side view: arms overlap, so the elbow angle can't be read. Count, but don't grade depth.
    depth_graded = turn_angle <= TURNED_VIEW_MAX_ANGLE
    warnings: list[str] = []
    if not depth_graded:
        warnings.append(SIDE_VIEW_WARNING)
    elif turn_angle > FRONT_VIEW_MAX_ANGLE:
        warnings.append(TURNED_WARNING)

    # Count: each dip in body height is one push-up (negated, so dips become peaks).
    height = body_height_signal(landmarks, timeline.fps, video_width, video_height)
    detected_reps = count_reps_peaks(
        -height,
        timeline.fps,
        min_drop=MIN_DIP_ARM_LENGTHS,
        min_gap_seconds=MIN_GAP_SECONDS,
        min_rep_seconds=0.0,
    )

    more_bent_angle = (
        more_bent_elbow_angle(landmarks, arms_for_grading, video_width, video_height)
        if depth_graded
        else None
    )
    rep_results: list[PushupRepResult] = []
    for rep_number, detected_rep in enumerate(detected_reps, start=1):
        rep_bottom_angle = (
            None
            if more_bent_angle is None
            else bottom_elbow_angle(more_bent_angle, detected_rep.peak_index, timeline.fps)
        )
        rep_results.append(
            PushupRepResult(
                rep_number=rep_number,
                start_seconds=timeline.slot_time_seconds(detected_rep.start_index),
                bottom_seconds=timeline.slot_time_seconds(detected_rep.peak_index),
                end_seconds=timeline.slot_time_seconds(detected_rep.end_index),
                bottom_elbow_angle=rep_bottom_angle,
                depth_feedback=NOT_GRADED if rep_bottom_angle is None else depth_grade(rep_bottom_angle),
            )
        )

    return PushupAnalyzeResponse(
        exercise="push_up",
        status="ok",
        message=counted_message(len(rep_results)),
        warnings=warnings,
        body_turn_angle=turn_angle,
        depth_graded=depth_graded,
        rep_count=len(rep_results),
        fps=timeline.fps,
        reps=rep_results,
        body_height_signal=build_time_series(timeline, height),
        elbow_angle_signal=None if more_bent_angle is None else build_time_series(timeline, more_bent_angle),
    )
