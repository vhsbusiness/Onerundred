import { coverData } from "./project-cover";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { dayKey, keyToDate, todayKey } from "./time";
import { isTrainingSlot } from "./training-types";
import { isWorkout } from "./workouts";
import type { DayPlan, Exercise, TrainingDetail, TrainingLog, TrainingSummary } from "./training-types";

function invalid(message: string): never { throw new ApiError(400, message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Dados do treino inválidos.");
  return value as Record<string, unknown>;
}
function positiveInt(value: unknown, label: string, max = 2147483647) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) invalid(label + " inválido.");
  return value;
}
function nameOf(value: unknown) {
  if (typeof value !== "string" || !value.trim()) invalid("Informe um nome.");
  return value.trim();
}
function sportOf(value: unknown) {
  if (!isWorkout(value)) invalid("Escolha a modalidade do treino.");
  return value;
}
function exerciseList(raw: unknown): Exercise[] {
  if (!Array.isArray(raw)) invalid("Lista de exercícios inválida.");
  return raw.map(item => {
    const e = object(item);
    const weightKg = e.weightKg ?? null;
    if (weightKg !== null && (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg < 0)) invalid("Carga inválida.");
    const reps = typeof e.reps === "string" ? e.reps.trim() : e.reps;
    if (typeof reps !== "number" && typeof reps !== "string") invalid("Repetições inválidas.");
    if (typeof reps === "string" && (!reps || reps.length > 80 || /^[-+.]\d/.test(reps))) invalid("Informe as repetições ou o tempo da série.");
    const substitute = e.substitute == null ? "" : e.substitute;
    if (typeof substitute !== "string" || substitute.length > 180) invalid("Exercício substituto inválido.");
    return { name: nameOf(e.name), sets: positiveInt(e.sets, "Número de séries"),
      reps: typeof reps === "string" && !/^\d+$/.test(reps) ? reps : positiveInt(Number(reps), "Número de repetições"), weightKg,
      ...(substitute.trim() ? { substitute: substitute.trim() } : {}) };
  });
}
const counts = { cover:{ select:{ id:true } }, _count: { select: { workouts: true } } } as const;
function summary(p: { cover:{id:string}|null; id: string; name: string; description: string; workout: string | null; archivedAt: Date | null; _count: { workouts: number } }): TrainingSummary {
  return { id: p.id, coverId:p.cover?.id ?? null, name: p.name, description: p.description, workout: sportOf(p.workout), archived: Boolean(p.archivedAt), logCount: p._count.workouts };
}
export async function listTraining(userId: string) {
  const rows = await prisma.project.findMany({ where: { userId, workout: { not: null } }, include: counts, orderBy: { createdAt: "desc" } });
  return rows.map(summary);
}
function owned(userId: string, id: string) {
  return { id, userId, workout: { not: null } };
}
export async function readTraining(userId: string, id: string): Promise<TrainingDetail | null> {
  const p = await prisma.project.findFirst({ where: owned(userId, id), include: {
    ...counts, plans: true, workouts: { orderBy: [{ dayKey: "desc" }, { createdAt: "desc" }] },
    checks: { where: { auto: false }, orderBy: { dayKey: "desc" }, select: { dayKey: true, done: true, note: true } },
  } });
  if (!p) return null;
  return { ...summary(p), restSeconds: p.restSeconds, restEndsAt: p.restEndsAt?.getTime() ?? null, obligations: p.obligations, previousChecks: p.checks,
    plans: p.plans.map(day => ({ weekday: day.weekday, exercises: exerciseList(day.exercises) })),
    logs: p.workouts.map(log => ({ id: log.id, planSlot: log.planSlot, sport: sportOf(log.sport), dayKey: log.dayKey, durationSeconds: log.durationSeconds,
      distanceMeters: log.distanceMeters, exercises: exerciseList(log.exercises ?? []) })),
  };
}
export async function createTraining(userId: string, raw: unknown) {
  const input = object(raw);
  const imageData = coverData(input.image);
  return summary(await prisma.project.create({ data: { ...(imageData && {cover:{create:{imageData}}}), userId, name: nameOf(input.name), workout: sportOf(input.workout),
    description: typeof input.description === "string" ? input.description.trim() : "", startDate: todayKey(), days: 0 }, include: counts }));
}
export async function editTraining(userId: string, id: string, raw: unknown) {
  const input = object(raw);
  const changed = await prisma.project.updateMany({ where: owned(userId, id), data: {
    name: input.name === undefined ? undefined : nameOf(input.name),
    description: typeof input.description === "string" ? input.description.trim() : undefined,
    workout: input.workout === undefined ? undefined : sportOf(input.workout),
    restSeconds: input.restSeconds === undefined ? undefined : positiveInt(input.restSeconds, "Descanso em segundos"),
    ...(input.archived === true ? { restEndsAt: null } : {}),
    archivedAt: typeof input.archived === "boolean" ? (input.archived ? new Date() : null) : undefined,
  } });
  if (!changed.count) throw new ApiError(404, "Projeto de treino não encontrado.");
}
export async function removeTraining(userId: string, id: string) {
  const result = await prisma.project.deleteMany({ where: owned(userId, id) });
  if (!result.count) throw new ApiError(404, "Projeto de treino não encontrado.");
}
export async function requireActiveTraining(userId: string, id: string) {
  const p = await prisma.project.findFirst({ where: owned(userId, id), select: { archivedAt: true } });
  if (!p) throw new ApiError(404, "Projeto de treino não encontrado.");
  if (p.archivedAt) throw new ApiError(409, "Reative o projeto para registrar treinos.");
}
export async function saveTrainingDay(userId: string, projectId: string, raw: unknown) {
  const input = object(raw);
  const days: unknown[] = Array.isArray(input.days) ? input.days : [input];
  if (!days.length || days.length > 7) invalid("Selecione de um a sete treinos.");
  const plans: DayPlan[] = days.map(rawDay => {
    const d = object(rawDay);
    if (typeof d.weekday !== "number" || !Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6) invalid("Treino inválido.");
    return { weekday: d.weekday, exercises: exerciseList(d.exercises) };
  });
  if (new Set(plans.map(d => d.weekday)).size !== plans.length) invalid("Cada treino deve aparecer apenas uma vez.");
  await requireActiveTraining(userId, projectId);
  if (input.previous !== undefined && plans.length === 1) {
    const { weekday, exercises } = plans[0];
    const previous = exerciseList(input.previous);
    const row = await prisma.workoutPlan.findUnique({ where: { projectId_weekday: { projectId, weekday } } });
    const current = exerciseList(row?.exercises ?? []);
    if (sameExercises(current, exercises)) return;
    if (!sameExercises(current, previous)) throw changedExercises();
    if (!row) {
      try { await prisma.workoutPlan.create({data: {projectId, weekday, exercises}}); }
      catch (err) { if ((err as {code?: string}).code === "P2002") throw changedExercises(); throw err; }
    } else {
      const saved = await prisma.workoutPlan.updateMany({where: {projectId, weekday, exercises: {equals: row.exercises as Exercise[]}}, data: {exercises}});
      if (!saved.count) throw changedExercises();
    }
    return;
  }
  await prisma.$transaction(plans.map(({ weekday, exercises }) => prisma.workoutPlan.upsert({
    where: { projectId_weekday: { projectId, weekday } }, create: { projectId, weekday, exercises }, update: { exercises },
  })));
}
export async function recordTraining(userId: string, projectId: string, raw: unknown) {
  const input = object(raw);
  const id = input.id;
  if (typeof id !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) invalid("Identificador inválido.");
  const date = input.dayKey;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(keyToDate(date).getTime()) || dayKey(keyToDate(date)) !== date || date > todayKey()) invalid("Escolha uma data válida até hoje.");
  const sport = sportOf(input.sport);
  const planSlot = sport === "strength" ? input.planSlot ?? null : null;
  if (planSlot !== null && !isTrainingSlot(planSlot)) invalid("Selecione um treino válido.");
  const distance = sport === "running" || sport === "cycling";
  const durationSeconds = sport === "strength" && input.durationSeconds == null ? null : positiveInt(input.durationSeconds, "Tempo do treino");
  const distanceMeters = distance ? positiveInt(input.distanceMeters, "Distância") : null;
  const exercises = sport === "strength" ? exerciseList(input.exercises) : [];
  if (sport === "strength" && !exercises.length) invalid("Adicione pelo menos um exercício.");
  await requireActiveTraining(userId, projectId);
  // A mesma tentativa reenviada após uma falha de rede não soma duas sessões.
  const row = await prisma.workoutLog.upsert({ where: { projectId_id: { projectId, id } }, update: {},
    create: { id, projectId, sport, planSlot, dayKey: date, durationSeconds, distanceMeters, exercises } });
  const result: TrainingLog = { id, planSlot: row.planSlot, sport: sportOf(row.sport), dayKey: row.dayKey, durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters, exercises: exerciseList(row.exercises ?? []) };
  if (result.planSlot !== planSlot || result.sport !== sport || result.dayKey !== date || result.durationSeconds !== durationSeconds ||
      result.distanceMeters !== distanceMeters || JSON.stringify(result.exercises) !== JSON.stringify(exercises)) {
    throw new ApiError(409, "Este registro já foi salvo. Atualize a página.");
  }
  return result;
}
function sameExercises(a: Exercise[], b: Exercise[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function changedExercises() {
  return new ApiError(409, "Os exercícios foram alterados. Feche o editor e atualize a página.");
}
export async function editLoggedExercises(userId: string, projectId: string, id: string, raw: unknown) {
  const input = object(raw);
  await requireActiveTraining(userId, projectId);
  const where = { projectId, id, sport: "strength", project: owned(userId, projectId) };
  const row = await prisma.workoutLog.findFirst({ where, select: {exercises: true} });
  if (!row) throw new ApiError(404, "Registro não encontrado.");
  const exercises = exerciseList(input.exercises);
  if (!exercises.length) invalid("Mantenha pelo menos um exercício no registro.");
  const current = exerciseList(row.exercises);
  if (sameExercises(current, exercises)) return;
  if (!sameExercises(current, exerciseList(input.previous))) throw changedExercises();
  const saved = await prisma.workoutLog.updateMany({
    where: {...where, exercises: {equals: row.exercises as Exercise[]}}, data: {exercises}
  });
  if (!saved.count) throw changedExercises();
}
export async function removeTrainingLog(userId: string, projectId: string, logId: string) {
  const result = await prisma.workoutLog.deleteMany({ where: { projectId, id: logId, project: owned(userId, projectId) } });
  if (!result.count) throw new ApiError(404, "Registro não encontrado.");
}
