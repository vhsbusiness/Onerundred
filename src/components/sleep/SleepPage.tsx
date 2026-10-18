"use client";

import { Moon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { formatDuration, keyToDate, todayKey, weekdayShort } from "@/lib/time";
import type { SleepLogDTO, SleepPageDTO } from "@/lib/types";

const QUALITY = ["Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[1.8rem] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-sm text-ink-2">{label}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

function durationLabel(min: number | null): string {
  return min === null ? "—" : formatDuration(min * 60000);
}

function SleepChart({ logs }: { logs: SleepLogDTO[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const byKey = new Map(logs.map((l) => [l.dayKey, l]));
  const days: string[] = [];
  const base = keyToDate(todayKey());
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const W = 560;
  const H = 170;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxH = 10;
  const slot = innerW / days.length;
  const barW = Math.min(26, slot * 0.6);
  const y = (hours: number) => padT + innerH - (Math.min(hours, maxH) / maxH) * innerH;
  const hovered = hover ? byKey.get(hover) : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Horas dormidas nas últimas 14 noites">
        <rect x={padL} y={y(8)} width={innerW} height={y(7) - y(8)} fill="rgba(139,227,166,0.08)" />
        {[0, 4, 8].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.07)" />
            <text x={padL - 6} y={y(g) + 3.5} fontSize={10} textAnchor="end" fill="var(--color-ink-3)">
              {g}h
            </text>
          </g>
        ))}
        {days.map((key, i) => {
          const l = byKey.get(key);
          const cx = padL + slot * i + slot / 2;
          const x = cx - barW / 2;
          const hours = l ? l.durationMin / 60 : 0;
          const good = hours >= 7 && hours <= 9;
          return (
            <g key={key} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {l ? (
                <rect
                  x={x}
                  y={y(hours)}
                  width={barW}
                  height={padT + innerH - y(hours)}
                  rx={4}
                  fill={good ? "var(--color-green-deep)" : hours < 6 ? "var(--color-orange-deep)" : "var(--color-blue-deep)"}
                  opacity={hover === null || hover === key ? 1 : 0.55}
                />
              ) : (
                <line x1={x} x2={x + barW} y1={padT + innerH - 1} y2={padT + innerH - 1} stroke="rgba(255,255,255,0.18)" strokeWidth={2} strokeDasharray="3 3" />
              )}
              <text x={cx} y={H - 8} fontSize={10} textAnchor="middle" fill={key === todayKey() ? "var(--color-ink)" : "var(--color-ink-3)"}>
                {weekdayShort(key)} {keyToDate(key).getDate()}
              </text>
            </g>
          );
        })}
      </svg>
      {hovered && hover && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line-2 bg-surface-3 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((padL + slot * days.indexOf(hover) + slot / 2) / W) * 100}%` }}
        >
          <div className="font-medium">{keyToDate(hover).toLocaleDateString("pt-BR")}</div>
          <div className="text-ink-2">
            dormiu {durationLabel(hovered.durationMin)} · {hovered.sleepTime}–{hovered.wakeTime}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green-deep" /> 7–9h</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-deep" /> 6–7h ou mais de 9h</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-orange-deep" /> menos de 6h</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 border-t border-dashed border-white/30" /> sem registro</span>
      </div>
    </div>
  );
}

export function SleepPage() {
  const [data, setData] = useState<SleepPageDTO | null>(null);
  const [dayKey, setDayKey] = useState(todayKey());
  const [bedTime, setBedTime] = useState("23:00");
  const [sleepTime, setSleepTime] = useState("23:30");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [quality, setQuality] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await http.get<SleepPageDTO>("/api/sono"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await http.post("/api/sono", { dayKey, bedTime, sleepTime, wakeTime, quality, note });
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: SleepLogDTO) {
    if (!confirm(`Apagar o registro de ${keyToDate(l.dayKey).toLocaleDateString("pt-BR")}?`)) return;
    await http.del(`/api/sono/${l.id}`);
    await load();
  }

  const existing = data?.logs.find((l) => l.dayKey === dayKey);
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Moon size={22} className="text-blue" /> Sono
        </h1>
        <p className="text-sm text-ink-2">Registre que horas deitou, dormiu e acordou. A IA usa isso para sugerir seus horários.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <form onSubmit={save} className="card space-y-4 p-5 lg:col-span-4">
          <h2 className="text-sm font-medium text-ink-2">{existing ? "Editar noite" : "Registrar noite"}</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Dia em que acordei</span>
            <input type="date" value={dayKey} max={todayKey()} onChange={(e) => setDayKey(e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Deitei</span>
              <input type="time" value={bedTime} onChange={(e) => setBedTime(e.target.value)} className="input px-2" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Dormi</span>
              <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} className="input px-2" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Acordei</span>
              <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="input px-2" />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Como foi o sono</span>
            <div className="flex flex-wrap gap-1.5">
              {QUALITY.map((q, i) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(quality === i + 1 ? null : i + 1)}
                  className={`pill cursor-pointer ${quality === i + 1 ? "pill-blue" : ""}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="input" />
          {error && <p className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Salvando…" : existing ? "Atualizar registro" : "Salvar noite"}
          </button>
          {existing && (
            <p className="text-xs text-ink-3">
              Já existe registro para esse dia ({existing.sleepTime}–{existing.wakeTime}). Salvar substitui.
            </p>
          )}
        </form>

        <div className="space-y-4 lg:col-span-8">
          <section className="card p-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
              <Tile value={durationLabel(stats?.lastNight?.durationMin ?? null)} label="Última noite" hint={stats?.lastNight ? `${stats.lastNight.sleepTime} → ${stats.lastNight.wakeTime}` : undefined} />
              <Tile value={durationLabel(stats?.avgDuration7 ?? null)} label="Média 7 dias" hint={stats?.avgDuration30 ? `30 dias: ${durationLabel(stats.avgDuration30)}` : undefined} />
              <Tile value={stats?.avgBedTime7 ?? "—"} label="Deito em média" />
              <Tile value={stats?.avgWakeTime7 ?? "—"} label="Acordo em média" />
              <Tile value={stats?.avgLatency7 === null || stats?.avgLatency7 === undefined ? "—" : `${stats.avgLatency7}m`} label="Para pegar no sono" />
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink-2">Últimas 14 noites</h2>
              <span className="pill">horas dormidas</span>
            </div>
            {data ? <SleepChart logs={data.logs} /> : <div className="h-40 animate-pulse" />}
          </section>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-medium text-ink-2">Histórico</h2>
        {!data ? (
          <div className="h-24 animate-pulse" />
        ) : data.logs.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhuma noite registrada ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.logs.map((l) => (
              <li key={l.id} className="group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-black/20 px-3 py-2 text-sm">
                <span className="w-32 font-medium">
                  {weekdayShort(l.dayKey)}, {keyToDate(l.dayKey).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </span>
                <span className="text-ink-2 tabular-nums">deitei {l.bedTime}</span>
                <span className="text-ink-2 tabular-nums">dormi {l.sleepTime}</span>
                <span className="text-ink-2 tabular-nums">acordei {l.wakeTime}</span>
                <span className={`pill ${l.durationMin >= 420 && l.durationMin <= 540 ? "pill-green" : l.durationMin < 360 ? "pill-orange" : "pill-blue"}`}>
                  {durationLabel(l.durationMin)}
                </span>
                {l.quality && <span className="pill">{QUALITY[l.quality - 1]}</span>}
                {l.note && <span className="truncate text-xs text-ink-3">{l.note}</span>}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDayKey(l.dayKey);
                      setBedTime(l.bedTime);
                      setSleepTime(l.sleepTime);
                      setWakeTime(l.wakeTime);
                      setQuality(l.quality);
                      setNote(l.note);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="btn btn-ghost h-8 px-2 text-xs opacity-0 group-hover:opacity-100"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(l)}
                    className="btn btn-ghost h-8 w-8 p-0 text-ink-3 opacity-0 hover:text-red group-hover:opacity-100"
                    aria-label="Apagar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
