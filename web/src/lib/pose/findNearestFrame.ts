import type { PoseFrame } from "@/types/pose";

// Returns the stored frame whose timestamp is closest to timeMs (binary search;
// frames are sorted by timestamp). Returns null for an empty recording.
export function findNearestFrame(frames: PoseFrame[], timeMs: number): PoseFrame | null {
  if (frames.length === 0) return null;

  // Find the first frame at or after timeMs.
  let lowIndex = 0;
  let highIndex = frames.length - 1;
  while (lowIndex < highIndex) {
    const middleIndex = Math.floor((lowIndex + highIndex) / 2);
    if (frames[middleIndex].timestampMs < timeMs) {
      lowIndex = middleIndex + 1;
    } else {
      highIndex = middleIndex;
    }
  }

  // Pick whichever of it and the frame before it is closer.
  const frameAfter = frames[lowIndex];
  const frameBefore = lowIndex > 0 ? frames[lowIndex - 1] : null;
  if (frameBefore !== null && timeMs - frameBefore.timestampMs < frameAfter.timestampMs - timeMs) {
    return frameBefore;
  }
  return frameAfter;
}
