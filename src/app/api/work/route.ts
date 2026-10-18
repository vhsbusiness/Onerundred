import { ApiError, handle, json, readBody } from "@/lib/api";
import { getWorkState, startWork, stopWork } from "@/lib/repo";

export const GET = handle(async () => json(await getWorkState()));

export const POST = handle(async (req: Request) => {
  const body = await readBody(req);
  if (body.action === "start") return json(await startWork());
  if (body.action === "stop") return json(await stopWork());
  throw new ApiError(400, "action deve ser start ou stop");
});
