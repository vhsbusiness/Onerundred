import { ApiError, json, readBody, withUser } from "@/lib/api";
import { applyImport, planImport } from "@/lib/import";
import type { ImportPlan } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Lê o print com a IA e devolve o plano (nada é criado ainda). */
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.image !== "string") throw new ApiError(400, "Envie a imagem (data URL)");
  return json(await planImport(user.id, id, body.image));
});

/** Aplica o plano: cria listas e tarefas que não existem. */
export const PUT = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  const plan = body.plan as ImportPlan | undefined;
  if (!plan || !Array.isArray(plan.lists)) throw new ApiError(400, "Plano inválido");
  return json(await applyImport(user.id, id, plan, Boolean(body.includeDone)));
});
