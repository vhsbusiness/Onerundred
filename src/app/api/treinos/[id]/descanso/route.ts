import { json, readBody, withAccess } from "@/lib/api";
import { changeRest } from "@/lib/training-rest";

export const PUT = withAccess("training", async (user, req: Request, ctx: { params: Promise<{ id: string }> }) =>
  json(await changeRest(user.id, (await ctx.params).id, await readBody(req))));
