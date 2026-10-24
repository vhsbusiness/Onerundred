"use client";

import { DateField } from "@/components/ui/DateField";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import { Archive, ArrowUpRight, Check, Flame, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { todayKey } from "@/lib/time";
import type { ProjectDTO } from "@/lib/types";
import { MetasHeader } from "./MetasTabs";
import { confirmMarkDone } from "./confirmDone";

const BLOBS = [
  ["rgba(245,176,110,0.5)", "rgba(127,183,245,0.45)"],
  ["rgba(139,227,166,0.5)", "rgba(245,176,110,0.45)"],
  ["rgba(127,183,245,0.5)", "rgba(139,227,166,0.45)"],
];

export function ProjectForm({
  initial,
  onSaved,
  onClose,
}: {
  initial?: ProjectDTO;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [obligations, setObligations] = useState(initial?.obligations.join("\n") ?? "");
  const [days, setDays] = useState(initial ? String(initial.days) : "30");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayKey());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { name, description, obligations, days: Number(days), startDate };
      if (initial) await http.patch(`/api/projetos/${initial.id}`, payload);
      else await http.post("/api/projetos", payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Nome</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: 30 dias sem açúcar" className="input" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Descrição</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Por que esse projeto importa" className="input resize-y" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Obrigações (uma por linha)</span>
        <textarea
          value={obligations}
          onChange={(e) => setObligations(e.target.value)}
          rows={4}
          placeholder={"Treinar 40 min\nSem refrigerante\nDormir antes das 23h"}
          className="input resize-y"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Duração (dias)</span>
          <input value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} className="input" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Começa em</span>
          <DateField value={startDate} onChange={setStartDate} ariaLabel="Começa em" />
        </label>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary flex-1">
          {busy ? "Salvando…" : initial ? "Salvar alterações" : "Criar projeto"}
        </button>
        <button type="button" onClick={onClose} className="btn btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CardMenu({
  project,
  onEdit,
  onChanged,
}: {
  project: ProjectDTO;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // O card tem overflow hidden (blobs), então o menu é posicionado em relação à janela.
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 192) });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function archive() {
    setOpen(false);
    await http.patch(`/api/projetos/${project.id}`, { archived: !project.archivedAt });
    onChanged();
  }

  async function remove() {
    setOpen(false);
    if (!(await askConfirm({ title: "Excluir meta", message: `Excluir a meta "${project.name}" e todas as marcações?`, confirmLabel: "Excluir", danger: true }))) return;
    await http.del(`/api/projetos/${project.id}`);
    onChanged();
  }

  const item = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-fill-2";

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="btn btn-ghost h-8 w-8 p-0"
        aria-label="Opções da meta"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="fixed z-40 w-48 rounded-xl border border-line-2 bg-surface-3 p-1 shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <Link href={`/metas/projetos/${project.id}`} className={item} onClick={() => setOpen(false)}>
            <ArrowUpRight size={14} className="text-ink-3" /> Abrir
          </Link>
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil size={14} className="text-ink-3" /> Editar
          </button>
          <button type="button" className={item} onClick={archive}>
            <Archive size={14} className="text-ink-3" /> {project.archivedAt ? "Reativar" : "Arquivar"}
          </button>
          <div className="my-1 border-t border-line" />
          <button type="button" className={`${item} text-red`} onClick={remove}>
            <Trash2 size={14} /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProjects(await http.get<ProjectDTO[]>("/api/projetos"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** Marca o dia a marcar (ontem): a meta de um dia é confirmada no dia seguinte. */
  async function markYesterday(p: ProjectDTO, done: boolean) {
    if (done && p.markStatus === "missed" && !(await confirmMarkDone())) return;
    await http.post(`/api/projetos/${p.id}/dias`, { dayKey: p.markDayKey, done });
    load();
  }

  const active = projects?.filter((p) => !p.archivedAt) ?? [];
  const archived = projects?.filter((p) => p.archivedAt) ?? [];

  return (
    <div className="space-y-5">
      <MetasHeader />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-3">
          Crie um projeto de quantos dias quiser e marque, dia a dia, se cumpriu as obrigações. Dias não marcados até a virada do dia contam como não feitos.
        </p>
        <button type="button" onClick={() => setCreating(true)} className="btn btn-primary shrink-0">
          <Plus size={14} /> Novo projeto
        </button>
      </div>

      {error && <div className="card p-4 text-sm text-red">{error}</div>}

      {!projects ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card h-44" />
          <div className="card h-44" />
        </div>
      ) : active.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-3">Nenhum projeto ainda. Crie o primeiro.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p, i) => {
            const [a, b] = BLOBS[i % BLOBS.length];
            const progress = p.days > 0 ? (p.doneCount / p.days) * 100 : 0;
            return (
              <div
                key={p.id}
                className="card blob-surface flex flex-col p-5"
                style={{ "--blob-a": a, "--blob-b": b } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/metas/projetos/${p.id}`} className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight hover:underline">{p.name}</h2>
                    <p className="line-clamp-2 text-sm text-ink-2">{p.description || p.obligations.slice(0, 2).join(" · ")}</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.streak > 0 && (
                      <span className="pill pill-orange">
                        <Flame size={11} /> {p.streak}d
                      </span>
                    )}
                    <CardMenu project={p} onEdit={() => setEditing(p)} onChanged={load} />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-ink-3">
                    <span>
                      dia {Math.min(p.daysElapsed, p.days)} de {p.days}
                    </span>
                    <span className="tabular-nums">
                      {p.doneCount} feitos · {p.missedCount} não
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-fill-2">
                    <div className="h-full rounded-full bg-green-deep transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {p.markStatus === "pending" || p.markStatus === "missed" || p.markStatus === "done" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => markYesterday(p, true)}
                        className={`btn h-9 flex-1 ${p.markStatus === "done" ? "pill-green border-green/40" : ""}`}
                      >
                        <Check size={14} /> {p.markStatus === "done" ? "Feito ontem" : "Fiz ontem"}
                      </button>
                      <button
                        type="button"
                        onClick={() => markYesterday(p, false)}
                        className={`btn h-9 flex-1 ${p.markStatus === "missed" ? "pill-red border-red/40" : ""}`}
                      >
                        <X size={14} /> Não fiz
                      </button>
                    </>
                  ) : (
                    <span className="pill">
                      {p.markStatus === "ended" ? "Projeto encerrado" : p.startDate === todayKey() ? "Começou hoje · marque amanhã" : `Começa em ${p.startDate.split("-").reverse().join("/")}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-medium text-ink-2">Arquivados</h2>
          <ul className="space-y-1 text-sm">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-well px-3 py-2">
                <Link href={`/metas/projetos/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <span className="ml-auto text-xs text-ink-3">
                  {p.doneCount}/{p.days} dias feitos
                </span>
                <CardMenu project={p} onEdit={() => setEditing(p)} onChanged={load} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={<h2 className="text-lg font-semibold">Novo projeto</h2>}>
        <ProjectForm onSaved={load} onClose={() => setCreating(false)} />
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={<h2 className="text-lg font-semibold">Editar meta</h2>}>
        {editing && <ProjectForm key={editing.id} initial={editing} onSaved={load} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
