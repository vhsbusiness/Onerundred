import { mindBranchIds } from "./mind-tree";

type Node = { id: string; parentId: string | null; imageData?: string; drawing?: string };
type Box = { id: string; rect: { left: number; right: number; top: number; bottom: number } };
/** Hit-test fixed destination bounds: pointer capture/moving children must not obscure the target. */
export function mindDropTarget(nodes: Node[], selected: string[], boxes: Box[], point: { x: number; y: number }) {
  const selectedIds = new Set(selected);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const roots = selected.filter(id => {
    let parent = byId.get(id)?.parentId;
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = byId.get(parent)?.parentId;
    }
    return true;
  });
  if (roots.length !== 1) return null;
  const source = byId.get(roots[0]);
  if (!source || source.imageData || source.drawing) return null;
  const moving = mindBranchIds(nodes, roots);
  const hits = boxes.filter(({ id, rect }) => {
    const n = byId.get(id);
    return n && !moving.has(id) && id !== source.parentId && !n.imageData && !n.drawing &&
      point.x >= rect.left - 4 && point.x <= rect.right + 4 && point.y >= rect.top - 4 && point.y <= rect.bottom + 4;
  }).sort((a, b) => {
    const distance = (box: Box) => Math.hypot(point.x - (box.rect.left + box.rect.right) / 2, point.y - (box.rect.top + box.rect.bottom) / 2);
    return distance(a) - distance(b);
  });
  return hits[0] ? { id: source.id, parentId: hits[0].id } : null;
}
