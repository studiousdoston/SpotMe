import type { AnalyzableExercise, ExerciseId } from "@/types/analysis";

export type ExerciseOption = {
  id: ExerciseId;
  label: string;
  // Used in "6 squats".
  pluralLabel: string;
  isAvailable: boolean;
  // Shown under the picker for the selected exercise (null while not available yet).
  cameraHint: string | null;
};

// Shown in this order in the exercise picker.
export const EXERCISE_OPTIONS: ExerciseOption[] = [
  {
    id: "squat",
    label: "Squat",
    pluralLabel: "squats",
    isAvailable: true,
    cameraHint: "Any angle, keep hips and knees in frame.",
  },
  { id: "bicep_curl", label: "Bicep curl", pluralLabel: "curls", isAvailable: false, cameraHint: null },
  { id: "push_up", label: "Push-up", pluralLabel: "push-ups", isAvailable: false, cameraHint: null },
];

export function getExerciseOption(exerciseId: ExerciseId): ExerciseOption {
  const exerciseOption = EXERCISE_OPTIONS.find((option) => option.id === exerciseId);
  if (exerciseOption === undefined) throw new Error(`Unknown exercise: ${exerciseId}`);
  return exerciseOption;
}

// Narrows an exercise to one the server can analyze today.
export function isAnalyzableExercise(exerciseId: ExerciseId): exerciseId is AnalyzableExercise {
  return exerciseId === "squat";
}

// "1 squat" / "6 squats"
export function formatRepCount(exerciseId: ExerciseId, repCount: number): string {
  const exerciseOption = getExerciseOption(exerciseId);
  const singularLabel = exerciseOption.pluralLabel.replace(/s$/, "");
  return `${repCount} ${repCount === 1 ? singularLabel : exerciseOption.pluralLabel}`;
}
