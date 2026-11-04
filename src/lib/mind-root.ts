/** Every independent text tree has its own root, including texts created on the canvas. */
export function isMindRoot(node: { parentId: string | null; imageData: string; drawing: string }) {
  return !node.parentId && !node.imageData && !node.drawing;
}
