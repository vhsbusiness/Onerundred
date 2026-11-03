export const boardSymbols = { star: "Estrela", rocket: "Foguete", briefcase: "Trabalho", book: "Livro", target: "Alvo", heart: "Coração" } as const;
export type BoardSymbol = keyof typeof boardSymbols;
export function isBoardSymbol(value: unknown): value is BoardSymbol {
  return typeof value === "string" && Object.hasOwn(boardSymbols, value);
}
