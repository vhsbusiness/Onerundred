import { json, withUser } from "@/lib/api";
import { previewTrainingFile } from "@/lib/training-import";

export const POST = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) =>
  json({ days: await previewTrainingFile(user.id, (await ctx.params).id, req) }));
