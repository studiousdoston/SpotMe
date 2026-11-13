import { useContext } from "react";
import { WorkoutSessionContext, type WorkoutSessionContextValue } from "@/lib/workoutSession/workoutSessionContext";

// Access the current workout session (must be inside WorkoutSessionProvider).
export function useWorkoutSession(): WorkoutSessionContextValue {
  const contextValue = useContext(WorkoutSessionContext);
  if (contextValue === null) {
    throw new Error("useWorkoutSession must be used inside WorkoutSessionProvider.");
  }
  return contextValue;
}
