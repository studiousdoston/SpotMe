"""Shared test helpers: fixture loading and synthetic frame builders."""

import json
import math
from pathlib import Path
from typing import Any

import pytest

FIXTURES_DIRECTORY = Path(__file__).parent / "fixtures"
SQUAT_FRONT_FIXTURE = FIXTURES_DIRECTORY / "squat-front.landmarks.json"
CURL_FRONT_FIXTURE = FIXTURES_DIRECTORY / "curls_front.landmarks.json"
PUSHUP_FRONT_FIXTURE = FIXTURES_DIRECTORY / "pushups_front.landmarks.json"

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


@pytest.fixture
def curl_front_recording() -> dict[str, Any]:
    """Real alternating-curl recording from the web app (PoseRecording JSON, without the exercise field)."""
    with CURL_FRONT_FIXTURE.open() as fixture_file:
        return json.load(fixture_file)


@pytest.fixture
def pushup_front_recording() -> dict[str, Any]:
    """Real push-up recording filmed from the front (PoseRecording JSON, without the exercise field)."""
    with PUSHUP_FRONT_FIXTURE.open() as fixture_file:
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


# ---- Synthetic curls ----

# Arm lengths in pixels (upper arm and forearm), and where the shoulders sit (normalized).
UPPER_ARM_PIXELS = 120.0
FOREARM_PIXELS = 110.0
CURL_SHOULDER_Y = 0.30
# Wrist straight below the shoulder when the arm hangs: (120 + 110) px down.
HANGING_WRIST_DROP_PIXELS = UPPER_ARM_PIXELS + FOREARM_PIXELS
FULL_CURL_HEIGHT_PERCENT = 100.0


def build_curl_landmarks(
    left_height_percent: float,
    right_height_percent: float,
    arm_visibility: tuple[float, float] = (0.99, 0.99),
    shoulder_x_gap: float = 0.2,
    shoulder_z_gap: float = 0.0,
) -> list[dict[str, float]]:
    """33 landmarks for a standing person filmed from the front, each wrist at a curl height.

    Height percent: 0 = arm hanging straight down, 100 = wrist at shoulder level. As in a real
    front view, the forearm comes towards the camera, so the wrist only moves straight up in the image.
    shoulder_x_gap / shoulder_z_gap set the body turn angle: atan(z_gap / x_gap).
    arm_visibility = (left, right) visibility of each arm's elbow and wrist.
    """
    landmarks = [{"x": 0.5, "y": 0.6, "z": 0.0, "visibility": 0.99} for _ in range(33)]
    arm_specs = (
        # (shoulder, elbow, wrist, shoulder x, curl height percent, visibility)
        (11, 13, 15, 0.5 + shoulder_x_gap / 2, left_height_percent, arm_visibility[0]),
        (12, 14, 16, 0.5 - shoulder_x_gap / 2, right_height_percent, arm_visibility[1]),
    )
    for shoulder_index, elbow_index, wrist_index, shoulder_x, height_percent, visibility in arm_specs:
        shoulder_z = shoulder_z_gap / 2 if shoulder_index == 11 else -shoulder_z_gap / 2
        # Pixel positions: elbow straight below the shoulder, wrist risen height_percent of the way up.
        shoulder_pixel_x, shoulder_pixel_y = shoulder_x * VIDEO_WIDTH, CURL_SHOULDER_Y * VIDEO_HEIGHT
        elbow_pixel_y = shoulder_pixel_y + UPPER_ARM_PIXELS
        wrist_pixel_y = shoulder_pixel_y + HANGING_WRIST_DROP_PIXELS * (1 - height_percent / 100)
        for landmark_index, pixel_y, landmark_visibility in (
            (shoulder_index, shoulder_pixel_y, 0.99),
            (elbow_index, elbow_pixel_y, visibility),
            (wrist_index, wrist_pixel_y, visibility),
        ):
            landmarks[landmark_index] = {
                "x": shoulder_pixel_x / VIDEO_WIDTH,
                "y": pixel_y / VIDEO_HEIGHT,
                "z": shoulder_z if landmark_index == shoulder_index else 0.0,
                "visibility": landmark_visibility,
            }
    return landmarks


def build_curl_recording(
    curls_per_arm: int,
    top_height_percent: float = FULL_CURL_HEIGHT_PERCENT,
    arm_visibility: tuple[float, float] = (0.99, 0.99),
    shoulder_x_gap: float = 0.2,
    shoulder_z_gap: float = 0.0,
    curl_seconds: float = 2.0,
    rest_seconds: float = 0.5,
) -> dict[str, Any]:
    """Alternating curls: left, right, left, ... each arm `curls_per_arm` times (cosine up and down)."""
    frames: list[dict[str, Any]] = []
    frame_index = 0

    def add_frame(left_height_percent: float, right_height_percent: float) -> None:
        nonlocal frame_index
        landmarks = build_curl_landmarks(
            left_height_percent, right_height_percent, arm_visibility, shoulder_x_gap, shoulder_z_gap
        )
        frames.append({"timestampMs": frame_index * 1000 / FPS, "landmarks": landmarks})
        frame_index += 1

    def rest() -> None:
        for _ in range(round(rest_seconds * FPS)):
            add_frame(0.0, 0.0)

    curl_frames = round(curl_seconds * FPS)
    rest()
    for _ in range(curls_per_arm):
        for arm_side in ("left", "right"):
            for curl_frame in range(curl_frames):
                # 0 → 1 → 0 over the curl: the wrist rises from hanging to top_height_percent and back.
                rise_fraction = (1 - math.cos(2 * math.pi * curl_frame / curl_frames)) / 2
                curling_height = rise_fraction * top_height_percent
                if arm_side == "left":
                    add_frame(curling_height, 0.0)
                else:
                    add_frame(0.0, curling_height)
            rest()

    return {
        "frames": frames,
        "videoWidth": VIDEO_WIDTH,
        "videoHeight": VIDEO_HEIGHT,
        "durationSeconds": frame_index / FPS,
    }


# ---- Synthetic push-ups ----

# Wrists stay on the floor; the shoulders move down as the elbows bend (pixel lengths as for curls).
PUSHUP_FLOOR_Y = 0.80
TOP_ELBOW_ANGLE = 170.0
GOOD_BOTTOM_ELBOW_ANGLE = 70.0


def place_pushup_arm(
    wrist_pixel_x: float, elbow_angle: float, outward: float
) -> tuple[float, float, float, float]:
    """Shoulder straight above the wrist, elbow pushed outwards, so the 2D elbow angle is exactly elbow_angle.

    Returns (shoulder_pixel_y, elbow_pixel_x, elbow_pixel_y, wrist_pixel_y).
    """
    wrist_pixel_y = PUSHUP_FLOOR_Y * VIDEO_HEIGHT
    # Law of cosines: shoulder-to-wrist distance for this elbow angle.
    shoulder_to_wrist = math.sqrt(
        UPPER_ARM_PIXELS**2
        + FOREARM_PIXELS**2
        - 2 * UPPER_ARM_PIXELS * FOREARM_PIXELS * math.cos(math.radians(elbow_angle))
    )
    shoulder_pixel_y = wrist_pixel_y - shoulder_to_wrist
    # Elbow: UPPER_ARM_PIXELS from the shoulder, FOREARM_PIXELS from the wrist, on the outer side.
    distance_down_from_shoulder = (UPPER_ARM_PIXELS**2 - FOREARM_PIXELS**2 + shoulder_to_wrist**2) / (
        2 * shoulder_to_wrist
    )
    distance_outwards = math.sqrt(max(UPPER_ARM_PIXELS**2 - distance_down_from_shoulder**2, 0.0))
    elbow_pixel_x = wrist_pixel_x + outward * distance_outwards
    elbow_pixel_y = shoulder_pixel_y + distance_down_from_shoulder
    return shoulder_pixel_y, elbow_pixel_x, elbow_pixel_y, wrist_pixel_y


def build_pushup_landmarks(
    left_elbow_angle: float,
    right_elbow_angle: float,
    arm_visibility: tuple[float, float] = (0.99, 0.99),
    shoulder_x_gap: float = 0.2,
    shoulder_z_gap: float = 0.0,
) -> list[dict[str, float]]:
    """33 landmarks for a push-up filmed from the front, with both elbow angles set (180 = straight).

    shoulder_x_gap / shoulder_z_gap set the body turn angle: atan(z_gap / x_gap).
    arm_visibility = (left, right) visibility of each arm's elbow and wrist.
    """
    # Hips, knees and ankles barely visible: the push-up must not need them.
    landmarks = [{"x": 0.5, "y": 0.6, "z": 0.0, "visibility": 0.1} for _ in range(33)]
    arm_specs = (
        # (shoulder, elbow, wrist, shoulder x, outward direction, elbow angle, visibility)
        (11, 13, 15, 0.5 + shoulder_x_gap / 2, 1.0, left_elbow_angle, arm_visibility[0]),
        (12, 14, 16, 0.5 - shoulder_x_gap / 2, -1.0, right_elbow_angle, arm_visibility[1]),
    )
    for shoulder_index, elbow_index, wrist_index, shoulder_x, outward, elbow_angle, visibility in arm_specs:
        shoulder_z = shoulder_z_gap / 2 if shoulder_index == 11 else -shoulder_z_gap / 2
        wrist_pixel_x = shoulder_x * VIDEO_WIDTH
        shoulder_pixel_y, elbow_pixel_x, elbow_pixel_y, wrist_pixel_y = place_pushup_arm(
            wrist_pixel_x, elbow_angle, outward
        )
        for landmark_index, pixel_x, pixel_y, landmark_visibility in (
            (shoulder_index, wrist_pixel_x, shoulder_pixel_y, 0.99),
            (elbow_index, elbow_pixel_x, elbow_pixel_y, visibility),
            (wrist_index, wrist_pixel_x, wrist_pixel_y, visibility),
        ):
            landmarks[landmark_index] = {
                "x": pixel_x / VIDEO_WIDTH,
                "y": pixel_y / VIDEO_HEIGHT,
                "z": shoulder_z if landmark_index == shoulder_index else 0.0,
                "visibility": landmark_visibility,
            }
    return landmarks


def build_pushup_recording(
    pushup_count: int,
    bottom_elbow_angles: tuple[float, float] = (GOOD_BOTTOM_ELBOW_ANGLE, GOOD_BOTTOM_ELBOW_ANGLE),
    arm_visibility: tuple[float, float] = (0.99, 0.99),
    shoulder_x_gap: float = 0.2,
    shoulder_z_gap: float = 0.0,
    pushup_seconds: float = 2.0,
    rest_seconds: float = 0.5,
) -> dict[str, Any]:
    """Push-ups where both elbows bend from 170° to (left, right) bottom angles and back (cosine)."""
    frames: list[dict[str, Any]] = []
    frame_index = 0

    def add_frame(left_angle: float, right_angle: float) -> None:
        nonlocal frame_index
        landmarks = build_pushup_landmarks(
            left_angle, right_angle, arm_visibility, shoulder_x_gap, shoulder_z_gap
        )
        frames.append({"timestampMs": frame_index * 1000 / FPS, "landmarks": landmarks})
        frame_index += 1

    def rest() -> None:
        for _ in range(round(rest_seconds * FPS)):
            add_frame(TOP_ELBOW_ANGLE, TOP_ELBOW_ANGLE)

    pushup_frames = round(pushup_seconds * FPS)
    rest()
    for _ in range(pushup_count):
        for pushup_frame in range(pushup_frames):
            # 0 → 1 → 0 over the push-up: down to the bottom angles and back up.
            bend_fraction = (1 - math.cos(2 * math.pi * pushup_frame / pushup_frames)) / 2
            add_frame(
                TOP_ELBOW_ANGLE - bend_fraction * (TOP_ELBOW_ANGLE - bottom_elbow_angles[0]),
                TOP_ELBOW_ANGLE - bend_fraction * (TOP_ELBOW_ANGLE - bottom_elbow_angles[1]),
            )
        rest()

    return {
        "frames": frames,
        "videoWidth": VIDEO_WIDTH,
        "videoHeight": VIDEO_HEIGHT,
        "durationSeconds": frame_index / FPS,
    }


# ---- Gaps ----


def remove_frames_between(
    recording: dict[str, Any], start_seconds: float, end_seconds: float
) -> dict[str, Any]:
    """Copy of the recording without the frames strictly between two times (like a backgrounded app)."""
    kept_frames = [
        frame
        for frame in recording["frames"]
        if not start_seconds * 1000 < frame["timestampMs"] < end_seconds * 1000
    ]
    return {**recording, "frames": kept_frames}
