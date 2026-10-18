"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Archive, ArrowLeft, ArrowRight, Check, Copy, FolderInput, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { http, priorityUi } from "@/lib/client";
import { imagesFromClipboard, toImageDataUrl } from "@/lib/images";
import type { CardDTO, ListDTO, ListKind } from "@/lib/types";
import { CardItem } from "./CardItem";

const KIND_LABEL: Record<ListKind, string> = {
  normal: "Normal",
  tomorrow: "Amanhã",
  done: "Feitas",
};

export function ListColumn({
  list,
  lists,
  index,
  count,
  now,
  todayKey,
  onChanged,
  onOpenCard,
  onTimer,
  onCardContextMenu,
}: {
  list: ListDTO;
  lists: ListDTO[];
  index: number;
  count: number;
  now: number;
  todayKey: string;
  onChanged: () => void;
  onOpenCard: (card: CardDTO) => void;
  onTimer: (card: CardDTO) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardDTO) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id, data: { type: "list" } });
  const [menu, setMenu] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(2);
  const [estimate, setEstimate] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  async function onPasteNewCard(e: React.ClipboardEvent) {
    const files = imagesFromClipboard(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    const urls = await Promise.all(files.map((f) => toImageDataUrl(f)));
    setPendingImages((prev) => [...prev, ...urls].slice(0, 10));
  }
  const addRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
        setMoveOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  const p = priorityUi(list.priority);

  async function patch(data: Record<string, unknown>) {
    await http.patch(`/api/lists/${list.id}`, data);
    onChanged();
  }

  async function saveName() {
    setEditing(false);
    const next = name.trim();
    if (!next || next === list.name) {
      setName(list.name);
      return;
    }
    await patch({ name: next });
  }

  async function cyclePriority() {
    await patch({ priority: (list.priority % 3) + 1 });
  }

  async function action(body: Record<string, unknown>) {
    setMenu(false);
    setMoveOpen(false);
    await http.post(`/api/lists/${list.id}/acoes`, body);
    onChanged();
  }

  async function archiveAll() {
    const n = list.cards.length;
    if (n === 0) return;
    if (!confirm(`Arquivar as ${n} tarefas de "${list.name}"? Elas ficam na aba Arquivadas.`)) return;
    await action({ action: "archiveCards" });
  }

  async function remove() {
    if (!confirm(`Excluir a lista "${list.name}" e suas ${list.cards.length} tarefas?`)) return;
    await http.del(`/api/lists/${list.id}`);
    onChanged();
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const created = await http.post<{ id: string }>("/api/cards", {
      listId: list.id,
      title: t,
      priority,
      estimatedMinutes: estimate ? Number(estimate) : null,
    });
    for (const image of pendingImages) {
      await http.post(`/api/cards/${created.id}/imagens`, { image });
    }
    setPendingImages([]);
    setTitle("");
    setEstimate("");
    onChanged();
    addRef.current?.focus();
  }

  const openCount = list.cards.filter((c) => !c.completedAt).length;

  return (
    <section
      data-no-pan
      className={`card flex max-h-full w-[86vw] max-w-[300px] shrink-0 snap-start flex-col transition md:w-[300px] ${
        isOver ? "border-line-2 bg-surface-2" : ""
      }`}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(list.name);
                setEditing(false);
              }
            }}
            className="input h-8 flex-1 px-2 py-1 text-sm font-medium"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setName(list.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
            title="Renomear lista"
          >
            {list.name}
            <span className="ml-2 text-xs font-normal text-ink-3 tabular-nums">
              {list.kind === "done" ? list.cards.length : openCount}
            </span>
          </button>
        )}

        {list.kind !== "done" && (
          <button
            type="button"
            onClick={cyclePriority}
            className={`${p.pill} cursor-pointer`}
            title="Prioridade da lista (clique para alternar)"
          >
            {p.label}
          </button>
        )}
        {list.kind !== "normal" && <span className="pill">{KIND_LABEL[list.kind]}</span>}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="btn btn-ghost h-7 w-7 p-0"
            aria-label="Opções da lista"
          >
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div className="absolute right-0 top-8 z-20 w-60 rounded-xl border border-line-2 bg-surface-3 p-1 text-sm shadow-2xl">
              <MenuItem
                icon={<Plus size={14} />}
                label="Adicionar tarefa"
                onClick={() => {
                  setMenu(false);
                  setAdding(true);
                }}
              />
              <MenuItem icon={<Copy size={14} />} label="Copiar lista" onClick={() => action({ action: "copy" })} />
              <MenuItem
                icon={<FolderInput size={14} />}
                label={moveOpen ? "Mover todas as tarefas para…" : "Mover todas as tarefas desta lista"}
                disabled={list.cards.length === 0 || lists.length < 2}
                onClick={() => setMoveOpen((o) => !o)}
              />
              {moveOpen && (
                <div className="mb-1 ml-6 space-y-0.5 border-l border-line pl-2">
                  {lists
                    .filter((l) => l.id !== list.id)
                    .map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => action({ action: "moveCards", toListId: l.id })}
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-ink-2 hover:bg-white/[0.06] hover:text-ink"
                      >
                        {l.name}
                      </button>
                    ))}
                </div>
              )}
              <MenuItem
                icon={<Archive size={14} />}
                label="Arquivar todas as tarefas desta lista"
                disabled={list.cards.length === 0}
                onClick={archiveAll}
              />
              <div className="my-1 border-t border-line" />
              <MenuItem
                icon={<ArrowLeft size={14} />}
                label="Mover para a esquerda"
                disabled={index === 0}
                onClick={() => patch({ toIndex: index - 1 })}
              />
              <MenuItem
                icon={<ArrowRight size={14} />}
                label="Mover para a direita"
                disabled={index >= count - 1}
                onClick={() => patch({ toIndex: index + 1 })}
              />
              <div className="my-1 border-t border-line" />
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-ink-3">Tipo da lista</div>
              {(Object.keys(KIND_LABEL) as ListKind[]).map((k) => (
                <MenuItem
                  key={k}
                  icon={list.kind === k ? <Check size={14} /> : <span className="w-3.5" />}
                  label={KIND_LABEL[k]}
                  onClick={() => patch({ kind: k })}
                />
              ))}
              <div className="my-1 border-t border-line" />
              <MenuItem icon={<Trash2 size={14} />} label="Excluir lista" danger onClick={remove} />
            </div>
          )}
        </div>
      </header>

      <div ref={setNodeRef} className="min-h-[40px] flex-1 space-y-2 overflow-y-auto px-3 pb-2">
        <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {list.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              listId={list.id}
              now={now}
              todayKey={todayKey}
              onOpen={() => onOpenCard(card)}
              onTimer={() => onTimer(card)}
              onContextMenu={onCardContextMenu}
            />
          ))}
        </SortableContext>
        {list.cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">
            {list.kind === "done" ? "Arraste tarefas concluídas para cá" : "Sem tarefas"}
          </div>
        )}
      </div>

      <footer className="px-3 pb-3 pt-1">
        {adding ? (
          <form onSubmit={addCard} onPaste={onPasteNewCard} className="space-y-2 rounded-xl border border-line-2 bg-surface-2 p-2">
            <input
              ref={addRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Título da tarefa (cole uma imagem com Ctrl+V)"
              className="input"
            />
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingImages.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="h-14 w-14 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingImages((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-line-2 bg-surface-3 text-[10px] text-ink-2"
                      aria-label="Remover imagem"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((n) => {
                const pu = priorityUi(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPriority(n)}
                    className={`${priority === n ? pu.pill : "pill"} cursor-pointer`}
                  >
                    {pu.label}
                  </button>
                );
              })}
              <input
                value={estimate}
                onChange={(e) => setEstimate(e.target.value.replace(/\D/g, ""))}
                placeholder="min"
                inputMode="numeric"
                className="input ml-auto h-7 w-16 px-2 py-0 text-xs"
                title="Estimativa em minutos"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary h-8 flex-1">
                Adicionar
              </button>
              <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost h-8">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn btn-ghost h-9 w-full justify-start px-2 text-ink-3 hover:bg-white/[0.04]"
          >
            <Plus size={15} /> Adicionar tarefa
          </button>
        )}
      </footer>
    </section>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.06] disabled:opacity-40 ${
        danger ? "text-red" : ""
      }`}
    >
      <span className="text-ink-3">{icon}</span>
      {label}
    </button>
  );
}
