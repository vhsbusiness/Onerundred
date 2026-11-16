import { ApiError } from "./errors";
import { textBlockSize } from "./mind-size";
import { subtree, remember, writeMap, type NodePatch } from "./mind-undo";
import type { MindNode } from "@/generated/prisma/client";

const title = "Nova ideia";
const gap = 18;
const size = (n: MindNode) =>
  n.imageData ? { width: n.imageWidth, height: n.imageHeight } : textBlockSize(n);
type Edit = { id: string; before: NodePatch; after: NodePatch };

function siblingSlot(nodes: MindNode[], anchor: MindNode, parent: MindNode) {
  const box = textBlockSize({
    ...anchor,
    title,
    fontSize: 14,
    textWidth: null,
    textHeight: null,
    shape: "plain",
  });
  const x = Math.max(anchor.x, Math.ceil(parent.x + size(parent).width / 2 + box.width / 2 + 64));
  const clearance = (n: MindNode) => Math.ceil((size(n).height + box.height) / 2 + gap);
  const column = nodes.filter((n) => !n.drawing && Math.abs(n.x - x) < (size(n).width + box.width) / 2 + gap);
  let y = anchor.y + clearance(anchor);
  const siblings = column.filter((n) => n.parentId === parent.id && n.y > anchor.y).sort((a, b) => a.y - b.y);
  const edits: Edit[] = [];
  let bottom = y + box.height / 2;
  for (const sibling of siblings) {
    const dy = Math.ceil(bottom + gap + size(sibling).height / 2 - sibling.y);
    if (dy <= 0) break;
    const branch = subtree(nodes, sibling);
    if (branch.some((n) => n.locked)) {
      edits.length = 0;
      break;
    }
    for (const n of branch) edits.push({ id: n.id, before: { y: n.y }, after: { y: n.y + dy } });
    bottom = sibling.y + dy + size(sibling).height / 2;
  }
  const moved = new Set(edits.map((e) => e.id));
  if (column.some((n) => !moved.has(n.id) && Math.abs(n.y - y) < clearance(n))) {
    // A fixed or unrelated object blocks this slot. Use the nearest free interval on either side.
    const options = column.flatMap((n) => [n.y + clearance(n), n.y - clearance(n)]);
    const byDistance = options.sort((a, b) => Math.abs(a - anchor.y) - Math.abs(b - anchor.y) || b - a);
    y = byDistance.find((candidate) => column.every((n) => Math.abs(candidate - n.y) >= clearance(n))) ?? y;
    edits.length = 0;
  }
  return { x, y, edits };
}

export function insertRelative(
  boardId: string,
  userId: string,
  id: string,
  mode: "parent" | "sibling",
  draft?: string,
) {
  return writeMap(boardId, userId, async (tx) => {
    const nodes = await tx.mindNode.findMany({ where: { boardId } });
    const anchor = nodes.find((n) => n.id === id);
    if (!anchor || anchor.imageData || anchor.drawing) throw new ApiError(404, "Ramo não encontrado.");
    const parent = nodes.find((n) => n.id === anchor.parentId);
    if (mode === "sibling" && !parent) throw new ApiError(400, "O ramo inicial não tem um ramo anterior.");
    const originalTitle = anchor.title;
    if (draft) anchor.title = draft;
    let x = anchor.x,
      y = anchor.y;
    let edits: Edit[] = [];
    if (mode === "sibling" && parent) ({ x, y, edits } = siblingSlot(nodes, anchor, parent));
    if (mode === "parent") {
      const branch = subtree(nodes, anchor);
      if (branch.some((n) => n.locked))
        throw new ApiError(409, "Desfixe este ramo antes de inserir um anterior.");
      const dx = Math.ceil(
        size(anchor).width / 2 +
          textBlockSize({ ...anchor, title, textWidth: null, textHeight: null, fontSize: 14 }).width / 2 +
          104,
      );
      edits = branch.map((n) => ({ id: n.id, before: { x: n.x }, after: { x: n.x + dx } }));
    }
    if (
      [x, y, ...edits.flatMap((e) => [e.after.x ?? 0, e.after.y ?? 0])].some((p) => Math.abs(p) > 1_000_000)
    )
      throw new ApiError(400, "Limite de posição do mapa atingido.");
    const node = await tx.mindNode.create({
      data: {
        boardId,
        title,
        parentId: anchor.parentId,
        x,
        y,
        color: anchor.color,
        shape: "plain",
        autoLayout: mode === "parent" && !parent && anchor.autoLayout,
      },
    });
    const before: NodePatch = {},
      after: NodePatch = {};
    if (mode === "parent") {
      Object.assign(before, {
        parentId: anchor.parentId,
        detached: anchor.detached,
        autoLayout: anchor.autoLayout,
      });
      Object.assign(after, { parentId: node.id, detached: false, autoLayout: false });
    }
    if (draft && draft !== originalTitle) {
      before.title = originalTitle;
      after.title = draft;
    }
    if (Object.keys(after).length) edits.push({ id, before, after });
    for (const edit of edits) await tx.mindNode.update({ where: { id: edit.id }, data: edit.after });
    await remember(tx, boardId, userId, {
      kind: "compound",
      actions: [
        { kind: "create", nodes: [node] },
        { kind: "batch", edits },
      ],
    });
    return tx.mindNode.findUniqueOrThrow({ where: { id: node.id } });
  });
}
