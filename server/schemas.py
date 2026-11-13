"""Pydantic request/response models.

JSON uses camelCase (to match the web app); Python uses snake_case.
"""

from typing import Literal

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

    exercise: Literal["squat"]
    # At least two frames, so a frame interval (and therefore fps) can be measured.
    frames: list[PoseFrame] = Field(min_length=2)
    video_width: int = Field(gt=0)
    video_height: int = Field(gt=0)
    # Optional: the browser reports Infinity (sent as null) for some recorded videos.
    duration_seconds: float | None = None


# ---- Response ----


class Feedback(CamelModel):
    """A stable code for the frontend to style, plus human-readable text."""

    code: str
    text: str


class RepResult(CamelModel):
    """One counted rep with its depth and tempo grades."""

    rep_number: int
    start_seconds: float
    bottom_seconds: float
    end_seconds: float
    bottom_depth: float
    depth_feedback: Feedback
    down_seconds: float
    up_seconds: float
    tempo_feedback: Feedback


class DepthSignal(CamelModel):
    """The smoothed depth curve over time (for charts and the overlay)."""

    times_seconds: list[float]
    values: list[float | None]


class AnalyzeResponse(CamelModel):
    """Result of analyzing one set."""

    exercise: Literal["squat"]
    status: Literal["ok", "low_visibility"]
    message: str
    rep_count: int
    trusted_fraction: float
    fps: float
    reps: list[RepResult]
    # None when visibility was too low to compute a trustworthy curve.
    depth_signal: DepthSignal | None
