import type { WorkBreak } from "./types";

export function sortedBreaks(breaks: WorkBreak[]): WorkBreak[] {
  return [...breaks].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Intervals are stored in chronological order, as UTC ISO timestamps. */
export function breakError(breaks: WorkBreak[], start: Date, end: Date): string | null {
  let previousEnd = start.getTime();
  for (const pause of sortedBreaks(breaks)) {
    const from = new Date(pause.startedAt);
    const to = new Date(pause.endedAt);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
        from.toISOString() !== pause.startedAt || to.toISOString() !== pause.endedAt) {
      return "Informe o início e o fim de cada pausa.";
    }
    if (to <= from) return "O fim da pausa deve ser depois do início.";
    if (from < start || to > end) return "A pausa deve ficar dentro dos horários da sessão.";
    if (from.getTime() < previousEnd) return "Duas pausas não podem ocupar o mesmo horário.";
    previousEnd = to.getTime();
  }
  return null;
}

type WorkRow = { startedAt: Date; endedAt: Date | null; breaks: string };

export function storedBreaks(session: WorkRow): WorkBreak[] {
  return JSON.parse(session.breaks) as WorkBreak[];
}

/** Trechos efetivamente trabalhados, sem mudar o dia de referência da sessão. */
export function workIntervals(session: WorkRow, now = Date.now()) {
  const intervals: { start: number; end: number }[] = [];
  let start = session.startedAt.getTime();
  for (const pause of storedBreaks(session)) {
    const end = Date.parse(pause.startedAt);
    if (end > start) intervals.push({ start, end });
    start = Date.parse(pause.endedAt);
  }
  const end = session.endedAt?.getTime() ?? now;
  if (end > start) intervals.push({ start, end });
  return intervals;
}

export function workedMs(session: WorkRow, now = Date.now()) {
  return workIntervals(session, now).reduce((total, part) => total + part.end - part.start, 0);
}

export function totalWorkedMs(sessions: WorkRow[], now = Date.now()) {
  return sessions.reduce((total, session) => total + workedMs(session, now), 0);
}
