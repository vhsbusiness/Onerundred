"use client";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import { Gamepad2, Pause, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TimeField } from "@/components/ui/TimeField";
import { elapsedSince, http, useNow } from "@/lib/client";
import { formatClock, formatDuration, keyToDate, todayKey, weekdayShort } from "@/lib/time";
import type { LeisureLogDTO, LeisurePageDTO } from "@/lib/types";

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[1.8rem] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-sm text-ink-2">{label}</div>
      {hint && <div className="mt-1 truncate text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

function minutesLabel(min: number): string {
  return min === 0 ? "0m" : formatDuration(min * 60000);
}

function LeisureChart({ byDay }: { byDay: { key: string; minutes: number }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 560;
  const H = 170;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxMin = Math.max(120, ...byDay.map((d) => d.minutes));
  const maxH = Math.ceil(maxMin / 60);
  const slot = innerW / byDay.length;
  const barW = Math.min(26, slot * 0.6);
  const y = (min: number) => padT + innerH - (min / (maxH * 60)) * innerH;
  const ticks = maxH <= 4 ? [0, 1, 2, 3, 4].filter((t) => t <= maxH) : [0, Math.round(maxH / 2), maxH];
  const hovered = byDay.find((d) => d.key === hover);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Horas de lazer nos últimos 14 dias">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t * 60)} y2={y(t * 60)} stroke="rgba(255,255,255,0.07)" />
            <text x={padL - 6} y={y(t * 60) + 3.5} fontSize={10} textAnchor="end" fill="var(--color-ink-3)">
              {t}h
            </text>
          </g>
        ))}
        {byDay.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const x = cx - barW / 2;
          return (
            <g key={d.key} onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {d.minutes > 0 ? (
                <rect x={x} y={y(d.minutes)} width={barW} height={padT + innerH - y(d.minutes)} rx={4} fill="var(--color-blue-deep)" opacity={hover === null || hover === d.key ? 1 : 0.55} />
              ) : (
                <line x1={x} x2={x + barW} y1={padT + innerH - 1} y2={padT + innerH - 1} stroke="rgba(255,255,255,0.18)" strokeWidth={2} strokeDasharray="3 3" />
              )}
              <text x={cx} y={H - 8} fontSize={10} textAnchor="middle" fill={d.key === todayKey() ? "var(--color-ink)" : "var(--color-ink-3)"}>
                {weekdayShort(d.key)} {keyToDate(d.key).getDate()}
              </text>
            </g>
          );
        })}
      </svg>
      {hovered && hover && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line-2 bg-surface-3 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((padL + slot * byDay.findIndex((d) => d.key === hover) + slot / 2) / W) * 100}%` }}
        >
          <div className="font-medium">{keyToDate(hover).toLocaleDateString("pt-BR")}</div>
          <div className="text-ink-2">{minutesLabel(hovered.minutes)} de lazer</div>
        </div>
      )}
    </div>
  );
}

export function LeisurePage() {
  const [data, setData] = useState<LeisurePageDTO | null>(null);
  const [dayKey, setDayKey] = useState(todayKey());
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("22:00");
  const [activity, setActivity] = useState("Jogos");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const running = data?.running ?? null;
  const now = useNow(Boolean(running));

  const load = useCallback(async () => {
    try {
      setData(await http.get<LeisurePageDTO>("/api/lazer"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function toggleTimer() {
    setBusy(true);
    try {
      await http.post("/api/lazer", running ? { action: "stop" } : { action: "start", activity });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { dayKey, startTime, endTime, activity, note };
      if (editingId) await http.patch(`/api/lazer/${editingId}`, payload);
      else await http.post("/api/lazer", payload);
      setNote("");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: LeisureLogDTO) {
    if (!(await askConfirm({ title: "Apagar lazer", message: `Apagar ${l.activity} de ${l.startTime} até ${l.endTime ?? "agora"}?`, confirmLabel: "Apagar", danger: true }))) return;
    await http.del(`/api/lazer/${l.id}`);
    await load();
  }

  const stats = data?.stats;
  const grouped = new Map<string, LeisureLogDTO[]>();
  for (const l of data?.logs ?? []) {
    if (!l.endAt) continue;
    if (!grouped.has(l.dayKey)) grouped.set(l.dayKey, []);
    grouped.get(l.dayKey)!.push(l);
  }
  const topActivity = stats?.byActivity7[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Gamepad2 size={22} className="text-green" /> Lazer
        </h1>
        <p className="text-sm text-ink-2">Marque de que horas até que horas você jogou ou descansou. A IA usa isso para medir o equilíbrio do seu dia.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <section
            className="card blob-surface p-5"
            style={{ "--blob-a": running ? "rgba(139,227,166,0.5)" : "rgba(127,183,245,0.4)", "--blob-b": "rgba(245,176,110,0.35)" } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink-2">Agora</h2>
              {running && <span className="pill pill-green">{running.activity}</span>}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <div className="font-mono text-[2.2rem] font-semibold leading-none tabular-nums">
                  {formatClock(running ? elapsedSince(running.startAt, now) : 0)}
                </div>
                <div className="mt-1.5 text-sm text-ink-2">{running ? `desde ${running.startTime}` : "nenhum lazer em andamento"}</div>
              </div>
              <button
                type="button"
                onClick={toggleTimer}
                disabled={busy}
                className={`btn h-12 w-12 rounded-full p-0 ${running ? "pill-red border-red/40" : "btn-primary"}`}
                aria-label={running ? "Parar lazer" : "Começar lazer agora"}
                title={running ? "Parar" : "Começar agora"}
              >
                {running ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
            </div>
            {!running && (
              <p className="mt-3 text-xs text-ink-3">Começa com a atividade escolhida no formulário abaixo.</p>
            )}
          </section>

          <form onSubmit={save} className="card space-y-4 p-5">
            <h2 className="text-sm font-medium text-ink-2">{editingId ? "Editar bloco" : "Registrar bloco"}</h2>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Atividade</span>
              <input list="atividades" value={activity} onChange={(e) => setActivity(e.target.value)} className="input" />
              <datalist id="atividades">
                {(data?.activities ?? []).map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Dia</span>
              <input type="date" value={dayKey} max={todayKey()} onChange={(e) => setDayKey(e.target.value)} className="input" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">De</span>
                <TimeField value={startTime} onChange={setStartTime} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Até</span>
                <TimeField value={endTime} onChange={setEndTime} />
              </label>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="input" />
            {error && <p className="text-sm text-red">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn btn-primary flex-1">
                {busy ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar bloco"}
              </button>
              {editingId && (
                <button type="button" onClick={() => setEditingId(null)} className="btn btn-ghost">
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="space-y-4 lg:col-span-8">
          <section className="card p-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
              <Tile value={minutesLabel(stats?.todayMin ?? 0)} label="Hoje" />
              <Tile value={minutesLabel(stats?.weekMin ?? 0)} label="Esta semana" />
              <Tile value={minutesLabel(stats?.avg7Min ?? 0)} label="Média por dia (7d)" />
              <Tile value={topActivity ? minutesLabel(topActivity.minutes) : "—"} label="Mais frequente (7d)" hint={topActivity?.activity} />
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink-2">Últimos 14 dias</h2>
              <span className="pill">horas de lazer</span>
            </div>
            {stats ? <LeisureChart byDay={stats.byDay14} /> : <div className="h-40 animate-pulse" />}
            {stats && stats.byActivity7.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stats.byActivity7.map((a) => (
                  <span key={a.activity} className="pill">
                    {a.activity} · {minutesLabel(a.minutes)}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-medium text-ink-2">Histórico</h2>
        {!data ? (
          <div className="h-24 animate-pulse" />
        ) : grouped.size === 0 ? (
          <p className="text-sm text-ink-3">Nenhum bloco registrado ainda.</p>
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([key, items]) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center gap-2 text-xs text-ink-3">
                  <span className="font-medium text-ink-2">
                    {weekdayShort(key)}, {keyToDate(key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                  · {minutesLabel(items.reduce((a, l) => a + l.durationMin, 0))}
                </div>
                <ul className="space-y-1.5">
                  {items.map((l) => (
                    <li key={l.id} className="group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-black/20 px-3 py-2 text-sm">
                      <span className="pill pill-blue">{l.activity}</span>
                      <span className="text-ink-2 tabular-nums">
                        {l.startTime} → {l.endTime}
                      </span>
                      <span className="tabular-nums">{minutesLabel(l.durationMin)}</span>
                      {l.note && <span className="truncate text-xs text-ink-3">{l.note}</span>}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(l.id);
                            setDayKey(l.dayKey);
                            setStartTime(l.startTime);
                            setEndTime(l.endTime ?? l.startTime);
                            setActivity(l.activity);
                            setNote(l.note);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="btn btn-ghost h-8 px-2 text-xs md:opacity-0 md:group-hover:opacity-100"
                        >
                          Editar
                        </button>
                        <button type="button" onClick={() => remove(l)} className="btn btn-ghost h-8 w-8 p-0 text-ink-3 md:opacity-0 hover:text-red md:group-hover:opacity-100" aria-label="Apagar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
