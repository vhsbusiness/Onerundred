import { ApiError, json, withUser } from "@/lib/api";
import { pasteMindSelection } from "@/lib/mind-copy";
import { MIND_CLIPBOARD_LIMIT } from "@/lib/mind-clipboard";

export const POST = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Cópia vazia.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MIND_CLIPBOARD_LIMIT + 1024) { await reader.cancel(); throw new ApiError(413, "Copie menos itens ou imagens por vez."); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ApiError(400, "Cópia inválida."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Cópia inválida.");
  return json(await pasteMindSelection(id, user.id, body), { status: 201 });
});
