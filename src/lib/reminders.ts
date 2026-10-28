import { prisma } from "./db";
import { ApiError } from "./errors";
import { boardAccess } from "./repo";
import type { OpenCardBrief, ReminderDTO } from "./types";

const REPEATS = ["none", "daily", "weekly"] as const;
type Repeat = (typeof REPEATS)[number];

type ReminderRow = {
  id: string;
  title: string;
  note: string;
  at: Date;
  repeat: string;
  active: boolean;
  lastSentAt: Date | null;
  card?: { id: string; title: string; completedAt: Date | null; list: { boardId: string } } | null;
};
const withCard = { card: { select: { id: true, title: true, completedAt: true, list: { select: { boardId: true } } } } } as const;

function serialize(r: ReminderRow): ReminderDTO {
  return {
    id: r.id,
    title: r.title,
    note: r.note,
    at: r.at.toISOString(),
    repeat: (REPEATS.includes(r.repeat as Repeat) ? r.repeat : "none") as Repeat,
    active: r.active,
    lastSentAt: r.lastSentAt ? r.lastSentAt.toISOString() : null,
    card: r.card ? { id: r.card.id, title: r.card.title, boardId: r.card.list.boardId, done: Boolean(r.card.completedAt) } : null,
  };
}

/** Confere que a tarefa é do usuário (dono ou membro do quadro). */
async function ownedCardId(userId: string, cardId: unknown): Promise<string | null> {
  if (cardId === null || cardId === "" || cardId === undefined) return null;
  if (typeof cardId !== "string") throw new ApiError(400, "Tarefa inválida");
  const card = await prisma.card.findFirst({ where: { id: cardId, list: { board: boardAccess(userId) } }, select: { id: true } });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");
  return card.id;
}

function parseInput(input: { title?: unknown; note?: unknown; at?: unknown; repeat?: unknown }) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  if (title.length < 1) throw new ApiError(400, "Dê um título ao lembrete");
  const at = typeof input.at === "string" ? new Date(input.at) : null;
  if (!at || Number.isNaN(at.getTime())) throw new ApiError(400, "Data e hora inválidas");
  const repeat = REPEATS.includes(input.repeat as Repeat) ? (input.repeat as Repeat) : "none";
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) : "";
  return { title, at, repeat, note };
}

export async function listReminders(userId: string, cardId?: string): Promise<ReminderDTO[]> {
  const rows = await prisma.reminder.findMany({
    where: { userId, ...(cardId ? { cardId } : {}) },
    orderBy: [{ active: "desc" }, { at: "asc" }],
    take: 200,
    include: withCard,
  });
  return rows.map(serialize);
}

/** Tarefas abertas do usuário, para associar a um lembrete. */
export async function listOpenCards(userId: string): Promise<OpenCardBrief[]> {
  const rows = await prisma.card.findMany({
    where: { archivedAt: null, completedAt: null, list: { board: boardAccess(userId) } },
    orderBy: [{ scheduledFor: "asc" }, { position: "asc" }],
    select: { id: true, title: true, list: { select: { name: true, boardId: true, board: { select: { name: true } } } } },
    take: 300,
  });
  return rows.map((c) => ({ id: c.id, title: c.title, boardId: c.list.boardId, boardName: c.list.board.name, listName: c.list.name }));
}

export async function createReminder(userId: string, input: Record<string, unknown>): Promise<ReminderDTO> {
  const data = parseInput(input);
  if (data.at.getTime() < Date.now() - 60_000 && data.repeat === "none") {
    throw new ApiError(400, "Esse horário já passou");
  }
  const cardId = await ownedCardId(userId, input.cardId);
  const row = await prisma.reminder.create({ data: { userId, ...data, cardId }, include: withCard });
  return serialize(row);
}

export async function updateReminder(userId: string, id: string, input: Record<string, unknown>): Promise<ReminderDTO> {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Lembrete não encontrado");
  const data: { title?: string; note?: string; at?: Date; repeat?: string; active?: boolean } = {};
  void existing.cardId;
  if (input.title !== undefined || input.at !== undefined || input.repeat !== undefined || input.note !== undefined) {
    const parsed = parseInput({
      title: input.title ?? existing.title,
      note: input.note ?? existing.note,
      at: input.at ?? existing.at.toISOString(),
      repeat: input.repeat ?? existing.repeat,
    });
    Object.assign(data, parsed);
    if (input.at !== undefined) data.active = true;
  }
  if (typeof input.active === "boolean") data.active = input.active;
  const cardId = input.cardId === undefined ? undefined : await ownedCardId(userId, input.cardId);
  const row = await prisma.reminder.update({ where: { id }, data: { ...data, ...(cardId !== undefined ? { cardId } : {}) }, include: withCard });
  return serialize(row);
}

export async function deleteReminder(userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Lembrete não encontrado");
  await prisma.reminder.delete({ where: { id } });
}
