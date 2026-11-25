import { addDays, addMonths, differenceInCalendarDays, format } from "date-fns";
import { ApiError } from "./errors";
import { requireDay } from "./organizer-input";

export const frequencies = { daily: "Diária", weekly: "Semanal", monthly: "Mensal" };
export type SavingsFrequency = keyof typeof frequencies;
export const frequencyUnits = { daily: "dia", weekly: "semana", monthly: "mês" };
export type SavingsPlanInput = { frequency: string; mode: string; amountCents: number; startDay: string; endDay: string };
const date = (day: string) => new Date(day + "T12:00:00");
const key = (day: Date) => format(day, "yyyy-MM-dd");
export function savingsEnd(start: string, duration: number, unit: string) {
  requireDay(start);
  if (!Number.isInteger(duration) || duration < 1 || duration > 3660 || !["days", "weeks", "months"].includes(unit))
    throw new ApiError(400, "Informe uma duração válida.");
  return key(addDays(unit === "months" ? addMonths(date(start), duration) : addDays(date(start), duration * (unit === "weeks" ? 7 : 1)), -1));
}
/** Periods are anchored to the start date; an incomplete final period still has a contribution. */
export function savingsPlan(input: SavingsPlanInput) {
  const { frequency, mode, amountCents, startDay, endDay } = input;
  requireDay(startDay); requireDay(endDay);
  const days = differenceInCalendarDays(date(endDay), date(startDay)) + 1;
  if (days < 1 || days > 3660) throw new ApiError(400, "A duração deve ser de 1 a 3.660 dias.");
  if (!Object.hasOwn(frequencies, frequency) || !["period", "total"].includes(mode)) throw new ApiError(400, "Escolha a frequência e o tipo de cálculo.");
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 2147483647) throw new ApiError(400, "Informe um valor positivo válido.");
  const periods: { start: string; end: string; targetCents: number }[] = [];
  const boundary = (index: number) => key(frequency === "monthly" ? addMonths(date(startDay), index) : addDays(date(startDay), index * (frequency === "weekly" ? 7 : 1)));
  for (let i = 0; boundary(i) <= endDay; i++) {
    periods.push({ start: boundary(i), end: key(addDays(date(boundary(i + 1)), -1)) < endDay ? key(addDays(date(boundary(i + 1)), -1)) : endDay, targetCents: 0 });
  }
  const totalCents = mode === "total" ? amountCents : amountCents * periods.length;
  if (!Number.isSafeInteger(totalCents) || totalCents > 2147483647) throw new ApiError(400, "O total ultrapassa o valor máximo permitido.");
  if (totalCents < periods.length) throw new ApiError(400, "O total precisa permitir pelo menos R$ 0,01 por período.");
  const base = Math.floor(totalCents / periods.length), extra = totalCents % periods.length;
  periods.forEach((period, index) => { period.targetCents = base + (index < extra ? 1 : 0); });
  return { periods, totalCents, days };
}


export type SavingsDefinition = SavingsPlanInput & { name: string; reminderTime: string | null };
export function savingsDefinition(goal: SavingsDefinition): SavingsDefinition {
  return { name: goal.name, frequency: goal.frequency, mode: goal.mode, amountCents: goal.amountCents,
    startDay: goal.startDay, endDay: goal.endDay, reminderTime: goal.reminderTime };
}

/** Reconstruct the duration without changing the saved end date when opening the editor. */
export function savingsDuration(start: string, end: string) {
  for (let months = 1; months <= 121; months++) {
    const candidate = savingsEnd(start, months, "months");
    if (candidate === end) return { value: months, unit: "months" };
    if (candidate > end) break;
  }
  const days = differenceInCalendarDays(date(end), date(start)) + 1;
  return days % 7 === 0 ? { value: days / 7, unit: "weeks" } : { value: days, unit: "days" };
}

export function checkSavingsEdit(previous: SavingsPlanInput, next: SavingsPlanInput, recordedStarts: string[]) {
  if (!recordedStarts.length) return;
  const oldPeriods = new Map(savingsPlan(previous).periods.map(p => [p.start, p.end]));
  const newPeriods = new Map(savingsPlan(next).periods.map(p => [p.start, p.end]));
  if (recordedStarts.some(start => !newPeriods.has(start) || newPeriods.get(start) !== oldPeriods.get(start)))
    throw new ApiError(400, "Este ajuste mudaria ou removeria um período já registrado. Preserve suas datas; os valores e o lembrete podem ser alterados.");
}
