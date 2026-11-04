import type { MindNode, Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { arrangeMindMap } from "./mind-auto";
import { boardAccess } from "./repo";

type Transaction = Prisma.TransactionClient;
export type NodePatch = Partial<Omit<MindNode, "id" | "parentId" | "boardId">>;
export type ColorField = "color" | "textColor" | "highlight";
type Action =
  | { kind: "compound"; actions: Action[] }
  | { kind: "batch"; edits: { id: string; before: NodePatch; after: NodePatch }[] }
  | { kind: "move"; dx: number; dy: number; positions: { id: string; x: number; y: number }[] }
  | { kind: "paint"; field: ColorField; value: string; previous: { id: string; value: string }[] }
  | { kind: "create" | "delete"; nodes: MindNode[] }
  | { kind: "edit"; id: string; before: NodePatch; after: NodePatch };

export function writeMap<T>(boardId: string, userId: string, mutate: (tx: Transaction) => Promise<T>) {
  return prisma.$transaction(async tx => {
    // Reserve the board row so two editors cannot interleave a change with an undo.
    const board = await tx.board.updateMany({
      where: { id: boardId, type: "mindmap", ...boardAccess(userId) },
      data: { position: { increment: 0 } },
    });
    if (!board.count) throw new ApiError(404, "Mapa indisponível.");
    return mutate(tx);
  });
}

export async function remember(tx: Transaction, boardId: string, userId: string, action: Action) {
  const nodes = await tx.mindNode.findMany({ where: { boardId } });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edits: { id: string; before: NodePatch; after: NodePatch }[] = [];
  for (const { id, x, y } of arrangeMindMap(nodes)) {
    const previous = byId.get(id)!;
    await tx.mindNode.update({ where: { id }, data: { x, y } });
    edits.push({ id, before: { x: previous.x, y: previous.y }, after: { x, y } });
  }
  if (edits.length) action = { kind: "compound", actions: [action, { kind: "batch", edits }] };
  const where = { boardId, userId };
  await tx.mindUndo.create({ data: { ...where, payload: JSON.stringify(action) } });
  const cutoff = await tx.mindUndo.findFirst({ where, orderBy: { id: "desc" }, skip: 30, select: { id: true } });
  if (cutoff) await tx.mindUndo.deleteMany({ where: { ...where, id: { lte: cutoff.id } } });
}

export function subtree(nodes: MindNode[], root: MindNode) {
  const children = new Map<string, MindNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const result = [root];
  for (let i = 0; i < result.length; i++) result.push(...(children.get(result[i].id) ?? []));
  return result;
}

export function undoMap(boardId: string, userId: string, expectedId: number) {
  return writeMap(boardId, userId, async tx => {
    const entry = await tx.mindUndo.findFirst({ where: { boardId, userId }, orderBy: { id: "desc" } });
    if (entry?.id !== expectedId) throw new ApiError(409, "O histórico mudou. Atualize o quadro e tente novamente.");
    const action: Action = JSON.parse(entry.payload);
    await applyUndo(tx, boardId, action);
    await tx.mindUndo.delete({ where: { id: entry.id } });
    return { ok: true };
  });
}

async function applyUndo(tx: Transaction, boardId: string, action: Action) {
  const conflict = new ApiError(409, "Esse ramo mudou desde a sua ação. Atualize o mapa para ver a versão atual.");
  if (action.kind === "compound") {
    for (const step of [...action.actions].reverse()) await applyUndo(tx, boardId, step);
  } else if (action.kind === "batch") {
    for (const edit of action.edits) {
      const result = await tx.mindNode.updateMany({ where: { boardId, id: edit.id, ...(edit.after.x !== undefined && { locked: false }), ...edit.after }, data: edit.before });
      if (result.count !== 1) throw conflict;
    }
  } else if (action.kind === "move") {
    const where = { boardId, id: { in: action.positions.map(p => p.id) }, locked: false };
    const current = await tx.mindNode.findMany({ where, select: { id: true, x: true, y: true } });
    const positions = new Map(current.map(p => [p.id, p]));
    if (action.positions.some(p => positions.get(p.id)?.x !== p.x || positions.get(p.id)?.y !== p.y)) throw conflict;
    await tx.mindNode.updateMany({ where, data: { x: { decrement: action.dx }, y: { decrement: action.dy } } });
  } else if (action.kind === "paint") {
    const groups = new Map<string, string[]>();
    for (const { id, value } of action.previous) {
      const ids = groups.get(value) ?? [];
      ids.push(id);
      groups.set(value, ids);
    }
    for (const [value, ids] of groups) {
      const result = await tx.mindNode.updateMany({
        where: { boardId, id: { in: ids }, [action.field]: action.value }, data: { [action.field]: value },
      });
      if (result.count !== ids.length) throw conflict;
    }
  } else if (action.kind === "edit") {
    const result = await tx.mindNode.updateMany({
      where: { boardId, id: action.id, ...(action.after.x !== undefined && { locked: false }), ...action.after },
      data: action.before,
    });
    if (!result.count) throw conflict;
  } else if (action.kind === "create") {
    const ids = action.nodes.map(n => n.id);
    const current = await tx.mindNode.findMany({ where: { boardId, id: { in: ids } } });
    const byId = new Map(current.map(n => [n.id, n]));
    for (const node of action.nodes) {
      const now = byId.get(node.id);
      if (!now || (Object.keys(node) as (keyof MindNode)[]).some(key => node[key] !== now[key])) throw conflict;
    }
    // A later child added by someone else must not disappear through the cascade.
    if (await tx.mindNode.count({ where: { boardId, parentId: { in: ids }, id: { notIn: ids } } })) throw conflict;
    await tx.mindNode.deleteMany({ where: { boardId, id: { in: ids } } });
  } else {
    // Another editor may have imported a new central idea after this one was deleted.
    if (action.nodes.some(n => !n.parentId && !n.detached) &&
        await tx.mindNode.count({ where: { boardId, parentId: null, detached: false } })) throw conflict;
    const restored = new Set(action.nodes.map(n => n.id));
    const parents = [...new Set(action.nodes.flatMap(n => n.parentId && !restored.has(n.parentId) ? [n.parentId] : []))];
    if (await tx.mindNode.count({ where: { boardId, id: { in: parents } } }) !== parents.length) throw conflict;
    await tx.mindNode.createMany({ data: action.nodes });
  }
}
