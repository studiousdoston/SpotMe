"""Squat counting and grading (analysis layer, no HTTP)."""

from typing import Any

import pytest

from analysis.squat import LOW_VISIBILITY_MESSAGE, analyze_squat
from analysis.timeline import build_landmark_timeline
from schemas import AnalyzeRequest, AnalyzeResponse
from tests.conftest import build_squat_recording


def run_squat_analysis(recording: dict[str, Any]) -> AnalyzeResponse:
    """Validate a recording like the API does, then analyze it."""
    request = AnalyzeRequest.model_validate({**recording, "exercise": "squat"})
    timeline = build_landmark_timeline(request.frames)
    return analyze_squat(timeline, request.video_width, request.video_height)


def test_synthetic_five_full_depth_squats() -> None:
    result = run_squat_analysis(build_squat_recording(squat_count=5))

    assert result.status == "ok"
    assert result.rep_count == 5
    assert [rep.depth_feedback.code for rep in result.reps] == ["good_depth"] * 5
    assert result.fps == pytest.approx(30.0)
    assert result.trusted_fraction == pytest.approx(1.0)


def test_low_visibility_returns_no_reps() -> None:
    result = run_squat_analysis(build_squat_recording(squat_count=5, visibility=0.1))

    assert result.status == "low_visibility"
    assert result.message == LOW_VISIBILITY_MESSAGE
    assert result.rep_count == 0
    assert result.reps == []
    assert result.depth_signal is None


def test_squat_front_fixture_counts_six_reps(squat_front_recording: dict[str, Any]) -> None:
    result = run_squat_analysis(squat_front_recording)

    assert result.status == "ok"
    assert result.rep_count == 6
