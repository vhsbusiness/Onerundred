/*
 * Áreas do app: cada usuário tem uma área Pessoal e uma Profissional, com
 * quadros, lembretes, metas, arquivadas, configurações e dashboard separados.
 * Sono e lazer existem só na Pessoal. A área atual vai num cookie (lido pelo
 * servidor em páginas e rotas) e o botão do cabeçalho alterna entre as duas.
 */
export type Area = "pessoal" | "profissional";
export const AREAS: Area[] = ["pessoal", "profissional"];
export const DEFAULT_AREA: Area = "pessoal";
export const AREA_COOKIE = "onerundred_area";
export const AREA_LABEL: Record<Area, string> = { pessoal: "Pessoal", profissional: "Profissional" };

/** Abas que só existem na área Pessoal. */
export const PERSONAL_ONLY_PATHS = ["/sono", "/lazer"];

export function isArea(v: unknown): v is Area {
  return v === "pessoal" || v === "profissional";
}

export function otherArea(a: Area): Area {
  return a === "pessoal" ? "profissional" : "pessoal";
}

/**
 * Chave de Setting por área. A Pessoal usa a chave original (dados antigos
 * continuam valendo nela); a Profissional recebe um sufixo.
 */
export function areaKey(key: string, area: Area): string {
  return area === "pessoal" ? key : `${key}@${area}`;
}
