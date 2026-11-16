import { prisma } from "./db";
import { ApiError } from "./errors";
import { requireDay, shortText } from "./organizer-input";
import { todayKey } from "./time";

export function listDiets(userId: string) {
  return prisma.dietProject.findMany({
    where: { userId },
    select: { id: true, name: true, cover: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });
}
export async function readDiet(userId: string, id: string, dayKey: string) {
  const project = await prisma.dietProject.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      cover: { select: { id: true } },
      days: { where: { meals: { some: {} } }, select: { dayKey: true }, orderBy: { dayKey: "desc" } },
    },
  });
  if (!project) return null;
  const meals = await prisma.dietMeal.findMany({
    where: { day: { projectId: id, dayKey, project: { userId } } },
    orderBy: [{ time: "asc" }, { id: "asc" }],
  });
  return { project, meals };
}
export type DietDetail = NonNullable<Awaited<ReturnType<typeof readDiet>>>;

export async function writeDiet(userId: string, projectId: string, body: Record<string, unknown>) {
  const owner = { id: projectId, userId };
  await prisma.$transaction(async (tx) => {
    if (!(await tx.dietProject.findFirst({ where: owner, select: { id: true } })))
      throw new ApiError(404, "Projeto não encontrado.");
    if (body.action === "rename") {
      await tx.dietProject.update({
        where: owner,
        data: { name: shortText(body.name, "nome do projeto", 80) },
      });
      return;
    }
    if (body.action === "deleteProject") {
      await tx.dietProject.delete({ where: owner });
      return;
    }
    const dayKey = requireDay(body.dayKey);
    const where = {
      id: typeof body.id === "string" ? body.id : "",
      day: { projectId, dayKey, project: { userId } },
    };
    const missing = new ApiError(404, "Refeição não encontrada neste dia.");
    if (body.action === "deleteMeal") {
      if (!(await tx.dietMeal.deleteMany({ where })).count) throw missing;
      return;
    }
    if (body.action === "mark") {
      if (typeof body.eaten !== "boolean" || (body.eaten && dayKey > todayKey()))
        throw new ApiError(400, "Você pode registrar o consumo até hoje.");
      if (!(await tx.dietMeal.updateMany({ where, data: { eaten: body.eaten } })).count) throw missing;
      return;
    }
    if (body.action === "copy") {
      const from = requireDay(body.from);
      if (from === dayKey) throw new ApiError(400, "Escolha outro dia de origem.");
      const planned = await tx.dietMeal.findMany({
        where: { day: { projectId, dayKey: from } },
        select: { name: true, time: true, foods: true, calories: true },
        orderBy: [{ time: "asc" }, { id: "asc" }],
      });
      if (!planned.length) throw new ApiError(400, "O dia escolhido não tem refeições.");
      const target = await tx.dietDay.upsert({
        where: { projectId_dayKey: { projectId, dayKey } },
        create: { projectId, dayKey },
        update: { dayKey },
      });
      if (await tx.dietMeal.count({ where: { dayId: target.id } }))
        throw new ApiError(409, "Escolha um dia sem refeições para copiar o cardápio.");
      await tx.dietMeal.createMany({ data: planned.map((meal) => ({ ...meal, dayId: target.id })) });
      return;
    }
    if (body.action !== "add" && body.action !== "edit") throw new ApiError(400, "Operação inválida.");
    const time = body.time ?? "";
    if (typeof time !== "string" || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
      throw new ApiError(400, "Horário inválido.");
    const calories = body.calories ?? null;
    if (
      calories !== null &&
      (typeof calories !== "number" || !Number.isInteger(calories) || calories < 0 || calories > 100000)
    )
      throw new ApiError(400, "Confira as calorias da refeição.");
    const data = {
      name: shortText(body.name, "refeição", 80),
      time,
      foods: shortText(body.foods, "alimentos e porções", 3000),
      calories,
    };
    if (body.action === "edit") {
      if (!(await tx.dietMeal.updateMany({ where, data })).count) throw missing;
    } else {
      const day = await tx.dietDay.upsert({
        where: { projectId_dayKey: { projectId, dayKey } },
        create: { projectId, dayKey },
        update: {},
      });
      await tx.dietMeal.create({ data: { ...data, dayId: day.id } });
    }
  });
}
