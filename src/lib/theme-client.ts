"use client";

import { DESIGN_COOKIE, isDesign, isTheme, THEME_COOKIE, themeColorFor, type Design, type Theme } from "./theme";

/** Tema em uso na página (lido do <html data-theme>). */
export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : "dark";
}

/** Design em uso na página (lido do <html data-design>; ausente = v1). */
export function currentDesign(): Design {
  const d = document.documentElement.dataset.design;
  return isDesign(d) ? d : "v1";
}

function syncMetaColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = themeColorFor(currentTheme(), currentDesign());
}

/** Aplica o tema na hora e guarda no cookie (1 ano) para o próximo carregamento. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  syncMetaColor();
  window.dispatchEvent(new CustomEvent("theme-changed", { detail: theme }));
}

/** Liga/desliga o Design 2.0 na hora e guarda no cookie. */
export function applyDesign(design: Design) {
  if (design === "v2") document.documentElement.dataset.design = "v2";
  else delete document.documentElement.dataset.design;
  document.cookie = `${DESIGN_COOKIE}=${design}; Path=/; Max-Age=31536000; SameSite=Lax`;
  syncMetaColor();
  window.dispatchEvent(new CustomEvent("design-changed", { detail: design }));
}
