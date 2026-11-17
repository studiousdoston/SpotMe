"""POST /api/analyze through FastAPI's TestClient."""

from typing import Any

from fastapi.testclient import TestClient

from main import app
from schemas import CurlAnalyzeResponse, PushupAnalyzeResponse, SquatAnalyzeResponse

client = TestClient(app)


def test_analyze_fixture_returns_valid_response(squat_front_recording: dict[str, Any]) -> None:
    response = client.post("/api/analyze", json={**squat_front_recording, "exercise": "squat"})

    assert response.status_code == 200
    response_json = response.json()

    # camelCase keys, and the body parses back into the response model.
    assert {"repCount", "trustedFraction", "depthSignal", "reps"} <= response_json.keys()
    parsed_response = SquatAnalyzeResponse.model_validate(response_json)
    assert parsed_response.status == "ok"
    assert parsed_response.rep_count == len(parsed_response.reps) > 0
    assert parsed_response.depth_signal is not None
    assert len(parsed_response.depth_signal.times_seconds) == len(parsed_response.depth_signal.values)
    first_rep = response_json["reps"][0]
    assert {"repNumber", "bottomDepth", "depthFeedback", "tempoFeedback"} <= first_rep.keys()
    assert {"code", "text"} == first_rep["depthFeedback"].keys()


def test_analyze_curl_returns_per_arm_response(curl_front_recording: dict[str, Any]) -> None:
    response = client.post("/api/analyze", json={**curl_front_recording, "exercise": "curl"})

    assert response.status_code == 200
    response_json = response.json()

    # camelCase keys, and the body parses back into the curl response model.
    assert response_json["exercise"] == "curl"
    assert {"status", "message", "warnings", "bodyTurnAngle", "arms"} <= response_json.keys()
    assert {"visible", "repCount", "reps", "wristHeightSignal", "hangingBaseline"} <= response_json["arms"][
        "left"
    ].keys()
    parsed_response = CurlAnalyzeResponse.model_validate(response_json)
    assert parsed_response.status == "ok"
    first_rep = response_json["arms"]["left"]["reps"][0]
    assert {
        "repNumber",
        "startSeconds",
        "peakSeconds",
        "endSeconds",
        "curlHeightPercent",
        "rangeFeedback",
    } <= (first_rep.keys())
    assert {"code", "text"} == first_rep["rangeFeedback"].keys()


def test_analyze_push_up_returns_reps_and_signals(pushup_front_recording: dict[str, Any]) -> None:
    response = client.post("/api/analyze", json={**pushup_front_recording, "exercise": "push_up"})

    assert response.status_code == 200
    response_json = response.json()

    # camelCase keys, and the body parses back into the push-up response model.
    assert response_json["exercise"] == "push_up"
    assert {
        "status",
        "message",
        "warnings",
        "bodyTurnAngle",
        "depthGraded",
        "repCount",
        "reps",
        "bodyHeightSignal",
        "elbowAngleSignal",
    } <= response_json.keys()
    parsed_response = PushupAnalyzeResponse.model_validate(response_json)
    assert parsed_response.status == "ok"
    assert parsed_response.rep_count == 7
    first_rep = response_json["reps"][0]
    assert {
        "repNumber",
        "startSeconds",
        "bottomSeconds",
        "endSeconds",
        "bottomElbowAngle",
        "depthFeedback",
    } == first_rep.keys()


def test_analyze_rejects_unsupported_exercise(squat_front_recording: dict[str, Any]) -> None:
    response = client.post("/api/analyze", json={**squat_front_recording, "exercise": "deadlift"})

    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"] == ["body", "exercise"]
    assert "squat" in error["msg"]


def test_analyze_rejects_wrong_landmark_count() -> None:
    frame = {"timestampMs": 0, "landmarks": [{"x": 0, "y": 0, "z": 0, "visibility": 1}] * 5}
    response = client.post(
        "/api/analyze",
        json={"exercise": "squat", "frames": [frame, frame], "videoWidth": 100, "videoHeight": 100},
    )

    assert response.status_code == 422
