import { ApiError, json, readBody, withUser } from "@/lib/api";
import { rememberBoardVisit } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const body = await readBody(req);
  // A tab left open before switching accounts cannot overwrite the new account's history.
  if (body.viewerId !== user.id) throw new ApiError(403, "A conta desta aba mudou. Atualize a página.");
  await rememberBoardVisit((await ctx.params).id, user.id);
  return json({ ok: true });
});
