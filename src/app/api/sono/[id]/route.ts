import { json, withUser } from "@/lib/api";
import { deleteSleep } from "@/lib/sleep";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteSleep(user.id, id);
  return json({ ok: true });
});
