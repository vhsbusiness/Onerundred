"use client";

import { Archive, ArrowUpRight, Dumbbell, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { http } from "@/lib/client";
import type { TrainingSummary } from "@/lib/training-types";
import { workoutLabel, type Workout } from "@/lib/workouts";
import { MetasHeader } from "../MetasTabs";
import { SportPicker } from "./SportPicker";

export function TrainingProjectForm({ initial, onClose }: { initial?: TrainingSummary; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "Treino");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sport, setSport] = useState<Workout>(initial?.workout ?? "strength");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const payload = { name, description, workout: sport };
      if (initial) {
        await http.patch("/api/treinos/" + initial.id, payload);
        router.refresh();
      } else {
        const created = await http.post<TrainingSummary>("/api/treinos", payload);
        router.push("/metas/treinos/" + created.id);
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={onClose} title={<h2 className="text-lg font-semibold">{initial ? "Editar projeto de treino" : "Novo projeto de treino"}</h2>}>
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm">Nome do projeto<input required className="input mt-1" value={name} onChange={e => setName(e.target.value)} /></label>
      <SportPicker value={sport} onChange={setSport} />
      <label className="block text-sm">Descrição <span className="text-ink-3">(opcional)</span><textarea className="input mt-1" rows={2} value={description} onChange={e => setDescription(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      <button disabled={busy} className="btn btn-primary">{initial ? "Salvar alterações" : "Criar projeto"}</button>
    </form>
  </Modal>;
}

export function TrainingProjects({ projects }: { projects: TrainingSummary[] }) {
  const [creating, setCreating] = useState(false);
  return <div className="space-y-5">
    <MetasHeader title="Projetos" subtitle="Planeje a semana e registre seus treinos." />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold"><Dumbbell size={18} className="text-orange" /> Meus treinos</h2>
      <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Novo projeto de treino</button>
    </div>
    {!projects.length && <p className="card p-6 text-sm text-ink-2">Seu primeiro projeto de treino aparecerá aqui.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map(p =>
      <Link key={p.id} href={"/metas/treinos/" + p.id} className="card space-y-3 p-5 hover:border-line-3">
        <div className="flex justify-between gap-2"><h3 className="break-words text-lg font-semibold">{p.name}</h3><ArrowUpRight size={16} className="shrink-0 text-ink-3" /></div>
        {p.description && <p className="line-clamp-2 text-sm text-ink-2">{p.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2"><span className="pill">{workoutLabel(p.workout)}</span>
          <span>{p.logCount} {p.logCount === 1 ? "treino registrado" : "treinos registrados"}</span>
          {p.archived && <span className="pill"><Archive size={12} /> Arquivado</span>}
        </div>
      </Link>
    )}</div>
    {creating && <TrainingProjectForm onClose={() => setCreating(false)} />}
  </div>;
}
