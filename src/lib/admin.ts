import { prisma } from "./db";
import { ApiError } from "./errors";
import { sumSessions, dayRange, todayKey } from "./time";
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

export async function listUsers(): Promise<AdminUser[]> {
  const { start, end } = dayRange(todayKey());
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      boards: {
        include: {
          lists: {
            include: {
              cards: {
                select: { completedAt: true, sessions: { select: { startedAt: true, endedAt: true } } },
              },
            },
          },
        },
      },
      workSessions: { select: { startedAt: true, endedAt: true } },
      _count: { select: { sessions: true } },
    },
  });

  return users.map((u) => {
    let openCards = 0;
    let doneCards = 0;
    let doneToday = 0;
    let taskMs = 0;
    for (const b of u.boards) {
      for (const l of b.lists) {
        for (const c of l.cards) {
          if (c.completedAt) {
            doneCards += 1;
            if (c.completedAt >= start && c.completedAt < end) doneToday += 1;
          } else {
            openCards += 1;
          }
          taskMs += sumSessions(c.sessions.filter((s) => s.endedAt));
        }
      }
    }
    const workedToday = sumSessions(u.workSessions.filter((s) => s.startedAt >= start));
    const workedTotal = sumSessions(u.workSessions);
    return {
      id: u.id,
      avatar: u.avatar,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role as "user" | "admin",
      active: u.active,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      boards: u.boards.length,
      openCards,
      doneCards,
      doneToday,
      workedTodayMs: workedToday,
      workedTotalMs: workedTotal,
      taskMs,
      activeSessions: u._count.sessions,
    };
  });
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
  return {
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
