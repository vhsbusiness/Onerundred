import { isBoardSymbol } from "@/lib/board-icons";
import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { deleteBoard, getBoard, updateBoard } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getBoard(id, user.id));
});

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (body.symbol != null && !isBoardSymbol(body.symbol)) throw new ApiError(400, "Ícone inválido");
  if (body.type !== undefined && body.type !== "tasks" && body.type !== "organization") throw new ApiError(400, "Tipo de quadro inválido");
  await updateBoard(id, user.id, { symbol: body.symbol as string | null | undefined, type: body.type as "tasks" | "organization" | undefined, name: body.name !== undefined ? requireString(body.name, "name") : undefined });
  return json(await getBoard(id, user.id));
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteBoard(id, user.id);
  return json({ ok: true });
});
