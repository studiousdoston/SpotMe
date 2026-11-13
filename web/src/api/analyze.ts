import { useMutation } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { apiClient } from "@/api/client";
import type { AnalysisResult, AnalyzableExercise, AnalyzeRequest, ValidationErrorItem } from "@/types/analysis";
import type { PoseRecording } from "@/types/pose";

// Uploading landmarks from a phone on gym Wi-Fi can be slow for long sets,
// so this call gets more time than the client's default.
const ANALYZE_TIMEOUT_MS = 60_000;

// 4 decimals of a 0–1 coordinate is ~0.1 px on a 1080p frame: no visible loss, much smaller JSON.
function roundTo4Decimals(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// Builds the request body: same shape as PoseRecording, with rounded landmark values.
export function toAnalyzeRequest(exercise: AnalyzableExercise, recording: PoseRecording): AnalyzeRequest {
  return {
    exercise,
    frames: recording.frames.map((frame) => ({
      timestampMs: frame.timestampMs,
      landmarks:
        frame.landmarks?.map((landmark) => ({
          x: roundTo4Decimals(landmark.x),
          y: roundTo4Decimals(landmark.y),
          z: roundTo4Decimals(landmark.z),
          visibility: roundTo4Decimals(landmark.visibility),
        })) ?? null,
    })),
    videoWidth: recording.videoWidth,
    videoHeight: recording.videoHeight,
    durationSeconds: Number.isFinite(recording.durationSeconds) ? recording.durationSeconds : null,
  };
}

// Sends the landmarks to the server; resolves with rep counts and per-rep grades.
export async function analyzeRecording(
  exercise: AnalyzableExercise,
  recording: PoseRecording,
): Promise<AnalysisResult> {
  const response = await apiClient.post<AnalysisResult>("/analyze", toAnalyzeRequest(exercise, recording), {
    timeout: ANALYZE_TIMEOUT_MS,
  });
  return response.data;
}

type AnalyzeVariables = {
  exercise: AnalyzableExercise;
  recording: PoseRecording;
};

// Mutation hook used by the Upload page.
export function useAnalyzeRecordingMutation() {
  return useMutation({
    mutationFn: ({ exercise, recording }: AnalyzeVariables) => analyzeRecording(exercise, recording),
  });
}

// ---- Error messages ----

function isValidationErrorItem(value: unknown): value is ValidationErrorItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "msg" in value &&
    typeof value.msg === "string" &&
    "loc" in value &&
    Array.isArray(value.loc)
  );
}

// First field error from FastAPI's 422 body, e.g. "exercise: Input should be 'squat'".
function describeValidationError(responseData: unknown): string | null {
  if (typeof responseData !== "object" || responseData === null || !("detail" in responseData)) return null;
  const errorDetail = responseData.detail;
  if (!Array.isArray(errorDetail) || !isValidationErrorItem(errorDetail[0])) return null;
  const firstError = errorDetail[0];
  // Drop the leading "body" from the location.
  const fieldPath = firstError.loc.slice(1).join(".");
  return fieldPath ? `${fieldPath}: ${firstError.msg}` : firstError.msg;
}

// Turns an analyze failure into a message for the user.
export function describeAnalyzeError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "Something went wrong while analyzing this set. Try again.";
  }

  // Timed out.
  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return "The server took too long to answer. Check your connection and try again.";
  }

  // No response at all, or the proxy (Vite in dev, Nginx in production) couldn't reach the API.
  const statusCode = error.response?.status;
  if (statusCode === undefined || statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return "Can't reach the SpotMe server. Check your connection and try again.";
  }

  // The server rejected the data.
  if (statusCode === 422) {
    const validationMessage = describeValidationError(error.response?.data);
    return `The server couldn't use this recording${validationMessage ? ` (${validationMessage})` : ""}.`;
  }

  return `The server had a problem analyzing this set (error ${statusCode}). Try again.`;
}
