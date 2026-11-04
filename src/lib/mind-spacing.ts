import type { MindNode } from "@/generated/prisma/client";
import { mindBranchIds } from "./mind-tree";
import { textBlockSize } from "./mind-size";
import { ApiError } from "./errors";

/** Keep a resized text block from swallowing its incoming/outgoing connections. */
export function spaceMindChildren(nodes: MindNode[], changed: Set<string>) {
  const byId = new Map(nodes.map(n => [n.id, { ...n }]));
  const parents = new Set(changed);
  for (const id of changed) { const parent = byId.get(id)?.parentId; if (parent) parents.add(parent); }
  const children = new Map<string, string[]>();
  for (const n of nodes) { if (!n.parentId) continue; const list = children.get(n.parentId) ?? []; list.push(n.id); children.set(n.parentId, list); }
  const order = nodes.filter(n => !n.parentId).map(n => n.id);
  for (let i = 0; i < order.length; i++) order.push(...(children.get(order[i]) ?? []));
  for (const id of order) {
    if (!parents.has(id)) continue;
    const parent = byId.get(id)!;
    for (const childId of children.get(id) ?? []) {
      const child = byId.get(childId)!, direction = child.x < parent.x ? -1 : 1;
      const gap = Math.ceil(textBlockSize(parent).width / 2 + textBlockSize(child).width / 2 + 48);
      if (Math.abs(child.x - parent.x) >= gap) continue;
      const dx = parent.x + direction * gap - child.x;
      for (const descendantId of mindBranchIds(nodes, [child.id])) {
        const n = byId.get(descendantId)!;
        if (n.locked) throw new ApiError(409, "Esse tamanho precisa mover um item fixado. Desfixe o ramo ou use um bloco menor.");
        if (Math.abs(n.x + dx) > 1_000_000) throw new ApiError(400, "Limite de posição do mapa atingido.");
        n.x += dx;
      }
    }
  }
  return [...byId.values()];
}
