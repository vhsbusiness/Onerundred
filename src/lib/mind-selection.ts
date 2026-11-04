import { mindBranchIds } from "./mind-tree";
import { isMindRoot } from "./mind-root";
import type { MindStyle } from "./mind-style";
import { ApiError } from "./errors";
import { remember, writeMap, type ColorField, type NodePatch } from "./mind-undo";

export type SelectionEdit = { action: "format"; patch: MindStyle } | { action: "delete" } | { action: "move"; dx: number; dy: number; titleEdit?: { id: string; title: string } } |
  { action: "paint"; field: ColorField; value: string };

export function editSelection(boardId: string, userId: string, ids: string[], edit: SelectionEdit) {
  return writeMap(boardId, userId, async tx => {
    const where = { boardId, id: { in: ids } };
    const selected = await tx.mindNode.findMany({ where });
    if (selected.length !== ids.length) throw new ApiError(409, "A seleção mudou. Atualize o mapa.");
    if (edit.action === "move") {
      const { dx, dy } = edit;
      if (!dx && !dy && !edit.titleEdit) return;
      const all = await tx.mindNode.findMany({ where: { boardId } });
      const branchIds = mindBranchIds(all, ids);
      const moving = all.filter(n => branchIds.has(n.id));
      if (moving.some(n => n.locked)) throw new ApiError(409, "Este ramo contém itens fixados. Desfixe-os para mover o conjunto.");
      if (moving.some(n => Math.abs(n.x + dx) > 1_000_000 || Math.abs(n.y + dy) > 1_000_000))
        throw new ApiError(409, "O movimento ultrapassa o limite do mapa.");
      const byId = new Map(all.map(n => [n.id, n]));
      const roots = new Map<string, (typeof all)[number]>();
      for (const node of selected) {
        let root = node;
        while (root.parentId && byId.has(root.parentId)) root = byId.get(root.parentId)!;
        if ((dx || dy) && isMindRoot(root) && root.autoLayout) roots.set(root.id, root);
      }
      const edits: { id: string; before: NodePatch; after: NodePatch }[] = [...roots.keys()].map(id => ({ id, before: { autoLayout: true }, after: { autoLayout: false } }));
      for (const id of roots.keys()) await tx.mindNode.update({ where: { id }, data: { autoLayout: false } });
      if (edit.titleEdit) {
        const original = selected.find(n => n.id === edit.titleEdit!.id);
        if (!original || original.imageData || original.drawing) throw new ApiError(400, "Texto fora da seleção.");
        if (original.title !== edit.titleEdit.title) {
          await tx.mindNode.update({ where: { id: original.id }, data: { title: edit.titleEdit.title } });
          edits.push({ id: original.id, before: { title: original.title }, after: { title: edit.titleEdit.title } });
        }
      }
      const positions = moving.map(n => ({ id: n.id, x: n.x + dx, y: n.y + dy }));
      const movedIds = [...branchIds];
      for (let i = 0; i < movedIds.length; i += 300)
        await tx.mindNode.updateMany({ where: { boardId, id: { in: movedIds.slice(i, i + 300) } }, data: { x: { increment: dx }, y: { increment: dy } } });
      // Manual positioning takes priority. Undo restores both coordinates and the former Auto setting.
      await remember(tx, boardId, userId, { kind: "compound", actions: [
        ...(edits.length ? [{ kind: "batch" as const, edits }] : []),
        { kind: "move", dx, dy, positions },
      ] }, false);
      return { autoDisabled: roots.size };
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
