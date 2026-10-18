import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { moveCard } from "@/lib/repo";

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const toIndex = Number(body.toIndex);
  if (!Number.isInteger(toIndex) || toIndex < 0) throw new ApiError(400, "toIndex inválido");
  await moveCard(user.id, requireString(body.cardId, "cardId"), requireString(body.toListId, "toListId"), toIndex);
  return json({ ok: true });
});
