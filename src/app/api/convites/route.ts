import { ApiError, json, readBody, withUser } from "@/lib/api";
import { listMyInvites, respondInvite } from "@/lib/sharing";

/** Convites pendentes para mim (sininho). */
export const GET = withUser(async (user) => json(await listMyInvites(user.id)));

/** Responde: { id, accept: true|false } */
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (typeof body.id !== "string" || typeof body.accept !== "boolean") throw new ApiError(400, "Informe id e accept");
  return json(await respondInvite(user.id, body.id, body.accept));
});
