import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Must match the installed @mediapipe/tasks-vision version in package.json,
// so the WASM runtime and the JS bundle stay in sync. Bump both together.
const TASKS_VISION_VERSION = "1.2.3";
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

// Same model as notebooks/01 (pose_landmarker_full, float16), loaded from Google's storage.
// The .task file is never stored in this repo.
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

// Size of the blank image used to warm the model up.
const WARM_UP_CANVAS_SIZE = 256;

export type PoseDelegate = "GPU" | "CPU";

// Lifecycle of the one shared landmarker:
// idle → loading (download + create) → preparing (warm-up) → ready, or error.
export type SharedPoseLandmarkerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "preparing" }
  | { status: "ready"; poseLandmarker: PoseLandmarker; delegate: PoseDelegate }
  | { status: "error"; errorMessage: string };

// ---- Strictly increasing detector timestamps ----

// VIDEO mode requires timestamps that strictly increase for the landmarker's whole life,
// including the warm-up and every video analyzed afterwards.
let lastDetectorTimestampMs = 0;

// Next free timestamp (used for one-off detections like the warm-up).
function takeNextDetectorTimestamp(): number {
  lastDetectorTimestampMs += 1;
  return lastDetectorTimestampMs;
}

// A clock for one video run: continues after the last timestamp ever sent,
// so a second video (which restarts at 0 ms) still moves forward.
export function createDetectorClock(): (videoTimeMs: number) => number {
  const runStartOffsetMs = lastDetectorTimestampMs + 1;
  return (videoTimeMs: number) => {
    const detectorTimestampMs = Math.max(runStartOffsetMs + videoTimeMs, lastDetectorTimestampMs + 1);
    lastDetectorTimestampMs = detectorTimestampMs;
    return detectorTimestampMs;
  };
}

// ---- Creating and warming up ----

// Creates a landmarker with the notebook's settings on the given delegate.
async function createPoseLandmarker(delegate: PoseDelegate): Promise<PoseLandmarker> {
  const visionFileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  return PoseLandmarker.createFromOptions(visionFileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// The first detection is very slow (GPU shader compilation, ~4 s on desktop Chrome)
// and blocks the main thread. Doing it once here, on a blank canvas, keeps that
// pause out of the video analysis.
// Note: a blank image has no person, so only the person-detector stage warms up here;
// the landmark stage warms up on the first real video frame (analyzed while paused).
async function warmUpPoseLandmarker(poseLandmarker: PoseLandmarker): Promise<void> {
  // Give the browser a moment to paint "Preparing pose model…" before the main thread blocks.
  await new Promise((resolve) => window.setTimeout(resolve, 50));

  const warmUpCanvas = document.createElement("canvas");
  warmUpCanvas.width = WARM_UP_CANVAS_SIZE;
  warmUpCanvas.height = WARM_UP_CANVAS_SIZE;
  const warmUpContext = warmUpCanvas.getContext("2d");
  if (warmUpContext !== null) {
    warmUpContext.fillStyle = "#000000";
    warmUpContext.fillRect(0, 0, WARM_UP_CANVAS_SIZE, WARM_UP_CANVAS_SIZE);
  }
  poseLandmarker.detectForVideo(warmUpCanvas, takeNextDetectorTimestamp());
}

// Creates + warms up on one delegate, reporting "preparing" between the two steps.
async function createReadyPoseLandmarker(delegate: PoseDelegate): Promise<PoseLandmarker> {
  const poseLandmarker = await createPoseLandmarker(delegate);
  setSharedState({ status: "preparing" });
  try {
    await warmUpPoseLandmarker(poseLandmarker);
  } catch (warmUpError: unknown) {
    poseLandmarker.close();
    throw warmUpError;
  }
  return poseLandmarker;
}

// GPU first (much faster); if creating OR warming up fails there, fall back to the CPU.
async function loadSharedPoseLandmarker(): Promise<void> {
  setSharedState({ status: "loading" });
  try {
    const gpuLandmarker = await createReadyPoseLandmarker("GPU");
    setSharedState({ status: "ready", poseLandmarker: gpuLandmarker, delegate: "GPU" });
    return;
  } catch (gpuError: unknown) {
    console.warn("GPU pose landmarker failed, falling back to CPU.", gpuError);
  }

  try {
    setSharedState({ status: "loading" });
    const cpuLandmarker = await createReadyPoseLandmarker("CPU");
    setSharedState({ status: "ready", poseLandmarker: cpuLandmarker, delegate: "CPU" });
  } catch (cpuError: unknown) {
    console.error("Pose model failed to load.", cpuError);
    setSharedState({
      status: "error",
      errorMessage: "The pose model couldn't be loaded. Check your connection and reload the page.",
    });
  }
}

// ---- Shared store (read by usePoseLandmarker through useSyncExternalStore) ----

// Module-level singleton: the whole app shares ONE landmarker.
let sharedState: SharedPoseLandmarkerState = { status: "idle" };
const stateListeners = new Set<() => void>();

function setSharedState(nextState: SharedPoseLandmarkerState): void {
  sharedState = nextState;
  stateListeners.forEach((notifyListener) => notifyListener());
}

export function getPoseLandmarkerState(): SharedPoseLandmarkerState {
  return sharedState;
}

export function subscribeToPoseLandmarker(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// Starts loading on first request (and retries after an error). Safe to call repeatedly.
export function ensurePoseLandmarkerLoading(): void {
  if (sharedState.status === "idle" || sharedState.status === "error") {
    void loadSharedPoseLandmarker();
  }
}
