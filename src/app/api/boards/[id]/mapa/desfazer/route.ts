import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { undoMap } from "@/lib/mind-undo";

export const POST = withAccess("boards", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { actionId } = await readBody(req);
  if (typeof actionId !== "number" || !Number.isSafeInteger(actionId)) throw new ApiError(400, "Ação inválida.");
  return json(await undoMap(id, user.id, actionId));
});
