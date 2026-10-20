import { ApiError, json, optionalPriority, readBody, requireString, withUser } from "@/lib/api";
import { deleteList, updateList } from "@/lib/repo";
import type { ListKind } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
const KINDS: ListKind[] = ["normal", "today", "tomorrow", "done"];

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  const kind = body.kind === undefined ? undefined : (body.kind as ListKind);
  if (kind !== undefined && !KINDS.includes(kind)) throw new ApiError(400, "Tipo de lista inválido");
  const toIndex = body.toIndex === undefined ? undefined : Number(body.toIndex);
  if (toIndex !== undefined && !Number.isInteger(toIndex)) throw new ApiError(400, "toIndex inválido");
  await updateList(id, user.id, {
    name: body.name !== undefined ? requireString(body.name, "name") : undefined,
    priority: optionalPriority(body.priority),
    kind,
    toIndex,
  });
  return json({ ok: true });
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteList(id, user.id);
  return json({ ok: true });
});
