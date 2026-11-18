import type { Workout } from "./workouts";

export type Exercise = { name: string; sets: number; reps: number | string; weightKg: number | null; substitute?: string };
export type DayPlan = { weekday: number; exercises: Exercise[] };
export type TrainingLog = {
  id: string; dayKey: string; sport: Workout; planSlot: number | null; durationSeconds: number | null;
  distanceMeters: number | null; exercises: Exercise[];
};
export type TrainingSummary = {
  id: string; name: string; description: string; workout: Workout;
  coverId: string | null; archived: boolean; logCount: number;
};
export type TrainingDetail = TrainingSummary & {
  restSeconds: number; restEndsAt: number | null; plans: DayPlan[]; logs: TrainingLog[]; obligations: string;
  previousChecks: { dayKey: string; done: boolean; note: string }[];
};
// Existing weekday keys remain stable: Monday's exercises become A, Sunday becomes G.
export const TRAINING_ORDER = [1, 2, 3, 4, 5, 6, 0];
export function isTrainingSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && TRAINING_ORDER.includes(value);
}
export function trainingPlanLabel(slot: number) {
  return "Treino " + String.fromCharCode(65 + TRAINING_ORDER.indexOf(slot));
}

export function elapsedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  if (minutes < 60) return minutes + ":" + ss;
  return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0") + ":" + ss;
}
export function parseElapsed(input: string) {
  const parts = input.trim().split(":");
  if (parts.length > 3 || parts.some((v, i) => !/^\d+$/.test(v) || (i > 0 && Number(v) >= 60))) return 0;
  return parts.length === 1 ? Number(parts[0]) * 60 : parts.reduce((n, v) => n * 60 + Number(v), 0);
}
export function paceSeconds(seconds: number, meters: number) {
  return Math.round(seconds * 1000 / meters);
}

/** -1 indica que a ficha não especificou o treino; o usuário escolhe na revisão. */
export type ImportedDay = DayPlan & { label: string };
export { DOCUMENT_LIMIT as PLAN_FILE_LIMIT, DOCUMENT_TYPES as PLAN_FILE_TYPES } from "./document-types";
