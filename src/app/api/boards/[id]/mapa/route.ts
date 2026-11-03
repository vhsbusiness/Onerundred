import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { boardAccess } from "@/lib/repo";

type Context = { params: Promise<{ id: string }> };
const palette = ["blue", "green", "orange", "red"];

function topic(value: unknown) {
  const title = requireString(value, "Ideia");
  if (title.length > 160) throw new ApiError(400, "Use até 160 caracteres por ideia.");
  return title;
}

export const POST = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  const parentId = requireString(body.parentId, "Ideia principal");
  const title = topic(body.title);
  const node = await prisma.$transaction(async tx => {
    const parent = await tx.mindNode.findFirst({
      where: { id: parentId, boardId, board: { type: "mindmap", ...boardAccess(user.id) } },
    });
    if (!parent) throw new ApiError(404, "Ideia indisponível.");
    const nodes = await tx.mindNode.findMany({ where: { boardId }, select: { x: true, y: true, parentId: true } });
    const siblings = nodes.filter(n => n.parentId === parentId).length;
    const root = nodes.find(n => n.parentId === null)!;
    const right = parent.parentId ? parent.x >= root.x : siblings % 2 === 0;
    const x = parent.x + (right ? 240 : -240);
    let y = parent.y;
    while (nodes.some(n => Math.abs(n.x - x) < 202 && Math.abs(n.y - y) < 84)) y += 96;
    return tx.mindNode.create({ data: { boardId, parentId, title, x, y, color: parent.parentId ? parent.color : palette[siblings % palette.length] } });
  });
  return json(node, { status: 201 });
});

export const PATCH = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  const id = requireString(body.id, "Ideia");
  const data: { title?: string; x?: number; y?: number; color?: string } = {};
  if (body.title !== undefined) data.title = topic(body.title);
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !palette.includes(body.color)) throw new ApiError(400, "Cor inválida.");
    data.color = body.color;
  }
  if (body.x !== undefined || body.y !== undefined) {
    const coordinate = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= 1000000;
    if (!coordinate(body.x) || !coordinate(body.y)) throw new ApiError(400, "Posição inválida.");
    data.x = body.x;
    data.y = body.y;
  }
  if (!Object.keys(data).length) throw new ApiError(400, "Escolha uma alteração.");
  const result = await prisma.mindNode.updateMany({ where: { id, boardId, board: { type: "mindmap", ...boardAccess(user.id) } }, data });
  if (!result.count) throw new ApiError(404, "Ideia indisponível.");
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const id = requireString((await readBody(req)).id, "Ideia");
  const result = await prisma.mindNode.deleteMany({ where: { id, boardId, parentId: { not: null }, board: { type: "mindmap", ...boardAccess(user.id) } } });
  if (!result.count) throw new ApiError(404, "Ramo indisponível para exclusão.");
  return json({ ok: true });
});
