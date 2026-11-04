import type { MindNode, Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { spaceMindChildren } from "./mind-spacing";
import { arrangeMindMap } from "./mind-auto";
import { boardAccess } from "./repo";

type Transaction = Prisma.TransactionClient;
export type NodePatch = Partial<Omit<MindNode, "id" | "boardId">>;
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
  if (action.kind === "edit") return [action.id, ...[action.before.parentId, action.after.parentId].filter((id): id is string => !!id)];
  if (action.kind === "batch") return action.edits.map(e => e.id);
  if (action.kind === "move") return action.positions.map(n => n.id);
  if (action.kind === "paint") return action.previous.map(n => n.id);
  return [];
}
function geometryIds(action: Action): string[] {
  if (action.kind === "compound") return action.actions.flatMap(geometryIds);
  const changes = action.kind === "edit" ? [action] : action.kind === "batch" ? action.edits : [];
  return changes.filter(e => ["title", "fontSize", "shape", "textWidth", "textHeight"].some(key => key in e.after)).map(e => e.id);
}
export async function remember(tx: Transaction, boardId: string, userId: string, action: Action, layout = true) {
  const original = await tx.mindNode.findMany({ where: { boardId } });
  const ids = new Set(geometryIds(action));
  const nodes = ids.size ? spaceMindChildren(original, ids) : original;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const roots = new Set<string>();
  for (const id of affectedIds(action)) {
    let node = byId.get(id);
    while (node?.parentId) node = byId.get(node.parentId);
    if (node) roots.add(node.id);
  }
  for (const change of layout ? arrangeMindMap(nodes, roots) : []) byId.set(change.id, { ...byId.get(change.id)!, ...change });
  const edits = original.flatMap(n => {
    const next = byId.get(n.id)!;
    return n.x !== next.x || n.y !== next.y ? [{ id: n.id, before: { x: n.x, y: n.y }, after: { x: next.x, y: next.y } }] : [];
  });
  for (const e of edits) await tx.mindNode.update({ where: { id: e.id }, data: e.after });
  if (edits.length) action = { kind: "compound", actions: [action, { kind: "batch", edits }] };
  const where = { boardId, userId };
  await tx.mindUndo.deleteMany({ where: { ...where, undone: true } });
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
    const entry = await tx.mindUndo.findFirst({ where: { boardId, userId, undone: false }, orderBy: { id: "desc" } });
    if (entry?.id !== expectedId) throw new ApiError(409, "O histórico mudou. Atualize o quadro e tente novamente.");
    const action: Action = JSON.parse(entry.payload);
    await applyUndo(tx, boardId, action);
    await tx.mindUndo.update({ where: { id: entry.id }, data: { undone: true } });
    return { ok: true };
  });
}

function inverse(action: Action): Action {
  if (action.kind === "compound") return { kind: "compound", actions: [...action.actions].reverse().map(inverse) };
  if (action.kind === "edit") return { ...action, before: action.after, after: action.before };
  if (action.kind === "batch") return { kind: "batch", edits: action.edits.map(e => ({ ...e, before: e.after, after: e.before })) };
  if (action.kind === "move") return { ...action, dx: -action.dx, dy: -action.dy, positions: action.positions.map(p => ({ id: p.id, x: p.x - action.dx, y: p.y - action.dy })) };
  if (action.kind === "paint") return { kind: "batch", edits: action.previous.map(p => ({ id: p.id, before: { [action.field]: action.value }, after: { [action.field]: p.value } })) };
  return { ...action, kind: action.kind === "create" ? "delete" : "create" };
}
export function redoMap(boardId: string, userId: string, expectedId: number) {
  return writeMap(boardId, userId, async tx => {
    const entry = await tx.mindUndo.findFirst({ where: { boardId, userId, undone: true }, orderBy: { id: "asc" } });
    if (entry?.id !== expectedId) throw new ApiError(409, "O histórico mudou. Atualize o quadro e tente novamente.");
    await applyUndo(tx, boardId, inverse(JSON.parse(entry.payload)));
    await tx.mindUndo.update({ where: { id: entry.id }, data: { undone: false } });
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
    for (let i = 0; i < action.positions.length; i += 300)
      await tx.mindNode.updateMany({ where: { boardId, id: { in: action.positions.slice(i, i + 300).map(n => n.id) } }, data: { x: { decrement: action.dx }, y: { decrement: action.dy } } });
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
    if (action.before.parentId && !await tx.mindNode.count({ where: { id: action.before.parentId, boardId } })) throw conflict;
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
    const current = await tx.mindNode.findMany({ where: { boardId }, select: { id: true } });
    const existing = new Set(current.map(n => n.id));
    if (action.nodes.some(n => existing.has(n.id))) throw conflict;
    const restored = new Set(action.nodes.map(n => n.id));
    const parents = [...new Set(action.nodes.flatMap(n => n.parentId && !restored.has(n.parentId) ? [n.parentId] : []))];
    if (await tx.mindNode.count({ where: { boardId, id: { in: parents } } }) !== parents.length) throw conflict;
    await tx.mindNode.createMany({ data: action.nodes });
  }
}
