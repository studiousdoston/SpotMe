"""Pydantic request/response models.

JSON uses camelCase (to match the web app); Python uses snake_case.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# MediaPipe Pose always returns this many landmarks per person.
LANDMARKS_PER_FRAME = 33


class CamelModel(BaseModel):
    """Base model: camelCase in JSON, snake_case in Python (both accepted on input)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---- Request ----


class Landmark(CamelModel):
    """One body point in normalized image coordinates (same as web/src/types/pose.ts)."""

    x: float
    y: float
    z: float
    visibility: float


class PoseFrame(CamelModel):
    """One analyzed frame. landmarks is None when no person was found."""

    timestamp_ms: float
    landmarks: list[Landmark] | None = Field(
        default=None, min_length=LANDMARKS_PER_FRAME, max_length=LANDMARKS_PER_FRAME
    )


class AnalyzeRequest(CamelModel):
    """The PoseRecording the web app produces, plus which exercise it is."""

    exercise: Literal["squat", "curl"]
    # At least two frames, so a frame interval (and therefore fps) can be measured.
    frames: list[PoseFrame] = Field(min_length=2)
    video_width: int = Field(gt=0)
    video_height: int = Field(gt=0)
    # Optional: the browser reports Infinity (sent as null) for some recorded videos.
    duration_seconds: float | None = None


# ---- Response: shared pieces ----


class Feedback(CamelModel):
    """A stable code for the frontend to style, plus human-readable text."""

    code: str
    text: str


class TimeSeries(CamelModel):
    """A smoothed signal over time (for charts and the overlay); null = no value at that time."""

    times_seconds: list[float]
    values: list[float | None]


# ---- Response: squat ----


class SquatRepResult(CamelModel):
    """One counted squat with its depth and tempo grades."""

    rep_number: int
    start_seconds: float
    bottom_seconds: float
    end_seconds: float
    bottom_depth: float
    depth_feedback: Feedback
    down_seconds: float
    up_seconds: float
    tempo_feedback: Feedback


class SquatAnalyzeResponse(CamelModel):
    """Result of analyzing one squat set."""

    exercise: Literal["squat"]
    # incomplete_recording: part of the video has no frames (see analysis/timeline.py).
    status: Literal["ok", "low_visibility", "incomplete_recording"]
    message: str
    rep_count: int
    trusted_fraction: float
    fps: float
    reps: list[SquatRepResult]
    # None when the set wasn't counted (low visibility or an incomplete recording).
    depth_signal: TimeSeries | None


# ---- Response: curl ----


class CurlRepResult(CamelModel):
    """One counted curl of one arm, graded by how high the wrist rose."""

    rep_number: int
    start_seconds: float
    # Moment the wrist was highest (the top of the curl).
    peak_seconds: float
    end_seconds: float
    # How far the wrist rose: 0 = arm hanging, 100 = wrist at shoulder level.
    curl_height_percent: float
    range_feedback: Feedback


class CurlArmResult(CamelModel):
    """Counting result for one arm."""

    # False when the elbow/wrist were too hidden to count this arm.
    visible: bool
    # None = not counted (arm hidden, or the set wasn't counted at all). 0 = counted, no curls found.
    rep_count: int | None
    reps: list[CurlRepResult]
    # Smoothed wrist height in upper-arm lengths: 0 = shoulder level, about -1.8 = hanging
    # (None when this arm wasn't counted).
    wrist_height_signal: TimeSeries | None
    # The arm's hanging wrist height (0% curl height); 100% is 0. None when not counted.
    hanging_baseline: float | None


class CurlArms(CamelModel):
    """The person's own left and right arm (MediaPipe's left = landmarks 11/13/15)."""

    left: CurlArmResult
    right: CurlArmResult


class CurlAnalyzeResponse(CamelModel):
    """Result of analyzing one alternating dumbbell curl set (each arm counted separately)."""

    exercise: Literal["curl"]
    status: Literal["ok", "low_visibility", "not_front_view", "incomplete_recording"]
    message: str
    # Non-blocking advice (e.g. "turn to face the camera"); the counts are still shown.
    warnings: list[str]
    # How far the shoulders are turned away from the camera: 0° = facing it, 90° = side on.
    # None when the shoulders were never visible enough to measure.
    body_turn_angle: float | None
    fps: float
    arms: CurlArms


# One response type per exercise; "exercise" tells them apart.
AnalyzeResponse = Annotated[SquatAnalyzeResponse | CurlAnalyzeResponse, Field(discriminator="exercise")]
