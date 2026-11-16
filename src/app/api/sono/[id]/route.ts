import { json, withAccess } from "@/lib/api";
import { deleteSleep } from "@/lib/sleep";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAccess("sleep", async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteSleep(user.id, id);
  return json({ ok: true });
});
