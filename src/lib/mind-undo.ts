import type { MindNode, Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { boardAccess } from "./repo";

type Transaction = Prisma.TransactionClient;
export type NodePatch = Partial<Omit<MindNode, "id" | "parentId" | "boardId">>;
type Action =
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
    const conflict = new ApiError(409, "Esse ramo mudou desde a sua ação. Atualize o mapa para ver a versão atual.");
    if (action.kind === "edit") {
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
      const parentId = action.nodes[0].parentId;
      if (!parentId || !await tx.mindNode.count({ where: { boardId, id: parentId } })) throw conflict;
      await tx.mindNode.createMany({ data: action.nodes });
    }
    await tx.mindUndo.delete({ where: { id: entry.id } });
    return { ok: true };
  });
}
