import { parseTextSpans, encodeTextSpans } from "@/lib/mind-rich-text";
import { MIND_TITLE_MAX_LENGTH, MIND_TITLE_LIMIT_MESSAGE } from "@/lib/mind-title";
import { ApiError, json, readBody, requireString, withAccess } from "@/lib/api";
import { insertRelative } from "@/lib/mind-insert";
import { organizeMindTree, reconnectMindBranch } from "@/lib/mind-structure";
export const POST = withAccess("boards", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  if (body.action === "organize") {
    const id = body.id === undefined ? undefined : requireString(body.id, "Ramo");
    return json(await organizeMindTree(boardId, user.id, id));
  }
  const id = requireString(body.id, "Ramo");
  const title = body.title === undefined ? undefined : requireString(body.title, "Ideia");
  if (title && title.length > MIND_TITLE_MAX_LENGTH) throw new ApiError(400, MIND_TITLE_LIMIT_MESSAGE);
  const textSpans = body.textSpans === undefined ? undefined : encodeTextSpans(parseTextSpans(title ?? "", body.textSpans));
  if (body.action === "parent" || body.action === "sibling") return json(await insertRelative(boardId,user.id,id,body.action,title,textSpans),{status:201});
  if (body.action !== "connect") throw new ApiError(400, "Ação inválida.");
  const parentId = body.parentId === null ? null : requireString(body.parentId, "Ramo de destino");
  return json(await reconnectMindBranch(boardId, user.id, id, parentId, title, textSpans));
});
