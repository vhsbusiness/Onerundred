import type { MindNodeDTO } from "./types";

export const MIND_TEXT_MIME = "application/x-onerundred-mind-text+json";
export type MindTextStyle = Pick<MindNodeDTO, "bold" | "textColor" | "highlight" | "fontSize" | "link">;
export type MindText = { text: string; style: Partial<MindTextStyle> };
const hex = /^#[0-9a-f]{6}$/i;
export function safeMindTextStyle(value: unknown): Partial<MindTextStyle> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>, style: Partial<MindTextStyle> = {};
  if (typeof raw.bold === "boolean") style.bold = raw.bold;
  for (const field of ["textColor", "highlight"] as const)
    if (typeof raw[field] === "string" && (raw[field] === "" || hex.test(raw[field]))) style[field] = raw[field];
  if (typeof raw.fontSize === "number" && Number.isInteger(raw.fontSize) && raw.fontSize >= 8 && raw.fontSize <= 72) style.fontSize = raw.fontSize;
  if (typeof raw.link === "string" && raw.link.length <= 2048) {
    try { if (!raw.link || ["http:", "https:"].includes(new URL(raw.link).protocol)) style.link = raw.link; } catch { /* discard unsafe links */ }
  }
  return style;
}
export function writeMindText(clipboard: DataTransfer, text: string, node: MindTextStyle) {
  const style = safeMindTextStyle(node);
  clipboard.setData("text/plain", text);
  clipboard.setData(MIND_TEXT_MIME, JSON.stringify({ version: 1, text, style }));
  const escaped = text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const css = `font-weight:${style.bold ? 700 : 400};font-size:${style.fontSize ?? 14}px;${style.textColor ? `color:${style.textColor};` : ""}${style.highlight ? `background-color:${style.highlight};` : ""}`;
  clipboard.setData("text/html", `<span style="${css}">${escaped.replace(/\n/g, "<br>")}</span>`);
}
function cssColor(value: string) {
  if (hex.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) return "#" + [...value.slice(1)].map(c => c + c).join("");
  const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (!match || (match[4] && Number(match[4]) < 1)) return undefined;
  return "#" + match.slice(1, 4).map(v => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("");
}
export function readMindText(clipboard: DataTransfer): MindText | null {
  const raw = clipboard.getData(MIND_TEXT_MIME);
  if (raw && raw.length < 20_000) {
    try {
      const data = JSON.parse(raw);
      if (data.version === 1 && typeof data.text === "string" && data.text.length <= 160)
        return { text: data.text, style: safeMindTextStyle(data.style) };
    } catch { /* fall through to safe HTML/text parsing */ }
  }
  const text = clipboard.getData("text/plain"), html = clipboard.getData("text/html");
  if (!html || html.length > 200_000 || !text || text.length > 160) return null;
  // Inert template: never mount clipboard HTML, fetch resources or execute markup.
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,embed,img,svg,link,meta").forEach(n => n.remove());
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  let first: Node | null;
  while ((first = walker.nextNode()) && !first.textContent?.trim()) { /* first visible phrase */ }
  if (!first) return null;
  const style: Partial<MindTextStyle> = {};
  const chain: HTMLElement[] = [];
  for (let el = first.parentElement; el; el = el.parentElement) chain.unshift(el);
  for (const el of chain) {
    const css = el.style;
    if (["B", "STRONG"].includes(el.tagName)) style.bold = true;
    if (css.fontWeight) style.bold = css.fontWeight === "bold" || Number(css.fontWeight) >= 600;
    const color = cssColor(css.color), highlight = cssColor(css.backgroundColor);
    if (color) style.textColor = color;
    if (highlight) style.highlight = highlight;
    if (/^\d+(\.\d+)?(px|pt)$/.test(css.fontSize)) style.fontSize = Math.max(8, Math.min(72, Math.round(parseFloat(css.fontSize) * (css.fontSize.endsWith("pt") ? 4 / 3 : 1))));
    if (el.tagName === "A") style.link = el.getAttribute("href") ?? "";
  }
  return { text, style: safeMindTextStyle(style) };
}
