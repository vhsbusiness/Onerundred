import { prisma } from "./db";
import type { Area } from "./area";
import { ApiError } from "./errors";
import type { ReminderDTO } from "./types";

const REPEATS = ["none", "daily", "weekly"] as const;
type Repeat = (typeof REPEATS)[number];

function serialize(r: { id: string; title: string; note: string; at: Date; repeat: string; active: boolean; lastSentAt: Date | null }): ReminderDTO {
  return {
    id: r.id,
    title: r.title,
    note: r.note,
    at: r.at.toISOString(),
    repeat: (REPEATS.includes(r.repeat as Repeat) ? r.repeat : "none") as Repeat,
    active: r.active,
    lastSentAt: r.lastSentAt ? r.lastSentAt.toISOString() : null,
  };
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

export async function listReminders(userId: string, area: Area): Promise<ReminderDTO[]> {
  const rows = await prisma.reminder.findMany({ where: { userId, area }, orderBy: [{ active: "desc" }, { at: "asc" }], take: 200 });
  return rows.map(serialize);
}

export async function createReminder(userId: string, area: Area, input: Record<string, unknown>): Promise<ReminderDTO> {
  const data = parseInput(input);
  if (data.at.getTime() < Date.now() - 60_000 && data.repeat === "none") {
    throw new ApiError(400, "Esse horário já passou");
  }
  const row = await prisma.reminder.create({ data: { userId, area, ...data } });
  return serialize(row);
}

export async function updateReminder(userId: string, id: string, input: Record<string, unknown>): Promise<ReminderDTO> {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Lembrete não encontrado");
  const data: { title?: string; note?: string; at?: Date; repeat?: string; active?: boolean } = {};
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
  const row = await prisma.reminder.update({ where: { id }, data });
  return serialize(row);
}

export async function deleteReminder(userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Lembrete não encontrado");
  await prisma.reminder.delete({ where: { id } });
}
