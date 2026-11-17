"""Recordings with missing stretches of video are rejected, for every exercise."""

from typing import Any

import pytest

from analysis.curl import analyze_curl
from analysis.squat import analyze_squat
from analysis.timeline import build_landmark_timeline, find_long_gaps
from schemas import AnalyzeRequest, CurlAnalyzeResponse, PoseFrame, SquatAnalyzeResponse
from tests.conftest import build_curl_recording, build_squat_recording, remove_frames_between

GAP_MESSAGE = (
    "Part of the video wasn't analyzed (gap at 3.2–12.6 s). Please analyze it again and keep the app open."
)


def run_squat_analysis(recording: dict[str, Any]) -> SquatAnalyzeResponse:
    request = AnalyzeRequest.model_validate({**recording, "exercise": "squat"})
    return analyze_squat(build_landmark_timeline(request.frames), request.video_width, request.video_height)


def run_curl_analysis(recording: dict[str, Any]) -> CurlAnalyzeResponse:
    request = AnalyzeRequest.model_validate({**recording, "exercise": "curl"})
    return analyze_curl(build_landmark_timeline(request.frames), request.video_width, request.video_height)


# ---- Gap detection ----


def make_frame(timestamp_ms: float, has_person: bool = True) -> PoseFrame:
    return PoseFrame.model_validate(
        {
            "timestampMs": timestamp_ms,
            "landmarks": [{"x": 0.5, "y": 0.5, "z": 0, "visibility": 0.9}] * 33 if has_person else None,
        }
    )


def test_gap_longer_than_half_a_second_is_found() -> None:
    frames = [make_frame(0), make_frame(33), make_frame(600), make_frame(633)]
    gaps = find_long_gaps(frames)

    assert len(gaps) == 1
    assert gaps[0].start_seconds == pytest.approx(0.033)
    assert gaps[0].end_seconds == pytest.approx(0.6)


def test_short_gaps_and_no_person_frames_are_not_gaps() -> None:
    # 0.5 s exactly is allowed ("longer than 0.5 s" is the rule); no-person frames are still analyzed frames.
    frames = [make_frame(0), make_frame(500), make_frame(533, has_person=False), make_frame(1000)]

    assert find_long_gaps(frames) == []


# ---- Squat ----


def test_squat_with_gap_is_incomplete() -> None:
    result = run_squat_analysis(remove_frames_between(build_squat_recording(squat_count=5), 3.2, 12.6))

    assert result.status == "incomplete_recording"
    assert result.message == GAP_MESSAGE
    assert result.rep_count == 0
    assert result.reps == []
    assert result.depth_signal is None
    # Still measured on the frames that exist (NaN grid slots in the gap count as untrusted).
    assert 0 < result.trusted_fraction < 1


def test_squat_fixture_with_gap_is_incomplete(squat_front_recording: dict[str, Any]) -> None:
    result = run_squat_analysis(remove_frames_between(squat_front_recording, 3.2, 12.6))

    assert result.status == "incomplete_recording"
    assert result.message == GAP_MESSAGE


def test_squat_with_short_gap_still_counts() -> None:
    result = run_squat_analysis(remove_frames_between(build_squat_recording(squat_count=5), 3.2, 3.6))

    assert result.status == "ok"
    assert result.rep_count == 5


# ---- Curl ----


def test_curl_with_gap_is_incomplete() -> None:
    result = run_curl_analysis(remove_frames_between(build_curl_recording(curls_per_arm=5), 3.2, 12.6))

    assert result.status == "incomplete_recording"
    assert result.message == GAP_MESSAGE
    assert result.warnings == []
    for arm_result in (result.arms.left, result.arms.right):
        assert arm_result.rep_count is None
        assert arm_result.reps == []
        assert arm_result.wrist_height_signal is None


def test_curl_fixture_with_two_gaps_names_both(curl_front_recording: dict[str, Any]) -> None:
    with_gaps = remove_frames_between(remove_frames_between(curl_front_recording, 2.0, 4.0), 9.0, 10.0)
    result = run_curl_analysis(with_gaps)

    assert result.status == "incomplete_recording"
    assert result.message == (
        "Part of the video wasn't analyzed (gaps at 2.0–4.0 s and 9.0–10.0 s). "
        "Please analyze it again and keep the app open."
    )
