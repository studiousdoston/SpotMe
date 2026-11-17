"""Alternating dumbbell curl counting and grading, adapted from notebooks/03.

Each arm is counted on its own: one curl = one rise of the wrist towards the shoulder.

Two intentional changes from the notebook:
- Signal: the notebook used the 2D elbow angle. Filmed from the front, the forearm comes towards
  the camera, so the 2D angle barely changes for partial AND full curls (foreshortening): on a real
  front-view video it missed a rep and graded every partial curl as full. MediaPipe's z was too
  noisy for a 3D angle. Wrist height relative to the shoulder, in upper-arm lengths, stays readable
  from the front (see wrist_height).
- Front-view check: a middle "turned" zone (see FRONT_VIEW_MAX_ANGLE).
"""

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from analysis.reps import count_reps_peaks
from analysis.timeline import LandmarkTimeline, build_time_series, describe_incomplete_recording
from schemas import CurlAnalyzeResponse, CurlArmResult, CurlArms, CurlRepResult, Feedback

# ---- Counting constants ----

# An arm whose elbow/wrist average visibility is below this is "hidden" and not counted.
# Frames where the arm's shoulder, elbow or wrist is seen less well than this are untrusted.
MIN_ARM_VISIBILITY = 0.5
# Upper-arm length = rolling median over ~2 s, so one bad frame doesn't change the scale.
UPPER_ARM_MEDIAN_SECONDS = 2.0
# Smoothed over a fixed 5 frames (not a duration), like the notebook.
SIGNAL_SMOOTHING_FRAMES = 5
# The arm's hanging position = this low percentile of its trusted wrist heights.
HANGING_BASELINE_PERCENTILE = 10
# A curl = a rise of at least 0.4 upper-arm lengths, reps at least 0.8 s apart.
MIN_CURL_RISE = 0.4
MIN_GAP_SECONDS = 0.8
# Curl height >= 70% of the way from hanging to shoulder level = full curl, otherwise partial.
FULL_CURL_MIN_PERCENT = 70

# body_turn_angle: only frames where both shoulders are seen this well are measured.
MIN_SHOULDER_VISIBILITY = 0.5
# Turn angle zones. The notebook used a hard 40° cutoff, but real phone videos measured
# 45–66° while facing roughly front, so 40–65° still counts (with a warning) and only
# more than 65° is rejected.
FRONT_VIEW_MAX_ANGLE = 40
TURNED_VIEW_MAX_ANGLE = 65

# ---- Messages and feedback ----

NOT_FRONT_VIEW_MESSAGE = "Face the camera for curls"
TURNED_WARNING = "Turn to face the camera for more accurate counting"
LOW_VISIBILITY_MESSAGE = "Keep both arms in view of the camera"

FULL_CURL = Feedback(code="full_curl", text="Full curl")
PARTIAL_CURL = Feedback(code="partial_curl", text="Partial curl, squeeze all the way up")


@dataclass(frozen=True)
class ArmLandmarks:
    """MediaPipe landmark indices for one arm."""

    side: str
    shoulder: int
    elbow: int
    wrist: int


LEFT_ARM = ArmLandmarks(side="left", shoulder=11, elbow=13, wrist=15)
RIGHT_ARM = ArmLandmarks(side="right", shoulder=12, elbow=14, wrist=16)


def range_grade(curl_height_percent: float) -> Feedback:
    """Full curl when the wrist rose at least 70% of the way from hanging to shoulder level."""
    return FULL_CURL if curl_height_percent >= FULL_CURL_MIN_PERCENT else PARTIAL_CURL


# ---- Signals ----


def landmark_pixels(
    landmarks: pd.DataFrame, landmark_index: int, axis: str, video_width: int, video_height: int
) -> pd.Series:
    """One landmark coordinate in pixels (MediaPipe gives 0–1 of the frame width or height)."""
    scale = video_width if axis == "x" else video_height
    return landmarks[f"{landmark_index}_{axis}"] * scale


def trusted_arm_frames(landmarks: pd.DataFrame, arm: ArmLandmarks) -> pd.Series:
    """True for frames where the arm's shoulder, elbow and wrist are all seen well enough."""
    arm_visibility_columns = [f"{arm.shoulder}_vis", f"{arm.elbow}_vis", f"{arm.wrist}_vis"]
    return landmarks[arm_visibility_columns].min(axis=1) >= MIN_ARM_VISIBILITY


def wrist_height(
    landmarks: pd.DataFrame, arm: ArmLandmarks, fps: float, video_width: int, video_height: int
) -> pd.Series:
    """Raw wrist height in upper-arm lengths: 0 = wrist at shoulder level, about -1.8 = arm hanging.

    Pixels, because normalized x and y have different scales. Image y grows downwards, so a wrist
    below the shoulder gives a negative value. Untrusted frames are NaN.
    """
    trusted = trusted_arm_frames(landmarks, arm)

    def pixels(landmark_index: int, axis: str) -> pd.Series:
        return landmark_pixels(landmarks, landmark_index, axis, video_width, video_height)

    # Upper arm = shoulder → elbow length, rolling median over trusted frames, gaps filled.
    upper_arm_length = np.hypot(
        pixels(arm.shoulder, "x") - pixels(arm.elbow, "x"),
        pixels(arm.shoulder, "y") - pixels(arm.elbow, "y"),
    ).where(trusted)
    median_window_frames = max(round(UPPER_ARM_MEDIAN_SECONDS * fps), 1)
    typical_upper_arm_length = (
        upper_arm_length.rolling(median_window_frames, center=True, min_periods=1)
        .median()
        .interpolate(limit_direction="both")
    )

    height = (pixels(arm.shoulder, "y") - pixels(arm.wrist, "y")) / typical_upper_arm_length
    return height.where(trusted)


def smoothed_wrist_height(raw_height: pd.Series) -> np.ndarray:
    """Like the notebook's clean-up: fill untrusted frames from neighbours, then a centered 5-frame mean."""
    filled_height = raw_height.interpolate(limit_direction="both")
    return filled_height.rolling(SIGNAL_SMOOTHING_FRAMES, center=True, min_periods=1).mean().to_numpy()


def hanging_baseline(smoothed_height: np.ndarray, trusted: pd.Series) -> float:
    """The arm's hanging height: a low percentile of trusted frames (robust to a few odd dips)."""
    return float(np.percentile(smoothed_height[trusted.to_numpy()], HANGING_BASELINE_PERCENTILE))


def curl_height_percent(peak_height: float, baseline: float) -> float:
    """How far the wrist rose from hanging (0%) to shoulder level (100%), clamped to 0–100."""
    if baseline >= 0:
        # Degenerate: the arm never hung below the shoulder, so there's no range to measure.
        return 0.0
    return float(np.clip((peak_height - baseline) / (0 - baseline) * 100, 0, 100))


def arm_visibility(landmarks: pd.DataFrame, arm: ArmLandmarks) -> float:
    """Notebook: mean over frames of min(elbow, wrist) visibility. Frames with no person are skipped."""
    visibility = landmarks[[f"{arm.elbow}_vis", f"{arm.wrist}_vis"]].min(axis=1).mean()
    # No frame with a person at all: NaN. Treated as 0 so the arm counts as hidden.
    return float(visibility) if pd.notna(visibility) else 0.0


def body_turn_angle(landmarks: pd.DataFrame) -> float | None:
    """Notebook's body_turn_angle: median of atan(|Δz| / |Δx|) between the shoulders, in degrees.

    0° = shoulders square to the camera, 90° = side on. Uses raw normalized x and z (not pixels)
    because MediaPipe's z is in roughly the same units as x. None when the shoulders are never visible.
    """
    shoulders_visible = landmarks[["11_vis", "12_vis"]].min(axis=1) > MIN_SHOULDER_VISIBILITY
    if not shoulders_visible.any():
        return None
    x_difference = (landmarks["11_x"] - landmarks["12_x"]).abs()
    z_difference = (landmarks["11_z"] - landmarks["12_z"]).abs()
    turn_per_frame = np.degrees(np.arctan2(z_difference, x_difference))
    return float(turn_per_frame[shoulders_visible].median())


# ---- Counting ----


def uncounted_arm(visible: bool) -> CurlArmResult:
    """An arm with no count: hidden, or the whole set wasn't counted."""
    return CurlArmResult(
        visible=visible, rep_count=None, reps=[], wrist_height_signal=None, hanging_baseline=None
    )


def count_arm_reps(
    timeline: LandmarkTimeline, arm: ArmLandmarks, video_width: int, video_height: int
) -> CurlArmResult:
    """Every wrist rise of >= 0.4 upper-arm lengths is a curl, graded full/partial by curl height."""
    landmarks = timeline.landmarks
    trusted = trusted_arm_frames(landmarks, arm)
    if arm_visibility(landmarks, arm) < MIN_ARM_VISIBILITY or not trusted.any():
        return uncounted_arm(visible=False)

    height = smoothed_wrist_height(wrist_height(landmarks, arm, timeline.fps, video_width, video_height))
    baseline = hanging_baseline(height, trusted)
    # Peaks of the wrist height = tops of the curls. min_rep_seconds=0: no minimum rep width,
    # like the notebook's find_peaks; reps.py adds the half-height start/end of each rep for the replay.
    detected_reps = count_reps_peaks(
        height,
        timeline.fps,
        min_drop=MIN_CURL_RISE,
        min_gap_seconds=MIN_GAP_SECONDS,
        min_rep_seconds=0.0,
    )

    rep_results: list[CurlRepResult] = []
    for rep_number, detected_rep in enumerate(detected_reps, start=1):
        rep_height_percent = curl_height_percent(float(height[detected_rep.peak_index]), baseline)
        rep_results.append(
            CurlRepResult(
                rep_number=rep_number,
                start_seconds=timeline.slot_time_seconds(detected_rep.start_index),
                peak_seconds=timeline.slot_time_seconds(detected_rep.peak_index),
                end_seconds=timeline.slot_time_seconds(detected_rep.end_index),
                curl_height_percent=rep_height_percent,
                range_feedback=range_grade(rep_height_percent),
            )
        )
    return CurlArmResult(
        visible=True,
        rep_count=len(rep_results),
        reps=rep_results,
        wrist_height_signal=build_time_series(timeline, height),
        hanging_baseline=baseline,
    )


def counted_message(arms: CurlArms) -> str:
    """'Left 5 · Right 6', with 'hidden' for an arm that couldn't be counted."""

    def describe(side_label: str, arm_result: CurlArmResult) -> str:
        return f"{side_label} {'hidden' if arm_result.rep_count is None else arm_result.rep_count}"

    return f"{describe('Left', arms.left)} · {describe('Right', arms.right)}"


# ---- Full analysis ----


def analyze_curl(timeline: LandmarkTimeline, video_width: int, video_height: int) -> CurlAnalyzeResponse:
    """Check the camera faces the person, then count and grade each arm separately."""
    landmarks = timeline.landmarks
    turn_angle = body_turn_angle(landmarks)
    left_visible = arm_visibility(landmarks, LEFT_ARM) >= MIN_ARM_VISIBILITY
    right_visible = arm_visibility(landmarks, RIGHT_ARM) >= MIN_ARM_VISIBILITY

    def not_counted(
        status: Literal["low_visibility", "not_front_view", "incomplete_recording"], message: str
    ) -> CurlAnalyzeResponse:
        return CurlAnalyzeResponse(
            exercise="curl",
            status=status,
            message=message,
            warnings=[],
            body_turn_angle=turn_angle,
            fps=timeline.fps,
            arms=CurlArms(left=uncounted_arm(left_visible), right=uncounted_arm(right_visible)),
        )

    # Part of the video has no frames: don't bridge the gap, ask for a re-run.
    if timeline.long_gaps:
        return not_counted("incomplete_recording", describe_incomplete_recording(timeline.long_gaps))

    # Shoulders never seen, or neither arm visible: nothing to count.
    if turn_angle is None or not (left_visible or right_visible):
        return not_counted("low_visibility", LOW_VISIBILITY_MESSAGE)

    # Side or diagonal view: arms overlap the body and the wrist can't be tracked reliably.
    if turn_angle > TURNED_VIEW_MAX_ANGLE:
        return not_counted("not_front_view", NOT_FRONT_VIEW_MESSAGE)

    warnings: list[str] = []
    if turn_angle > FRONT_VIEW_MAX_ANGLE:
        warnings.append(TURNED_WARNING)

    arms = CurlArms(
        left=count_arm_reps(timeline, LEFT_ARM, video_width, video_height),
        right=count_arm_reps(timeline, RIGHT_ARM, video_width, video_height),
    )
    for side_label, arm_result in (("left", arms.left), ("right", arms.right)):
        if not arm_result.visible:
            warnings.append(f"Your {side_label} arm was hidden, so it wasn't counted")

    return CurlAnalyzeResponse(
        exercise="curl",
        status="ok",
        message=counted_message(arms),
        warnings=warnings,
        body_turn_angle=turn_angle,
        fps=timeline.fps,
        arms=arms,
    )
