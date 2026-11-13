"""Shared test helpers: fixture loading and synthetic frame builders."""

import json
import math
from pathlib import Path
from typing import Any

import pytest

FIXTURES_DIRECTORY = Path(__file__).parent / "fixtures"
SQUAT_FRONT_FIXTURE = FIXTURES_DIRECTORY / "squat-front.landmarks.json"

FPS = 30.0
VIDEO_WIDTH = 480
VIDEO_HEIGHT = 848

# Standing pose (normalized y): shoulders above hips above knees; torso = 0.2 of the frame height.
SHOULDER_Y = 0.30
HIP_Y_STANDING = 0.50
KNEE_Y = 0.70
TORSO_HEIGHT = HIP_Y_STANDING - SHOULDER_Y


@pytest.fixture
def squat_front_recording() -> dict[str, Any]:
    """Real recording from the web app (PoseRecording JSON, without the exercise field)."""
    with SQUAT_FRONT_FIXTURE.open() as fixture_file:
        return json.load(fixture_file)


def build_landmarks(hip_y: float, visibility: float) -> list[dict[str, float]]:
    """33 landmarks for a front-facing person whose hips are at hip_y; the torso moves with the hips."""
    shoulder_y = hip_y - TORSO_HEIGHT
    landmarks = [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": visibility} for _ in range(33)]
    for landmark_index, (x_position, y_position) in {
        11: (0.45, shoulder_y),
        12: (0.55, shoulder_y),
        23: (0.46, hip_y),
        24: (0.54, hip_y),
        25: (0.46, KNEE_Y),
        26: (0.54, KNEE_Y),
    }.items():
        landmarks[landmark_index] = {"x": x_position, "y": y_position, "z": 0.0, "visibility": visibility}
    return landmarks


def build_squat_recording(
    squat_count: int,
    visibility: float = 0.99,
    squat_seconds: float = 2.5,
    rest_seconds: float = 1.0,
) -> dict[str, Any]:
    """Recording where the hips drop smoothly to knee height `squat_count` times (cosine down and up)."""
    frames: list[dict[str, Any]] = []
    frame_index = 0

    def add_frame(hip_y: float) -> None:
        nonlocal frame_index
        frames.append(
            {"timestampMs": frame_index * 1000 / FPS, "landmarks": build_landmarks(hip_y, visibility)}
        )
        frame_index += 1

    rest_frames = round(rest_seconds * FPS)
    squat_frames = round(squat_seconds * FPS)
    for _ in range(rest_frames):
        add_frame(HIP_Y_STANDING)
    for _ in range(squat_count):
        for squat_frame in range(squat_frames):
            # 0 → 1 → 0 over the squat: hips go from standing to knee height and back.
            drop_fraction = (1 - math.cos(2 * math.pi * squat_frame / squat_frames)) / 2
            add_frame(HIP_Y_STANDING + drop_fraction * (KNEE_Y - HIP_Y_STANDING))
        for _ in range(rest_frames):
            add_frame(HIP_Y_STANDING)

    return {
        "frames": frames,
        "videoWidth": VIDEO_WIDTH,
        "videoHeight": VIDEO_HEIGHT,
        "durationSeconds": frame_index / FPS,
    }
