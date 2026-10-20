"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPercent, http, TONE_PILL, TONE_TEXT, useNow } from "@/lib/client";
import { scoreTone, type PeriodScore } from "@/lib/metrics";
import { formatDayLong, formatDuration } from "@/lib/time";
import type { AiStatusDTO, DashboardDTO, WorkState } from "@/lib/types";
import { AiInsightCard } from "./AiInsightCard";
import { HistoryChart } from "./HistoryChart";
import { Tip } from "@/components/ui/Tip";
import { TodayTasks } from "./TodayTasks";
import { WorkTimer } from "./WorkTimer";

function ScoreTile({ label, score, hint, help }: { label: string; score: PeriodScore; hint: string; help: string }) {
  const tone = scoreTone(score.score);
  return (
    <div className="min-w-0">
      <Tip text={help} className="cursor-help">
        <div className={`text-[2rem] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
          {formatPercent(score.score)}
        </div>
        <div className="mt-1.5 text-sm text-ink-2 underline decoration-dotted decoration-ink-3/60 underline-offset-4">{label}</div>
      </Tip>
      <div className="mt-2">
        <span className={TONE_PILL[tone]}>{hint}</span>
      </div>
    </div>
  );
}

function PlainTile({
  value,
  label,
  pill,
  pillClass = "pill",
  help,
  compact = false,
}: {
  value: string;
  label: string;
  pill: string;
  pillClass?: string;
  help?: string;
  /** Valor mais comprido (ex.: "~10h 40m"): fonte menor para não quebrar linha. */
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Tip text={help ?? ""} className={help ? "cursor-help" : ""}>
        <div className={`whitespace-nowrap font-semibold leading-none tracking-tight tabular-nums ${compact ? "text-[1.6rem] pt-1" : "text-[2rem]"}`}>{value}</div>
        <div className={`mt-1.5 text-sm text-ink-2 ${help ? "underline decoration-dotted decoration-ink-3/60 underline-offset-4" : ""}`}>{label}</div>
      </Tip>
      <div className="mt-2">
        <span className={pillClass}>{pill}</span>
      </div>
    </div>
  );
}

function SegmentedBar({ counts }: { counts: DashboardDTO["counts"] }) {
  const total = counts.done + counts.inProgress + counts.pending;
  const segs = [
    { key: "done", label: "Feitas", n: counts.done, cls: "bg-green-deep" },
    { key: "prog", label: "Em andamento", n: counts.inProgress, cls: "bg-orange-deep" },
    { key: "pend", label: "Pendentes", n: counts.pending, cls: "bg-blue-deep" },
  ];
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-lg">
        {total === 0 ? (
          <div className="h-full w-full rounded-lg bg-fill-2" />
        ) : (
          segs
            .filter((s) => s.n > 0)
            .map((s) => (
              <div
                key={s.key}
                className={`${s.cls} h-full rounded-[4px] transition-[width] duration-500`}
                style={{ width: `${(s.n / total) * 100}%` }}
                title={`${s.label}: ${s.n}`}
              />
            ))
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${s.cls}`} />
            {s.label} <span className="text-ink tabular-nums">{s.n}</span>
          </span>
        ))}
        {counts.overdue > 0 && (
          <span className="inline-flex items-center gap-1.5 text-red">
            <span className="h-2 w-2 rounded-sm bg-red" />
            Atrasadas <span className="tabular-nums">{counts.overdue}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function Dashboard({ initialData, initialAi }: { initialData?: DashboardDTO; initialAi?: AiStatusDTO }) {
  const [data, setData] = useState<DashboardDTO | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await http.get<DashboardDTO>("/api/dashboard"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    // Sem dados iniciais do servidor, busca ao montar (o setState ocorre após o await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialData) load();
    const id = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, initialData]);

  // Relógio (a cada minuto) para o horário previsto de terminar; vale 0 até montar.
  const nowMs = useNow(true, 60000);

  if (error) {
    return (
      <div className="card p-6 text-sm text-red">
        {error}{" "}
        <button type="button" className="btn ml-2" onClick={load}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid animate-pulse gap-4 lg:grid-cols-12">
        <div className="card h-56 lg:col-span-8" />
        <div className="card h-56 lg:col-span-4" />
        <div className="card h-72 lg:col-span-5" />
        <div className="card h-72 lg:col-span-7" />
      </div>
    );
  }

  const onWork = (w: WorkState) => setData((d) => (d ? { ...d, work: w } : d));
  const todayHint = `${data.today.doneCount} feitas · ${data.today.openCount} abertas`;
  const weekHint = `${data.week.doneCount} feitas · ${data.week.openCount} abertas`;
  const monthHint = `${data.month.doneCount} feitas · ${data.month.openCount} abertas`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Seu dia</h1>
          <p className="text-sm text-ink-2">{formatDayLong(data.todayKey)}</p>
        </div>
        {data.runningTask && (
          <Link
            href={`/quadros/${data.runningTask.boardId}?card=${data.runningTask.cardId}`}
            className="pill pill-green"
            title="Tarefa em andamento"
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-green" />
            Fazendo: {data.runningTask.title}
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="card p-5 lg:col-span-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
            <ScoreTile
              label="Hoje"
              score={data.today}
              hint={todayHint}
              help="Quanto do que você planejou para hoje já foi concluído. Tarefas de prioridade alta valem mais, e o que ficou aberto puxa a nota para baixo. Tarefas de amanhã não contam hoje."
            />
            <ScoreTile
              label="Esta semana"
              score={data.week}
              hint={weekHint}
              help="A mesma nota, olhando a semana inteira (segunda a domingo): o que você concluiu contra o que ficou em aberto."
            />
            <ScoreTile
              label="Este mês"
              score={data.month}
              hint={monthHint}
              help="A mesma nota, olhando o mês inteiro: o que você concluiu contra o que ficou em aberto."
            />
            <PlainTile
              value={formatDuration(data.work.todayMs)}
              label="Trabalhado hoje"
              pill={data.work.verdict.label}
              pillClass={TONE_PILL[data.work.verdict.tone]}
              help="Tempo total das suas sessões de trabalho de hoje. O selo diz se você está abaixo, no ritmo ou acima do que planejou para o dia."
            />
            <PlainTile
              value={data.remaining.openCount === 0 ? "0m" : `~${formatDuration(data.remaining.minutes * 60000)}`}
              label="Para terminar hoje"
              compact
              pill={
                data.remaining.openCount === 0
                  ? "Tudo feito"
                  : nowMs === 0
                    ? `${data.remaining.openCount} abertas`
                    : `termina ~${new Date(nowMs + data.remaining.minutes * 60000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              }
              pillClass={data.remaining.openCount === 0 ? "pill pill-green" : data.remaining.minutes > 8 * 60 ? "pill pill-red" : "pill pill-blue"}
              help={`Soma do que falta nas ${data.remaining.openCount} tarefas abertas de hoje: a estimativa de cada uma menos o tempo já gasto. ${
                data.remaining.openCount - data.remaining.estimatedCount > 0
                  ? `${data.remaining.openCount - data.remaining.estimatedCount} sem estimativa entram com a sua média de ${data.remaining.avgMinutes} min por tarefa.`
                  : "Todas têm estimativa."
              } O horário é se você seguir direto, sem pausas.`}
            />
            <PlainTile
              value={`${data.streak}d`}
              label="Sequência ≥ 70%"
              pill={data.streak > 0 ? "Mantenha o ritmo" : "Comece hoje"}
              pillClass={data.streak > 0 ? "pill pill-orange" : "pill"}
              help="Quantos dias seguidos você fechou com uma nota boa (70% ou mais). Dias sem tarefas não quebram a sequência."
            />
          </div>

          <div className="mt-6">
            <AiInsightCard todayCards={data.todayCards} initialStatus={initialAi} />
          </div>

          <div className="mt-5">
            <SegmentedBar counts={data.counts} />
          </div>
        </section>

        <div className="lg:col-span-4">
          <WorkTimer work={data.work} onChange={onWork} />
        </div>

        <section className="card p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-2">Últimos 14 dias</h2>
            <span className="pill">nota diária</span>
          </div>
          <HistoryChart history={data.history} todayKey={data.todayKey} />
        </section>

        <section className="card p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-2">Tarefas de hoje</h2>
            <Link href="/quadros" className="btn btn-ghost h-8 px-3 text-xs">
              Ver quadros
            </Link>
          </div>
          <TodayTasks cards={data.todayCards} todayKey={data.todayKey} onChanged={load} />
        </section>
      </div>
    </div>
  );
}
