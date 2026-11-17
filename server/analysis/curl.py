"""Alternating dumbbell curl counting and grading, ported from notebooks/03.

Same formulas and thresholds as the notebook's elbow_angle, count_arm_reps (v2) and
body_turn_angle. Each arm is counted on its own: one curl = one dip in the elbow angle.
The only change is the front-view check, which gets a middle "turned" zone (see FRONT_VIEW_MAX_ANGLE).
"""

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from analysis.reps import count_reps_peaks
from analysis.timeline import LandmarkTimeline, build_time_series, describe_incomplete_recording
from schemas import CurlAnalyzeResponse, CurlArmResult, CurlArms, CurlRepResult, Feedback

# ---- Notebook constants ----

# An arm whose elbow/wrist average visibility is below this is "hidden" and not counted.
MIN_ARM_VISIBILITY = 0.5
# count_arm_reps v2: any dip of >= 25° is a curl, reps at least 0.8 s apart.
MIN_CURL_DEGREES = 25
MIN_GAP_SECONDS = 0.8
# The notebook smooths the elbow angle over a fixed 5 frames (not a duration).
ANGLE_SMOOTHING_FRAMES = 5
# Smallest elbow angle <= 70° = full curl, otherwise partial.
FULL_CURL_MAX_ANGLE = 70

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


def range_grade(top_angle: float) -> Feedback:
    """Notebook's partial-curl rule: the elbow must close to 70° or less."""
    return FULL_CURL if top_angle <= FULL_CURL_MAX_ANGLE else PARTIAL_CURL


# ---- Signals ----


def elbow_angle(
    landmarks: pd.DataFrame, arm: ArmLandmarks, video_width: int, video_height: int
) -> np.ndarray:
    """Notebook's elbow_angle: angle between upper arm and forearm in pixels (180° = straight arm)."""

    def to_pixels(landmark_index: int, axis: str) -> pd.Series:
        scale = video_width if axis == "x" else video_height
        return landmarks[f"{landmark_index}_{axis}"] * scale

    upper_arm_x = to_pixels(arm.shoulder, "x") - to_pixels(arm.elbow, "x")
    upper_arm_y = to_pixels(arm.shoulder, "y") - to_pixels(arm.elbow, "y")
    forearm_x = to_pixels(arm.wrist, "x") - to_pixels(arm.elbow, "x")
    forearm_y = to_pixels(arm.wrist, "y") - to_pixels(arm.elbow, "y")
    cosine = (upper_arm_x * forearm_x + upper_arm_y * forearm_y) / (
        np.hypot(upper_arm_x, upper_arm_y) * np.hypot(forearm_x, forearm_y) + 1e-8
    )
    return np.degrees(np.arccos(np.clip(cosine.to_numpy(), -1, 1)))


def arm_visibility(landmarks: pd.DataFrame, arm: ArmLandmarks) -> float:
    """Notebook: mean over frames of min(elbow, wrist) visibility. Frames with no person are skipped."""
    visibility = landmarks[[f"{arm.elbow}_vis", f"{arm.wrist}_vis"]].min(axis=1).mean()
    # No frame with a person at all: NaN. Treated as 0 so the arm counts as hidden.
    return float(visibility) if pd.notna(visibility) else 0.0


def smoothed_elbow_angle(
    landmarks: pd.DataFrame, arm: ArmLandmarks, video_width: int, video_height: int
) -> np.ndarray:
    """Notebook: fill gaps from neighbours, then a centered 5-frame rolling mean."""
    angle = pd.Series(elbow_angle(landmarks, arm, video_width, video_height)).interpolate(
        limit_direction="both"
    )
    return angle.rolling(ANGLE_SMOOTHING_FRAMES, center=True, min_periods=1).mean().to_numpy()


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
    return CurlArmResult(visible=visible, rep_count=None, reps=[], elbow_angle_signal=None)


def count_arm_reps(
    timeline: LandmarkTimeline, arm: ArmLandmarks, video_width: int, video_height: int
) -> CurlArmResult:
    """Notebook's count_arm_reps v2: every elbow dip >= 25° is a curl, graded full/partial by top angle."""
    landmarks = timeline.landmarks
    if arm_visibility(landmarks, arm) < MIN_ARM_VISIBILITY:
        return uncounted_arm(visible=False)

    angle = smoothed_elbow_angle(landmarks, arm, video_width, video_height)
    # Peaks on (180 - angle): the signal rises as the arm bends. min_rep_seconds=0 keeps
    # exactly the notebook's find_peaks result (it had no minimum rep width); reps.py adds
    # the half-height start/end of each rep for the replay.
    detected_reps = count_reps_peaks(
        180 - angle,
        timeline.fps,
        min_drop=MIN_CURL_DEGREES,
        min_gap_seconds=MIN_GAP_SECONDS,
        min_rep_seconds=0.0,
    )

    rep_results = [
        CurlRepResult(
            rep_number=rep_number,
            start_seconds=timeline.slot_time_seconds(detected_rep.start_index),
            peak_seconds=timeline.slot_time_seconds(detected_rep.peak_index),
            end_seconds=timeline.slot_time_seconds(detected_rep.end_index),
            top_angle=float(angle[detected_rep.peak_index]),
            range_feedback=range_grade(float(angle[detected_rep.peak_index])),
        )
        for rep_number, detected_rep in enumerate(detected_reps, start=1)
    ]
    return CurlArmResult(
        visible=True,
        rep_count=len(rep_results),
        reps=rep_results,
        elbow_angle_signal=build_time_series(timeline, angle),
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

    # Side or diagonal view: arms overlap the body and the elbow angle is unreliable.
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
