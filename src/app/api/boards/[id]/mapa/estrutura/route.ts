import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { organizeMindTree, reconnectMindBranch } from "@/lib/mind-structure";
export const POST = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req), id = requireString(body.id, "Ramo");
  if (body.action === "organize") return json(await organizeMindTree(boardId, user.id, id));
  if (body.action !== "connect") throw new ApiError(400, "Ação inválida.");
  const parentId = body.parentId === null ? null : requireString(body.parentId, "Ramo de destino");
  return json(await reconnectMindBranch(boardId, user.id, id, parentId));
});
