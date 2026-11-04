import type { MindNodeDTO } from "./types";

type TextBlock = Pick<MindNodeDTO, "title" | "fontSize" | "shape" | "parentId" | "detached"> & Partial<Pick<MindNodeDTO, "textWidth" | "textHeight">>;
export function textBlockSize(node: TextBlock) {
  const root = !node.parentId && !node.detached;
  const padding = (root ? 20 : 14) + (node.shape === "plain" ? 0 : 3);
  const width = node.textWidth ?? Math.min(320, Math.max(root ? 120 : 72, Math.ceil(Math.max(...node.title.split("\n").map(line => line.length)) * node.fontSize * .59 + 28)));
  const lines = Math.max(1, node.title.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length * node.fontSize * .59 / Math.max(1, width - 20))), 0));
  const minHeight = Math.ceil(node.fontSize * 1.25 + padding);
  return { width, height: Math.max(minHeight, node.textHeight ?? Math.ceil(lines * node.fontSize * 1.25 + padding)) };
}
