import { json, withAccess } from "@/lib/api";
import { analyzeWorkSession } from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

/** Visão da IA sobre uma sessão de trabalho encerrada. */
export const POST = withAccess("work", async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await analyzeWorkSession(user.id, id));
});
