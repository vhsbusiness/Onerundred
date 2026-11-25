import { prisma } from "./db";
import { ApiError } from "./errors";
import { shortText, requireDay } from "./organizer-input";
import { parseMoney, type FinanceSpace } from "./finance-format";
import { savingsPlan } from "./savings-plan";
import { dayKey, todayKey } from "./time";

export async function listSavings(userId: string, space: FinanceSpace, today = todayKey()) {
  const goals = await prisma.savingsGoal.findMany({ where: { userId, space }, orderBy: { createdAt: "desc" }, include: { checkins: { orderBy: { periodStart: "asc" } } } });
  return goals.map(goal => {
    const plan = savingsPlan(goal);
    const records = new Map(goal.checkins.map(row => [row.periodStart, row.cents]));
    return { ...goal, createdAt: goal.createdAt.toISOString(), checkins: undefined,
      ...plan, periods: plan.periods.map(p => ({ ...p, savedCents: records.get(p.start) ?? null, available: p.start <= today })),
      savedCents: goal.checkins.reduce((sum, row) => sum + row.cents, 0) };
  });
}
export type SavingsGoalView = Awaited<ReturnType<typeof listSavings>>[number];
export async function writeSavings(userId: string, space: FinanceSpace, resource: string, method: string, body: Record<string, unknown>) {
  const owner = { userId, space };
  if (resource === "metas" && method === "POST") {
    const amountCents = parseMoney(body.amount);
    if (amountCents === null) throw new ApiError(400, "Informe um valor válido para a meta.");
    const data = { name: shortText(body.name, "nome", 80), frequency: shortText(body.frequency, "frequência"), mode: shortText(body.mode, "tipo de cálculo"), amountCents, startDay: requireDay(body.startDay), endDay: requireDay(body.endDay), reminderTime: body.reminderTime === null ? null : shortText(body.reminderTime, "horário", 5) };
    savingsPlan(data);
    if (data.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.reminderTime)) throw new ApiError(400, "Horário inválido.");
    await prisma.savingsGoal.create({ data: { ...owner, ...data } });
    return;
  }
  const id = shortText(body.id, "meta");
  if (resource === "metas" && method === "DELETE") {
    const result = await prisma.savingsGoal.deleteMany({ where: { ...owner, id } });
    if (!result.count) throw new ApiError(404, "Meta não encontrada.");
    return;
  }
  if (resource !== "registros-meta" || method !== "POST") throw new ApiError(405, "Operação indisponível.");
  const periodStart = requireDay(body.periodStart);
  const cents = parseMoney(body.amount, true);
  if (cents === null || cents < 0) throw new ApiError(400, "Informe quanto guardou, incluindo zero se não guardou.");
  await prisma.$transaction(async tx => {
    const goal = await tx.savingsGoal.findFirst({ where: { ...owner, id } });
    if (!goal) throw new ApiError(404, "Meta não encontrada.");
    if (!savingsPlan(goal).periods.some(p => p.start === periodStart) || periodStart > todayKey()) throw new ApiError(400, "Escolha um período que já começou.");
    await tx.savingsCheckin.upsert({ where: { goalId_periodStart: { goalId: id, periodStart } }, create: { goalId: id, periodStart, cents }, update: { cents } });
  });
}

/** Claims each period once; failed deliveries release the claim for the next scheduler tick. */
export async function sendSavingsReminders(userId: string, now: Date, send: (message: { title: string; body: string; url: string; tag: string }) => Promise<number>) {
  const today = dayKey(now), clock = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const goals = await prisma.savingsGoal.findMany({ where: { userId, reminderTime: { not: null }, startDay: { lte: today } }, include: { checkins: { select: { periodStart: true } } } });
  let sent = 0;
  for (const goal of goals) {
    const records = new Set(goal.checkins.map(c => c.periodStart));
    const due = savingsPlan(goal).periods.filter(p => !records.has(p.start) && (p.end < today || (p.end === today && clock >= goal.reminderTime!))).at(-1);
    if (!due) continue;
    // Use the latest due period only: older unmarked periods stay visible in the goal history.
    const period = goal.id + ":" + due.start, type = "savingsGoal";
    try { await prisma.notificationLog.create({ data: { userId, type, period } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") continue; throw error; }
    try {
      const delivered = await send({ title: "Registrou sua meta financeira?", body: `${goal.name}: marque se cumpriu e quanto guardou neste período, mesmo que seja zero.`, url: `/financeiro?espaco=${goal.space === "business" ? "empresa" : "pessoal"}#meta-${goal.id}`, tag: `savings-${goal.id}-${due.start}` });
      if (delivered > 0) sent++;
      else await prisma.notificationLog.deleteMany({ where: { userId, type, period } });
    } catch (error) { await prisma.notificationLog.deleteMany({ where: { userId, type, period } }); throw error; }
  }
  return sent;
}
