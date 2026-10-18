import { ApiError, json, optionalDayKey, readBody, requireString, withUser } from "@/lib/api";
import { deleteProject, getProject, updateProject } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getProject(user.id, id));
});

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  const days = body.days === undefined ? undefined : Number(body.days);
  if (days !== undefined && !Number.isInteger(days)) throw new ApiError(400, "Duração em dias inválida");
  const project = await updateProject(user.id, id, {
    name: body.name !== undefined ? requireString(body.name, "name") : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    obligations: typeof body.obligations === "string" ? body.obligations : undefined,
    startDate: optionalDayKey(body.startDate),
    days,
    archived: body.archived === undefined ? undefined : Boolean(body.archived),
  });
  return json(project);
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteProject(user.id, id);
  return json({ ok: true });
});
