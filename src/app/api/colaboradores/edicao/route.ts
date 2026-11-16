import { apiPrincipal } from "@/lib/personal-api";
import { ApiError, json, readBody, requireString, withAccess } from "@/lib/api";
import { pendingBoardRequests, requestBoardEdit, respondBoardRequest } from "@/lib/collaboration-boards";

export const GET = withAccess("collaboration", async user => json(await pendingBoardRequests(user.id)));
export const POST = withAccess("collaboration", async (user, req: Request) => {
  if (req.headers.has("authorization")) await apiPrincipal(req, "boards");
  const body = await readBody(req);
  return json(await requestBoardEdit(user.id, requireString(body.collaborationId, "Colaboração"), requireString(body.boardId, "Quadro")));
});
export const PATCH = withAccess("collaboration", async (user, req: Request) => {
  if (req.headers.has("authorization")) await apiPrincipal(req, "boards");
  const body = await readBody(req);
  if (typeof body.approve !== "boolean") throw new ApiError(400, "Resposta inválida.");
  await respondBoardRequest(user.id, requireString(body.id, "Pedido"), body.approve);
  return json({ ok: true });
});
