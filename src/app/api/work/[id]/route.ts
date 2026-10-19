import { json, withUser } from "@/lib/api";
import { deleteWorkSession, getWorkState } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteWorkSession(user.id, id);
  return json(await getWorkState(user.id));
});
