import type { Landmark } from "@/types/pose";

// Same connections as notebooks/01: shoulders + arms, torso, legs (landmarks 11–28).
export const SKELETON_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // shoulders + arms
  [11, 23], [12, 24], [23, 24], // torso
  [23, 25], [25, 27], [24, 26], [26, 28], // legs
];

// Joints that get a dot: every landmark from 11 (left shoulder) to 28 (right ankle).
const FIRST_JOINT_INDEX = 11;
const LAST_JOINT_INDEX = 28;

// Joints below this visibility are hidden instead of drawn as guesses.
export const MIN_JOINT_VISIBILITY = 0.5;

// Matches --color-accent in src/index.css.
const SKELETON_LINE_COLOR = "#a3e635";
const JOINT_DOT_COLOR = "#ffffff";

function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark !== undefined && landmark.visibility >= MIN_JOINT_VISIBILITY;
}

// Draws the body skeleton onto a canvas of the given pixel size.
// Landmarks are normalized (0–1), so they are scaled to width/height here.
// The caller clears the canvas; this only draws, so other layers (rep count, angles) can be added.
export function drawSkeleton(
  context: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
): void {
  // Scale stroke and dot size with the video so they look the same on any resolution.
  const lineWidth = Math.max(2, Math.min(width, height) * 0.008);
  const jointRadius = lineWidth * 1.2;

  // Lines between connected joints (only when both ends are visible).
  context.strokeStyle = SKELETON_LINE_COLOR;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  for (const [startIndex, endIndex] of SKELETON_CONNECTIONS) {
    const startLandmark = landmarks[startIndex];
    const endLandmark = landmarks[endIndex];
    if (!isVisible(startLandmark) || !isVisible(endLandmark)) continue;
    context.beginPath();
    context.moveTo(startLandmark.x * width, startLandmark.y * height);
    context.lineTo(endLandmark.x * width, endLandmark.y * height);
    context.stroke();
  }

  // Small dots on each visible joint.
  context.fillStyle = JOINT_DOT_COLOR;
  for (let jointIndex = FIRST_JOINT_INDEX; jointIndex <= LAST_JOINT_INDEX; jointIndex++) {
    const jointLandmark = landmarks[jointIndex];
    if (!isVisible(jointLandmark)) continue;
    context.beginPath();
    context.arc(jointLandmark.x * width, jointLandmark.y * height, jointRadius, 0, Math.PI * 2);
    context.fill();
  }
}
