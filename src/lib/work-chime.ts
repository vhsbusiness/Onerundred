import type { WorkState } from "./types";

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
// Abas em segundo plano podem acordar atrasadas. Não tocar avisos antigos.
const GRACE = 60_000;
const MARKER = "onerundred:last-work-chime";

export function workMilestone(running: NonNullable<WorkState["running"]>, now: number, settings: WorkChimeSettings) {
  const interval = settings.intervalMinutes * 60_000;
  const start = Date.parse(running.startedAt);
  const previousMs = running.previousCycleMs ?? 0;
  const elapsed = previousMs + Math.max(0, now - start);
  const number = Math.floor(elapsed / interval);
  const milestoneMs = number * interval;
  const remainder = elapsed % interval;
  return {
    due: settings.enabled && milestoneMs > previousMs && remainder < GRACE && now - remainder >= settings.changedAt,
    key: running.id + ":" + milestoneMs,
    nextIn: interval - remainder,
  };
}

/** Um monitor por aba, compartilhado entre todos os designs e páginas autenticadas. */
export function watchWorkClock(showRunning: (running: boolean) => void) {
  let audio: AudioContext | undefined;
  let active = true;
  let version = 0;
  let timeout: number | undefined;
  let lastPlayed = "";

  function unlock() {
    try {
      audio ??= new AudioContext();
      if (audio.state !== "running") void audio.resume().catch(() => {});
    } catch { /* O navegador pode proibir áudio. O cronômetro continua normalmente. */ }
  }

  function chime(key: string, requestVersion: number) {
    const ready = () => active && requestVersion === version && audio?.state === "running" && lastPlayed !== key;
    if (!ready()) return;
    function playOnce() {
      if (!ready() || !audio) return false;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const t = audio.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(t);
      oscillator.stop(t + 0.36);
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
          if (last.result !== key && playOnce()) store.put(key, MARKER);
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
        const { due, key, nextIn } = workMilestone(running, Date.now(), workChime);
        if (due) chime(key, current);
        delay = Math.min(delay, nextIn);
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
    if (audio) void audio.close().catch(() => {});
  };
}
