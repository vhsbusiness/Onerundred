import { ApiError, json, readBody, withUser } from "@/lib/api";
import { getWorkState, startWork, stopWork } from "@/lib/repo";

export const GET = withUser(async (user) => json(await getWorkState(user.id)));

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (body.action === "start") return json(await startWork(user.id));
  if (body.action === "stop") return json(await stopWork(user.id));
  throw new ApiError(400, "action deve ser start ou stop");
});
