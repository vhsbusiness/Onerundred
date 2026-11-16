import { MIND_TITLE_MAX_LENGTH, MIND_TITLE_LIMIT_MESSAGE } from "@/lib/mind-title";
import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { organizeMindTree, reconnectMindBranch } from "@/lib/mind-structure";
export const POST = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  if (body.action === "organize") {
    const id = body.id === undefined ? undefined : requireString(body.id, "Ramo");
    return json(await organizeMindTree(boardId, user.id, id));
  }
  if (body.action !== "connect") throw new ApiError(400, "Ação inválida.");
  const id = requireString(body.id, "Ramo");
  const parentId = body.parentId === null ? null : requireString(body.parentId, "Ramo de destino");
  const title = body.title === undefined ? undefined : requireString(body.title, "Ideia");
  if (title && title.length > MIND_TITLE_MAX_LENGTH) throw new ApiError(400, MIND_TITLE_LIMIT_MESSAGE);
  return json(await reconnectMindBranch(boardId, user.id, id, parentId, title));
});
