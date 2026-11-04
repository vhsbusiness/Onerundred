import { parseMindPicture, mindImageDimension } from "@/lib/mind-picture";
import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { isMindRoot } from "@/lib/mind-root";
import { parseDrawing } from "@/lib/mind-drawing";
import { positionBranch } from "@/lib/mind-layout";
import { parseMindStyle } from "@/lib/mind-style";
import { remember, subtree, writeMap, type NodePatch } from "@/lib/mind-undo";

type Context = { params: Promise<{ id: string }> };
function coordinate(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= 1_000_000;
}
function topic(value: unknown) {
  const title = requireString(value, "Ideia");
  if (title.length > 160) throw new ApiError(400, "Use até 160 caracteres por ideia.");
  return title;
}

export const POST = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  if (body.detached !== undefined && typeof body.detached !== "boolean") throw new ApiError(400, "Tipo inválido.");
  const detached = body.detached === true;
  const parentId = detached ? null : requireString(body.parentId, "Ideia principal");
  const title = topic(body.title);
  const direction = body.direction;
  if (direction !== undefined && direction !== "right" && direction !== "left") throw new ApiError(400, "Direção inválida.");
  const shape = body.shape ?? "plain";
  if (shape !== "plain" && shape !== "rounded") throw new ApiError(400, "Forma inválida.");
  const image = parseMindPicture(body);
  const drawing = body.drawing === undefined ? null : parseDrawing(body.drawing);
  if (body.drawing !== undefined && (!drawing || !detached || image.imageData)) throw new ApiError(400, "Desenho inválido.");
  const inkId = body.inkId;
  if (inkId !== undefined && (!drawing || typeof inkId !== "string" || !/^ink_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(inkId))) throw new ApiError(400, "Identificador do desenho inválido.");
  const ink = drawing ? { drawing: JSON.stringify(drawing), ...parseMindStyle({ color: body.color, strokeWidth: body.strokeWidth }) } : {};
  if (image.imageData && !detached) throw new ApiError(400, "Cole a imagem como um objeto no mapa.");
  let point: { x: number; y: number } | undefined;
  if (body.x !== undefined || body.y !== undefined) {
    if (!coordinate(body.x) || !coordinate(body.y)) throw new ApiError(400, "Posição inválida.");
    point = { x: body.x, y: body.y };
  }
  const node = await writeMap(boardId, user.id, async tx => {
    if (typeof inkId === "string") {
      const saved = await tx.mindNode.findUnique({ where: { id: inkId } });
      if (saved) {
        if (saved.boardId !== boardId || !saved.drawing) throw new ApiError(409, "Desenho indisponível.");
        return saved;
      }
    }
    const parent = parentId ? await tx.mindNode.findFirst({ where: { id: parentId, boardId } }) : null;
    if (!detached && (!parent || parent.imageData || parent.drawing)) throw new ApiError(404, "Ideia indisponível.");
    const nodes = await tx.mindNode.findMany({ where: { boardId } });
    if (image.imageData && nodes.filter(n => n.imageData).length >= 50) throw new ApiError(400, "Este mapa já tem 50 imagens.");
    const branch = parent ? positionBranch(parent, nodes, direction) : { x: 0, y: 0, color: "blue" };
    if (!point && (!coordinate(branch.x) || !coordinate(branch.y))) throw new ApiError(400, "Limite de posição do mapa atingido.");
    const node = await tx.mindNode.create({ data: { ...(typeof inkId === "string" && { id: inkId }), boardId, parentId, detached, title, shape, ...branch, ...point, ...image, ...ink } });
    await remember(tx, boardId, user.id, { kind: "create", nodes: [node] });
    return tx.mindNode.findUniqueOrThrow({ where: { id: node.id } });
  });
  return json(node, { status: 201 });
});

export const PATCH = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  const id = requireString(body.id, "Ideia");
  const data: NodePatch = parseMindStyle(body);
  if (body.title !== undefined) data.title = topic(body.title);
  if (body.autoLayout !== undefined) {
    if (typeof body.autoLayout !== "boolean") throw new ApiError(400, "Formato inválido.");
    data.autoLayout = body.autoLayout;
  }
  if (body.imageWidth !== undefined || body.imageHeight !== undefined) {
    if (!mindImageDimension(body.imageWidth) || !mindImageDimension(body.imageHeight)) throw new ApiError(400, "Tamanho de imagem inválido.");
    data.imageWidth = body.imageWidth; data.imageHeight = body.imageHeight;
  }
  if (body.x !== undefined || body.y !== undefined) {
    if (!coordinate(body.x) || !coordinate(body.y)) throw new ApiError(400, "Posição inválida.");
    data.x = body.x; data.y = body.y;
  }
  if (!Object.keys(data).length) throw new ApiError(400, "Escolha uma alteração.");
  await writeMap(boardId, user.id, async tx => {
    const node = await tx.mindNode.findFirst({ where: { id, boardId } });
    if (!node || (data.x !== undefined && node.locked)) throw new ApiError(404, "Ideia indisponível.");
    if (data.autoLayout !== undefined && !isMindRoot(node)) throw new ApiError(400, "O Auto pertence à ideia central.");
    if (data.imageWidth !== undefined && !node.imageData) throw new ApiError(400, "Selecione uma imagem.");
    const changed = (Object.keys(data) as (keyof NodePatch)[]).filter(key => node[key] !== data[key]);
    if (!changed.length) return;
    const before = Object.fromEntries(changed.map(key => [key, node[key]]));
    const after = Object.fromEntries(changed.map(key => [key, data[key]]));
    await tx.mindNode.update({ where: { id }, data });
    await remember(tx, boardId, user.id, { kind: "edit", id, before, after });
  });
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const id = requireString((await readBody(req)).id, "Ideia");
  await writeMap(boardId, user.id, async tx => {
    const nodes = await tx.mindNode.findMany({ where: { boardId } });
    const branch = nodes.find(n => n.id === id);
    if (!branch) throw new ApiError(404, "Ramo indisponível para exclusão.");
    const removed = subtree(nodes, branch);
    await tx.mindNode.delete({ where: { id } });
    await remember(tx, boardId, user.id, { kind: "delete", nodes: removed });
  });
  return json({ ok: true });
});
