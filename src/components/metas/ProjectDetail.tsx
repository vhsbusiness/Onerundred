"use client";

import { Archive, ArrowLeft, Check, Flame, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { keyToDate, todayKey, weekdayShort } from "@/lib/time";
import type { ProjectDTO, ProjectDayDTO } from "@/lib/types";
import { MetasHeader } from "./MetasTabs";
import { ProjectForm } from "./ProjectsPage";
import { confirmMarkDone } from "./confirmDone";

const STATUS_STYLE: Record<ProjectDayDTO["status"], string> = {
  done: "bg-green-deep text-bg border-transparent",
  missed: "bg-red/20 text-red border-red/40",
  pending: "bg-transparent text-ink border-ink-2 border-dashed",
  future: "bg-white/[0.03] text-ink-3 border-line",
};

function fmtDay(key: string) {
  return keyToDate(key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [p, setP] = useState<ProjectDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ProjectDayDTO | null>(null);
  const today = todayKey();

  const load = useCallback(async () => {
    try {
      setP(await http.get<ProjectDTO>(`/api/projetos/${projectId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [projectId]);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function mark(day: ProjectDayDTO, done: boolean) {
    if (done && day.status === "missed" && !confirmMarkDone()) return;
    try {
      setP(await http.post<ProjectDTO>(`/api/projetos/${projectId}/dias`, { dayKey: day.dayKey, done }));
      setSelected(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    }
  }

  async function archive() {
    if (!p) return;
    await http.patch(`/api/projetos/${p.id}`, { archived: !p.archivedAt });
    load();
  }

  async function remove() {
    if (!p) return;
    if (!confirm(`Excluir o projeto "${p.name}" e todas as marcações?`)) return;
    await http.del(`/api/projetos/${p.id}`);
    router.push("/metas");
  }

  if (error) {
    return (
      <div className="card p-6 text-sm text-red">
        {error} ·{" "}
        <Link href="/metas" className="underline">
          voltar
        </Link>
      </div>
    );
  }
  if (!p) return <div className="card h-64 animate-pulse" />;

  const todayDay = p.dayList.find((d) => d.dayKey === today);

  return (
    <div className="space-y-5">
      <MetasHeader title={p.name} subtitle={p.description || "Projeto"} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/metas" className="btn btn-ghost h-8 px-2">
          <ArrowLeft size={15} /> Projetos
        </Link>
        <span className="pill">
          {p.endless ? `desde ${fmtDay(p.startDate)} · sem data para acabar` : `${fmtDay(p.startDate)} → ${fmtDay(p.endDate ?? p.startDate)} · ${p.days} dias`}
        </span>
        <span className="pill pill-green">{p.doneCount} feitos</span>
        <span className="pill pill-red">{p.missedCount} não feitos</span>
        {p.completion !== null && <span className="pill pill-blue">{p.completion}% dos dias passados</span>}
        {p.streak > 0 && (
          <span className="pill pill-orange">
            <Flame size={11} /> sequência {p.streak}d
          </span>
        )}
        {p.archivedAt && <span className="pill">arquivado</span>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost h-8 px-2 text-xs">
            <Pencil size={13} /> Editar
          </button>
          <button type="button" onClick={archive} className="btn btn-ghost h-8 px-2 text-xs">
            <Archive size={13} /> {p.archivedAt ? "Reativar" : "Arquivar"}
          </button>
          <button type="button" onClick={remove} className="btn btn-ghost h-8 w-8 p-0 text-ink-3 hover:text-red" aria-label="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="card p-5 lg:col-span-4">
          <h2 className="mb-2 text-sm font-medium text-ink-2">Obrigações diárias</h2>
          {p.obligations.length === 0 ? (
            <p className="text-sm text-ink-3">Nenhuma obrigação descrita.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {p.obligations.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          )}

          {todayDay && (
            <div className="mt-5 rounded-xl border border-line bg-black/20 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
                Hoje · dia {todayDay.index}{p.endless ? "" : ` de ${p.days}`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => mark(todayDay, true)}
                  className={`btn h-9 flex-1 ${todayDay.status === "done" ? "pill-green border-green/40" : ""}`}
                >
                  <Check size={14} /> {todayDay.status === "done" ? "Feito" : "Fiz"}
                </button>
                <button
                  type="button"
                  onClick={() => mark(todayDay, false)}
                  className={`btn h-9 flex-1 ${todayDay.status === "missed" ? "pill-red border-red/40" : ""}`}
                >
                  <X size={14} /> Não fiz
                </button>
              </div>
              {todayDay.status === "pending" && (
                <p className="mt-2 text-xs text-ink-3">Sem marcação até o fim do dia, conta como não feito.</p>
              )}
            </div>
          )}
        </section>

        <section className="card p-5 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-2">Dia a dia</h2>
            <div className="flex flex-wrap gap-3 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-deep" /> feito</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-red/40 bg-red/20" /> não feito</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-ink-2" /> hoje</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-line bg-white/[0.03]" /> futuro</span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10 md:grid-cols-14">
            {p.dayList.map((d) => (
              <button
                key={d.dayKey}
                type="button"
                disabled={d.status === "future"}
                onClick={() => setSelected(d)}
                title={`${fmtDay(d.dayKey)} · ${d.status === "done" ? "feito" : d.status === "missed" ? (d.auto ? "não feito (automático)" : "não feito") : d.status === "pending" ? "hoje" : "futuro"}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-[11px] leading-tight transition disabled:cursor-default ${STATUS_STYLE[d.status]} ${
                  d.status !== "future" ? "hover:brightness-125" : ""
                }`}
              >
                <span className="font-semibold">{d.index}</span>
                <span className="opacity-70">{weekdayShort(d.dayKey).slice(0, 1).toUpperCase()}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">Clique em um dia para marcar ou corrigir. Dias futuros ficam travados.</p>
        </section>
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? <h2 className="text-lg font-semibold">Dia {selected.index} · {fmtDay(selected.dayKey)}</h2> : null}>
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              {selected.status === "done" && "Marcado como feito."}
              {selected.status === "missed" && (selected.auto ? "Marcado automaticamente como não feito, porque não houve marcação até o fim do dia." : "Marcado como não feito.")}
              {selected.status === "pending" && "Ainda sem marcação. Até o fim do dia, conta como não feito."}
            </p>
            {selected.status === "missed" && (
              <p className="rounded-lg border border-orange/30 bg-orange/10 px-3 py-2 text-sm text-orange">
                Se a obrigação não foi cumprida nesse dia, não marque como feito.
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => mark(selected, true)} className={`btn flex-1 ${selected.status === "done" ? "pill-green border-green/40" : ""}`}>
                <Check size={14} /> Fiz
              </button>
              <button type="button" onClick={() => mark(selected, false)} className={`btn flex-1 ${selected.status === "missed" ? "pill-red border-red/40" : ""}`}>
                <X size={14} /> Não fiz
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title={<h2 className="text-lg font-semibold">Editar projeto</h2>}>
        {editing && <ProjectForm initial={p} onSaved={load} onClose={() => setEditing(false)} />}
      </Modal>
    </div>
  );
}
