import { handle, json, readBody, requireString } from "@/lib/api";
import { deleteBoard, getBoard, updateBoard } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getBoard(id));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  await updateBoard(id, { name: body.name !== undefined ? requireString(body.name, "name") : undefined });
  return json(await getBoard(id));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteBoard(id);
  return json({ ok: true });
});
