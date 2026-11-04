import { ApiError } from "./errors";

export type MindStyle = Partial<{ strokeWidth: number; bold: boolean; locked: boolean; textColor: string; highlight: string; color: string; shape: string; fontSize: number; link: string }>;
export function parseMindStyle(body: Record<string, unknown>): MindStyle {
  const data: MindStyle = {};
  for (const key of ["bold", "locked"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") throw new ApiError(400, "Formato inválido.");
    data[key] = body[key];
  }
  for (const key of ["textColor", "highlight", "color"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !(/^#[0-9a-f]{6}$/i.test(value) || (key === "color" ? ["orange", "green", "blue", "red"].includes(value) : value === ""))) throw new ApiError(400, "Cor inválida.");
    data[key] = value;
  }
  if (body.shape !== undefined) {
    if (typeof body.shape !== "string" || !["rounded", "pill", "plain", "rectangle"].includes(body.shape)) throw new ApiError(400, "Forma inválida.");
    data.shape = body.shape;
  }
  if (body.strokeWidth !== undefined) {
    if (typeof body.strokeWidth !== "number" || !Number.isInteger(body.strokeWidth) || body.strokeWidth < 1 || body.strokeWidth > 12) throw new ApiError(400, "Use uma espessura entre 1 e 12.");
    data.strokeWidth = body.strokeWidth;
  }
  if (body.fontSize !== undefined) {
    if (typeof body.fontSize !== "number" || !Number.isInteger(body.fontSize) || body.fontSize < 8 || body.fontSize > 72) throw new ApiError(400, "Use um tamanho entre 8 e 72.");
    data.fontSize = body.fontSize;
  }
  if (body.link !== undefined) {
    if (typeof body.link !== "string" || body.link.length > 2048) throw new ApiError(400, "Link inválido.");
    data.link = body.link.trim();
    if (data.link) {
      try { if (!["http:", "https:"].includes(new URL(data.link).protocol)) throw Error(); }
      catch { throw new ApiError(400, "Use um link http ou https."); }
    }
  }
  return data;
}
