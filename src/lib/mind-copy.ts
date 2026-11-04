import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import { parseDrawing } from "./mind-drawing";
import { parseMindPicture } from "./mind-picture";
import { parseMindStyle } from "./mind-style";
import { remember, writeMap } from "./mind-undo";
import { MIND_CLIPBOARD_MAX_NODES } from "./mind-clipboard";

function coordinate(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && Math.abs(v) <= 1_000_000; }
export function pasteMindSelection(boardId: string, userId: string, body: Record<string, unknown>) {
  const data = body.clipboard as Record<string, unknown> | undefined;
  if (!data || data.version !== 1 || data.boardId !== boardId || !Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > MIND_CLIPBOARD_MAX_NODES)
    throw new ApiError(400, "Copie até 1.000 itens deste mapa antes de colar.");
  if (!coordinate(body.dx) || !coordinate(body.dy)) throw new ApiError(400, "Posição inválida.");
  const dx = body.dx, dy = body.dy;
  const nodes = data.nodes.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Item inválido.");
    const n = value as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id || n.id.length > 100 || !(n.parentId === null || typeof n.parentId === "string") ||
        typeof n.title !== "string" || !n.title.trim() || n.title.length > 160 || !coordinate(n.x) || !coordinate(n.y) ||
        !coordinate(n.x + dx) || !coordinate(n.y + dy) || typeof n.autoLayout !== "boolean" || typeof n.detached !== "boolean") throw new ApiError(400, "Item inválido.");
    const drawing = n.drawing ? parseDrawing(n.drawing) : null;
    if (n.drawing && !drawing) throw new ApiError(400, "Desenho inválido.");
    const image = n.imageData ? parseMindPicture(n) : {};
    if ((drawing || image.imageData) && n.parentId || drawing && image.imageData) throw new ApiError(400, "Ligação inválida.");
    return { oldId: n.id, parentId: n.parentId as string | null, title: n.title, x: n.x + dx, y: n.y + dy,
      ...parseMindStyle(n), ...image, drawing: drawing ? JSON.stringify(drawing) : "", autoLayout: n.autoLayout,
      detached: n.detached as boolean };
  });
  const byId = new Map(nodes.map(n => [n.oldId, n]));
  if (byId.size !== nodes.length) throw new ApiError(400, "Itens repetidos na cópia.");
  // Iterative graph validation and ordering: parents are inserted before children on both databases.
  const children = new Map<string, typeof nodes>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const parent = byId.get(n.parentId);
    if (!parent || parent.drawing || parent.imageData) throw new ApiError(400, "Ligação inválida.");
    const list = children.get(n.parentId) ?? []; list.push(n); children.set(n.parentId, list);
  }
  const ordered = nodes.filter(n => !n.parentId);
  for (let i = 0; i < ordered.length && i < nodes.length; i++) ordered.push(...(children.get(ordered[i].oldId) ?? []));
  if (ordered.length !== nodes.length) throw new ApiError(400, "A cópia contém ligações circulares.");
  return writeMap(boardId, userId, async tx => {
    const imageCount = nodes.filter(n => n.imageData).length;
    if (imageCount && imageCount + await tx.mindNode.count({ where: { boardId, imageData: { not: "" } } }) > 50) throw new ApiError(400, "Este mapa comporta até 50 imagens.");
    const ids = new Map(nodes.map(n => [n.oldId, randomUUID()]));
    const created = await tx.mindNode.createManyAndReturn({ data: ordered.map(({ oldId, parentId, ...n }) => ({ ...n, boardId, id: ids.get(oldId)!, parentId: parentId ? ids.get(parentId)! : null })) });
    // Pasting is an exact snapshot; Auto must not reorganize either the original or the copy.
    await remember(tx, boardId, userId, { kind: "create", nodes: created }, false);
    return { ids: created.map(n => n.id) };
  });
}
