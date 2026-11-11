import { json, readBody, withUser } from "@/lib/api";
import { saveTrainingDay } from "@/lib/training";

export const PUT = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await saveTrainingDay(user.id, (await ctx.params).id, await readBody(req));
  return json({ ok: true });
});
