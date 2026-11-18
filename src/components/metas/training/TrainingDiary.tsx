"use client";

import { Archive, ArrowLeft, Play, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { http } from "@/lib/client";
import { keyToDate } from "@/lib/time";
import { elapsedLabel, paceSeconds, trainingPlanLabel, type TrainingDetail, type TrainingLog } from "@/lib/training-types";
import { isWorkout, workoutLabel, type Workout } from "@/lib/workouts";
import { FavoriteProjectButton } from "../FavoriteProjects";
import { ProjectCover } from "../ProjectCover";
import { MetasHeader } from "../MetasTabs";
import { SportPicker } from "./SportPicker";
import { EditableExercises } from "./ExerciseEditor";
import { ExerciseList } from "./Exercises";
import { WeeklyPlan } from "./WeeklyPlan";
import { RestTimer } from "./RestTimer";
import { TrainingProjectForm } from "./TrainingProjects";
import { TrainingEntry, type TrainingEntryHandle, type TrainingClockStatus } from "./TrainingEntry";

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
  const entry = useRef<TrainingEntryHandle>(null);
  const [clock, setClock] = useState<TrainingClockStatus>({ ready: false, running: false, paused: false, sport: project.workout });
  const [sport, setSport] = useState<Workout>(project.workout);
  type Section = "plano" | "treino" | "historico";
  const viewKey = "training-view:" + project.id;
  const [section, setSection] = useState<Section>(project.workout === "strength" ? "plano" : "historico");
  const [day, setDay] = useState(1);
  useEffect(() => {
    try {
      const view = JSON.parse(localStorage.getItem(viewKey) ?? "null");
      if (new URLSearchParams(location.search).get("aba") === "treino") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- a rest notification opens the active session.
        setSection("treino");
        const weekday = Number.isInteger(view?.day) ? view.day : 1;
        setDay(weekday); setSport("strength");
        localStorage.setItem(viewKey, JSON.stringify({section: "treino", day: weekday, sport: "strength"}));
        const url = new URL(location.href);
        url.searchParams.delete("aba");
        window.history.replaceState(null, "", url);
        return;
      }
      if (!view) return;
      if (["plano", "treino", "historico"].includes(view.section)) setSection(view.section);
      if (Number.isInteger(view.day) && view.day >= 0 && view.day <= 6) setDay(view.day);
      if (isWorkout(view.sport)) setSport(view.sport);
    } catch { /* Default to the project's initial sport. */ }
  }, [today, viewKey]);
  function show(next: Section, weekday = day, nextSport = sport) {
    setSection(next); setDay(weekday); setSport(nextSport);
    try { localStorage.setItem(viewKey, JSON.stringify({section: next, day: weekday, sport: nextSport})); } catch { /* Optional persistence. */ }
  }
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(15);
  const url = "/api/treinos/" + project.id;
  async function act(operation: () => Promise<unknown>, remove = false) {
    if (busy) return;
    setBusy(true);
    try { await operation(); window.dispatchEvent(new Event("project-changed")); if (remove) router.push("/metas/projetos?lista=1"); router.refresh(); }
    catch (e) { notify(e instanceof Error ? e.message : "Falha ao salvar.", "error"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <MetasHeader title={project.name} subtitle={project.description || "Diário de treino"} />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link className="btn btn-ghost" href="/metas/projetos?lista=1"><ArrowLeft size={14} /> Todos os projetos</Link>
      <div className="flex flex-wrap items-center gap-1">
        {!project.archived && <FavoriteProjectButton id={project.id} kind="training" />}
        <button className="btn btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Editar</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => http.patch(url, { archived: !project.archived }))}><Archive size={14} /> {project.archived ? "Reativar" : "Arquivar"}</button>
        <button className="btn btn-ghost text-red" aria-label="Excluir projeto" disabled={busy} onClick={async () => {
          if (await askConfirm({ title: "Excluir projeto?", message: "O plano e todos os registros deste projeto serão apagados.", confirmLabel: "Excluir", danger: true })) await act(() => http.del(url), true);
        }}><Trash2 size={14} /></button>
      </div>
    </div>
    {!project.archived && section !== "treino" && <button type="button" className="btn btn-primary"
      disabled={!clock.ready || clock.sport !== sport} onClick={() => { show("treino"); entry.current?.start(); }}>
      <Play size={16} /> {clock.running ? "Abrir treino em andamento" : clock.paused ? "Retomar treino" : "Iniciar treino"}
    </button>}
    <ProjectCover path={url+"/imagem"} coverId={project.coverId}/>
    {!project.archived && <nav aria-label="Seções do treino" className="flex flex-wrap gap-2">
      {([["plano", "Plano de treino"], ["treino", "Registrar treino"], ["historico", "Histórico"]] as const).map(([tab, title]) =>
        <button key={tab} type="button" aria-pressed={tab === section} onClick={() => show(tab)}
          className={"btn " + (tab === section ? "pill-orange" : "btn-ghost")}>{title}</button>)}
    </nav>}
    <div className="grid items-start gap-4 lg:grid-cols-2">
    {project.archived ? <p className="card p-4 text-sm lg:col-span-2">Projeto arquivado.</p> : <>
      <div hidden={section !== "treino"} className="min-w-0"><section className="card min-w-0 space-y-4 p-4 sm:p-5">
        <h2 className="font-semibold">Registrar treino</h2>
        <SportPicker value={sport} onChange={v => show("treino", day, v)} />
        <TrainingEntry ref={entry} onClockStatus={setClock} key={sport} projectId={project.id} today={today} sport={sport} plans={project.plans} onSave={() => { show("historico"); router.refresh(); notify("Treino registrado."); }} />
      </section></div>
      {section === "plano" && <div className="min-w-0 space-y-4 lg:col-span-2">
        <WeeklyPlan projectId={project.id} plans={project.plans} day={day} onDay={d => show("plano", d)} onSave={() => { router.refresh(); notify("Plano de treino salvo."); }} />
      </div>}
      {section === "treino" && sport === "strength" && <RestTimer projectId={project.id} initialSeconds={project.restSeconds} initialEnd={project.restEndsAt} />}
    </>}
    {(section === "historico" || project.archived) && <section className="card min-w-0 space-y-3 p-4 sm:p-5 lg:col-span-2">
      <h2 className="font-semibold">Histórico de treinos</h2>
      {!project.logs.length && <p className="text-sm text-ink-3">Nenhum treino registrado.</p>}
      <ul className="divide-y divide-line">{project.logs.slice(0, limit).map(log => <li className="py-3 first:pt-0" key={log.id}>
        <div className="flex items-start justify-between gap-2">
          <div><div className="font-medium">{log.planSlot == null ? workoutLabel(log.sport) : trainingPlanLabel(log.planSlot)}</div><time className="text-xs text-ink-3">{dayLabel(log.dayKey)}</time></div>
          <button className="btn btn-ghost h-8 w-8 p-0" disabled={busy} aria-label="Excluir registro" onClick={async () => {
            if (await askConfirm({ title: "Excluir registro?", message: workoutLabel(log.sport) + " de " + dayLabel(log.dayKey), confirmLabel: "Excluir", danger: true })) await act(() => http.del(url + "/registros/" + log.id));
          }}><Trash2 size={14} /></button>
        </div>
        {log.durationSeconds != null && <p className="mt-1 text-sm text-ink-2">{stats(log)}</p>}
        {!!log.exercises.length && (project.archived ? <ExerciseList exercises={log.exercises} /> :
          <EditableExercises exercises={log.exercises} allowAdd={false} onChange={async (exercises, _removed, previous) => {
            await http.patch(url + "/registros/" + log.id, { exercises, previous });
            router.refresh(); notify("Exercício atualizado.");
          }} />)}
      </li>)}</ul>
      {project.logs.length > limit && <button className="btn" onClick={() => setLimit(n => n + 15)}>Ver mais registros</button>}
    </section>}
    </div>
    {(project.previousChecks.length > 0 || project.obligations) && <details className="card p-4 text-sm">
      <summary className="cursor-pointer">Histórico do formato anterior</summary>
      {project.obligations && <p className="mt-2 whitespace-pre-wrap text-ink-2">{project.obligations}</p>}
      {project.previousChecks.map(c => <p className="mt-2 text-ink-2" key={c.dayKey}>{dayLabel(c.dayKey)} · {c.done ? "Feito" : "Não feito"} {c.note}</p>)}
    </details>}
    {editing && <TrainingProjectForm initial={project} onClose={() => setEditing(false)} />}
  </div>;
}
