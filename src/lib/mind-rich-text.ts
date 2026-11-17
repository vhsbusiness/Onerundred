import { ApiError } from "./errors";
import { MIND_TITLE_MAX_LENGTH } from "./mind-title";

export type InlineStyle = { bold?: boolean; textColor?: string; highlight?: string };
export type TextSpan = InlineStyle & { from: number; to: number };
export type MindTextValue = { title: string; textSpans: string };
export const inlineFields = ["bold", "textColor", "highlight"] as const;
export function inlineStyle(raw: unknown): InlineStyle {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>, result: InlineStyle = {};
  if (typeof value.bold === "boolean") result.bold = value.bold;
  for (const key of ["textColor", "highlight"] as const)
    if (typeof value[key] === "string" && (value[key] === "" || /^#[0-9a-f]{6}$/i.test(value[key]))) result[key] = value[key].toLowerCase();
  return result;
}
/** Canonical non-overlapping UTF-16 ranges; never store or render arbitrary HTML. */
export function parseTextSpans(title: string, raw: unknown): TextSpan[] {
  if (raw === undefined || raw === "") return [];
  if (title.length > MIND_TITLE_MAX_LENGTH || typeof raw !== "string" || raw.length > 250_000) throw new ApiError(400, "Formatação de texto inválida.");
  let values: unknown;
  try { values = JSON.parse(raw); } catch { throw new ApiError(400, "Formatação de texto inválida."); }
  if (!Array.isArray(values) || values.length > MIND_TITLE_MAX_LENGTH) throw new ApiError(400, "Formatação de texto inválida.");
  const result: TextSpan[] = [];
  let end = 0;
  for (const value of values) {
    if (!value || !Number.isInteger(value.from) || !Number.isInteger(value.to) || value.from < end || value.from < 0 || value.to <= value.from || value.to > title.length)
      throw new ApiError(400, "Trecho de texto inválido.");
    end = value.to;
    const style = inlineStyle(value);
    if (!Object.keys(style).length) continue;
    const previous = result.at(-1);
    if (previous && previous.to === value.from && inlineFields.every(key => previous[key] === style[key])) previous.to = value.to;
    else result.push({ from: value.from, to: value.to, ...style });
  }
  return result;
}
export const encodeTextSpans = (spans: TextSpan[]) => spans.length ? JSON.stringify(spans) : "";
export function textRuns(title: string, raw?: string) {
  const spans = parseTextSpans(title, raw), runs: (TextSpan & { text: string })[] = [];
  let offset = 0;
  for (const span of spans) {
    if (span.from > offset) runs.push({ from: offset, to: span.from, text: title.slice(offset, span.from) });
    runs.push({ ...span, text: title.slice(span.from, span.to) });
    offset = span.to;
  }
  if (offset < title.length) runs.push({ from: offset, to: title.length, text: title.slice(offset) });
  return runs;
}
export function sliceMindText(value: { title: string; textSpans?: string }, from: number, to: number): MindTextValue {
  const title = value.title.slice(from, to);
  const spans = parseTextSpans(value.title, value.textSpans).filter(s => s.to > from && s.from < to)
    .map(s => ({ ...s, from: Math.max(from, s.from) - from, to: Math.min(to, s.to) - from }));
  return { title, textSpans: encodeTextSpans(spans) };
}
export function trimMindText(value: { title: string; textSpans?: string }): MindTextValue {
  const start = value.title.length - value.title.trimStart().length;
  return sliceMindText(value, start, Math.max(start, value.title.trimEnd().length));
}
/** Changing a whole node's style overrides only that attribute in its inline ranges. */
export function clearInlineFields(title: string, raw: string | undefined, patch: InlineStyle) {
  const spans = parseTextSpans(title, raw).map(span => {
    const next = { ...span };
    for (const key of inlineFields) if (patch[key] !== undefined) delete next[key];
    return next;
  });
  return encodeTextSpans(parseTextSpans(title, encodeTextSpans(spans)));
}
