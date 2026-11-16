"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { DietDetail } from "@/lib/diet";
import { http } from "@/lib/client";
import { MetasHeader } from "../MetasTabs";
import { DateField } from "@/components/ui/DateField";
import { TimeField } from "@/components/ui/TimeField";
import { Modal } from "@/components/ui/Modal";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { ProjectCover } from "../ProjectCover";

const displayDate = (day: string) => day.split("-").reverse().join("/");
type Meal = DietDetail["meals"][number];
export function DietDiary({ data, day, today }: { data: DietDetail; day: string; today: string }) {
  const { project, meals } = data,
    router = useRouter(),
    path = "/metas/dietas/" + project.id,
    api = "/api/dietas/" + project.id;
  const [editor, setEditor] = useState<"new" | "rename" | "copy" | Meal | null>(null);
  const [time, setTime] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = editor && typeof editor === "object" ? editor : null;
  const others = project.days.filter((d) => d.dayKey !== day);
  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await http.post(api, { ...body, dayKey: day });
      setEditor(null);
      if (body.action === "deleteProject") router.push("/metas/projetos");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar.";
      if (editor) setError(msg);
      else notify(msg, "error");
    } finally {
      setBusy(false);
    }
  }
  function open(value: NonNullable<typeof editor>) {
    setError("");
    setEditor(value);
    setTime(typeof value === "object" ? value.time : "");
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    if (editor === "rename") return void act({ action: "rename", name: fields.get("name") });
    if (editor === "copy") return void act({ action: "copy", from: fields.get("from") });
    void act({
      action: current ? "edit" : "add",
      id: current?.id,
      name: fields.get("name"),
      foods: fields.get("foods"),
      time,
      calories: fields.get("calories") ? Number(fields.get("calories")) : null,
    });
  }
  const kcal = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);
  return (
    <div className="space-y-4">
      <MetasHeader title={project.name} subtitle="Diário de alimentação" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="btn btn-ghost" href="/metas/projetos">
          <ArrowLeft size={14} /> Projetos
        </Link>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => open("rename")}>
            <Pencil size={14} /> Renomear
          </button>
          <button
            className="btn btn-ghost text-red"
            aria-label="Excluir projeto de dieta"
            onClick={async () => {
              if (
                await askConfirm({
                  message: "Excluir este projeto e todos os cardápios?",
                  danger: true,
                  confirmLabel: "Excluir",
                })
              )
                void act({ action: "deleteProject" });
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <ProjectCover path={api + "/imagem"} coverId={project.cover?.id ?? null} />
      <section className="card space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Cardápio do dia</h2>
            <p className="text-sm text-ink-2">
              {meals.filter((m) => m.eaten).length} de {meals.length} refeições consumidas
              {meals.some((m) => m.calories !== null) && " · " + kcal + " kcal informadas"}
            </p>
          </div>
          <DateField
            ariaLabel="Data do cardápio"
            value={day}
            onChange={(d) => router.push(path + "?dia=" + d)}
          />
        </div>
        {!meals.length && (
          <p className="text-sm text-ink-2">Nenhuma refeição planejada para {displayDate(day)}.</p>
        )}
        <ol className="divide-y divide-line">
          {meals.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start gap-3 py-4">
              <div className="min-w-32 flex-1">
                <p className="text-xs text-ink-2">
                  {m.time || "Sem horário"}
                  {m.calories !== null && " · " + m.calories + " kcal"}
                </p>
                <h3 className="break-words font-semibold">{m.name}</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">{m.foods}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {day <= today && (
                  <button
                    className={m.eaten ? "btn pill-green" : "btn btn-ghost"}
                    disabled={busy}
                    aria-pressed={m.eaten}
                    onClick={() => void act({ action: "mark", id: m.id, eaten: !m.eaten })}
                  >
                    <Check size={14} />
                    {m.eaten ? "Consumida" : "Marcar consumo"}
                  </button>
                )}
                <button className="btn btn-ghost" aria-label={"Editar " + m.name} onClick={() => open(m)}>
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-ghost"
                  aria-label={"Excluir " + m.name}
                  onClick={async () => {
                    if (
                      await askConfirm({
                        message: "Excluir esta refeição do cardápio?",
                        danger: true,
                        confirmLabel: "Excluir",
                      })
                    )
                      void act({ action: "deleteMeal", id: m.id });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => open("new")}>
            <Plus size={15} /> Adicionar refeição
          </button>
          {!meals.length && !!others.length && (
            <button className="btn" onClick={() => open("copy")}>
              <Copy size={14} /> Copiar cardápio
            </button>
          )}
        </div>
      </section>
      {!!project.days.length && (
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Dias planejados</h2>
          <div className="flex flex-wrap gap-2">
            {project.days.map((d) => (
              <Link
                key={d.dayKey}
                className={day === d.dayKey ? "btn pill-orange" : "btn btn-ghost"}
                href={path + "?dia=" + d.dayKey}
              >
                {displayDate(d.dayKey)}
              </Link>
            ))}
          </div>
        </section>
      )}
      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={
            <h2 className="text-lg font-semibold">
              {editor === "rename"
                ? "Renomear projeto"
                : editor === "copy"
                  ? "Copiar cardápio"
                  : current
                    ? "Editar refeição"
                    : "Adicionar refeição"}
            </h2>
          }
        >
          <form onSubmit={submit} className="space-y-4 text-sm">
            {editor === "copy" ? (
              <label className="block">
                Copiar refeições de
                <select className="input mt-1" name="from">
                  {others.map((d) => (
                    <option key={d.dayKey} value={d.dayKey}>
                      {displayDate(d.dayKey)}
                    </option>
                  ))}
                </select>
              </label>
            ) : editor === "rename" ? (
              <label className="block">
                Nome do projeto
                <input
                  name="name"
                  className="input mt-1"
                  required
                  maxLength={80}
                  defaultValue={project.name}
                />
              </label>
            ) : (
              <>
                <label className="block">
                  Refeição
                  <input
                    required
                    name="name"
                    maxLength={80}
                    className="input mt-1"
                    placeholder="Ex.: Almoço"
                    defaultValue={current?.name}
                  />
                </label>
                <label className="block">
                  Alimentos e porções
                  <textarea
                    required
                    name="foods"
                    maxLength={3000}
                    className="input mt-1"
                    rows={4}
                    placeholder="Um alimento e sua porção por linha"
                    defaultValue={current?.foods}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    Horário (opcional)
                    <TimeField liveInput value={time} onChange={setTime} ariaLabel="Horário da refeição" />
                  </div>
                  <label>
                    Calorias (opcional)
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100000}
                      name="calories"
                      defaultValue={current?.calories ?? ""}
                    />
                  </label>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-red">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {editor === "copy" ? "Copiar para " + displayDate(day) : "Salvar"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
