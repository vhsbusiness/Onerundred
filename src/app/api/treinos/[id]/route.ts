import { json, readBody, withUser } from "@/lib/api";
import { editTraining, removeTraining } from "@/lib/training";

type Context = { params: Promise<{ id: string }> };
export const PATCH = withUser(async (user, req: Request, ctx: Context) => {
  await editTraining(user.id, (await ctx.params).id, await readBody(req));
  return json({ ok: true });
});
export const DELETE = withUser(async (user, _req: Request, ctx: Context) => {
  await removeTraining(user.id, (await ctx.params).id);
  return json({ ok: true });
});
