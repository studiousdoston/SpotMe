// One body point from MediaPipe Pose, in normalized image coordinates.
// x and y are 0–1 across the frame; z is depth relative to the hips; visibility is 0–1.
export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

// One analyzed video frame.
// landmarks holds 33 points, or null when no person was found
// (kept instead of skipped, like the notebook's NaN rows, so the timeline stays even).
export type PoseFrame = {
  timestampMs: number;
  landmarks: Landmark[] | null;
};

// Everything extracted from one video.
export type PoseRecording = {
  frames: PoseFrame[];
  videoWidth: number;
  videoHeight: number;
  durationSeconds: number;
};

// Numbers about one extraction run, shown under the player.
export type PoseExtractionStats = {
  framesProcessed: number;
  framesWithPerson: number;
  // Frames the browser showed while the model was still busy with the previous one.
  framesSkipped: number;
  // Longest stretch of video time between two analyzed frames.
  largestGapMs: number;
  processingTimeMs: number;
};
