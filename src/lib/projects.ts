import { addDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { dayKey, keyToDate, todayKey } from "./time";
import type { ProjectDTO, ProjectDayDTO, ProjectDayStatus } from "./types";

/*
 * Metas do tipo "projeto": um compromisso diário por N dias a partir de uma data.
 * Cada dia pode ser marcado como feito ou não feito. Dias passados sem marcação
 * viram "não feito" automaticamente (auto = true) na manutenção diária.
 */

export const MAX_PROJECT_DAYS = 365;

/** Quantos dias futuros mostrar num projeto sem fim. */
const ENDLESS_LOOKAHEAD = 6;

/** Dias do projeto. Sem fim (days = 0): do início até hoje + alguns dias à frente. */
function dayKeysOf(startDate: string, days: number): string[] {
  const start = keyToDate(startDate);
  let count = days;
  if (days === 0) {
    const today = keyToDate(todayKey());
    const elapsed = Math.round((today.getTime() - start.getTime()) / 86400000);
    count = Math.max(1, elapsed + 1 + ENDLESS_LOOKAHEAD);
  }
  return Array.from({ length: count }, (_, i) => dayKey(addDays(start, i)));
}

export function parseObligations(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
}

/** Marca como "não feito" todo dia passado sem marcação, em todos os projetos ativos. */
export async function autoMarkMissedDays(): Promise<void> {
  const today = todayKey();
  const projects = await prisma.project.findMany({
    where: { archivedAt: null, startDate: { lt: today } },
    include: { checks: { select: { dayKey: true } } },
  });
  for (const p of projects) {
    const marked = new Set(p.checks.map((c) => c.dayKey));
    const missing = dayKeysOf(p.startDate, p.days).filter((k) => k < today && !marked.has(k));
    if (missing.length === 0) continue;
    await prisma.projectDay.createMany({
      data: missing.map((k) => ({ projectId: p.id, dayKey: k, done: false, auto: true })),
    });
  }
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  obligations: string;
  startDate: string;
  days: number;
  createdAt: Date;
  archivedAt: Date | null;
  checks: { dayKey: string; done: boolean; auto: boolean; note: string }[];
}

function serialize(p: ProjectRow): ProjectDTO {
  const today = todayKey();
  const byKey = new Map(p.checks.map((c) => [c.dayKey, c]));
  const keys = dayKeysOf(p.startDate, p.days);

  const dayList: ProjectDayDTO[] = keys.map((k, i) => {
    const c = byKey.get(k);
    let status: ProjectDayStatus;
    if (c) status = c.done ? "done" : "missed";
    else if (k > today) status = "future";
    else if (k === today) status = "pending";
    else status = "missed"; // ainda não passou pela manutenção
    return { index: i + 1, dayKey: k, status, auto: c?.auto ?? false, note: c?.note ?? "" };
  });

  const doneCount = dayList.filter((d) => d.status === "done").length;
  const missedCount = dayList.filter((d) => d.status === "missed").length;
  const pendingCount = dayList.filter((d) => d.status === "pending").length;
  const futureCount = dayList.filter((d) => d.status === "future").length;
  const judged = doneCount + missedCount;

  // Sequência atual de dias feitos, contando de trás para frente a partir de hoje
  // (hoje pendente não quebra a sequência).
  let streak = 0;
  for (let i = dayList.length - 1; i >= 0; i--) {
    const d = dayList[i];
    if (d.status === "future" || d.status === "pending") continue;
    if (d.status === "done") streak += 1;
    else break;
  }

  const endless = p.days === 0;
  const endDate = endless ? null : keys[keys.length - 1];
  const todayEntry = dayList.find((d) => d.dayKey === today);
  const todayStatus: ProjectDTO["todayStatus"] = todayEntry
    ? todayEntry.status
    : today < p.startDate
      ? "not-started"
      : "ended";

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    obligations: parseObligations(p.obligations),
    startDate: p.startDate,
    endDate,
    days: p.days,
    endless,
    createdAt: p.createdAt.toISOString(),
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    doneCount,
    missedCount,
    pendingCount,
    futureCount,
    completion: judged > 0 ? Math.round((doneCount / judged) * 100) : null,
    streak,
    todayStatus,
    daysElapsed: dayList.filter((d) => d.dayKey <= today).length,
    dayList,
  };
}

const include = { checks: { select: { dayKey: true, done: true, auto: true, note: true } } } as const;

export async function listProjects(userId: string): Promise<ProjectDTO[]> {
  await autoMarkMissedDays();
  const rows = await prisma.project.findMany({
    where: { userId },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
    include,
  });
  return rows.map(serialize);
}

export async function getProject(userId: string, id: string): Promise<ProjectDTO> {
  await autoMarkMissedDays();
  const row = await prisma.project.findFirst({ where: { id, userId }, include });
  if (!row) throw new ApiError(404, "Projeto não encontrado");
  return serialize(row);
}

function validate(input: { name: string; days: number; startDate: string }) {
  if (input.name.trim().length < 2) throw new ApiError(400, "Dê um nome ao projeto");
  if (!Number.isInteger(input.days) || input.days < 0 || input.days > MAX_PROJECT_DAYS) {
    throw new ApiError(400, `Duração deve ser de 1 a ${MAX_PROJECT_DAYS} dias (ou 0 para sem fim)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new ApiError(400, "Data de início inválida");
}

export async function createProject(
  userId: string,
  input: { name: string; description: string; obligations: string; startDate: string; days: number },
): Promise<ProjectDTO> {
  validate(input);
  const row = await prisma.project.create({
    data: {
      userId,
      name: input.name.trim(),
      description: input.description.trim(),
      obligations: parseObligations(input.obligations).join("\n"),
      startDate: input.startDate,
      days: input.days,
    },
  });
  // Projetos que começam no passado já nascem com os dias anteriores marcados como não feitos.
  return getProject(userId, row.id);
}

export async function updateProject(
  userId: string,
  id: string,
  input: Partial<{ name: string; description: string; obligations: string; startDate: string; days: number; archived: boolean }>,
): Promise<ProjectDTO> {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Projeto não encontrado");
  const merged = {
    name: input.name ?? existing.name,
    days: input.days ?? existing.days,
    startDate: input.startDate ?? existing.startDate,
  };
  validate(merged);
  const row = await prisma.project.update({
    where: { id },
    data: {
      name: merged.name.trim(),
      days: merged.days,
      startDate: merged.startDate,
      description: input.description !== undefined ? input.description.trim() : undefined,
      obligations: input.obligations !== undefined ? parseObligations(input.obligations).join("\n") : undefined,
      archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
    },
    include,
  });
  // Marcações fora do novo intervalo são descartadas (projeto sem fim: só as anteriores ao início)
  if (row.days === 0) {
    await prisma.projectDay.deleteMany({ where: { projectId: id, dayKey: { lt: row.startDate } } });
  } else {
    const valid = new Set(dayKeysOf(row.startDate, row.days));
    await prisma.projectDay.deleteMany({ where: { projectId: id, dayKey: { notIn: [...valid] } } });
  }
  return getProject(userId, id);
}

export async function deleteProject(userId: string, id: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Projeto não encontrado");
  await prisma.project.delete({ where: { id } });
}

/** Marca um dia como feito ou não feito. Dias futuros não podem ser marcados. */
export async function setProjectDay(
  userId: string,
  id: string,
  input: { dayKey: string; done: boolean; note?: string },
): Promise<ProjectDTO> {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Projeto não encontrado");
  const keys = dayKeysOf(existing.startDate, existing.days);
  if (!keys.includes(input.dayKey)) throw new ApiError(400, "Esse dia não faz parte do projeto");
  if (input.dayKey > todayKey()) throw new ApiError(400, "Não dá para marcar um dia que ainda não chegou");

  await prisma.projectDay.upsert({
    where: { projectId_dayKey: { projectId: id, dayKey: input.dayKey } },
    create: { projectId: id, dayKey: input.dayKey, done: input.done, auto: false, note: input.note ?? "" },
    update: { done: input.done, auto: false, markedAt: new Date(), note: input.note ?? undefined },
  });
  return getProject(userId, id);
}
