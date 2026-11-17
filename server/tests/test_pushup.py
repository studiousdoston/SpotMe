"""Push-up counting and depth grading (analysis layer, no HTTP)."""

from typing import Any

import pytest

from analysis.pushup import LOW_VISIBILITY_MESSAGE, SIDE_VIEW_WARNING, TURNED_WARNING, analyze_pushup
from analysis.timeline import build_landmark_timeline
from schemas import AnalyzeRequest, PushupAnalyzeResponse, PushupRepResult
from tests.conftest import build_pushup_recording


def run_pushup_analysis(recording: dict[str, Any]) -> PushupAnalyzeResponse:
    """Validate a recording like the API does, then analyze it."""
    request = AnalyzeRequest.model_validate({**recording, "exercise": "push_up"})
    timeline = build_landmark_timeline(request.frames)
    return analyze_pushup(timeline, request.video_width, request.video_height)


def depth_codes(reps: list[PushupRepResult]) -> list[str]:
    return [rep.depth_feedback.code for rep in reps]


# ---- Synthetic recordings ----


def test_synthetic_five_good_pushups() -> None:
    result = run_pushup_analysis(build_pushup_recording(pushup_count=5))

    assert result.status == "ok"
    assert result.message == "5 push-ups"
    assert result.warnings == []
    assert result.depth_graded
    assert result.rep_count == 5
    assert depth_codes(result.reps) == ["good_depth"] * 5
    # Smoothing barely softens the 70° bottom.
    assert all(rep.bottom_elbow_angle == pytest.approx(70, abs=3) for rep in result.reps)
    assert result.body_height_signal is not None
    assert result.elbow_angle_signal is not None


def test_synthetic_shallow_pushups_are_counted_and_flagged() -> None:
    # 110° bottom: a 0.18 arm-length dip (counted), elbows well above 90° (too shallow).
    result = run_pushup_analysis(build_pushup_recording(pushup_count=3, bottom_elbow_angles=(110, 110)))

    assert result.rep_count == 3
    assert depth_codes(result.reps) == ["too_shallow"] * 3


def test_depth_uses_the_more_bent_arm() -> None:
    # Left arm alone (95°) would be too shallow; the right arm reached 80°.
    result = run_pushup_analysis(build_pushup_recording(pushup_count=3, bottom_elbow_angles=(95, 80)))

    assert result.rep_count == 3
    assert depth_codes(result.reps) == ["good_depth"] * 3
    assert all(rep.bottom_elbow_angle == pytest.approx(80, abs=3) for rep in result.reps)


def test_hidden_arm_is_ignored_and_the_other_still_grades() -> None:
    # Right arm hidden. If its 70° were used, the reps would be good; the visible left arm only reached 115°.
    result = run_pushup_analysis(
        build_pushup_recording(pushup_count=4, bottom_elbow_angles=(115, 70), arm_visibility=(0.99, 0.2))
    )

    assert result.status == "ok"
    assert result.depth_graded
    assert result.rep_count == 4
    assert depth_codes(result.reps) == ["too_shallow"] * 4
    assert all(rep.bottom_elbow_angle == pytest.approx(115, abs=3) for rep in result.reps)


def test_side_view_counts_but_does_not_grade_depth() -> None:
    # atan(0.2 / 0.04) ≈ 79°: side on.
    result = run_pushup_analysis(
        build_pushup_recording(pushup_count=5, shoulder_x_gap=0.04, shoulder_z_gap=0.2)
    )

    assert result.status == "ok"
    assert result.body_turn_angle == pytest.approx(78.7, abs=0.1)
    assert result.warnings == [SIDE_VIEW_WARNING]
    assert not result.depth_graded
    assert result.rep_count == 5
    assert depth_codes(result.reps) == ["not_graded"] * 5
    assert all(rep.bottom_elbow_angle is None for rep in result.reps)
    assert result.body_height_signal is not None
    assert result.elbow_angle_signal is None


def test_turned_view_grades_with_a_warning() -> None:
    # atan(0.15 / 0.15) = 45°: inside the 40–65° "turned" zone.
    result = run_pushup_analysis(
        build_pushup_recording(pushup_count=4, shoulder_x_gap=0.15, shoulder_z_gap=0.15)
    )

    assert result.status == "ok"
    assert result.warnings == [TURNED_WARNING]
    assert result.depth_graded
    assert result.rep_count == 4
    assert depth_codes(result.reps) == ["good_depth"] * 4


def test_both_arms_hidden_is_low_visibility() -> None:
    result = run_pushup_analysis(build_pushup_recording(pushup_count=3, arm_visibility=(0.2, 0.2)))

    assert result.status == "low_visibility"
    assert result.message == LOW_VISIBILITY_MESSAGE
    assert result.rep_count == 0
    assert result.reps == []


# ---- Real recording ----


def test_pushup_front_fixture_7_reps_4_and_5_too_shallow(pushup_front_recording: dict[str, Any]) -> None:
    result = run_pushup_analysis(pushup_front_recording)

    assert result.status == "ok"
    assert result.warnings == []
    assert result.body_turn_angle is not None and result.body_turn_angle < 40
    assert result.rep_count == 7
    assert [(round(rep.bottom_elbow_angle or 0), rep.depth_feedback.code) for rep in result.reps] == [
        (70, "good_depth"),
        (72, "good_depth"),
        (80, "good_depth"),
        (160, "too_shallow"),
        (143, "too_shallow"),
        (64, "good_depth"),
        (61, "good_depth"),
    ]
