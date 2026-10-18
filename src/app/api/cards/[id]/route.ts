import { handle, json, optionalDayKey, optionalMinutes, optionalPriority, readBody, requireString } from "@/lib/api";
import { completeCard, deleteCard, getCard, reopenCard, updateCard } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getCard(id));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);

  if (body.completed === true) return json(await completeCard(id));
  if (body.completed === false) return json(await reopenCard(id));

  const card = await updateCard(id, {
    title: body.title !== undefined ? requireString(body.title, "title") : undefined,
    description: body.description !== undefined ? requireString(body.description, "description", { allowEmpty: true }) : undefined,
    priority: optionalPriority(body.priority),
    estimatedMinutes: optionalMinutes(body.estimatedMinutes),
    scheduledFor: optionalDayKey(body.scheduledFor),
  });
  return json(card);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteCard(id);
  return json({ ok: true });
});
