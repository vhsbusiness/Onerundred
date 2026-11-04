import type { MindStyle } from "./mind-style";
import { ApiError } from "./errors";
import { remember, writeMap, type ColorField, type NodePatch } from "./mind-undo";

export type SelectionEdit = { action: "format"; patch: MindStyle } | { action: "delete" } | { action: "move"; dx: number; dy: number } |
  { action: "paint"; field: ColorField; value: string };

export function editSelection(boardId: string, userId: string, ids: string[], edit: SelectionEdit) {
  return writeMap(boardId, userId, async tx => {
    const where = { boardId, id: { in: ids } };
    const selected = await tx.mindNode.findMany({ where });
    if (selected.length !== ids.length) throw new ApiError(409, "A seleção mudou. Atualize o mapa.");
    if (edit.action === "move") {
      const { dx, dy } = edit;
      if (!dx && !dy) return;
      if (selected.some(n => n.locked || Math.abs(n.x + dx) > 1_000_000 || Math.abs(n.y + dy) > 1_000_000))
        throw new ApiError(409, "A seleção contém um ramo fixado ou fora do limite do mapa.");
      const positions = selected.map(n => ({ id: n.id, x: n.x + dx, y: n.y + dy }));
      await tx.mindNode.updateMany({ where, data: { x: { increment: dx }, y: { increment: dy } } });
      await remember(tx, boardId, userId, { kind: "move", dx, dy, positions });
    } else if (edit.action === "format") {
      const keys = Object.keys(edit.patch) as (keyof MindStyle)[];
      const edits = selected.flatMap(n => {
        const changed = keys.filter(key => n[key] !== edit.patch[key]);
        if (!changed.length) return [];
        return [{ id: n.id, before: Object.fromEntries(changed.map(k => [k, n[k]])) as NodePatch, after: Object.fromEntries(changed.map(k => [k, edit.patch[k]])) as NodePatch }];
      });
      if (!edits.length) return;
      await tx.mindNode.updateMany({ where, data: edit.patch });
      await remember(tx, boardId, userId, { kind: "batch", edits });
    } else if (edit.action === "paint") {
      const { field, value } = edit;
      const changed = selected.filter(n => n[field] !== value);
      if (!changed.length) return;
      const previous = changed.map(n => ({ id: n.id, value: n[field] }));
      await tx.mindNode.updateMany({ where, data: { [field]: value } });
      await remember(tx, boardId, userId, { kind: "paint", field, value, previous });
    } else {
      if (selected.some(n => !n.parentId && !n.detached)) throw new ApiError(400, "A ideia central não pode ser excluída.");
      const all = await tx.mindNode.findMany({ where: { boardId } });
      const children = new Map<string, typeof selected>();
      for (const node of all) {
        if (!node.parentId) continue;
        const list = children.get(node.parentId) ?? [];
        list.push(node);
        children.set(node.parentId, list);
      }
      // Walk from the root so a selected child is captured once, after its parent.
      const deleted = new Set(ids);
      const captured: typeof selected = [];
      const walk = all.filter(n => !n.parentId);
      for (let i = 0; i < walk.length; i++) {
        const node = walk[i];
        if (deleted.has(node.id) || (node.parentId && deleted.has(node.parentId))) {
          captured.push(node);
          deleted.add(node.id);
        }
        for (const child of children.get(node.id) ?? []) walk.push(child);
      }
      await tx.mindNode.deleteMany({ where });
      await remember(tx, boardId, userId, { kind: "delete", nodes: captured });
    }
  });
}
