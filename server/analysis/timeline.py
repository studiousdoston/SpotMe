"""Turn the web app's frames into the notebook's landmark table.

The notebook works on a pandas DataFrame with one row per video frame and columns
`frame, 0_x, 0_y, 0_z, 0_vis, ... 32_vis`, at a constant fps. Its windows
(e.g. "4 s rolling median", "0.8 s between reps") are expressed in frames, so the
browser's frames are placed on an even time grid first.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd

from schemas import LANDMARKS_PER_FRAME, PoseFrame

# Same column names as the notebook's COLS.
LANDMARK_COLUMNS: list[str] = [
    f"{landmark_index}_{component}"
    for landmark_index in range(LANDMARKS_PER_FRAME)
    for component in ("x", "y", "z", "vis")
]


@dataclass(frozen=True)
class LandmarkTimeline:
    """Landmarks on an even time grid."""

    # One row per grid slot: `frame` + LANDMARK_COLUMNS. NaN rows = no data for that slot.
    landmarks: pd.DataFrame
    # Detected frame rate (1000 / median frame interval in ms).
    fps: float
    # Video time of grid slot 0.
    start_seconds: float

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


def build_landmark_timeline(frames: list[PoseFrame]) -> LandmarkTimeline:
    """Place frames on an even grid at the detected fps.

    - Each frame goes to its nearest grid slot (if two land in the same slot, the first wins).
    - Frames with no person stay NaN rows, like the notebook's NaN rows.
    - Slots with no frame at all (frames the browser skipped) are also NaN rows: we don't invent
      data here. The notebook's own clean-up (visibility gating + interpolation) fills them later,
      and they count as untrusted, which keeps the trusted share honest.
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
    )
