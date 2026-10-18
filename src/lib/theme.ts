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
