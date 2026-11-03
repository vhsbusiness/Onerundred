import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { pendingBoardRequests, requestBoardEdit, respondBoardRequest } from "@/lib/collaboration-boards";

export const GET = withUser(async user => json(await pendingBoardRequests(user.id)));
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  return json(await requestBoardEdit(user.id, requireString(body.collaborationId, "Colaboração"), requireString(body.boardId, "Quadro")));
});
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (typeof body.approve !== "boolean") throw new ApiError(400, "Resposta inválida.");
  await respondBoardRequest(user.id, requireString(body.id, "Pedido"), body.approve);
  return json({ ok: true });
});
