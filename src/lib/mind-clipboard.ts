import type { MindNodeDTO } from "./types";

export const MIND_CLIPBOARD_PREFIX = "ONERUNDRED_MAP_V1\n";
export const MIND_CLIPBOARD_MIME = "application/x-onerundred-map+json";
export const MIND_CLIPBOARD_LIMIT = 8 * 1024 * 1024;
export const MIND_CLIPBOARD_MAX_NODES = 1000;
export type MindClipboard = { version: 1; boardId: string; nodes: MindNodeDTO[] };

export function copyMindSelection(boardId: string, nodes: MindNodeDTO[], ids: string[]): MindClipboard {
  const selected = new Set(ids);
  // Parents outside the selection are deliberately not linked to the new copy.
  const copied = nodes.filter(n => selected.has(n.id)).map(n => ({ ...n, parentId: n.parentId && selected.has(n.parentId) ? n.parentId : null, detached: n.detached || !!(n.parentId && !selected.has(n.parentId)) }));
  if (!copied.length) throw new Error("Selecione os itens que deseja copiar.");
  if (copied.length > MIND_CLIPBOARD_MAX_NODES) throw new Error("Copie até 1.000 itens por vez.");
  const data: MindClipboard = { version: 1, boardId, nodes: copied };
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MIND_CLIPBOARD_LIMIT) throw new Error("A seleção é muito grande. Copie menos imagens por vez.");
  return data;
}
export function readMindClipboard(text: string): MindClipboard | null {
  if (!text.startsWith(MIND_CLIPBOARD_PREFIX)) return null;
  if (new TextEncoder().encode(text).byteLength > MIND_CLIPBOARD_LIMIT + 64) throw new Error("A seleção copiada excede 8 MB.");
  let value;
  try { value = JSON.parse(text.slice(MIND_CLIPBOARD_PREFIX.length)); } catch { throw new Error("A cópia do mapa está incompleta."); }
  if (value?.version !== 1 || !Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > MIND_CLIPBOARD_MAX_NODES) throw new Error("Cópia de mapa inválida.");
  return value as MindClipboard;
}
