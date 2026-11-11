"use client";

import { Archive, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { http } from "@/lib/client";
import { keyToDate } from "@/lib/time";
import { elapsedLabel, paceSeconds, type TrainingDetail, type TrainingLog } from "@/lib/training-types";
import { workoutLabel, type Workout } from "@/lib/workouts";
import { MetasHeader } from "../MetasTabs";
import { SportPicker } from "./SportPicker";
import { ExerciseList } from "./Exercises";
import { WeeklyPlan } from "./WeeklyPlan";
import { RestTimer } from "./RestTimer";
import { TrainingProjectForm } from "./TrainingProjects";
import { TrainingEntry } from "./TrainingEntry";

function dayLabel(key: string) { return keyToDate(key).toLocaleDateString("pt-BR"); }
function stats(log: TrainingLog) {
  const parts: string[] = [];
  if (log.distanceMeters) parts.push((log.distanceMeters / 1000).toLocaleString("pt-BR") + " km");
  if (log.durationSeconds) parts.push(elapsedLabel(log.durationSeconds) + " de treino");
  if (log.distanceMeters && log.durationSeconds) parts.push(elapsedLabel(paceSeconds(log.durationSeconds, log.distanceMeters)) + " min/km");
  return parts.join(" · ");
}
export function TrainingDiary({ project, today }: { project: TrainingDetail; today: string }) {
  const router = useRouter();
  const [sport, setSport] = useState<Workout>(project.workout);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(15);
  const url = "/api/treinos/" + project.id;
  async function act(operation: () => Promise<unknown>, remove = false) {
    if (busy) return;
    setBusy(true);
    try { await operation(); if (remove) router.push("/metas/projetos"); router.refresh(); }
    catch (e) { notify(e instanceof Error ? e.message : "Falha ao salvar.", "error"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <MetasHeader title={project.name} subtitle={project.description || "Diário de treino"} />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link className="btn btn-ghost" href="/metas/projetos"><ArrowLeft size={14} /> Projetos</Link>
      <div className="flex flex-wrap gap-1">
        <button className="btn btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => http.patch(url, { archived: !project.archived }))}><Archive size={14} /> {project.archived ? "Reativar" : "Arquivar"}</button>
        <button className="btn btn-ghost text-red" aria-label="Excluir projeto" disabled={busy} onClick={async () => {
          if (await askConfirm({ title: "Excluir projeto?", message: "O plano e todos os registros deste projeto serão apagados.", confirmLabel: "Excluir", danger: true })) await act(() => http.del(url), true);
        }}><Trash2 size={14} /></button>
      </div>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
    {project.archived ? <p className="card p-4 text-sm lg:col-span-2">Projeto arquivado.</p> : <>
      <section className="card min-w-0 space-y-4 p-4 sm:p-5">
        <h2 className="font-semibold">Registrar treino</h2>
        <SportPicker value={sport} onChange={setSport} />
        <TrainingEntry key={sport} projectId={project.id} today={today} sport={sport} plans={project.plans} onSave={() => { router.refresh(); notify("Treino registrado."); }} />
      </section>
      {sport === "strength" && <div className="min-w-0 space-y-4">
        <WeeklyPlan projectId={project.id} plans={project.plans} initialDay={keyToDate(today).getDay()} onSave={() => { router.refresh(); notify("Plano semanal salvo."); }} />
        <RestTimer projectId={project.id} initialSeconds={project.restSeconds} />
      </div>}
    </>}
    <section className={"card min-w-0 space-y-3 p-4 sm:p-5 " + (project.archived || sport === "strength" ? "lg:col-span-2" : "")}>
      <h2 className="font-semibold">Histórico de treinos</h2>
      {!project.logs.length && <p className="text-sm text-ink-3">Nenhum treino registrado.</p>}
      <ul className="divide-y divide-line">{project.logs.slice(0, limit).map(log => <li className="py-3 first:pt-0" key={log.id}>
        <div className="flex items-start justify-between gap-2">
          <div><div className="font-medium">{workoutLabel(log.sport)}</div><time className="text-xs text-ink-3">{dayLabel(log.dayKey)}</time></div>
          <button className="btn btn-ghost h-8 w-8 p-0" disabled={busy} aria-label="Excluir registro" onClick={async () => {
            if (await askConfirm({ title: "Excluir registro?", message: workoutLabel(log.sport) + " de " + dayLabel(log.dayKey), confirmLabel: "Excluir", danger: true })) await act(() => http.del(url + "/registros/" + log.id));
          }}><Trash2 size={14} /></button>
        </div>
        {log.durationSeconds != null && <p className="mt-1 text-sm text-ink-2">{stats(log)}</p>}
        {!!log.exercises.length && <ExerciseList exercises={log.exercises} />}
      </li>)}</ul>
      {project.logs.length > limit && <button className="btn" onClick={() => setLimit(n => n + 15)}>Ver mais registros</button>}
    </section>
    </div>
    {(project.previousChecks.length > 0 || project.obligations) && <details className="card p-4 text-sm">
      <summary className="cursor-pointer">Histórico do formato anterior</summary>
      {project.obligations && <p className="mt-2 whitespace-pre-wrap text-ink-2">{project.obligations}</p>}
      {project.previousChecks.map(c => <p className="mt-2 text-ink-2" key={c.dayKey}>{dayLabel(c.dayKey)} · {c.done ? "Feito" : "Não feito"} {c.note}</p>)}
    </details>}
    {editing && <TrainingProjectForm initial={project} onClose={() => setEditing(false)} />}
  </div>;
}
