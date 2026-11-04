import type { Prisma } from "@/generated/prisma/client";

// Pausar fecha o segmento WorkSession, mas não encerra o ciclo de trabalho.
// A referência sobrevive a pausas/retomadas e ao reinício do servidor.
export const WORK_CYCLE_KEY = "workCycleStartedAt";

export async function unfinishedWorkStart(db: Prisma.TransactionClient, userId: string): Promise<Date | null> {
  const [last, settings] = await Promise.all([
    db.workSession.findFirst({ where: { userId }, orderBy: { startedAt: "desc" } }),
    db.setting.findMany({ where: { userId, key: { in: [WORK_CYCLE_KEY, "workEndedDay"] } } }),
  ]);
  if (!last) return null;
  const ended = settings.find((s) => s.key === "workEndedDay")?.value;
  // Compatibilidade com sessões anteriores à introdução da referência do ciclo.
  if (last.endedAt && ended !== "") return null;
  const saved = settings.find((s) => s.key === WORK_CYCLE_KEY)?.value;
  const anchor = saved ? new Date(saved) : null;
  return anchor && Number.isFinite(anchor.getTime()) && anchor <= last.startedAt ? anchor : last.startedAt;
}

export async function rememberWorkStart(db: Prisma.TransactionClient, userId: string, startedAt: Date) {
  await db.setting.upsert({
    where: { userId_key: { userId, key: WORK_CYCLE_KEY } },
    create: { userId, key: WORK_CYCLE_KEY, value: startedAt.toISOString() },
    update: { value: startedAt.toISOString() },
  });
}
