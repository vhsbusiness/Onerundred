import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { addChecklistItem, removeChecklistItem, updateChecklistItem } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Adiciona um item à checklist da tarefa. */
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  return json(await addChecklistItem(user.id, id, requireString(body.text, "text")), { status: 201 });
});

/** Marca/desmarca ou renomeia um item. */
export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.itemId !== "string") throw new ApiError(400, "itemId obrigatório");
  if (body.done !== undefined && typeof body.done !== "boolean") throw new ApiError(400, "done deve ser true/false");
  return json(
    await updateChecklistItem(user.id, id, body.itemId, {
      text: body.text !== undefined ? requireString(body.text, "text") : undefined,
      done: body.done as boolean | undefined,
    }),
  );
});

export const DELETE = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.itemId !== "string") throw new ApiError(400, "itemId obrigatório");
  return json(await removeChecklistItem(user.id, id, body.itemId));
});
