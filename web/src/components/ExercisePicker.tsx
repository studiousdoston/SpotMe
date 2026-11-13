import { EXERCISE_OPTIONS, getExerciseOption } from "@/lib/exercises";
import type { ExerciseId } from "@/types/analysis";

type ExercisePickerProps = {
  selectedExercise: ExerciseId;
  onSelect: (exercise: ExerciseId) => void;
  disabled?: boolean;
};

// Three big tap targets; exercises the server can't analyze yet are shown but disabled.
export function ExercisePicker({
  selectedExercise,
  onSelect,
  disabled = false,
}: ExercisePickerProps) {
  const cameraHint = getExerciseOption(selectedExercise).cameraHint;

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Exercise"
        className="grid grid-cols-3 gap-2"
      >
        {EXERCISE_OPTIONS.map((exerciseOption) => {
          const isSelected = exerciseOption.id === selectedExercise;
          const isDisabled = disabled || !exerciseOption.isAvailable;
          return (
            <button
              key={exerciseOption.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isDisabled}
              onClick={() => onSelect(exerciseOption.id)}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center transition-colors ${
                isSelected
                  ? "border-accent bg-accent/10 text-neutral-100"
                  : "border-neutral-800 bg-neutral-900 text-neutral-300"
              } ${isDisabled ? "cursor-not-allowed opacity-50" : "active:bg-neutral-800"}`}
            >
              <span className="font-semibold">{exerciseOption.label}</span>
              {!exerciseOption.isAvailable && (
                <span className="text-xs text-neutral-400">Coming soon</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Camera tip for the selected exercise */}
      {cameraHint !== null && (
        <p className="text-sm text-neutral-400">{cameraHint}</p>
      )}
    </div>
  );
}
