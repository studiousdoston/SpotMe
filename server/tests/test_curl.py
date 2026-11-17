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
from schemas import AnalyzeRequest, CurlAnalyzeResponse, CurlRepResult
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
        # Smoothing barely softens the top: the wrist reaches shoulder level.
        assert all(rep.curl_height_percent > 95 for rep in arm_result.reps)
        assert arm_result.wrist_height_signal is not None
        # Hanging = (120 + 110) / 120 upper-arm lengths below the shoulder.
        assert arm_result.hanging_baseline == pytest.approx(-230 / 120, abs=0.01)
    assert result.message == "Left 5 · Right 5"


def test_synthetic_partial_curls_are_flagged() -> None:
    # Wrist rises only half way to the shoulder: still a curl (0.96 upper-arm lengths), but partial.
    result = run_curl_analysis(build_curl_recording(curls_per_arm=3, top_height_percent=50))

    assert result.arms.left.rep_count == 3
    assert result.arms.right.rep_count == 3
    all_reps = result.arms.left.reps + result.arms.right.reps
    assert {rep.range_feedback.code for rep in all_reps} == {"partial_curl"}
    assert all(rep.curl_height_percent == pytest.approx(50, abs=3) for rep in all_reps)


@pytest.mark.parametrize(("top_height_percent", "expected_code"), [(75, "full_curl"), (65, "partial_curl")])
def test_full_curl_needs_70_percent_height(top_height_percent: float, expected_code: str) -> None:
    result = run_curl_analysis(build_curl_recording(curls_per_arm=2, top_height_percent=top_height_percent))

    for arm_result in (result.arms.left, result.arms.right):
        assert arm_result.rep_count == 2
        assert [rep.range_feedback.code for rep in arm_result.reps] == [expected_code] * 2


def test_small_wrist_wobble_is_not_a_curl() -> None:
    # 15% of 1.92 upper-arm lengths = 0.29: under the 0.4 minimum rise.
    result = run_curl_analysis(build_curl_recording(curls_per_arm=3, top_height_percent=15))

    assert result.arms.left.rep_count == 0
    assert result.arms.right.rep_count == 0


def test_hidden_arm_is_not_counted() -> None:
    # Right elbow/wrist barely visible (below 0.5), left arm clear.
    result = run_curl_analysis(build_curl_recording(curls_per_arm=5, arm_visibility=(0.99, 0.2)))

    assert result.status == "ok"
    assert result.arms.left.rep_count == 5
    assert result.arms.right.visible is False
    # Hidden = null, never 0.
    assert result.arms.right.rep_count is None
    assert result.arms.right.reps == []
    assert result.arms.right.wrist_height_signal is None
    assert result.arms.right.hanging_baseline is None
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


def describe_reps(reps: list[CurlRepResult]) -> list[tuple[int, str]]:
    """(rounded curl height, grade code) per rep, for readable assertion failures."""
    return [(round(rep.curl_height_percent), rep.range_feedback.code) for rep in reps]


def test_curl_front_fixture_left_5_reps_3_and_4_partial(curl_front_recording: dict[str, Any]) -> None:
    left_arm = run_curl_analysis(curl_front_recording).arms.left

    assert left_arm.rep_count == 5
    assert describe_reps(left_arm.reps) == [
        (100, "full_curl"),
        (100, "full_curl"),
        (57, "partial_curl"),
        (32, "partial_curl"),
        (100, "full_curl"),
    ]


def test_curl_front_fixture_right_6_rep_5_partial(curl_front_recording: dict[str, Any]) -> None:
    right_arm = run_curl_analysis(curl_front_recording).arms.right

    assert right_arm.rep_count == 6
    # Rep 4 (~79%) is a borderline full curl; only rep 5 is clearly partial.
    assert describe_reps(right_arm.reps) == [
        (94, "full_curl"),
        (91, "full_curl"),
        (89, "full_curl"),
        (79, "full_curl"),
        (48, "partial_curl"),
        (99, "full_curl"),
    ]
