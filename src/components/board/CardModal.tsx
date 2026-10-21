"use client";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import { Archive, Check, Copy, ImagePlus, ListChecks, Pause, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { elapsedSince, http, priorityUi, useNow } from "@/lib/client";
import { imageUrl, imagesFromClipboard, toImageDataUrl } from "@/lib/images";
import { formatClock, formatDuration } from "@/lib/time";
import { Modal } from "@/components/ui/Modal";
import { DateField } from "@/components/ui/DateField";
import type { CardDTO, ListDTO } from "@/lib/types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function CardModal({
  card,
  lists,
  onClose,
  onChanged,
  onCopy,
  onArchive,
}: {
  card: CardDTO | null;
  lists: ListDTO[];
  onClose: () => void;
  onChanged: () => void;
  onCopy?: () => void;
  onArchive?: () => void;
}) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [estimate, setEstimate] = useState(card?.estimatedMinutes ? String(card.estimatedMinutes) : "");

  const running = Boolean(card?.runningSince);
  const now = useNow(running);
  const imgRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const cardId = card?.id;

  // Colar imagem (Ctrl+V) com o modal aberto anexa à tarefa.
  useEffect(() => {
    if (!cardId) return;
    const onPaste = async (e: ClipboardEvent) => {
      const files = imagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      setUploading(true);
      try {
        for (const f of files) {
          await http.post(`/api/cards/${cardId}/imagens`, { image: await toImageDataUrl(f) });
        }
        onChanged();
      } finally {
        setUploading(false);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [cardId, onChanged]);

  if (!card) return null;

  async function addImages(files: File[]) {
    setUploading(true);
    try {
      for (const f of files.filter((x) => x.type.startsWith("image/"))) {
        await http.post(`/api/cards/${card!.id}/imagens`, { image: await toImageDataUrl(f) });
      }
      onChanged();
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId: string) {
    await http.del(`/api/cards/${card!.id}/imagens`, { imageId });
    onChanged();
  }

  async function addItem() {
    const text = newItem.trim();
    if (!text || addingItem) return;
    setAddingItem(true);
    try {
      await http.post(`/api/cards/${card!.id}/checklist`, { text });
      setNewItem("");
      onChanged();
    } finally {
      setAddingItem(false);
    }
  }

  async function toggleItem(itemId: string, done: boolean) {
    await http.patch(`/api/cards/${card!.id}/checklist`, { itemId, done });
    onChanged();
  }

  async function removeItem(itemId: string) {
    await http.del(`/api/cards/${card!.id}/checklist`, { itemId });
    onChanged();
  }

  const done = Boolean(card.completedAt);
  const spent = card.spentMs + (running ? elapsedSince(card.runningSince, now) : 0);
  const listOf = lists.find((l) => l.id === card.listId);

  async function patch(data: Record<string, unknown>) {
    await http.patch(`/api/cards/${card!.id}`, data);
    onChanged();
  }

  /** Fechar (Esc, fundo, X) salva o que ainda não foi gravado: título, descrição e estimativa. */
  function close() {
    const pending: Record<string, unknown> = {};
    const t = title.trim();
    if (t && t !== card!.title) pending.title = t;
    if (description !== card!.description) pending.description = description;
    const est = estimate ? Number(estimate) : null;
    if (est !== card!.estimatedMinutes) pending.estimatedMinutes = est;
    if (Object.keys(pending).length > 0) void patch(pending);
    onClose();
  }

  async function timer() {
    await http.post(`/api/cards/${card!.id}/timer`, { action: running ? "stop" : "start" });
    onChanged();
  }

  async function move(listId: string) {
    await http.post("/api/cards/move", { cardId: card!.id, toListId: listId, toIndex: 0 });
    onChanged();
  }

  async function remove() {
    if (!(await askConfirm({ title: "Excluir tarefa", message: `Excluir a tarefa "${card!.title}"?`, confirmLabel: "Excluir", danger: true }))) return;
    await http.del(`/api/cards/${card!.id}`);
    onClose();
    onChanged();
  }

  async function removeSession(sessionId: string) {
    await http.del(`/api/cards/${card!.id}/timer`, { sessionId });
    onChanged();
  }

  const titleNode = (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => {
        const t = title.trim();
        if (t && t !== card.title) patch({ title: t });
        else setTitle(card.title);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full bg-transparent text-lg font-semibold outline-none"
      aria-label="Título"
    />
  );

  return (
    <Modal open onClose={close} title={titleNode} wide>
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">
              Prioridade
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((n) => {
                const pu = priorityUi(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => patch({ priority: n })}
                    className={`${card.priority === n ? pu.pill : "pill"} cursor-pointer px-3 py-1`}
                  >
                    {pu.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== card.description) patch({ description });
              }}
              rows={5}
              placeholder="Detalhes, links…"
              className="input resize-y"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                <ListChecks size={13} /> Checklist
              </label>
              {card.checklist.length > 0 && (
                <span className={`text-xs tabular-nums ${card.checklist.every((i) => i.done) ? "text-green" : "text-ink-3"}`}>
                  {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
                </span>
              )}
            </div>
            {card.checklist.length > 0 && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-fill-2">
                <div
                  className={`h-full rounded-full transition-all ${card.checklist.every((i) => i.done) ? "bg-green-deep" : "bg-blue-deep"}`}
                  style={{ width: `${Math.round((card.checklist.filter((i) => i.done).length / card.checklist.length) * 100)}%` }}
                />
              </div>
            )}
            <ul className="space-y-1">
              {card.checklist.map((item) => (
                <li key={item.id} className="group flex items-center gap-2 rounded-lg border border-line bg-well px-2 py-1.5 text-sm">
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id, !item.done)}
                    aria-label={item.done ? "Desmarcar" : "Marcar como feito"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                      item.done ? "border-green/60 bg-green-deep text-bg" : "border-line-3 hover:border-green/60"
                    }`}
                  >
                    {item.done && <Check size={12} strokeWidth={3} />}
                  </button>
                  <span className={`min-w-0 flex-1 break-words ${item.done ? "text-ink-3 line-through" : ""}`}>{item.text}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remover item"
                    className="text-ink-3 opacity-0 transition hover:text-red focus:opacity-100 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addItem();
              }}
              className="mt-1.5 flex gap-2"
            >
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Adicionar item…"
                className="input h-9 py-1 text-sm"
              />
              <button type="submit" disabled={!newItem.trim() || addingItem} className="btn h-9 shrink-0 px-3 text-xs">
                <Plus size={13} /> Adicionar
              </button>
            </form>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-3">Imagens</label>
              <button type="button" onClick={() => imgRef.current?.click()} disabled={uploading} className="btn btn-ghost h-7 px-2 text-xs">
                <ImagePlus size={13} /> {uploading ? "Enviando…" : "Anexar"}
              </button>
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) addImages(files);
                }}
              />
            </div>
            {card.imageIds.length === 0 ? (
              <p className="text-xs text-ink-3">Cole uma imagem com Ctrl+V ou clique em Anexar.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {card.imageIds.map((id) => (
                  <div key={id} className="group relative">
                    <a href={imageUrl(id)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl(id)} alt="" className="h-24 w-32 rounded-lg border border-line object-cover" loading="lazy" />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeImage(id)}
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line-2 bg-surface-3 text-ink-2 shadow hover:text-red"
                      aria-label="Remover imagem"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">
                Estimativa (min)
              </label>
              <input
                value={estimate}
                inputMode="numeric"
                onChange={(e) => setEstimate(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  const v = estimate ? Number(estimate) : null;
                  if (v !== card.estimatedMinutes) patch({ estimatedMinutes: v });
                }}
                placeholder="ex.: 45"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">
                Dia
              </label>
              <DateField
                value={card.scheduledFor}
                onChange={(k) => {
                  if (k && k !== card.scheduledFor) patch({ scheduledFor: k });
                }}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">
              Lista
            </label>
            <select
              value={card.listId}
              onChange={(e) => move(e.target.value)}
              className="input appearance-none"
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <aside className="space-y-4">
          <div
            className={`rounded-2xl border p-4 ${
              running ? "border-green/35 bg-green/[0.07]" : "border-line bg-well"
            }`}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Tempo na tarefa</div>
            <div className="mt-1 font-mono text-[1.7rem] font-semibold leading-none tabular-nums">
              {formatClock(spent)}
            </div>
            {card.estimatedMinutes ? (
              <div className="mt-1 text-xs text-ink-3">
                estimativa {formatDuration(card.estimatedMinutes * 60000)}
                {spent > card.estimatedMinutes * 60000 ? (
                  <span className="text-orange"> · passou</span>
                ) : null}
              </div>
            ) : null}
            {!done && (
              <button
                type="button"
                onClick={timer}
                className={`btn mt-3 w-full ${running ? "pill-red border-red/40" : "btn-primary"}`}
              >
                {running ? (
                  <>
                    <Pause size={14} /> Pausar
                  </>
                ) : (
                  <>
                    <Play size={14} /> Iniciar
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {done ? (
              <button type="button" onClick={() => patch({ completed: false })} className="btn w-full">
                <RotateCcw size={14} /> Reabrir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => patch({ completed: true })}
                className="btn w-full pill-green border-green/40"
              >
                <Check size={14} /> Concluir
              </button>
            )}
            {onCopy && (
              <button type="button" onClick={onCopy} className="btn w-full">
                <Copy size={14} /> Copiar tarefa
              </button>
            )}
            {onArchive && (
              <button type="button" onClick={onArchive} className="btn w-full">
                <Archive size={14} /> Arquivar
              </button>
            )}
            <button type="button" onClick={remove} className="btn btn-ghost w-full text-red hover:text-red">
              <Trash2 size={14} /> Excluir
            </button>
          </div>

          <div className="text-[11px] text-ink-3">
            {listOf ? <div>Lista: {listOf.name}</div> : null}
            <div>Criada em {fmtDate(card.createdAt)}</div>
            {card.completedAt ? (
              <div>
                Concluída em {fmtDate(card.completedAt)} às {fmtTime(card.completedAt)}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {card.sessions && card.sessions.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Sessões</h3>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {card.sessions.map((s) => {
              const ms = s.endedAt
                ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
                : elapsedSince(s.startedAt, now);
              return (
                <li
                  key={s.id}
                  className="group flex items-center justify-between rounded-lg border border-line bg-well px-3 py-1.5 text-xs"
                >
                  <span className="text-ink-2 tabular-nums">
                    {fmtDate(s.startedAt)} · {fmtTime(s.startedAt)} – {s.endedAt ? fmtTime(s.endedAt) : "agora"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatDuration(ms)}</span>
                    {s.endedAt && (
                      <button
                        type="button"
                        onClick={() => removeSession(s.id)}
                        className="text-ink-3 md:opacity-0 transition hover:text-red md:group-hover:opacity-100"
                        aria-label="Apagar sessão"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
