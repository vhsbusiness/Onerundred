import { ApiError } from "./errors";
import { isMindRoot } from "./mind-root";
import { mindBranchIds } from "./mind-tree";
import { textBlockSize } from "./mind-size";
import { arrangeMindMap } from "./mind-auto";
import { remember, writeMap, type NodePatch } from "./mind-undo";

export function organizeMindTree(boardId: string, userId: string, id: string) {
  return writeMap(boardId, userId, async tx => {
    const nodes = await tx.mindNode.findMany({ where: { boardId } });
    const root = nodes.find(n => n.id === id);
    if (!root || !isMindRoot(root)) throw new ApiError(400, "Selecione um ramo inicial.");
    const byId = new Map(nodes.map(n => [n.id, n]));
    const changes = arrangeMindMap(nodes.map(n => n.id === id ? { ...n, autoLayout: true } : n), new Set([id]));
    const edits = changes.map(n => ({ id: n.id, before: { x: byId.get(n.id)!.x, y: byId.get(n.id)!.y }, after: { x: n.x, y: n.y } }));
    for (const e of edits) await tx.mindNode.update({ where: { id: e.id }, data: e.after });
    if (edits.length) await remember(tx, boardId, userId, { kind: "batch", edits }, false);
    return { changed: edits.length };
  });
}
export function reconnectMindBranch(boardId: string, userId: string, id: string, parentId: string | null, title?: string) {
  return writeMap(boardId, userId, async tx => {
    const nodes = await tx.mindNode.findMany({ where: { boardId } });
    let node = nodes.find(n => n.id === id);
    const parent = nodes.find(n => n.id === parentId);
    if (!node || node.imageData || node.drawing) throw new ApiError(404, "Ramo indisponível.");
    if (parentId && (!parent || parent.imageData || parent.drawing)) throw new ApiError(400, "Escolha um ramo deste mapa.");
    const ids = mindBranchIds(nodes, [id]), branch = nodes.filter(n => ids.has(n.id));
    if (parentId && ids.has(parentId)) throw new ApiError(400, "Um ramo não pode se conectar a si mesmo ou a um dos seus filhos.");
    if (branch.some(n => n.locked)) throw new ApiError(409, "Desfixe os itens deste ramo antes de mudar a conexão.");
    if (node.parentId === parentId && (title === undefined || title === node.title)) return { ok: true };
    const after: NodePatch = { parentId, detached: parentId === null, autoLayout: false };
    const before: NodePatch = { parentId: node.parentId, detached: node.detached, autoLayout: node.autoLayout };
    if (title !== undefined && title !== node.title) {
      before.title = node.title; after.title = title; node = { ...node, title };
    }
    let dx = 0, dy = 0;
    if (parent) {
      const siblings = nodes.filter(n => n.parentId === parent.id && !ids.has(n.id));
      const siblingIds = mindBranchIds(nodes, siblings.map(s => s.id));
      dx = Math.round(parent.x + textBlockSize(parent).width / 2 + textBlockSize(node).width / 2 + 104 - node.x);
      dy = Math.round((siblings.length ? Math.max(...nodes.filter(n => siblingIds.has(n.id)).map(n => n.y + textBlockSize(n).height / 2)) + textBlockSize(node).height / 2 + 40 : parent.y) - node.y);
    }
    if (branch.some(n => Math.abs(n.x + dx) > 1_000_000 || Math.abs(n.y + dy) > 1_000_000)) throw new ApiError(400, "Limite de posição do mapa atingido.");
    await tx.mindNode.update({ where: { id }, data: after });
    const positions = branch.map(n => ({ id: n.id, x: n.x + dx, y: n.y + dy }));
    for (let i = 0; i < positions.length; i += 300) await tx.mindNode.updateMany({ where: { boardId, id: { in: positions.slice(i, i + 300).map(n => n.id) } }, data: { x: { increment: dx }, y: { increment: dy } } });
    await remember(tx, boardId, userId, { kind: "compound", actions: [
      { kind: "edit", id, before, after }, { kind: "move", dx, dy, positions },
    ] });
    return { ok: true };
  });
}
