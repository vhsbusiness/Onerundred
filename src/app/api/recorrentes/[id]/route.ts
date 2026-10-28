import { ApiError, json, readBody, withUser } from "@/lib/api";
import { deleteRecurring, updateRecurring } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (body.weekdays !== undefined && !Array.isArray(body.weekdays)) throw new ApiError(400, "weekdays deve ser uma lista");
  if (body.active !== undefined && typeof body.active !== "boolean") throw new ApiError(400, "active deve ser true/false");
  return json(
    await updateRecurring(user.id, id, {
      weekdays: body.weekdays ? (body.weekdays as unknown[]).map(Number) : undefined,
      active: body.active as boolean | undefined,
      listId: typeof body.listId === "string" ? body.listId : undefined,
    }),
  );
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteRecurring(user.id, id);
  return json({ ok: true });
});
