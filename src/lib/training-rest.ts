import { prisma } from "./db";
import { ApiError } from "./errors";
import { sendToUser } from "./notifications";

const timers = new Map<string, { end: number; timer: ReturnType<typeof setTimeout> }>();
const maxDelay = 2_147_000_000;

async function finish(id: string, end: Date) {
  const project = await prisma.project.findFirst({ where: { id, restEndsAt: end }, select: { userId: true, archivedAt: true, name: true } });
  if (!project) return;
  const claimed = await prisma.project.updateMany({ where: { id, restEndsAt: end }, data: { restEndsAt: null } });
  if (!claimed.count || project.archivedAt || Date.now() - end.getTime() > 60_000) return;
  const prefs = await prisma.notificationPref.findUnique({ where: { userId: project.userId }, select: { enabled: true } });
  if (prefs?.enabled) await sendToUser(project.userId, { title: "Descanso concluído", body: project.name + " · Hora da próxima série.",
    url: "/metas/treinos/" + id + "?aba=treino", tag: "descanso-" + id }, 60);
}

function schedule(id: string, end: Date) {
  const existing = timers.get(id);
  if (existing?.end === end.getTime()) return;
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    timers.delete(id);
    if (Date.now() < end.getTime()) { schedule(id, end); return; }
    void finish(id, end).catch(() => console.error("Falha ao entregar aviso de descanso."));
  }, Math.min(maxDelay, Math.max(0, end.getTime() - Date.now())));
  timer.unref();
  timers.set(id, { end: end.getTime(), timer });
}

export async function restoreRestAlerts() {
  const running = await prisma.project.findMany({ where: { restEndsAt: { not: null } }, select: { id: true, restEndsAt: true } });
  for (const p of running) if (p.restEndsAt) schedule(p.id, p.restEndsAt);
}

export async function changeRest(userId: string, id: string, body: Record<string, unknown>) {
  const { seconds, preset, cancelEnd } = body;
  const owned = { id, userId, workout: { not: null }, archivedAt: null };
  if (cancelEnd !== undefined) {
    if (typeof cancelEnd !== "number" || !Number.isFinite(new Date(cancelEnd).getTime())) throw new ApiError(400, "Descanso inválido.");
    const stopped = await prisma.project.updateMany({ where: { ...owned, restEndsAt: new Date(cancelEnd) }, data: { restEndsAt: null } });
    const current = timers.get(id);
    if (stopped.count && current?.end === cancelEnd) {
      clearTimeout(current.timer); timers.delete(id);
    }
    return { end: null };
  }
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 ||
      typeof preset !== "number" || !Number.isInteger(preset) || seconds > preset || preset > 2147483647)
    throw new ApiError(400, "Informe um descanso válido em segundos.");
  const end = new Date(Date.now() + seconds * 1000);
  const saved = await prisma.project.updateMany({ where: owned, data: { restEndsAt: end, restSeconds: preset } });
  if (!saved.count) throw new ApiError(404, "Projeto de treino ativo não encontrado.");
  schedule(id, end);
  return { end: end.getTime() };
}
