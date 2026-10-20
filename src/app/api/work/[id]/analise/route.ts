import { json, withUser } from "@/lib/api";
import { analyzeWorkSession } from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

/** Visão da IA sobre uma sessão de trabalho encerrada. */
export const POST = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await analyzeWorkSession(user.id, id));
});
