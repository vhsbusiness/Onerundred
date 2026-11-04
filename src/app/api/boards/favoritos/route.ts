import { ApiError, json, readBody, withUser } from "@/lib/api";
import { listFavoriteBoards, setFavoriteBoards } from "@/lib/repo";

export const GET = withUser(async (user) => json(await listFavoriteBoards(user.id)));

export const PUT = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new ApiError(400, "Favoritos inválidos");
  }
  return json(await setFavoriteBoards(user.id, body.ids));
});
