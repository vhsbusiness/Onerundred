import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { palette, positionBranch } from "@/lib/mind-layout";
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
  const parentId = requireString(body.parentId, "Ideia principal");
  const title = topic(body.title);
  const shape = body.shape ?? "plain";
  if (shape !== "plain" && shape !== "rounded") throw new ApiError(400, "Forma inválida.");
  let point: { x: number; y: number } | undefined;
  if (body.x !== undefined || body.y !== undefined) {
    if (!coordinate(body.x) || !coordinate(body.y)) throw new ApiError(400, "Posição inválida.");
    point = { x: body.x, y: body.y };
  }
  const node = await writeMap(boardId, user.id, async tx => {
    const parent = await tx.mindNode.findFirst({
      where: { id: parentId, boardId },
    });
    if (!parent) throw new ApiError(404, "Ideia indisponível.");
    const nodes = await tx.mindNode.findMany({ where: { boardId }, select: { id: true, x: true, y: true, parentId: true, color: true } });
    const branch = positionBranch(parent, nodes);
    const node = await tx.mindNode.create({ data: { boardId, parentId, title, shape, ...branch, ...point } });
    await remember(tx, boardId, user.id, { kind: "create", nodes: [node] });
    return node;
  });
  return json(node, { status: 201 });
});

export const PATCH = withUser(async (user, req: Request, ctx: Context) => {
  const { id: boardId } = await ctx.params;
  const body = await readBody(req);
  const id = requireString(body.id, "Ideia");
  const data: NodePatch = {};
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
    if (typeof body.shape !== "string" || !["rounded", "pill", "plain", "rectangle"].includes(body.shape)) throw new ApiError(400, "Forma inválida.");
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
    if (!coordinate(body.x) || !coordinate(body.y)) throw new ApiError(400, "Posição inválida.");
    data.x = body.x;
    data.y = body.y;
  }
  if (!Object.keys(data).length) throw new ApiError(400, "Escolha uma alteração.");
  await writeMap(boardId, user.id, async tx => {
    const node = await tx.mindNode.findFirst({ where: { id, boardId } });
    if (!node || (data.x !== undefined && node.locked)) throw new ApiError(404, "Ideia indisponível.");
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
    if (!branch?.parentId) throw new ApiError(404, "Ramo indisponível para exclusão.");
    await remember(tx, boardId, user.id, { kind: "delete", nodes: subtree(nodes, branch) });
    await tx.mindNode.delete({ where: { id } });
  });
  return json({ ok: true });
});
