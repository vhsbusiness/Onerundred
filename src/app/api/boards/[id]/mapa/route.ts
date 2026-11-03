import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { palette, positionBranch } from "@/lib/mind-layout";
import { prisma } from "@/lib/db";
import { boardAccess } from "@/lib/repo";

type Context = { params: Promise<{ id: string }> };


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
    const nodes = await tx.mindNode.findMany({ where: { boardId }, select: { id: true, x: true, y: true, parentId: true, color: true } });
    const branch = positionBranch(parent, nodes);
    return tx.mindNode.create({ data: { boardId, parentId, title, ...branch } });
  });
  return json(node, { status: 201 });
});

export const PATCH = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  const id = requireString(body.id, "Ideia");
  const data: Partial<Omit<import("@/lib/types").MindNodeDTO, "id" | "parentId">> = {};
  for (const key of ["bold", "locked"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") throw new ApiError(400, "Formato inválido.");
    data[key] = body[key];
  }
  for (const key of ["textColor", "highlight"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || (value !== "" && !/^#[0-9a-f]{6}$/i.test(value))) throw new ApiError(400, "Cor inválida.");
    data[key] = value;
  }
  if (body.shape !== undefined) {
    if (typeof body.shape !== "string" || !["rounded", "pill", "plain"].includes(body.shape)) throw new ApiError(400, "Forma inválida.");
    data.shape = body.shape;
  }
  if (body.fontSize !== undefined) {
    if (typeof body.fontSize !== "number" || ![12, 14, 16, 20].includes(body.fontSize)) throw new ApiError(400, "Tamanho inválido.");
    data.fontSize = body.fontSize;
  }
  if (body.link !== undefined) {
    if (typeof body.link !== "string" || body.link.length > 2048) throw new ApiError(400, "Link inválido.");
    data.link = body.link.trim();
    if (data.link) {
      try { if (!["http:", "https:"].includes(new URL(data.link).protocol)) throw Error(); }
      catch { throw new ApiError(400, "Use um link http ou https."); }
    }
  }
  if (body.title !== undefined) data.title = topic(body.title);
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || (!palette.includes(body.color) && !/^#[0-9a-f]{6}$/i.test(body.color))) throw new ApiError(400, "Cor inválida.");
    data.color = body.color;
  }
  if (body.x !== undefined || body.y !== undefined) {
    const coordinate = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= 1000000;
    if (!coordinate(body.x) || !coordinate(body.y)) throw new ApiError(400, "Posição inválida.");
    data.x = body.x;
    data.y = body.y;
  }
  if (!Object.keys(data).length) throw new ApiError(400, "Escolha uma alteração.");
  const result = await prisma.mindNode.updateMany({ where: { id, boardId, ...(data.x === undefined ? {} : { locked: false }), board: { type: "mindmap", ...boardAccess(user.id) } }, data });
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
