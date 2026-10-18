import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/** Chave de dia no formato yyyy-MM-dd (fuso local do servidor). */
export function dayKey(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function tomorrowKey(): string {
  return dayKey(addDays(new Date(), 1));
}

/** Converte uma chave yyyy-MM-dd em Date local (meia-noite). */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Intervalo [start, end) de um dia. */
export function dayRange(key: string): { start: Date; end: Date } {
  const start = startOfDay(keyToDate(key));
  return { start, end: addDays(start, 1) };
}

/** Semana começando na segunda-feira. */
export function weekRange(date: Date = new Date()): { start: Date; end: Date; endKey: string } {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const last = endOfWeek(date, { weekStartsOn: 1 });
  return { start, end: addDays(startOfDay(last), 1), endKey: dayKey(last) };
}

export function monthRange(date: Date = new Date()): { start: Date; end: Date; endKey: string } {
  const start = startOfMonth(date);
  const last = endOfMonth(date);
  return { start, end: addDays(startOfDay(last), 1), endKey: dayKey(last) };
}

/** 1h 23m / 45m / 0m */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** 01:23:45 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}

export function minutesToLabel(min: number | null | undefined): string {
  if (!min) return "—";
  return formatDuration(min * 60000);
}

/** Soma a duração de sessões (com ou sem fim) até `now`. */
export function sumSessions(
  sessions: { startedAt: Date | string; endedAt: Date | string | null }[],
  now: Date = new Date(),
): number {
  return sessions.reduce((acc, s) => {
    const start = new Date(s.startedAt).getTime();
    const end = s.endedAt ? new Date(s.endedAt).getTime() : now.getTime();
    return acc + Math.max(0, end - start);
  }, 0);
}

export function weekdayShort(key: string): string {
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return names[keyToDate(key).getDay()];
}

export function formatDayLong(key: string): string {
  const d = keyToDate(key);
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const meses = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
}
