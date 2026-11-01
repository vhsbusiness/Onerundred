import { ApiError } from "./errors";
import type { CardLabel } from "./types";

export const labelColors = { orange: "Laranja", green: "Verde", blue: "Azul", red: "Vermelho" } as const;
export function parseLabels(value: unknown): CardLabel[] {
  if (!Array.isArray(value) || value.length > 10) throw new ApiError(400, "Use até 10 etiquetas por tarefa.");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item.name !== "string" || typeof item.color !== "string" || !Object.hasOwn(labelColors, item.color)) throw new ApiError(400, "Etiqueta inválida.");
    const name = item.name.trim();
    if (!name || name.length > 32) throw new ApiError(400, "A etiqueta deve ter entre 1 e 32 caracteres.");
    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) throw new ApiError(400, "Já existe uma etiqueta com esse nome.");
    seen.add(key);
    return { name, color: item.color as CardLabel["color"] };
  });
}
export function readLabels(value: string): CardLabel[] {
  try { return parseLabels(JSON.parse(value)); } catch { return []; }
}
