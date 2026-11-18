import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { parseMindFolds } from "@/lib/mind-fold-state";
import { saveMindFolds } from "@/lib/repo";

export const PUT = withAccess("boards", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const body = await readBody(req);
  if (body.viewerId !== user.id) throw new ApiError(403, "A conta desta aba mudou. Atualize a página.");
  await saveMindFolds((await ctx.params).id, user.id, parseMindFolds(body.foldedIds));
  return json({ ok: true });
});
