import { ApiError, handle, json, readBody } from "@/lib/api";
import { deleteTaskSession, getCard, startTaskTimer, stopTaskTimer } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (body.action === "start") return json(await startTaskTimer(id));
  if (body.action === "stop") return json(await stopTaskTimer(id));
  throw new ApiError(400, "action deve ser start ou stop");
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.sessionId !== "string") throw new ApiError(400, "sessionId obrigatório");
  await deleteTaskSession(body.sessionId);
  return json(await getCard(id));
});
