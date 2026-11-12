import type { WorkState } from "./types";
import { closeWorkAudio, enableWorkAudio, playWorkTone } from "./work-chime-audio";
import { DEFAULT_WORK_CHIME, type WorkChimeSettings } from "./work-chime-settings";

const CHANNEL = "onerundred-work-chime-changed";

export function notifyChimeSettingsChanged() {
  window.dispatchEvent(new Event("work-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("refresh");
    channel.close();
  }
}
// Ao abrir a página, considera apenas avisos recentes. Depois da primeira leitura
// do ciclo, o próximo marco continua válido mesmo que o navegador atrase a aba.
const INITIAL_GRACE = 60_000;
type Observation = { sessionId: string; changedAt: number; since: number };
const MARKER = "onerundred:last-work-chime";

export function workMilestone(running: NonNullable<WorkState["running"]>, now: number, settings: WorkChimeSettings, observedSince = now) {
  const interval = settings.intervalMinutes * 60_000;
  const start = Date.parse(running.startedAt);
  const previousMs = running.previousCycleMs ?? 0;
  const elapsed = previousMs + Math.max(0, now - start);
  const number = Math.floor(elapsed / interval);
  const milestoneMs = number * interval;
  const remainder = elapsed % interval;
  const milestoneAt = start + milestoneMs - previousMs;
  const recentOrObserved = remainder < INITIAL_GRACE || milestoneAt >= observedSince;
  return {
    due: settings.enabled && milestoneMs > previousMs && milestoneAt >= settings.changedAt && recentOrObserved,
    key: running.id + ":" + milestoneMs,
    nextIn: interval - remainder,
  };
}

/** Um monitor por aba, compartilhado entre todos os designs e páginas autenticadas. */
export function watchWorkClock(showRunning: (running: boolean) => void) {
  let observation: Observation | undefined;
  let active = true;
  let version = 0;
  let timeout: number | undefined;
  let lastPlayed = "";

  function unlock() {
    try {
      enableWorkAudio();
    } catch { /* O navegador pode proibir áudio. O cronômetro continua normalmente. */ }
  }

  function chime(key: string, requestVersion: number) {
    if (lastPlayed === key) return;
    let output: AudioContext;
    try { output = enableWorkAudio(); } catch { return; }
    const ready = () => active && requestVersion === version && output.state === "running" && lastPlayed !== key;
    if (!ready()) return;
    function playOnce() {
      if (!ready() || !playWorkTone(output)) return false;
      lastPlayed = key;
      return true;
    }
    // A transação de escrita serializa abas mesmo quando cada processo tem uma
    // cópia atrasada do localStorage. Guardamos só o último marco, sem histórico.
    const fallback = () => {
      const play = () => {
        try {
          if (localStorage.getItem(MARKER) === key) return;
          if (playOnce()) localStorage.setItem(MARKER, key);
        } catch { playOnce(); }
      };
      if (navigator.locks) void navigator.locks.request(MARKER, play).catch(() => {});
      else play();
    };
    try {
      const open = indexedDB.open("onerundred-work-sound", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("clock");
      open.onerror = fallback;
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("clock", "readwrite");
        const store = tx.objectStore("clock");
        const last = store.get(MARKER);
        last.onsuccess = () => {
          if (last.result === key) lastPlayed = key;
          else if (playOnce()) store.put(key, MARKER);
        };
        tx.oncomplete = () => db.close();
        tx.onabort = () => { db.close(); fallback(); };
      };
    } catch { fallback(); }
  }

  async function refresh() {
    window.clearTimeout(timeout);
    const current = ++version;
    let delay = 20_000;
    try {
      const res = await fetch("/api/work", { cache: "no-store" });
      if (!active || current !== version || !res.ok) return;
      const { running, workChime = DEFAULT_WORK_CHIME }: WorkState = await res.json();
      if (!active || current !== version) return;
      showRunning(Boolean(running));
      if (running && workChime.enabled) {
        const now = Date.now();
        if (observation?.sessionId !== running.id || observation.changedAt !== workChime.changedAt) {
          observation = { sessionId: running.id, changedAt: workChime.changedAt, since: now };
        }
        const { due, key, nextIn } = workMilestone(running, now, workChime, observation.since);
        if (due) chime(key, current);
        delay = Math.min(delay, nextIn);
      } else {
        observation = undefined;
      }
    } catch { /* sem confirmação de que a sessão segue aberta, não emitir som */ }
    finally {
      if (active && current === version) timeout = window.setTimeout(refresh, delay);
    }
  }

  function visible() { if (document.visibilityState === "visible") void refresh(); }
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  channel?.addEventListener("message", refresh);
  window.addEventListener("pointerup", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("work-changed", refresh);
  document.addEventListener("visibilitychange", visible);
  void refresh();
  return () => {
    active = false;
    channel?.close();
    window.clearTimeout(timeout);
    window.removeEventListener("pointerup", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("work-changed", refresh);
    document.removeEventListener("visibilitychange", visible);
    closeWorkAudio();
  };
}
