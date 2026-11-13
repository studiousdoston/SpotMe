// One mapping from server feedback codes to a tone, shared by the Results badges
// and the video overlay (skeleton tint + grade pop-up), so both always agree.

export type FeedbackTone = "good" | "warning" | "bad" | "neutral";

// Same as the notebook's ✅ / ⚠️ / ❌.
const TONE_BY_FEEDBACK_CODE: Record<string, FeedbackTone> = {
  good_depth: "good",
  controlled: "good",
  almost_depth: "warning",
  dropping_too_fast: "warning",
  too_fast: "warning",
  too_shallow: "bad",
};

export function getFeedbackTone(feedbackCode: string): FeedbackTone {
  return TONE_BY_FEEDBACK_CODE[feedbackCode] ?? "neutral";
}

// Canvas colors per tone: Tailwind's green/amber/red-500, the same hues as the badge classes.
export const FEEDBACK_TONE_COLORS: Record<FeedbackTone, string> = {
  good: "#22c55e",
  warning: "#f59e0b",
  bad: "#ef4444",
  neutral: "#a3a3a3",
};

// Short labels for the overlay pop-up (the full server text is too long for a video graphic).
const SHORT_TEXT_BY_FEEDBACK_CODE: Record<string, string> = {
  good_depth: "Good depth",
  almost_depth: "Almost deep enough",
  too_shallow: "Too shallow",
  controlled: "Controlled",
  dropping_too_fast: "Dropped too fast",
  too_fast: "Too fast",
};

export function getShortFeedbackText(feedback: { code: string; text: string }): string {
  return SHORT_TEXT_BY_FEEDBACK_CODE[feedback.code] ?? feedback.text;
}
