import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { endWork, getWorkState, pauseWork, startWork, workSessionsOnDay } from "@/lib/repo";

import { requireDay } from "@/lib/organizer-input";

export const GET = withAccess("work", async (user, req: Request) => {
  const day = new URL(req.url).searchParams.get("dia");
  return json(day === null ? await getWorkState(user.id) : await workSessionsOnDay(user.id, requireDay(day)));
});

/** action: start (começar/retomar/reabrir) | pause (ou stop) | end (encerrar o dia) */
export const POST = withAccess("work", async (user, req: Request) => {
  const body = await readBody(req);
  if (body.action === "start") return json(await startWork(user.id));
  if (body.action === "pause" || body.action === "stop") return json(await pauseWork(user.id));
  if (body.action === "end") return json(await endWork(user.id));
  throw new ApiError(400, "action deve ser start, pause ou end");
});
