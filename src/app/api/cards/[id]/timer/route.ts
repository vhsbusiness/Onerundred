import { ApiError, json, readBody, withUser } from "@/lib/api";
import { deleteTaskSession, getCard, startTaskTimer, stopTaskTimer } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (body.action === "start") return json(await startTaskTimer(user.id, id));
  if (body.action === "stop") return json(await stopTaskTimer(user.id, id));
  throw new ApiError(400, "action deve ser start ou stop");
});

export const DELETE = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.sessionId !== "string") throw new ApiError(400, "sessionId obrigatório");
  await deleteTaskSession(user.id, body.sessionId);
  return json(await getCard(id, user.id));
});
