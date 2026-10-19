import { subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { dayKey, dayRange, keyToDate, todayKey, weekRange } from "./time";
import type { LeisureLogDTO, LeisurePageDTO, LeisureStats } from "./types";

/*
 * Lazer: blocos de "de que horas até que horas" (ex.: jogos). Pode ser registrado
 * à mão ou cronometrado com começar/parar. O bloco pertence ao dia em que começou.
 */

export const DEFAULT_ACTIVITIES = ["Jogos", "Séries e filmes", "Redes sociais", "Esporte", "Social", "Leitura", "Outro"];

function parseClock(v: string, field: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!match) throw new ApiError(400, `Horário inválido em ${field} (use HH:MM)`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new ApiError(400, `Horário inválido em ${field}`);
  return { h, m };
}

function fmtClock(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function serialize(
  row: { id: string; dayKey: string; activity: string; startAt: Date; endAt: Date | null; note: string },
  now = new Date(),
): LeisureLogDTO {
  const end = row.endAt ?? now;
  return {
    id: row.id,
    dayKey: row.dayKey,
    activity: row.activity,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt ? row.endAt.toISOString() : null,
    startTime: fmtClock(row.startAt),
    endTime: row.endAt ? fmtClock(row.endAt) : null,
    note: row.note,
    durationMin: Math.max(0, Math.round((end.getTime() - row.startAt.getTime()) / 60000)),
  };
}

function cleanActivity(v: string | undefined): string {
  const a = (v ?? "").trim().slice(0, 40);
  return a || "Jogos";
}

/**
 * Registro manual: dia + de HH:MM até HH:MM. Se "até" for menor que "de", o bloco
 * atravessou a meia-noite: o dia informado é o do fim, e o início fica no dia anterior
 * (ex.: dia 19, 23:40 → 03:00 = começou às 23:40 do dia 18).
 */
export async function createLeisure(
  userId: string,
  input: { dayKey: string; startTime: string; endTime: string; activity?: string; note?: string },
): Promise<LeisureLogDTO> {
  if (input.dayKey > todayKey()) throw new ApiError(400, "Não dá para registrar lazer no futuro");
  const day = keyToDate(input.dayKey);
  const s = parseClock(input.startTime, "de");
  const e = parseClock(input.endTime, "até");
  let startAt = new Date(day);
  startAt.setHours(s.h, s.m, 0, 0);
  const endAt = new Date(day);
  endAt.setHours(e.h, e.m, 0, 0);
  if (endAt <= startAt) startAt = subDays(startAt, 1);
  if (endAt.getTime() - startAt.getTime() > 16 * 3600000) throw new ApiError(400, "Bloco de lazer longo demais; confira os horários");
  if (endAt > new Date()) throw new ApiError(400, "O horário final ainda não chegou");

  const row = await prisma.leisureLog.create({
    data: {
      userId,
      dayKey: input.dayKey,
      activity: cleanActivity(input.activity),
      startAt,
      endAt,
      note: (input.note ?? "").trim().slice(0, 300),
    },
  });
  return serialize(row);
}

export async function updateLeisure(
  userId: string,
  id: string,
  input: { dayKey: string; startTime: string; endTime: string; activity?: string; note?: string },
): Promise<LeisureLogDTO> {
  const existing = await prisma.leisureLog.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Registro não encontrado");
  const created = await createLeisure(userId, input);
  await prisma.leisureLog.delete({ where: { id } });
  return created;
}

export async function deleteLeisure(userId: string, id: string) {
  const existing = await prisma.leisureLog.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Registro não encontrado");
  await prisma.leisureLog.delete({ where: { id } });
}

/** Cronômetro: começa um bloco agora (encerra qualquer outro em andamento). */
export async function startLeisure(userId: string, activity?: string): Promise<LeisureLogDTO> {
  const now = new Date();
  await prisma.leisureLog.updateMany({ where: { userId, endAt: null }, data: { endAt: now } });
  const row = await prisma.leisureLog.create({
    data: { userId, dayKey: dayKey(now), activity: cleanActivity(activity), startAt: now },
  });
  return serialize(row, now);
}

export async function stopLeisure(userId: string): Promise<LeisureLogDTO | null> {
  const running = await prisma.leisureLog.findFirst({ where: { userId, endAt: null }, orderBy: { startAt: "desc" } });
  if (!running) return null;
  const now = new Date();
  const row = await prisma.leisureLog.update({ where: { id: running.id }, data: { endAt: now } });
  return serialize(row, now);
}

/** Cronômetros de lazer esquecidos de dias anteriores são encerrados à meia-noite. */
export async function autoStopForgottenLeisure(): Promise<void> {
  const { start } = dayRange(todayKey());
  const forgotten = await prisma.leisureLog.findMany({ where: { endAt: null, startAt: { lt: start } } });
  for (const r of forgotten) {
    await prisma.leisureLog.update({ where: { id: r.id }, data: { endAt: dayRange(dayKey(r.startAt)).end } });
  }
}

export async function listLeisure(userId: string, days = 60): Promise<LeisureLogDTO[]> {
  await autoStopForgottenLeisure();
  const since = subDays(dayRange(todayKey()).start, days);
  const rows = await prisma.leisureLog.findMany({
    where: { userId, startAt: { gte: since } },
    orderBy: { startAt: "desc" },
  });
  const now = new Date();
  return rows.map((r) => serialize(r, now));
}

export function computeLeisureStats(logs: LeisureLogDTO[]): LeisureStats {
  const today = todayKey();
  const base = keyToDate(today);
  const week = weekRange(new Date());
  const weekStartKey = dayKey(week.start);
  const cut7 = dayKey(subDays(base, 6));
  const cut14 = dayKey(subDays(base, 13));

  const byDay = new Map<string, number>();
  const byAct = new Map<string, number>();
  let todayMin = 0;
  let weekMin = 0;
  for (const l of logs) {
    if (l.dayKey === today) todayMin += l.durationMin;
    if (l.dayKey >= weekStartKey) weekMin += l.durationMin;
    if (l.dayKey >= cut14) byDay.set(l.dayKey, (byDay.get(l.dayKey) ?? 0) + l.durationMin);
    if (l.dayKey >= cut7) byAct.set(l.activity, (byAct.get(l.activity) ?? 0) + l.durationMin);
  }
  const byDay14 = Array.from({ length: 14 }, (_, i) => {
    const key = dayKey(subDays(base, 13 - i));
    return { key, minutes: byDay.get(key) ?? 0 };
  });
  const last7 = byDay14.slice(-7).reduce((a, d) => a + d.minutes, 0);
  return {
    todayMin,
    weekMin,
    avg7Min: Math.round(last7 / 7),
    byActivity7: [...byAct.entries()].map(([activity, minutes]) => ({ activity, minutes })).sort((a, b) => b.minutes - a.minutes),
    byDay14,
  };
}

export async function getLeisurePage(userId: string): Promise<LeisurePageDTO> {
  const logs = await listLeisure(userId);
  const running = logs.find((l) => !l.endAt) ?? null;
  const used = [...new Set(logs.map((l) => l.activity))];
  const activities = [...DEFAULT_ACTIVITIES, ...used.filter((a) => !DEFAULT_ACTIVITIES.includes(a))];
  return { logs, running, stats: computeLeisureStats(logs.filter((l) => l.endAt)), activities };
}
