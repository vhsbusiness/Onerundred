import { ApiError, handle, json, readBody, requireString } from "@/lib/api";
import { moveCard } from "@/lib/repo";

export const POST = handle(async (req: Request) => {
  const body = await readBody(req);
  const toIndex = Number(body.toIndex);
  if (!Number.isInteger(toIndex) || toIndex < 0) throw new ApiError(400, "toIndex inválido");
  await moveCard(requireString(body.cardId, "cardId"), requireString(body.toListId, "toListId"), toIndex);
  return json({ ok: true });
});
