import { getFeedbackTone, type FeedbackTone } from "@/lib/feedbackTone";
import type { Feedback } from "@/types/analysis";

// Tailwind classes per tone (same hues as FEEDBACK_TONE_COLORS used on the video overlay).
const TONE_CLASSES: Record<FeedbackTone, string> = {
  good: "bg-green-500/15 text-green-300 ring-green-500/30",
  warning: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
  bad: "bg-red-500/15 text-red-300 ring-red-500/30",
  neutral: "bg-neutral-800 text-neutral-300 ring-neutral-700",
};

// Small colored pill. The text always carries the meaning; color only reinforces it.
export function FeedbackBadge({ feedback }: { feedback: Feedback }) {
  const tone = getFeedbackTone(feedback.code);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}>
      {feedback.text}
    </span>
  );
}
