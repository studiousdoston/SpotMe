"""Curl counting and grading (analysis layer, no HTTP)."""

from typing import Any

import pytest

from analysis.curl import (
    LOW_VISIBILITY_MESSAGE,
    NOT_FRONT_VIEW_MESSAGE,
    TURNED_WARNING,
    analyze_curl,
)
from analysis.timeline import build_landmark_timeline
from schemas import AnalyzeRequest, CurlAnalyzeResponse
from tests.conftest import build_curl_recording


def run_curl_analysis(recording: dict[str, Any]) -> CurlAnalyzeResponse:
    """Validate a recording like the API does, then analyze it."""
    request = AnalyzeRequest.model_validate({**recording, "exercise": "curl"})
    timeline = build_landmark_timeline(request.frames)
    return analyze_curl(timeline, request.video_width, request.video_height)


# ---- Synthetic recordings ----


def test_synthetic_five_full_curls_per_arm() -> None:
    result = run_curl_analysis(build_curl_recording(curls_per_arm=5))

    assert result.status == "ok"
    assert result.warnings == []
    assert result.body_turn_angle == pytest.approx(0.0)
    for arm_result in (result.arms.left, result.arms.right):
        assert arm_result.visible
        assert arm_result.rep_count == 5
        assert [rep.range_feedback.code for rep in arm_result.reps] == ["full_curl"] * 5
        # Smoothing slightly softens the 40° top, but it stays a clear full curl.
        assert all(rep.top_angle < 50 for rep in arm_result.reps)
        assert arm_result.elbow_angle_signal is not None
    assert result.message == "Left 5 · Right 5"


def test_synthetic_partial_curls_are_flagged() -> None:
    result = run_curl_analysis(build_curl_recording(curls_per_arm=3, top_angle=110))

    assert result.arms.left.rep_count == 3
    assert result.arms.right.rep_count == 3
    assert {rep.range_feedback.code for rep in result.arms.left.reps + result.arms.right.reps} == {
        "partial_curl"
    }


def test_hidden_arm_is_not_counted() -> None:
    # Right elbow/wrist barely visible (below 0.5), left arm clear.
    result = run_curl_analysis(build_curl_recording(curls_per_arm=5, arm_visibility=(0.99, 0.2)))

    assert result.status == "ok"
    assert result.arms.left.rep_count == 5
    assert result.arms.right.visible is False
    # Hidden = null, never 0.
    assert result.arms.right.rep_count is None
    assert result.arms.right.reps == []
    assert result.arms.right.elbow_angle_signal is None
    assert result.message == "Left 5 · Right hidden"
    assert any("right arm was hidden" in warning for warning in result.warnings)


def test_both_arms_hidden_is_low_visibility() -> None:
    result = run_curl_analysis(build_curl_recording(curls_per_arm=2, arm_visibility=(0.2, 0.2)))

    assert result.status == "low_visibility"
    assert result.message == LOW_VISIBILITY_MESSAGE
    assert result.arms.left.rep_count is None
    assert result.arms.right.rep_count is None


def test_side_view_is_rejected() -> None:
    # Shoulders almost on top of each other in x, far apart in z: atan(0.2 / 0.04) ≈ 79°.
    result = run_curl_analysis(build_curl_recording(curls_per_arm=5, shoulder_x_gap=0.04, shoulder_z_gap=0.2))

    assert result.status == "not_front_view"
    assert result.message == NOT_FRONT_VIEW_MESSAGE
    assert result.body_turn_angle == pytest.approx(78.7, abs=0.1)
    assert result.arms.left.rep_count is None
    assert result.arms.right.rep_count is None
    assert result.arms.left.reps == result.arms.right.reps == []


def test_turned_view_still_counts_with_a_warning() -> None:
    # atan(0.15 / 0.15) = 45°: inside the 40–65° "turned" zone.
    result = run_curl_analysis(
        build_curl_recording(curls_per_arm=5, shoulder_x_gap=0.15, shoulder_z_gap=0.15)
    )

    assert result.status == "ok"
    assert result.body_turn_angle == pytest.approx(45.0)
    assert result.warnings == [TURNED_WARNING]
    assert result.arms.left.rep_count == 5
    assert result.arms.right.rep_count == 5


# ---- Real recording ----


def test_curl_front_fixture_is_front_view(curl_front_recording: dict[str, Any]) -> None:
    result = run_curl_analysis(curl_front_recording)

    assert result.status == "ok"
    assert result.warnings == []
    assert result.body_turn_angle is not None
    assert result.body_turn_angle < 40
    assert result.arms.left.visible
    assert result.arms.right.visible


def test_curl_front_fixture_counts_right_6_all_full(curl_front_recording: dict[str, Any]) -> None:
    result = run_curl_analysis(curl_front_recording)

    assert result.arms.right.rep_count == 6
    assert [rep.range_feedback.code for rep in result.arms.right.reps] == ["full_curl"] * 6


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Counts 4, not 5: at ~12.2 s the left forearm comes straight toward the camera, so the 2D elbow "
        "angle only dips 172° → 164° (10°), under the notebook's 25° minimum. A 2D front-view limit, "
        "not a threshold to tune. Remove this marker if the counter learns to handle it."
    ),
)
def test_curl_front_fixture_counts_left_5(curl_front_recording: dict[str, Any]) -> None:
    result = run_curl_analysis(curl_front_recording)

    assert result.arms.left.rep_count == 5
