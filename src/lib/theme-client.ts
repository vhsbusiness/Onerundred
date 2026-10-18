"use client";

import { isTheme, THEME_COLOR, THEME_COOKIE, type Theme } from "./theme";

/** Tema em uso na página (lido do <html data-theme>). */
export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : "dark";
}

/** Aplica o tema na hora e guarda no cookie (1 ano) para o próximo carregamento. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[theme];
  window.dispatchEvent(new CustomEvent("theme-changed", { detail: theme }));
}
