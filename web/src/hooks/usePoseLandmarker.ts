import { useEffect, useSyncExternalStore } from "react";
import {
  ensurePoseLandmarkerLoading,
  getPoseLandmarkerState,
  subscribeToPoseLandmarker,
  type SharedPoseLandmarkerState,
} from "@/lib/pose/landmarker";

// What components see: "idle" is reported as "loading", since loading starts on mount.
export type PoseLandmarkerState = Exclude<SharedPoseLandmarkerState, { status: "idle" }>;

const LOADING_STATE: PoseLandmarkerState = { status: "loading" };

// Starts loading (and warming up) the shared pose landmarker when the first component
// using this hook mounts. Every caller sees the same instance and the same status.
export function usePoseLandmarker(): PoseLandmarkerState {
  const sharedState = useSyncExternalStore(subscribeToPoseLandmarker, getPoseLandmarkerState);

  useEffect(() => {
    ensurePoseLandmarkerLoading();
  }, []);

  return sharedState.status === "idle" ? LOADING_STATE : sharedState;
}
