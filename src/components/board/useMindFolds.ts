"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { notify } from "@/components/ui/ConfirmProvider";
import { parseMindFolds } from "@/lib/mind-fold-state";

const changedEvent = "mind-folds-changed";
// Keep controls usable if the browser denies storage.
const unsaved = new Map<string, string>();
const saves = new Map<string, { value: string; promise: Promise<void> }>();
const ownerKey = (userId: string, boardId: string) => `onerundred:mind-folds:v1:${userId}:${boardId}`;

function read(key: string, fallback: string) {
  try {
    const raw = unsaved.get(key) ?? localStorage.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.stringify(parseMindFolds(JSON.parse(raw)));
  } catch { return fallback; }
}

function persistOwner(userId: string, boardId: string, value: string, force = false) {
  const key = ownerKey(userId, boardId), previous = saves.get(key);
  if (!force && previous?.value === value) return previous.promise;
  // Serialize fast toggles so an older response cannot overwrite a newer choice.
  const promise = (previous?.promise ?? Promise.resolve()).catch(() => {}).then(async () => {
    const body = JSON.stringify({ viewerId: userId, foldedIds: JSON.parse(value) });
    const result = await fetch(`/api/boards/${boardId}/mapa/recolhimento`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body,
      keepalive: new TextEncoder().encode(body).length < 60_000,
    });
    if (!result.ok) throw new Error("Não foi possível sincronizar os ramos para compartilhar. Tente novamente.");
    await result.json();
  }).catch(error => {
    if (saves.get(key)?.promise === promise) saves.delete(key);
    throw error;
  });
  saves.set(key, { value, promise });
  return promise;
}

/** Finish saving the current view before sending the invitation. */
export function syncMindFoldsForSharing(userId: string, boardId: string, fallbackIds: string[]) {
  return persistOwner(userId, boardId, read(ownerKey(userId, boardId), JSON.stringify(fallbackIds)), true);
}

/** New collaborators inherit the owner's view; later changes stay personal. */
export function useMindFolds(userId: string, boardId: string, ownerIds: string[], isOwner: boolean) {
  // Preserve the owner's existing device state. Members start fresh with the owner's view.
  const key = isOwner ? ownerKey(userId, boardId) : `onerundred:mind-folds:v2:${userId}:${boardId}`;
  const fallback = JSON.stringify(ownerIds);
  const warned = useRef(false), syncWarned = useRef(false);
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
  const snapshot = useSyncExternalStore(subscribe, useCallback(() => read(key, fallback), [key, fallback]), useCallback(() => fallback, [fallback]));
  const folded = useMemo(() => new Set<string>(JSON.parse(snapshot)), [snapshot]);
  const sync = useCallback((value: string) => {
    if (!isOwner) return;
    void persistOwner(userId, boardId, value).catch(error => {
      if (!syncWarned.current) { syncWarned.current = true; notify(error.message, "error"); }
    });
  }, [userId, boardId, isOwner]);
  useEffect(() => {
    // Migrate the owner's former browser-only choice without resetting nested folds.
    if (snapshot !== fallback) sync(snapshot);
    const retry = () => sync(read(key, fallback));
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [snapshot, fallback, key, sync]);
  const setFolded = useCallback((update: Set<string> | ((previous: Set<string>) => Set<string>)) => {
    const previous = new Set<string>(JSON.parse(read(key, fallback)));
    const next = typeof update === "function" ? update(previous) : update;
    const value = JSON.stringify(parseMindFolds([...next]));
    try {
      // Local persistence is immediate, even when navigating before the request finishes.
      localStorage.setItem(key, value);
      unsaved.delete(key);
    } catch {
      unsaved.set(key, value);
      if (!isOwner && !warned.current) {
        warned.current = true;
        notify("O navegador não permitiu salvar os ramos recolhidos. Sua escolha será mantida apenas nesta sessão.", "error");
      }
    }
    sync(value);
    window.dispatchEvent(new CustomEvent(changedEvent, { detail: key }));
  }, [key, fallback, sync, isOwner]);
  return [folded, setFolded] as const;
}
