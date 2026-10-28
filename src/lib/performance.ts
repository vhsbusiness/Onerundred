import { addDays, subDays } from "date-fns";
import { prisma } from "./db";
import { periodScore, type MetricCard } from "./metrics";
import { listLeisure } from "./leisure";
import { listProjects } from "./projects";
import { listSleep } from "./sleep";
import { boardAccess, getSettings, runMaintenance } from "./repo";
import { dayKey, dayRange, formatDuration, keyToDate, todayKey } from "./time";
import type { PerfComponent, PerformanceDayDTO, PerformanceDTO, PeriodReviewDTO, TargetsDTO } from "./types";

/*
 * Performance diária (0–100): média ponderada de quatro frentes, usando só as que têm
 * dado no dia — tarefas (nota do dia), sono (duração e horários contra a meta), lazer
 * (minutos contra a meta) e metas (dias marcados como feitos). Constância = dias
 * seguidos com performance ≥ 70.
 */

export const PERF_GOOD = 70;
const WEIGHTS = { tasks: 40, sleep: 25, leisure: 15, goals: 20 } as const;
const DEFAULT_SLEEP_MIN = 8 * 60;
const DEFAULT_LEISURE_MIN = 60;

function clockToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
/** 100 se chegou no horário; perde 20 pontos a cada 30 min de atraso. */
function punctuality(actualMin: number, targetMin: number, nightWrap: boolean): number {
  let late = actualMin - targetMin;
  // Deitar depois da meia-noite com meta à noite (ex.: meta 23:00, deitou 00:40 → 100 min atrasado).
  if (nightWrap && late < -12 * 60) late += 24 * 60;
  if (nightWrap && late > 12 * 60) late -= 24 * 60;
  return clamp(100 - Math.max(0, late) * (20 / 30));
}
function weightedAverage(parts: PerfComponent[]): number | null {
  const valid = parts.filter((p) => p.score !== null);
  if (valid.length === 0) return null;
  const total = valid.reduce((a, p) => a + p.weight, 0);
  return Math.round(valid.reduce((a, p) => a + (p.score as number) * p.weight, 0) / total);
}

interface DayData {
  cards: MetricCard[];
  hasTodayList: boolean;
  sleepByDay: Map<string, { durationMin: number; bedAt: Date; wakeAt: Date }>;
  leisureByDay: Map<string, number>;
  goalsByDay: Map<string, { done: number; missed: number }>;
  workByDay: Map<string, number>;
  doneByDay: Map<string, number>;
  targets: TargetsDTO;
}

function computeDay(key: string, d: DayData): PerformanceDayDTO {
  const { start, end } = dayRange(key);
  const taskScore = periodScore(d.cards, start, end, key, { hasTodayList: d.hasTodayList });
  const components: PerfComponent[] = [];

  components.push({
    key: "tasks",
    label: "Tarefas",
    weight: WEIGHTS.tasks,
    score: taskScore.score,
    detail:
      taskScore.score === null
        ? "sem tarefas no dia"
        : `${taskScore.doneCount} feitas · ${taskScore.openCount - taskScore.postponedCount} abertas${taskScore.postponedCount ? ` · ${taskScore.postponedCount} realocadas` : ""}`,
  });

  const sleep = d.sleepByDay.get(key);
  const sleepTarget = d.targets.sleepMinutes ?? DEFAULT_SLEEP_MIN;
  if (sleep) {
    const parts: number[] = [clamp((sleep.durationMin / sleepTarget) * 100)];
    const bits = [`${formatDuration(sleep.durationMin * 60000)} de ${formatDuration(sleepTarget * 60000)}`];
    if (d.targets.bedtime) {
      const p = punctuality(sleep.bedAt.getHours() * 60 + sleep.bedAt.getMinutes(), clockToMin(d.targets.bedtime), true);
      parts.push(p);
      if (p < 100) bits.push("deitou tarde");
    }
    if (d.targets.wake) {
      const p = punctuality(sleep.wakeAt.getHours() * 60 + sleep.wakeAt.getMinutes(), clockToMin(d.targets.wake), false);
      parts.push(p);
      if (p < 100) bits.push("acordou tarde");
    }
    components.push({
      key: "sleep",
      label: "Sono",
      weight: WEIGHTS.sleep,
      score: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length),
      detail: bits.join(" · "),
      hint: d.targets.sleepMinutes ? undefined : "Defina sua meta de sono na aba Metas (usando 8h por enquanto).",
    });
  } else {
    components.push({ key: "sleep", label: "Sono", weight: WEIGHTS.sleep, score: null, detail: "noite sem registro", hint: "Registre a noite na aba Sono." });
  }

  const leisureMin = d.leisureByDay.get(key) ?? 0;
  const leisureTarget = d.targets.leisureMinutes ?? DEFAULT_LEISURE_MIN;
  components.push({
    key: "leisure",
    label: "Lazer",
    weight: WEIGHTS.leisure,
    score: clamp((leisureMin / leisureTarget) * 100),
    detail: `${formatDuration(leisureMin * 60000)} de ${formatDuration(leisureTarget * 60000)}`,
    hint: d.targets.leisureMinutes ? undefined : "Defina sua meta de lazer na aba Metas (usando 1h por enquanto).",
  });

  const goals = d.goalsByDay.get(key);
  components.push({
    key: "goals",
    label: "Metas",
    weight: WEIGHTS.goals,
    score: goals && goals.done + goals.missed > 0 ? Math.round((goals.done / (goals.done + goals.missed)) * 100) : null,
    detail: goals && goals.done + goals.missed > 0 ? `${goals.done} de ${goals.done + goals.missed} cumpridas` : key >= todayKey() ? "marca-se amanhã" : "sem metas no dia",
  });

  // Dia sem nenhum registro (tarefas, sono ou metas) fica sem nota: o lazer sozinho não define o dia.
  const anyCore = components.some((c) => c.key !== "leisure" && c.score !== null);
  return {
    dayKey: key,
    score: anyCore ? weightedAverage(components) : null,
    components,
    taskScore,
    doneCount: d.doneByDay.get(key) ?? 0,
    postponedCount: taskScore.postponedCount,
    workMs: d.workByDay.get(key) ?? 0,
    leisureMin,
    sleepMin: sleep ? sleep.durationMin : null,
  };
}

async function loadDayData(userId: string, firstKey: string): Promise<DayData> {
  await runMaintenance();
  const since = dayRange(firstKey).start;
  const spanDays = Math.max(2, Math.round((Date.now() - since.getTime()) / 86400000) + 2);
  const [cards, hasTodayCount, sleepLogs, leisureLogs, projects, workSessions, targets] = await Promise.all([
    prisma.card.findMany({
      where: { list: { board: boardAccess(userId) } },
      include: { list: { select: { priority: true, kind: true } }, postponements: { select: { dayKey: true } } },
    }),
    prisma.list.count({ where: { kind: "today", board: boardAccess(userId) } }),
    listSleep(userId, spanDays),
    listLeisure(userId, spanDays),
    listProjects(userId),
    prisma.workSession.findMany({ where: { userId, startedAt: { gte: since } } }),
    getSettings(userId).then((s) => s.targets),
  ]);

  const sleepByDay = new Map<string, { durationMin: number; bedAt: Date; wakeAt: Date }>();
  for (const l of sleepLogs) sleepByDay.set(l.dayKey, { durationMin: l.durationMin, bedAt: new Date(l.bedAt), wakeAt: new Date(l.wakeAt) });

  const leisureByDay = new Map<string, number>();
  for (const l of leisureLogs) if (l.endAt) leisureByDay.set(l.dayKey, (leisureByDay.get(l.dayKey) ?? 0) + l.durationMin);

  const goalsByDay = new Map<string, { done: number; missed: number }>();
  for (const p of projects) {
    if (p.archivedAt) continue;
    for (const day of p.dayList) {
      if (day.status !== "done" && day.status !== "missed") continue;
      const g = goalsByDay.get(day.dayKey) ?? { done: 0, missed: 0 };
      if (day.status === "done") g.done += 1;
      else g.missed += 1;
      goalsByDay.set(day.dayKey, g);
    }
  }

  const now = Date.now();
  const workByDay = new Map<string, number>();
  for (const s of workSessions) {
    const k = dayKey(s.startedAt);
    workByDay.set(k, (workByDay.get(k) ?? 0) + ((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()));
  }

  const doneByDay = new Map<string, number>();
  for (const c of cards) {
    if (!c.completedAt) continue;
    const k = dayKey(c.completedAt);
    doneByDay.set(k, (doneByDay.get(k) ?? 0) + 1);
  }

  return {
    cards: cards.map((c) => ({ ...c, listPriority: c.list.priority, listKind: c.list.kind, postponedDays: c.postponements.map((p) => p.dayKey) })),
    hasTodayList: hasTodayCount > 0,
    sleepByDay,
    leisureByDay,
    goalsByDay,
    workByDay,
    doneByDay,
    targets,
  };
}

function streakOf(days: PerformanceDayDTO[], target: number): number {
  // Dias do mais recente ao mais antigo; hoje só conta se já estiver no alvo, e nunca quebra a sequência.
  const today = todayKey();
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.dayKey === today) {
      if (d.score !== null && d.score >= target) streak += 1;
      continue;
    }
    if (d.score !== null && d.score >= target) streak += 1;
    else break;
  }
  return streak;
}

/** Nível alvo em vigor: a meta do usuário ou o padrão (70). */
export function perfTargetOf(targets: TargetsDTO): number {
  return targets.performanceTarget ?? PERF_GOOD;
}

/** Performance de hoje, histórico de 14 dias e constância (calculada sobre 60 dias). */
export async function getPerformance(userId: string): Promise<PerformanceDTO> {
  const today = todayKey();
  const firstKey = dayKey(subDays(keyToDate(today), 59));
  const data = await loadDayData(userId, firstKey);
  const days: PerformanceDayDTO[] = [];
  for (let i = 59; i >= 0; i--) days.push(computeDay(dayKey(subDays(keyToDate(today), i)), data));
  return {
    today: days[days.length - 1],
    streak: streakOf(days, perfTargetOf(data.targets)),
    perfTarget: perfTargetOf(data.targets),
    history: days.slice(-14).map((d) => ({ dayKey: d.dayKey, score: d.score })),
    targets: data.targets,
  };
}

/** Revisão de um período de `n` dias terminando em `endKey` (inclusive). */
export async function getPeriodReview(userId: string, endKey: string, n: number): Promise<PeriodReviewDTO> {
  const count = Math.max(2, Math.min(90, n));
  const startKey = dayKey(subDays(keyToDate(endKey), count - 1));
  // Carrega desde 60 dias antes do fim para a constância ter base.
  const data = await loadDayData(userId, dayKey(subDays(keyToDate(endKey), 59)));
  const all: PerformanceDayDTO[] = [];
  for (let i = 59; i >= 0; i--) all.push(computeDay(dayKey(subDays(keyToDate(endKey), i)), data));
  const days = all.slice(-count).filter((d) => d.dayKey <= todayKey());
  const scores = days.map((d) => d.score).filter((s): s is number => s !== null);
  const taskScores = days.map((d) => d.taskScore.score).filter((s): s is number => s !== null);
  const sleeps = days.map((d) => d.sleepMin).filter((s): s is number => s !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  void addDays;
  return {
    startKey,
    endKey,
    days,
    avgScore: avg(scores),
    avgTaskScore: avg(taskScores),
    doneTotal: days.reduce((a, d) => a + d.doneCount, 0),
    postponedTotal: days.reduce((a, d) => a + d.postponedCount, 0),
    workMsTotal: days.reduce((a, d) => a + d.workMs, 0),
    leisureMinTotal: days.reduce((a, d) => a + d.leisureMin, 0),
    avgSleepMin: avg(sleeps),
    streak: streakOf(all, perfTargetOf(data.targets)),
    perfTarget: perfTargetOf(data.targets),
    targets: data.targets,
  };
}
