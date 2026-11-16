import { json, readBody, withAccess } from "@/lib/api";
import { recordTraining } from "@/lib/training";

export const POST = withAccess("training", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  return json(await recordTraining(user.id, (await ctx.params).id, await readBody(req)), { status: 201 });
});
