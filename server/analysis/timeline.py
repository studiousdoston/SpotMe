"""Turn the web app's frames into the notebook's landmark table.

The notebook works on a pandas DataFrame with one row per video frame and columns
`frame, 0_x, 0_y, 0_z, 0_vis, ... 32_vis`, at a constant fps. Its windows
(e.g. "4 s rolling median", "0.8 s between reps") are expressed in frames, so the
browser's frames are placed on an even time grid first.
"""

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from schemas import LANDMARKS_PER_FRAME, PoseFrame, TimeSeries

# Same column names as the notebook's COLS.
LANDMARK_COLUMNS: list[str] = [
    f"{landmark_index}_{component}"
    for landmark_index in range(LANDMARKS_PER_FRAME)
    for component in ("x", "y", "z", "vis")
]


# A stretch longer than this with no frame at all means part of the video was never analyzed
# (e.g. the phone put the app in the background). The analysis would bridge it with a straight
# line, which can invent or hide reps, so such recordings are rejected instead.
MAX_FRAME_GAP_SECONDS = 0.5


@dataclass(frozen=True)
class FrameGap:
    """A stretch of video between two consecutive analyzed frames, longer than MAX_FRAME_GAP_SECONDS."""

    start_seconds: float
    end_seconds: float


@dataclass(frozen=True)
class LandmarkTimeline:
    """Landmarks on an even time grid."""

    # One row per grid slot: `frame` + LANDMARK_COLUMNS. NaN rows = no data for that slot.
    landmarks: pd.DataFrame
    # Detected frame rate (1000 / median frame interval in ms).
    fps: float
    # Video time of grid slot 0.
    start_seconds: float
    # Stretches of video with no analyzed frame (empty for a complete recording).
    long_gaps: list[FrameGap] = field(default_factory=list)

    def slot_time_seconds(self, slot_index: float) -> float:
        """Video time of a grid slot (fractional slots allowed)."""
        return self.start_seconds + slot_index / self.fps


def detect_frame_interval_ms(frames: list[PoseFrame]) -> float:
    """Median gap between consecutive timestamps: robust to the occasional skipped frame."""
    timestamps_ms = np.array([frame.timestamp_ms for frame in frames], dtype=float)
    intervals_ms = np.diff(np.sort(timestamps_ms))
    positive_intervals_ms = intervals_ms[intervals_ms > 0]
    if positive_intervals_ms.size == 0:
        raise ValueError("Frames need at least two distinct timestamps to detect the frame rate.")
    return float(np.median(positive_intervals_ms))


def frame_to_row(frame: PoseFrame) -> list[float]:
    """Flatten one frame's 33 landmarks to x, y, z, vis values (NaN when no person was found)."""
    if frame.landmarks is None:
        return [np.nan] * len(LANDMARK_COLUMNS)
    return [
        value
        for landmark in frame.landmarks
        for value in (landmark.x, landmark.y, landmark.z, landmark.visibility)
    ]


def find_long_gaps(sorted_frames: list[PoseFrame]) -> list[FrameGap]:
    """Gaps between consecutive frames longer than MAX_FRAME_GAP_SECONDS.

    Frames where no person was found still count as analyzed: only missing frames make a gap.
    """
    return [
        FrameGap(start_seconds=previous_frame.timestamp_ms / 1000, end_seconds=next_frame.timestamp_ms / 1000)
        for previous_frame, next_frame in zip(sorted_frames, sorted_frames[1:], strict=False)
        if (next_frame.timestamp_ms - previous_frame.timestamp_ms) / 1000 > MAX_FRAME_GAP_SECONDS
    ]


def describe_incomplete_recording(long_gaps: list[FrameGap]) -> str:
    """User message naming every gap, e.g. 'Part of the video wasn't analyzed (gap at 3.2–12.6 s). ...'."""
    gap_ranges = " and ".join(f"{gap.start_seconds:.1f}–{gap.end_seconds:.1f} s" for gap in long_gaps)
    gap_word = "gap" if len(long_gaps) == 1 else "gaps"
    return (
        f"Part of the video wasn't analyzed ({gap_word} at {gap_ranges}). "
        "Please analyze it again and keep the app open."
    )


def build_landmark_timeline(frames: list[PoseFrame]) -> LandmarkTimeline:
    """Place frames on an even grid at the detected fps.

    - Each frame goes to its nearest grid slot (if two land in the same slot, the first wins).
    - Frames with no person stay NaN rows, like the notebook's NaN rows.
    - Slots with no frame at all (frames the browser skipped) are also NaN rows: we don't invent
      data here. The notebook's own clean-up (visibility gating + interpolation) fills them later,
      and they count as untrusted, which keeps the trusted share honest.
    - Gaps longer than MAX_FRAME_GAP_SECONDS are recorded in long_gaps, so each exercise can refuse
      to analyze the recording instead of interpolating across them.
    """
    frame_interval_ms = detect_frame_interval_ms(frames)
    sorted_frames = sorted(frames, key=lambda frame: frame.timestamp_ms)
    start_ms = sorted_frames[0].timestamp_ms

    # Grid slot for each frame.
    slot_indices = [round((frame.timestamp_ms - start_ms) / frame_interval_ms) for frame in sorted_frames]
    slot_count = slot_indices[-1] + 1

    # Observed rows, de-duplicated by slot, then spread over the full grid (missing slots → NaN).
    observed_rows = pd.DataFrame(
        [frame_to_row(frame) for frame in sorted_frames], columns=LANDMARK_COLUMNS, index=slot_indices
    )
    observed_rows = observed_rows[~observed_rows.index.duplicated(keep="first")]
    landmarks = observed_rows.reindex(range(slot_count))
    landmarks.insert(0, "frame", np.arange(slot_count))

    return LandmarkTimeline(
        landmarks=landmarks.reset_index(drop=True),
        fps=1000.0 / frame_interval_ms,
        start_seconds=start_ms / 1000.0,
        long_gaps=find_long_gaps(sorted_frames),
    )


def json_safe(value: float) -> float | None:
    """NaN/inf can't go into JSON; send null instead."""
    return value if math.isfinite(value) else None


def build_time_series(timeline: LandmarkTimeline, values: np.ndarray) -> TimeSeries:
    """One value per grid slot → {timesSeconds, values} for the web app's charts and overlay."""
    return TimeSeries(
        times_seconds=[timeline.slot_time_seconds(slot_index) for slot_index in range(len(values))],
        values=[json_safe(float(value)) for value in values],
    )
