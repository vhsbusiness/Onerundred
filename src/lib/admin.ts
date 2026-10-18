import { prisma } from "./db";
import { ApiError } from "./errors";
import { dayRange, sumSessions, todayKey } from "./time";
import type { AdminOverview, AdminUser, AppSettingsDTO } from "./types";

const AI_DEFAULTS = { aiMinDaysTasks: 3, aiMinDaysWork: 3, aiMinNightsSleep: 7, aiMinDaysLeisure: 7 } as const;
type AiMinKey = keyof typeof AI_DEFAULTS;

function readInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 60 ? n : fallback;
}

export async function getAppSettings(): Promise<AppSettingsDTO> {
  const rows = await prisma.appSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    allowRegistration: map.get("allowRegistration") !== "false",
    aiMinDaysTasks: readInt(map.get("aiMinDaysTasks"), AI_DEFAULTS.aiMinDaysTasks),
    aiMinDaysWork: readInt(map.get("aiMinDaysWork"), AI_DEFAULTS.aiMinDaysWork),
    aiMinNightsSleep: readInt(map.get("aiMinNightsSleep"), AI_DEFAULTS.aiMinNightsSleep),
    aiMinDaysLeisure: readInt(map.get("aiMinDaysLeisure"), AI_DEFAULTS.aiMinDaysLeisure),
  };
}

async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function updateAppSettings(data: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> {
  if (data.allowRegistration !== undefined) await setSetting("allowRegistration", String(data.allowRegistration));
  for (const key of Object.keys(AI_DEFAULTS) as AiMinKey[]) {
    const v = data[key];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 0 || v > 60) throw new ApiError(400, "Dias de observação devem ser de 0 a 60");
    await setSetting(key, String(v));
  }
  return getAppSettings();
}

/** Preço por milhão de tokens (padrão: gpt-5-mini). Ajustável por env. */
const PRICE_IN = Number(process.env.AI_PRICE_INPUT_PER_M ?? 0.25);
const PRICE_OUT = Number(process.env.AI_PRICE_OUTPUT_PER_M ?? 2);

export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * PRICE_IN + (completionTokens / 1e6) * PRICE_OUT;
}

async function aiUsageByUser() {
  const since30 = new Date(Date.now() - 30 * 86400000);
  const [all, recent] = await Promise.all([
    prisma.aiUsage.groupBy({ by: ["userId"], _count: { _all: true }, _sum: { promptTokens: true, completionTokens: true } }),
    prisma.aiUsage.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since30 } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    }),
  ]);
  const map = new Map<string, AdminUser["ai"]>();
  for (const r of all) {
    const p = r._sum.promptTokens ?? 0;
    const c = r._sum.completionTokens ?? 0;
    map.set(r.userId, { calls: r._count._all, calls30: 0, promptTokens: p, completionTokens: c, costUsd: estimateCostUsd(p, c), costUsd30: 0 });
  }
  for (const r of recent) {
    const cur = map.get(r.userId);
    if (!cur) continue;
    cur.calls30 = r._count._all;
    cur.costUsd30 = estimateCostUsd(r._sum.promptTokens ?? 0, r._sum.completionTokens ?? 0);
  }
  return map;
}

const EMPTY_AI: AdminUser["ai"] = { calls: 0, calls30: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, costUsd30: 0 };

export async function listUsers(): Promise<AdminUser[]> {
  const [users, usage] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { sessions: true } } },
    }),
    aiUsageByUser(),
  ]);
  return users.map((u) => ({
    ai: usage.get(u.id) ?? EMPTY_AI,
    id: u.id,
    avatar: u.avatar,
    name: u.name,
    email: u.email,
    username: u.username,
    role: u.role as "user" | "admin",
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    activeSessions: u._count.sessions,
  }));
}

export async function getOverview(): Promise<AdminOverview> {
  const { start, end } = dayRange(todayKey());
  const [users, activeToday, newThisWeek, doneToday, workToday, openCards] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { lastLoginAt: { gte: start } } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(start.getTime() - 6 * 86400000) } } }),
    prisma.card.count({ where: { completedAt: { gte: start, lt: end } } }),
    prisma.workSession.findMany({ where: { startedAt: { gte: start } }, select: { startedAt: true, endedAt: true } }),
    prisma.card.count({ where: { completedAt: null, archivedAt: null } }),
  ]);
  const since30 = new Date(Date.now() - 30 * 86400000);
  const usage30 = await prisma.aiUsage.aggregate({
    where: { createdAt: { gte: since30 } },
    _count: { _all: true },
    _sum: { promptTokens: true, completionTokens: true },
  });
  return {
    aiCostUsd30: estimateCostUsd(usage30._sum.promptTokens ?? 0, usage30._sum.completionTokens ?? 0),
    aiCalls30: usage30._count._all,
    users,
    activeToday,
    newThisWeek,
    doneToday,
    workedTodayMs: sumSessions(workToday),
    openCards,
    settings: await getAppSettings(),
  };
}

export async function updateUser(
  adminId: string,
  id: string,
  data: { role?: "user" | "admin"; active?: boolean },
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "Usuário não encontrado");
  if (id === adminId && (data.role === "user" || data.active === false)) {
    throw new ApiError(400, "Você não pode rebaixar nem desativar a própria conta");
  }
  await prisma.user.update({ where: { id }, data });
  if (data.active === false) {
    await prisma.authSession.deleteMany({ where: { userId: id } });
  }
}

export async function deleteUser(adminId: string, id: string) {
  if (id === adminId) throw new ApiError(400, "Você não pode excluir a própria conta");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "Usuário não encontrado");
  await prisma.user.delete({ where: { id } });
}
