import { addDays, subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { dayRange, keyToDate, todayKey } from "./time";
import type { SleepLogDTO, SleepPageDTO, SleepStats } from "./types";

/*
 * Uma "noite" é identificada pelo dia em que a pessoa acordou (dayKey).
 * As horas chegam como "HH:MM": acordei é no próprio dia; deitei e dormi são
 * do dia anterior quando o horário é maior que o de acordar (ex.: 23:30),
 * ou do mesmo dia quando é menor (ex.: 00:40).
 */

function parseClock(v: string, field: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!match) throw new ApiError(400, `Horário inválido em ${field} (use HH:MM)`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new ApiError(400, `Horário inválido em ${field}`);
  return { h, m };
}

function clockMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function fmtClock(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function minutesToClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

/** Média de horários do relógio que atravessam a meia-noite (ex.: 23:00 e 01:00 → 00:00). */
function averageClock(dates: Date[]): string | null {
  if (dates.length === 0) return null;
  // Desloca o "zero" para o meio-dia: horários entre 12:00 e 11:59 do dia seguinte viram contínuos.
  const shifted = dates.map((d) => (clockMinutes(d) + 720) % 1440);
  const avg = shifted.reduce((a, b) => a + b, 0) / shifted.length;
  return minutesToClock(avg - 720);
}

function serialize(row: {
  id: string;
  dayKey: string;
  bedAt: Date;
  sleepAt: Date;
  wakeAt: Date;
  quality: number | null;
  note: string;
}): SleepLogDTO {
  return {
    id: row.id,
    dayKey: row.dayKey,
    bedAt: row.bedAt.toISOString(),
    sleepAt: row.sleepAt.toISOString(),
    wakeAt: row.wakeAt.toISOString(),
    bedTime: fmtClock(row.bedAt),
    sleepTime: fmtClock(row.sleepAt),
    wakeTime: fmtClock(row.wakeAt),
    quality: row.quality,
    note: row.note,
    durationMin: Math.round((row.wakeAt.getTime() - row.sleepAt.getTime()) / 60000),
    latencyMin: Math.round((row.sleepAt.getTime() - row.bedAt.getTime()) / 60000),
  };
}

export async function upsertSleep(
  userId: string,
  input: { dayKey: string; bedTime: string; sleepTime: string; wakeTime: string; quality: number | null; note: string },
): Promise<SleepLogDTO> {
  if (input.dayKey > todayKey()) throw new ApiError(400, "Não dá para registrar uma noite no futuro");
  const day = keyToDate(input.dayKey);
  const wake = parseClock(input.wakeTime, "acordei");
  const bed = parseClock(input.bedTime, "deitei");
  const sleep = parseClock(input.sleepTime, "dormi");

  const wakeAt = new Date(day);
  wakeAt.setHours(wake.h, wake.m, 0, 0);

  const place = (c: { h: number; m: number }) => {
    const d = new Date(day);
    d.setHours(c.h, c.m, 0, 0);
    // Horário maior que o de acordar pertence à noite anterior.
    return d >= wakeAt ? addDays(d, -1) : d;
  };
  const sleepAt = place(sleep);
  let bedAt = place(bed);
  if (bedAt > sleepAt) bedAt = addDays(bedAt, -1);

  const durationMin = (wakeAt.getTime() - sleepAt.getTime()) / 60000;
  if (durationMin <= 0 || durationMin > 20 * 60) throw new ApiError(400, "Confira os horários: a noite ficou com duração estranha");
  const latencyMin = (sleepAt.getTime() - bedAt.getTime()) / 60000;
  if (latencyMin > 12 * 60) throw new ApiError(400, "Confira o horário em que deitou");

  const row = await prisma.sleepLog.upsert({
    where: { userId_dayKey: { userId, dayKey: input.dayKey } },
    create: { userId, dayKey: input.dayKey, bedAt, sleepAt, wakeAt, quality: input.quality, note: input.note },
    update: { bedAt, sleepAt, wakeAt, quality: input.quality, note: input.note },
  });
  return serialize(row);
}

export async function deleteSleep(userId: string, id: string) {
  const row = await prisma.sleepLog.findFirst({ where: { id, userId } });
  if (!row) throw new ApiError(404, "Registro não encontrado");
  await prisma.sleepLog.delete({ where: { id } });
}

export async function listSleep(userId: string, days = 60): Promise<SleepLogDTO[]> {
  const since = subDays(dayRange(todayKey()).start, days);
  const rows = await prisma.sleepLog.findMany({
    where: { userId, wakeAt: { gte: since } },
    orderBy: { wakeAt: "desc" },
  });
  return rows.map(serialize);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function computeStats(logs: SleepLogDTO[]): SleepStats {
  const today = todayKey();
  const key7 = keyToDate(today);
  const cut7 = subDays(key7, 7);
  const cut30 = subDays(key7, 30);
  const last7 = logs.filter((l) => keyToDate(l.dayKey) > cut7);
  const last30 = logs.filter((l) => keyToDate(l.dayKey) > cut30);
  return {
    nights: logs.length,
    avgDuration7: avg(last7.map((l) => l.durationMin)),
    avgDuration30: avg(last30.map((l) => l.durationMin)),
    avgLatency7: avg(last7.map((l) => l.latencyMin)),
    avgBedTime7: averageClock(last7.map((l) => new Date(l.bedAt))),
    avgSleepTime7: averageClock(last7.map((l) => new Date(l.sleepAt))),
    avgWakeTime7: averageClock(last7.map((l) => new Date(l.wakeAt))),
    lastNight: logs[0] ?? null,
  };
}

export async function getSleepPage(userId: string): Promise<SleepPageDTO> {
  const logs = await listSleep(userId);
  return { logs, stats: computeStats(logs) };
}
