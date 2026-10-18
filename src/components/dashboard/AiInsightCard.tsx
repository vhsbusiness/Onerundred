"use client";

import { Brain, ChevronDown, ChevronUp, Coffee, Eye, Moon, RefreshCw, Sparkles, Sun, Sunrise } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { http, TONE_PILL, TONE_TEXT } from "@/lib/client";
import { scoreTone } from "@/lib/metrics";
import type { AiInsightDTO, AiStatusDTO, TodayCard } from "@/lib/types";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function AiInsightCard({ todayCards, initialStatus }: { todayCards: TodayCard[]; initialStatus?: AiStatusDTO }) {
  const [status, setStatus] = useState<AiStatusDTO | null>(initialStatus ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const [collapsed, setCollapsed] = useState(false);

  // Preferência de recolhido/expandido fica só neste navegador.
  useEffect(() => {
    try {
      // Lê a preferência salva no navegador (fonte externa), uma vez ao montar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem("ai-insight-collapsed") === "1");
    } catch {
      /* sem localStorage */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ai-insight-collapsed", c ? "0" : "1");
      } catch {
        /* sem localStorage */
      }
      return !c;
    });
  }
  const cardsCount = useRef(todayCards.length);
  useEffect(() => {
    cardsCount.current = todayCards.length;
  }, [todayCards.length]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const insight = await http.post<AiInsightDTO>("/api/ai/insight");
      setStatus((s) => (s ? { ...s, insight, remainingToday: insight.remainingToday } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a análise");
    } finally {
      setBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await http.get<AiStatusDTO>("/api/ai/insight");
      setStatus(s);
      // A primeira análise do dia é gerada sozinha quando há tarefas e ainda não existe análise.
      if (!autoTried.current && s.enabled && s.observation.coreReady && !s.insight && s.remainingToday > 0 && cardsCount.current > 0) {
        autoTried.current = true;
        await generate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a análise");
    }
  }, [generate]);

  useEffect(() => {
    // Com dados iniciais do servidor, só dispara a análise automática se couber; senão busca.
    // (o setState ocorre após o await, não de forma síncrona)
    const s = initialStatus;
    if (s) {
      if (!autoTried.current && s.enabled && s.observation.coreReady && !s.insight && s.remainingToday > 0 && cardsCount.current > 0) {
        autoTried.current = true;
        generate();
      }
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
  }, [load, generate, initialStatus]);

  const boardOf = (cardId: string) => todayCards.find((c) => c.id === cardId)?.boardId;

  if (status && !status.enabled) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-line bg-black/20 px-4 py-2 text-sm text-ink-3">
        <Sparkles size={14} /> IA desativada neste ambiente (falta OPENAI_API_KEY).
      </div>
    );
  }

  const insight = status?.insight ?? null;
  const tone = scoreTone(insight?.score ?? null);
  const observation = status?.observation ?? null;
  const observing = Boolean(observation && !observation.coreReady);
  const stillWatching = observation?.dimensions.filter((d) => !d.ready) ?? [];

  return (
    <section
      className="blob-surface min-w-0 rounded-2xl border border-line bg-black/20 p-4"
      style={{ "--blob-a": "rgba(127,183,245,0.22)", "--blob-b": "rgba(139,227,166,0.18)" } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Brain size={15} className="text-blue" /> Análise do dia
        </h3>
        {insight && !observing && <span className={TONE_PILL[tone]}>nota IA {insight.score}%</span>}
        {observing && <span className="pill pill-blue">observando</span>}
        {collapsed && insight && (
          <span className={`hidden truncate text-sm sm:inline ${TONE_TEXT[tone]}`}>{insight.headline}</span>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          {insight && !collapsed && <span>às {timeLabel(insight.createdAt)}</span>}
          <button
            type="button"
            onClick={generate}
            disabled={busy || !status || status.remainingToday <= 0 || observing}
            className={`btn h-8 px-3 text-xs ${observing ? "hidden" : ""}`}
            title={status ? `${status.remainingToday} análises restantes hoje` : undefined}
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            {busy ? "Analisando…" : insight ? "Atualizar" : "Gerar análise"}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="btn btn-ghost h-8 w-8 p-0"
            aria-label={collapsed ? "Expandir análise" : "Recolher análise"}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>

      {observing && observation && !collapsed && (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Eye size={14} className="text-blue" />
            A IA está observando seus hábitos antes de opinar. Use o app normalmente: a análise libera quando tarefas e tempo de trabalho tiverem dias suficientes.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {observation.dimensions.map((d) => {
              const pct = d.need === 0 ? 100 : Math.min(100, Math.round((d.have / d.need) * 100));
              return (
                <li key={d.key} className="rounded-xl border border-line bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{d.label}</span>
                    <span className={d.ready ? "text-green" : "text-ink-3"}>
                      {d.ready ? "pronto" : `${d.have} de ${d.need} ${d.unit}`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={`h-full rounded-full ${d.ready ? "bg-green-deep" : "bg-blue-deep"}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!observing && stillWatching.length > 0 && !collapsed && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
          <Eye size={12} /> Ainda observando: {stillWatching.map((d) => `${d.label.toLowerCase()} (${d.have}/${d.need} ${d.unit})`).join(" · ")}
        </p>
      )}

      {error && !collapsed && <p className="mt-3 text-sm text-red">{error}</p>}

      {!insight && !error && !collapsed && !observing && (
        <p className="mt-3 text-sm text-ink-3">
          {busy
            ? "A IA está lendo suas tarefas, prioridades e tempo de trabalho…"
            : todayCards.length === 0
              ? "Crie tarefas para hoje e a IA analisa seu dia."
              : "Clique em “Gerar análise” para a IA avaliar seu dia."}
        </p>
      )}

      {insight && !collapsed && !observing && (
        <div className={`mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr] ${busy ? "opacity-60" : ""}`}>
          <div className="space-y-3">
            <p className={`text-base font-semibold leading-snug ${TONE_TEXT[tone]}`}>{insight.headline}</p>
            <p className="text-sm leading-relaxed text-ink-2">{insight.assessment}</p>
            {insight.suggestions.length > 0 && (
              <ul className="space-y-1 text-sm text-ink-2">
                {insight.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            {insight.nextTasks.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
                  Ataque nesta ordem
                </div>
                <ol className="space-y-1.5">
                  {insight.nextTasks.map((t, i) => {
                    const boardId = boardOf(t.cardId);
                    const inner = (
                      <>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-semibold">
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{t.title}</span>
                          <span className="block text-[11px] text-ink-3">{t.reason}</span>
                        </span>
                      </>
                    );
                    return (
                      <li key={t.cardId}>
                        {boardId ? (
                          <Link
                            href={`/quadros/${boardId}?card=${t.cardId}`}
                            className="flex items-start gap-2 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 transition hover:border-line-2"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex items-start gap-2 rounded-lg border border-line bg-black/20 px-2.5 py-1.5">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
                Horários sugeridos
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="pill pill-blue">
                  <Sun size={11} /> {insight.schedule.startWork}–{insight.schedule.stopWork}
                </span>
                {insight.schedule.breakAt.length > 0 && (
                  <span className="pill pill-orange">
                    <Coffee size={11} /> pausas {insight.schedule.breakAt.join(", ")}
                  </span>
                )}
                {insight.schedule.sleepAt && (
                  <span className="pill">
                    <Moon size={11} /> dormir {insight.schedule.sleepAt}
                  </span>
                )}
                {insight.schedule.wakeAt && (
                  <span className="pill">
                    <Sunrise size={11} /> acordar {insight.schedule.wakeAt}
                  </span>
                )}
              </div>
              {insight.schedule.note && <p className="mt-1.5 text-[11px] text-ink-3">{insight.schedule.note}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
