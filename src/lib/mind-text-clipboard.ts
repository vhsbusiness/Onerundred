import { MIND_TITLE_MAX_LENGTH } from "./mind-title";
import { textRuns, inlineStyle, parseTextSpans, encodeTextSpans, type TextSpan } from "./mind-rich-text";
import type { MindNodeDTO } from "./types";

export const MIND_TEXT_MIME = "application/x-onerundred-mind-text+json";
export type MindTextStyle = Pick<MindNodeDTO, "bold" | "textColor" | "highlight" | "fontSize" | "link">;
export type MindText = { text: string; style: Partial<MindTextStyle>; textSpans?: string };
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
export function writeMindText(clipboard: DataTransfer, text: string, node: MindTextStyle, textSpans = "") {
  const style = safeMindTextStyle(node);
  clipboard.setData("text/plain", text);
  clipboard.setData(MIND_TEXT_MIME, JSON.stringify({ version: 2, text, style, textSpans: encodeTextSpans(parseTextSpans(text, textSpans)) }));
  const escaped = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const html = textRuns(text, textSpans).map(run => {
    const current = { ...style, ...inlineStyle(run) };
    const css = `font-weight:${current.bold ? 700 : 500};font-size:${current.fontSize ?? 14}px;${current.textColor ? `color:${current.textColor};` : ""}${current.highlight ? `background-color:${current.highlight};` : ""}`;
    return `<span style="${css}">${escaped(run.text).replace(/\n/g, "<br>")}</span>`;
  }).join("");
  clipboard.setData("text/html", html);
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
  if (raw && raw.length < 250_000) {
    try {
      const data = JSON.parse(raw);
      if ([1, 2].includes(data.version) && typeof data.text === "string" && data.text.length <= MIND_TITLE_MAX_LENGTH)
        return { text: data.text, style: safeMindTextStyle(data.style), textSpans: encodeTextSpans(parseTextSpans(data.text, data.textSpans)) };
    } catch { /* fall through to safe HTML/text parsing */ }
  }
  const text = clipboard.getData("text/plain"), html = clipboard.getData("text/html");
  if (!html || html.length > 200_000 || !text || text.length > MIND_TITLE_MAX_LENGTH) return null;
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
  let extracted = "";
  const spans: TextSpan[] = [];
  function visit(node: Node, inherited: Partial<MindTextStyle>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const from = extracted.length;
      extracted += node.textContent ?? "";
      if (extracted.length > from) spans.push({ from, to: extracted.length, ...inlineStyle(inherited) });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { extracted += "\n"; return; }
    const next = { ...inherited }, css = node.style;
    if (["B", "STRONG"].includes(node.tagName)) next.bold = true;
    if (css.fontWeight) next.bold = css.fontWeight === "bold" || Number(css.fontWeight) >= 600;
    const color = cssColor(css.color), highlight = cssColor(css.backgroundColor);
    if (color) next.textColor = color;
    if (highlight) next.highlight = highlight;
    node.childNodes.forEach(child => visit(child, next));
    if (["P", "DIV", "LI"].includes(node.tagName) && !extracted.endsWith("\n")) extracted += "\n";
  }
  template.content.childNodes.forEach(node => visit(node, {}));
  if (extracted.trim() === text.trim() && extracted.includes(text)) {
    const from = extracted.indexOf(text);
    const clipped = spans.filter(s => s.to > from && s.from < from + text.length)
      .map(s => ({ ...s, from: Math.max(from, s.from) - from, to: Math.min(from + text.length, s.to) - from }));
    return { text, style: {}, textSpans: encodeTextSpans(parseTextSpans(text, encodeTextSpans(clipped))) };
  }
  return { text, style: safeMindTextStyle(style) };
}
