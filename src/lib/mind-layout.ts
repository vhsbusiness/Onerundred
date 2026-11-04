import type { MindNodeDTO } from "./types";

export const palette = ["blue", "green", "orange", "red"];
type Positioned = Pick<MindNodeDTO, "id" | "parentId" | "x" | "y" | "color">;

export function positionBranch(parent: Positioned, nodes: Positioned[], direction?: "right") {
  const siblings = nodes.filter(node => node.parentId === parent.id).length;
  const root = nodes.find(node => !node.parentId)!;
  const right = direction === "right" || (parent.parentId ? parent.x >= root.x : siblings % 2 === 0);
  const x = parent.x + (right ? 240 : -240);
  let y = parent.y;
  while (nodes.some(node => Math.abs(node.x - x) < 202 && Math.abs(node.y - y) < 84)) y += 96;
  return { x, y, color: parent.parentId ? parent.color : palette[siblings % palette.length] };
}
