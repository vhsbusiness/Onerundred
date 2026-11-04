import type { MindNodeDTO } from "./types";
import { textBlockSize } from "./mind-size";

export const palette = ["blue", "green", "orange", "red"];
type Positioned = Pick<MindNodeDTO, "id" | "parentId" | "x" | "y" | "color"> & Partial<Pick<MindNodeDTO, "title" | "fontSize" | "shape" | "detached" | "textWidth" | "textHeight" | "imageData" | "imageWidth" | "imageHeight">>;
const textSize = (n: Positioned) => textBlockSize({ title: n.title ?? "Nova ideia", fontSize: n.fontSize ?? 14, shape: n.shape ?? "plain", parentId: n.parentId, detached: n.detached ?? false, textWidth: n.textWidth, textHeight: n.textHeight });
export function positionBranch(parent: Positioned, nodes: Positioned[], direction?: "right" | "left", title = "Nova ideia") {
  const siblings = nodes.filter(node => node.parentId === parent.id).length;
  const right = direction !== "left";
  const newSize = textBlockSize({ title, fontSize: 14, shape: "plain", parentId: parent.id, detached: false });
  const gap = Math.max(240, Math.ceil(textSize(parent).width / 2 + newSize.width / 2 + 64));
  const x = parent.x + (right ? gap : -gap);
  let y = parent.y;
  while (nodes.some(node => {
    const size = node.imageData ? { width: node.imageWidth ?? 240, height: node.imageHeight ?? 160 } : textSize(node);
    return Math.abs(node.x - x) < Math.max(202, (size.width + newSize.width) / 2 + 24) && Math.abs(node.y - y) < Math.max(84, (size.height + newSize.height) / 2 + 24);
  })) y += 96;
  return { x, y, color: parent.parentId ? parent.color : palette[siblings % palette.length] };
}
