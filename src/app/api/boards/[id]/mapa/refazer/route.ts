import { ApiError, json, readBody, withUser } from "@/lib/api";
import { redoMap } from "@/lib/mind-undo";

export const POST = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { actionId } = await readBody(req);
  if (typeof actionId !== "number" || !Number.isSafeInteger(actionId)) throw new ApiError(400, "Ação inválida.");
  return json(await redoMap(id, user.id, actionId));
});
