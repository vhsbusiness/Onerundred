import type { DayPlan, Exercise } from "./training-types";
import { isTrainingSlot } from "./training-types";
import { keyToDate } from "./time";

export type SessionDraft = {
  version: 2; date: string; planSlot: number | null; draft: Exercise[] | null;
  checked: number[]; startedAt: number | null; elapsedMs: number;
  km: string; time: string; byPace: boolean; requestId: string | null;
};
export function emptyTrainingSession(date: string): SessionDraft {
  return { version: 2, date, planSlot: null, draft: null, checked: [], startedAt: null,
    elapsedMs: 0, km: "", time: "", byPace: false, requestId: null };
}
export function restoreTrainingSession(raw: string, today: string, plans: DayPlan[]): SessionDraft {
  const value = JSON.parse(raw) as Omit<SessionDraft, "version"> & { version: number };
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.checked) || typeof value.date !== "string")
    return emptyTrainingSession(today);
  // Preserve unfinished sessions from the old weekday-based form, including checklists.
  const legacySlot = keyToDate(value.date).getDay();
  const planSlot = value.version === 1 ? legacySlot : value.planSlot;
  const slot = isTrainingSlot(planSlot) ? planSlot : null;
  return { ...emptyTrainingSession(today), ...value, version: 2, planSlot: slot,
    draft: value.draft ?? (value.version === 1 ? plans.find(p => p.weekday === slot)?.exercises ?? [] : null) };
}
