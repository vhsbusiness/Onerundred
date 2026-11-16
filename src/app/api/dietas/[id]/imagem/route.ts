import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { coverData, coverResponse } from "@/lib/project-cover";

type Context = { params: Promise<{ id: string }> };
export const GET = withAccess("diet", async (user, _req: Request, ctx: Context) => {
  const { id } = await ctx.params;
  const row = await prisma.projectCover.findFirst({
    where: { dietId: id, diet: { userId: user.id } },
    select: { imageData: true },
  });
  return coverResponse(row?.imageData);
});
export const PUT = withAccess("diet", async (user, req: Request, ctx: Context) => {
  const { id } = await ctx.params;
  const imageData = coverData((await readBody(req)).image);
  if (!imageData) throw new ApiError(400, "Escolha uma imagem.");
  const exists = await prisma.dietProject.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "Projeto não encontrado.");
  await prisma.projectCover.upsert({
    where: { dietId: id },
    update: { id: randomUUID(), imageData },
    create: { dietId: id, imageData },
  });
  return json({ ok: true });
});
export const DELETE = withAccess("diet", async (user, _req: Request, ctx: Context) => {
  const { id } = await ctx.params;
  await prisma.projectCover.deleteMany({ where: { dietId: id, diet: { userId: user.id } } });
  return json({ ok: true });
});
