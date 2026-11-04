"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { notify } from "@/components/ui/ConfirmProvider";

const changedEvent = "mind-folds-changed";
// Keep controls usable if the browser denies storage. This fallback is not durable.
const unsaved = new Map<string, string>();
const emptySnapshot = () => "[]";

function read(key: string) {
  if (unsaved.has(key)) return unsaved.get(key)!;
  try { return localStorage.getItem(key) ?? "[]"; }
  catch { return "[]"; }
}

function parse(value: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(value);
    if (Array.isArray(ids)) return new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200));
  } catch { /* Old or damaged preferences must not prevent opening the map. */ }
  return new Set();
}

/** Personal presentation state, shared between this account's tabs on this device. */
export function useMindFolds(userId: string, boardId: string) {
  const key = `onerundred:mind-folds:v1:${userId}:${boardId}`;
  const warned = useRef(false);
  const subscribe = useCallback((onChange: () => void) => {
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) { unsaved.delete(key); onChange(); }
    };
    const local = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) onChange();
    };
    window.addEventListener("storage", storage);
    window.addEventListener(changedEvent, local);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(changedEvent, local);
    };
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, useCallback(() => read(key), [key]), emptySnapshot);
  const folded = useMemo(() => parse(snapshot), [snapshot]);
  const setFolded = useCallback((update: Set<string> | ((previous: Set<string>) => Set<string>)) => {
    const previous = parse(read(key));
    const next = typeof update === "function" ? update(previous) : update;
    const value = JSON.stringify([...next]);
    try {
      // Save in the event itself: reloading/navigating immediately cannot cancel it.
      localStorage.setItem(key, value);
      unsaved.delete(key);
    } catch {
      unsaved.set(key, value);
      if (!warned.current) {
        warned.current = true;
        notify("O navegador não permitiu salvar os ramos recolhidos. Sua escolha será mantida apenas nesta sessão.", "error");
      }
    }
    window.dispatchEvent(new CustomEvent(changedEvent, { detail: key }));
  }, [key]);
  return [folded, setFolded] as const;
}
