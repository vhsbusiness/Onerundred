import { handle } from "@/lib/api";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { readableOwner } from "@/lib/collaboration-boards";
import { getCardImage } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Serve a imagem de uma tarefa do próprio usuário. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const collaboration = new URL(_req.url).searchParams.get("colaboracao");
  const img = collaboration
    ? await prisma.cardImage.findFirst({ where: { id, card: { archivedAt: null, list: { board: { user: readableOwner(user.id, collaboration) } } } }, select: { data: true } })
    : await getCardImage(user.id, id);
  if (!img) return new Response("Não encontrada", { status: 404 });
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(img.data);
  if (!match) return new Response("Imagem inválida", { status: 500 });
  const bytes = Buffer.from(match[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": match[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": collaboration ? "private, no-store" : "private, max-age=86400, immutable",
    },
  });
});
