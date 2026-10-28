/*
 * Tema (escuro/claro). A escolha vale por usuário (Setting "theme") e fica
 * também num cookie, para o servidor já renderizar o <html data-theme> certo
 * e a página não piscar ao carregar.
 */
export type Theme = "dark" | "light";
export const THEMES: Theme[] = ["dark", "light"];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "onerundred_theme";
export const THEME_COLOR: Record<Theme, string> = { dark: "#0b0c0f", light: "#f3f1ec" };

export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

/*
 * Design 2.0 (experimental): um segundo conjunto de tokens visuais, ligado só pelo
 * admin no painel. Vale por usuário (Setting "design") e vai num cookie para o
 * servidor já renderizar <html data-design="v2"> sem piscar. Função temporária.
 */
export type Design = "v1" | "v2";
export const DEFAULT_DESIGN: Design = "v1";
export const DESIGN_COOKIE = "onerundred_design";

export function isDesign(v: unknown): v is Design {
  return v === "v1" || v === "v2";
}

/** Cor da barra do navegador/PWA para cada combinação de tema e design. */
export function themeColorFor(theme: Theme, design: Design): string {
  // O Design 2.0 usa as mesmas cores do app, então a barra do navegador não muda.
  void design;
  return THEME_COLOR[theme];
}
