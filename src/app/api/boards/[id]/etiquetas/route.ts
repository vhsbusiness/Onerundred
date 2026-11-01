import { json, withUser } from "@/lib/api";
import { listBoardLabels } from "@/lib/repo";
type Ctx = { params: Promise<{ id: string }> };
export const GET = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await listBoardLabels(id, user.id));
});
