"""Frames → even-grid landmark table."""

import math

import pytest

from analysis.timeline import LANDMARK_COLUMNS, build_landmark_timeline
from schemas import Landmark, PoseFrame


def make_frame(timestamp_ms: float, has_person: bool = True) -> PoseFrame:
    landmarks = [Landmark(x=0.5, y=0.5, z=0.0, visibility=0.9) for _ in range(33)] if has_person else None
    return PoseFrame(timestamp_ms=timestamp_ms, landmarks=landmarks)


def test_columns_match_notebook() -> None:
    assert LANDMARK_COLUMNS[:4] == ["0_x", "0_y", "0_z", "0_vis"]
    assert LANDMARK_COLUMNS[-1] == "32_vis"
    assert len(LANDMARK_COLUMNS) == 132


def test_skipped_and_empty_frames_become_nan_rows() -> None:
    # 30 fps, with a no-person frame at slot 2 and a skipped slot 4.
    frames = [
        make_frame(0),
        make_frame(33.3),
        make_frame(66.7, has_person=False),
        make_frame(100),
        make_frame(166.7),
    ]
    timeline = build_landmark_timeline(frames)

    assert timeline.fps == pytest.approx(30.0, rel=0.01)
    assert len(timeline.landmarks) == 6
    assert list(timeline.landmarks["frame"]) == [0, 1, 2, 3, 4, 5]
    nan_slots = [
        slot_index for slot_index in range(6) if math.isnan(timeline.landmarks.loc[slot_index, "11_vis"])
    ]
    assert nan_slots == [2, 4]
    assert timeline.slot_time_seconds(3) == pytest.approx(0.1, abs=0.001)
