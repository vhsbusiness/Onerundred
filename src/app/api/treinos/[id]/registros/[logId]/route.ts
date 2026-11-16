import { json, withAccess } from "@/lib/api";
import { removeTrainingLog } from "@/lib/training";

export const DELETE = withAccess("training", async (user, _req: Request, ctx: { params: Promise<{ id: string; logId: string }> }) => {
  const { id, logId } = await ctx.params;
  await removeTrainingLog(user.id, id, logId);
  return json({ ok: true });
});
