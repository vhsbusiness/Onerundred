import { ApiError } from "./errors";

export const mindFoldKey = (boardId: string) => `mind-folds:${boardId}`;
export function parseMindFolds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5000 || value.some(id => typeof id !== "string" || !id || id.length > 200))
    throw new ApiError(400, "Ramos recolhidos inválidos.");
  return [...new Set(value)].sort();
}
export function readMindFolds(value: string | null | undefined): string[] {
  try { return parseMindFolds(JSON.parse(value ?? "[]")); }
  catch { return []; }
}
