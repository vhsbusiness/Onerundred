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

function affectedIds(action: Action): string[] {
  if (action.kind === "compound") return action.actions.flatMap(affectedIds);
  if (action.kind === "create" || action.kind === "delete") return action.nodes.flatMap(n => [n.id, ...(n.parentId ? [n.parentId] : [])]);
  if (action.kind === "edit") return [action.id];
  if (action.kind === "batch") return action.edits.map(e => e.id);
  if (action.kind === "move") return action.positions.map(n => n.id);
  if (action.kind === "paint") return action.previous.map(n => n.id);
  return [];
}
export async function remember(tx: Transaction, boardId: string, userId: string, action: Action, layout = true) {
  const nodes = await tx.mindNode.findMany({ where: { boardId } });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edits: { id: string; before: NodePatch; after: NodePatch }[] = [];
  const roots = new Set<string>();
  for (const id of affectedIds(action)) {
    let node = byId.get(id);
    while (node?.parentId) node = byId.get(node.parentId);
    if (node) roots.add(node.id);
  }
  for (const { id, x, y } of layout ? arrangeMindMap(nodes, roots) : []) {
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
    const current = await tx.mindNode.findMany({ where: { boardId } });
    const byId = new Map(current.map(n => [n.id, n]));
    for (const node of action.nodes) {
      const now = byId.get(node.id);
      if (!now || (Object.keys(node) as (keyof MindNode)[]).some(key => node[key] !== now[key])) throw conflict;
    }
    // A later child added by someone else must not disappear through the cascade.
    const selected = new Set(ids);
    if (current.some(n => n.parentId && selected.has(n.parentId) && !selected.has(n.id))) throw conflict;
    // Bound SQL parameters and avoid recursive cascade limits for long pasted chains.
    for (let i = 0; i < ids.length; i += 300) await tx.mindNode.updateMany({ where: { boardId, id: { in: ids.slice(i, i + 300) } }, data: { parentId: null } });
    for (let i = 0; i < ids.length; i += 300) await tx.mindNode.deleteMany({ where: { boardId, id: { in: ids.slice(i, i + 300) } } });
  } else {
    const restored = new Set(action.nodes.map(n => n.id));
    const parents = [...new Set(action.nodes.flatMap(n => n.parentId && !restored.has(n.parentId) ? [n.parentId] : []))];
    if (await tx.mindNode.count({ where: { boardId, id: { in: parents } } }) !== parents.length) throw conflict;
    await tx.mindNode.createMany({ data: action.nodes });
  }
}
