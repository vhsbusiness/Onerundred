"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Tone } from "./metrics";

/* ───────────── HTTP ───────────── */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
    // Sessão expirada ou inválida: volta para o login.
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", window.location.pathname);
    window.location.assign(login.toString());
  }
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* sem corpo */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const http = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};

/** Avisa outros componentes (ex.: indicador no topo) que o estado de trabalho mudou. */
export function notifyWorkChanged() {
  window.dispatchEvent(new Event("work-changed"));
}

/* ───────────── Relógio ───────────── */

/** Retorna Date.now() atualizado a cada `intervalMs` enquanto `active`. */
/*
 * Relógio compartilhado para contadores. No servidor (e na hidratação) vale 0,
 * para o HTML não divergir do cliente; depois de montar passa a valer Date.now()
 * e, enquanto `active`, avança a cada `intervalMs`.
 */
let tickNow = 0;
export function useNow(active: boolean, intervalMs = 1000): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      const id = setInterval(() => {
        tickNow = Date.now();
        onChange();
      }, intervalMs);
      return () => clearInterval(id);
    },
    [active, intervalMs],
  );
  return useSyncExternalStore(
    subscribe,
    () => tickNow || (tickNow = Date.now()),
    () => 0,
  );
}

export function elapsedSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  return Math.max(0, now - new Date(iso).getTime());
}

/* ───────────── Estilo ───────────── */

export const PRIORITY_UI: Record<number, { label: string; pill: string; dot: string; text: string; bar: string }> = {
  1: { label: "Alta", pill: "pill pill-orange", dot: "bg-orange", text: "text-orange", bar: "bg-orange-deep" },
  2: { label: "Média", pill: "pill pill-blue", dot: "bg-blue", text: "text-blue", bar: "bg-blue-deep" },
  3: { label: "Baixa", pill: "pill pill-green", dot: "bg-green", text: "text-green", bar: "bg-green-deep" },
};

export function priorityUi(p: number) {
  return PRIORITY_UI[p] ?? PRIORITY_UI[2];
}

export const TONE_PILL: Record<Tone, string> = {
  green: "pill pill-green",
  blue: "pill pill-blue",
  orange: "pill pill-orange",
  neutral: "pill",
};

export const TONE_TEXT: Record<Tone, string> = {
  green: "text-green",
  blue: "text-blue",
  orange: "text-orange",
  neutral: "text-ink-2",
};

export const TONE_BAR: Record<Tone, string> = {
  green: "bg-green-deep",
  blue: "bg-blue-deep",
  orange: "bg-orange-deep",
  neutral: "bg-line-3",
};

export function formatPercent(score: number | null): string {
  return score === null ? "—" : `${score}%`;
}
