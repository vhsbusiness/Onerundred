import { ApiError } from "./errors";

export function shortText(value: unknown, label: string, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new ApiError(400, `Confira o campo ${label} (até ${max} caracteres).`);
  return value.trim();
}

export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function requireDay(value: unknown) {
  if (!validDay(value)) throw new ApiError(400, "Escolha uma data válida.");
  return value;
}
