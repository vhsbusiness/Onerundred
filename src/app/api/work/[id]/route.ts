import { handle, json } from "@/lib/api";
import { deleteWorkSession, getWorkState } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteWorkSession(id);
  return json(await getWorkState());
});
