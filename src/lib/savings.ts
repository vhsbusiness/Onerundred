import { prisma } from "./db";
import { ApiError } from "./errors";
import { shortText, requireDay } from "./organizer-input";
import { parseMoney, type FinanceSpace } from "./finance-format";
import { Prisma } from "@/generated/prisma/client";
import { checkSavingsEdit, savingsDefinition, savingsPlan, type SavingsDefinition } from "./savings-plan";
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
  if (resource === "metas" && (method === "POST" || method === "PATCH")) {
    const amountCents = parseMoney(body.amount);
    if (amountCents === null) throw new ApiError(400, "Informe um valor válido para a meta.");
    const data = { name: shortText(body.name, "nome", 80), frequency: shortText(body.frequency, "frequência"), mode: shortText(body.mode, "tipo de cálculo"), amountCents, startDay: requireDay(body.startDay), endDay: requireDay(body.endDay), reminderTime: body.reminderTime === null ? null : shortText(body.reminderTime, "horário", 5) };
    savingsPlan(data);
    if (data.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.reminderTime)) throw new ApiError(400, "Horário inválido.");
    if (method === "POST") await prisma.savingsGoal.create({ data: { ...owner, ...data } });
    else {
      const id = shortText(body.id, "meta");
      if (!body.original || typeof body.original !== "object" || Array.isArray(body.original))
        throw new ApiError(400, "Abra a meta novamente antes de editar.");
      await savingsTransaction(async tx => {
        const current = await tx.savingsGoal.findFirst({ where: { ...owner, id }, include: { checkins: { select: { periodStart: true } } } });
        if (!current) throw new ApiError(404, "Meta não encontrada.");
        const same = (a: SavingsDefinition, b: SavingsDefinition) => JSON.stringify(savingsDefinition(a)) === JSON.stringify(savingsDefinition(b));
        if (same(current, data)) return; // Retry after a lost response is harmless.
        if (!same(current, body.original as SavingsDefinition)) throw new ApiError(409, "Esta meta foi alterada em outra aba. Feche e abra a edição novamente para ver os dados atuais.");
        checkSavingsEdit(current, data, current.checkins.map(c => c.periodStart));
        await tx.savingsGoal.update({ where: { id }, data });
        const nextPeriods = new Map(savingsPlan(data).periods.map(p => [p.start, p.end]));
        const changedPeriods = savingsPlan(current).periods.filter(p => nextPeriods.get(p.start) !== p.end).map(p => id + ":" + p.start);
        if (changedPeriods.length) await tx.notificationLog.deleteMany({ where: { userId, type: "savingsGoal", period: { in: changedPeriods } } });
      });
    }
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
  await savingsTransaction(async tx => {
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


/** Edits and check-ins must agree on the same period boundaries, even in separate tabs. */
async function savingsTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return await prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw new ApiError(409, "A meta mudou durante o salvamento. Atualize a página e tente novamente.");
    throw error;
  }
}
