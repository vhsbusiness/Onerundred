import { isMindRoot } from "./mind-root";
import { textBlockSize } from "./mind-size";
import type { MindNode } from "@/generated/prisma/client";

type Point = { x: number; y: number };
type Box = { left: number; right: number; top: number; bottom: number };
const GAP_X = 104, GAP_Y = 40;

/** Lay out complete subtrees in separate bands and align levels, without moving their roots. */
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
  const children = new Map<string, MindNode[]>(), byId = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? []; list.push(node); children.set(node.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const size = (n: MindNode) => n.imageData ? { width: n.imageWidth, height: n.imageHeight } : textBlockSize(n);
  const order = [root], depth = new Map([[root.id, 0]]), widths = new Map<number, number>();
  const frozen = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const n = order[i], level = depth.get(n.id)!;
    widths.set(level, Math.max(widths.get(level) ?? 0, size(n).width));
    if (n.locked || n.parentId && frozen.has(n.parentId)) frozen.add(n.id);
    for (const child of children.get(n.id) ?? []) { depth.set(child.id, level + 1); order.push(child); }
  }
  const side = (n: MindNode) => n.parentId && n.x < byId.get(n.parentId)!.x ? -1 : 1;
  const band = new Map<string, number>();
  const sum = (list: MindNode[]) => list.reduce((total, n) => total + band.get(n.id)!, 0) + Math.max(0, list.length - 1) * GAP_Y;
  for (const n of [...order].reverse()) {
    const list = children.get(n.id) ?? [];
    band.set(n.id, Math.max(size(n).height, sum(list.filter(c => side(c) === -1)), sum(list.filter(c => side(c) === 1))));
  }
  const positions = new Map<string, Point>([[root.id, { x: root.x, y: root.y }]]);
  for (const parent of order) {
    const point = positions.get(parent.id)!, level = depth.get(parent.id)!;
    for (const direction of [-1, 1]) {
      const list = (children.get(parent.id) ?? []).filter(n => side(n) === direction);
      let top = point.y - sum(list) / 2;
      for (const n of list) {
        positions.set(n.id, frozen.has(n.id) ? { x: n.x, y: n.y } : {
          x: Math.round(point.x + direction * (widths.get(level)! / 2 + GAP_X + widths.get(level + 1)! / 2)),
          y: Math.round(top + band.get(n.id)! / 2),
        });
        top += band.get(n.id)! + GAP_Y;
      }
    }
  }
  const bounds = (n: MindNode, point: Point): Box => {
    const { width, height } = size(n);
    return { left: point.x - width / 2 - 16, right: point.x + width / 2 + 16, top: point.y - height / 2 - 12, bottom: point.y + height / 2 + 12 };
  };
  const tree = new Set(order.map(n => n.id));
  const occupied = nodes.filter(n => !n.drawing && (n.id === root.id || !tree.has(n.id) || frozen.has(n.id))).map(n => bounds(n, n));
  // Resolve collisions by translating an entire branch, never by distorting its internal layout.
  for (const head of children.get(root.id) ?? []) {
    const branch = [head];
    for (let i = 0; i < branch.length; i++) branch.push(...(children.get(branch[i].id) ?? []));
    const movable = branch.filter(n => !frozen.has(n.id));
    let shift = 0;
    for (;;) {
      let extra = 0;
      for (const n of movable) {
        const point = positions.get(n.id)!, box = bounds(n, { x: point.x, y: point.y + shift });
        for (const obstacle of occupied) {
          if (box.left < obstacle.right && box.right > obstacle.left && box.top < obstacle.bottom && box.bottom > obstacle.top)
            extra = Math.max(extra, obstacle.bottom - box.top + GAP_Y);
        }
      }
      if (!extra || shift + extra > 1_000_000) break;
      shift += Math.ceil(extra);
    }
    for (const n of movable) {
      const point = positions.get(n.id)!;
      const next = { x: point.x, y: point.y + shift };
      if (Math.abs(next.x) > 1_000_000 || Math.abs(next.y) > 1_000_000) { positions.set(n.id, { x: n.x, y: n.y }); continue; }
      positions.set(n.id, next); occupied.push(bounds(n, next));
    }
  }
  return order.flatMap(n => {
    const point = positions.get(n.id)!;
    return point.x !== n.x || point.y !== n.y ? [{ id: n.id, ...point }] : [];
  });
}
