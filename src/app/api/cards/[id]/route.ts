import { json, optionalDayKey, optionalMinutes, optionalPriority, readBody, requireString, withUser } from "@/lib/api";
import { completeCard, deleteCard, getCard, reopenCard, updateCard } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getCard(id, user.id));
});

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);

  if (body.completed === true) return json(await completeCard(user.id, id));
  if (body.completed === false) return json(await reopenCard(user.id, id));

  const card = await updateCard(id, user.id, {
    title: body.title !== undefined ? requireString(body.title, "title") : undefined,
    description: body.description !== undefined ? requireString(body.description, "description", { allowEmpty: true }) : undefined,
    priority: optionalPriority(body.priority),
    estimatedMinutes: optionalMinutes(body.estimatedMinutes),
    scheduledFor: optionalDayKey(body.scheduledFor),
  });
  return json(card);
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteCard(id, user.id);
  return json({ ok: true });
});
