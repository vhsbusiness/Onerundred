import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { deleteWorkSession, getWorkState, updateWorkSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Informe os horários da sessão");
  await updateWorkSession(user.id, id, {
    startedAt: requireString(body.startedAt, "Início"),
    endedAt: requireString(body.endedAt, "Término"),
    previousStartedAt: requireString(body.previousStartedAt, "Início original"),
    previousEndedAt: requireString(body.previousEndedAt, "Término original"),
  });
  return json(await getWorkState(user.id));
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteWorkSession(user.id, id);
  return json(await getWorkState(user.id));
});
