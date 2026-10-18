import { ApiError, json, readBody, withUser } from "@/lib/api";
import { endWork, getWorkState, pauseWork, startWork } from "@/lib/repo";

export const GET = withUser(async (user) => json(await getWorkState(user.id)));

/** action: start (começar/retomar/reabrir) | pause (ou stop) | end (encerrar o dia) */
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (body.action === "start") return json(await startWork(user.id));
  if (body.action === "pause" || body.action === "stop") return json(await pauseWork(user.id));
  if (body.action === "end") return json(await endWork(user.id));
  throw new ApiError(400, "action deve ser start, pause ou end");
});
