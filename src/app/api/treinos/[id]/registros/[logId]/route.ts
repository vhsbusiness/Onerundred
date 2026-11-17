import { json, readBody, withAccess } from "@/lib/api";
import { editLoggedExercises, removeTrainingLog } from "@/lib/training";

export const DELETE = withAccess("training", async (user, _req: Request, ctx: { params: Promise<{ id: string; logId: string }> }) => {
  const { id, logId } = await ctx.params;
  await removeTrainingLog(user.id, id, logId);
  return json({ ok: true });
});

export const PATCH = withAccess("training", async (user, req: Request, ctx: { params: Promise<{ id: string; logId: string }> }) => {
  const { id, logId } = await ctx.params;
  await editLoggedExercises(user.id, id, logId, await readBody(req));
  return json({ ok: true });
});
