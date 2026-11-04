import { isMindRoot } from "./mind-root";
import type { MindNode } from "@/generated/prisma/client";

/** Reserve a vertical band for each subtree; keep each branch on its chosen side. */
export function arrangeMindMap(nodes: MindNode[], rootIds?: Set<string>) {
  const current = new Map(nodes.map(n => [n.id, n]));
  const changes: { id: string; x: number; y: number }[] = [];
  for (const root of nodes.filter(n => isMindRoot(n) && n.autoLayout && (!rootIds || rootIds.has(n.id)))) {
    for (const change of arrangeTree([...current.values()], root)) {
      changes.push(change);
      current.set(change.id, { ...current.get(change.id)!, ...change });
    }
  }
  return changes;
}
function arrangeTree(nodes: MindNode[], root: MindNode) {
  const children = new Map<string, MindNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node); children.set(node.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const sizes = new Map<string, number>();
  const width = (n: MindNode) => n.imageData ? n.imageWidth : Math.min(320, Math.max(100, n.title.length * n.fontSize * .59 + 28));
  const height = (n: MindNode) => n.imageData ? n.imageHeight + 40 : Math.max(64, Math.ceil(n.title.length * n.fontSize * .59 / width(n)) * n.fontSize * 1.3 + 30);
  // Iterative postorder, safe for deeply nested imported maps.
  const order = [root];
  for (let i = 0; i < order.length; i++) order.push(...(children.get(order[i].id) ?? []));
  for (const node of [...order].reverse()) {
    const list = children.get(node.id) ?? [];
    sizes.set(node.id, Math.max(height(node), list.reduce((sum, n) => sum + sizes.get(n.id)!, 0) + Math.max(0, list.length - 1) * 32));
  }
  const positions = new Map([[root.id, { x: root.x, y: root.y }]]);
  const changes: { id: string; x: number; y: number }[] = [];
  const frozen = new Set<string>();
  for (const node of order) {
    if (node.locked || (node.parentId && frozen.has(node.parentId))) frozen.add(node.id);
  }
  const bounds = (n: MindNode, point = n) => ({ left: point.x - width(n) / 2 - 20, right: point.x + width(n) / 2 + 20, top: point.y - height(n) / 2 - 16, bottom: point.y + height(n) / 2 + 16 });
  const treeIds = new Set(order.map(n => n.id));
  const occupied = nodes.filter(n => !n.drawing && (n.id === root.id || !treeIds.has(n.id) || frozen.has(n.id))).map(n => bounds(n));
  for (const parent of order) {
    const list = children.get(parent.id) ?? [];
    const point = positions.get(parent.id) ?? parent;
    let y = point.y - (sizes.get(parent.id)! - height(parent)) / 2;
    for (const node of list) {
      const side = node.x >= parent.x ? 1 : -1;
      const next = node.locked || frozen.has(node.id) ? { x: node.x, y: node.y } : {
        x: Math.round(point.x + side * Math.max(240, width(parent) / 2 + width(node) / 2 + 100)),
        y: Math.round(y + (sizes.get(node.id)! - height(parent)) / 2),
      };
      if (!frozen.has(node.id)) {
        let overlap;
        while ((overlap = occupied.find(b => {
          const box = bounds(node, { ...node, ...next });
          return box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top;
        }))) next.y = Math.ceil(overlap.bottom + height(node) / 2 + 17);
        if (Math.abs(next.x) > 1_000_000 || Math.abs(next.y) > 1_000_000) { next.x = node.x; next.y = node.y; }
        occupied.push(bounds(node, { ...node, ...next }));
      }
      positions.set(node.id, next);
      if (Math.abs(next.x) <= 1_000_000 && Math.abs(next.y) <= 1_000_000 && (next.x !== node.x || next.y !== node.y)) changes.push({ id: node.id, ...next });
      y += sizes.get(node.id)! + 32;
    }
  }
  return changes;
}
