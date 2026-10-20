"use client";

import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArrowLeft, ArrowRight, Check, Copy, FolderInput, Magnet, MoreHorizontal, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { http, priorityUi } from "@/lib/client";
import { imagesFromClipboard, toImageDataUrl } from "@/lib/images";
import type { CardDTO, ListDTO, ListKind } from "@/lib/types";
import { CardItem } from "./CardItem";

/** Prefixo dos ids de ordenação das listas (distinto do id da lista, que é a área de soltar tarefas). */
export const LIST_SORT_PREFIX = "list:";

const KIND_LABEL: Record<ListKind, string> = {
  normal: "Normal",
  today: "Hoje",
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
  lastUndo,
  onUndo,
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
  lastUndo?: { id: string; label: string } | null;
  onUndo?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id, data: { type: "list" } });
  // A coluna inteira é arrastável pelo cabeçalho (como no Trello) para reordenar as listas.
  const {
    setNodeRef: setSortableRef,
    transform: sortTransform,
    transition: sortTransition,
    isDragging: sorting,
    attributes: sortAttributes,
    listeners: sortListeners,
  } = useSortable({ id: `${LIST_SORT_PREFIX}${list.id}`, data: { type: "listSort" } });
  const [menu, setMenu] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(2);
  const [estimate, setEstimate] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [aiSorting, setAiSorting] = useState(false);

  /** Pede à IA para ordenar as tarefas abertas da lista por importância (dá para desfazer). */
  async function aiSort() {
    setMenu(false);
    setAiSorting(true);
    try {
      const r = await http.post<{ moved: number; reason: string }>(`/api/lists/${list.id}/acoes`, { action: "aiSort" });
      notify(r.moved === 0 ? "A IA manteve a ordem que já estava." : `Lista organizada pela IA: ${r.reason}`);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível organizar", "error");
    } finally {
      setAiSorting(false);
    }
  }

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
        setPullOpen(false);
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
    setPullOpen(false);
    await http.post(`/api/lists/${list.id}/acoes`, body);
    onChanged();
  }

  async function archiveAll() {
    const n = list.cards.length;
    if (n === 0) return;
    if (!(await askConfirm({ title: "Arquivar tarefas", message: `Arquivar as ${n} tarefas de "${list.name}"? Elas ficam na aba Arquivadas.`, confirmLabel: "Arquivar" }))) return;
    await action({ action: "archiveCards" });
  }

  async function remove() {
    if (!(await askConfirm({ title: "Excluir lista", message: `Excluir a lista "${list.name}" e suas ${list.cards.length} tarefas?`, confirmLabel: "Excluir", danger: true }))) return;
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
      ref={setSortableRef}
      style={{ transform: CSS.Translate.toString(sortTransform), transition: sortTransition }}
      className={`card flex max-h-full w-[86vw] max-w-[300px] shrink-0 snap-start flex-col bg-list transition md:w-[300px] ${
        isOver ? "border-line-2 bg-list-hover" : ""
      } ${sorting ? "z-20 opacity-90 shadow-2xl ring-1 ring-line-3" : ""}`}
    >
      <header
        className={`flex items-center gap-2 px-3 pb-2 pt-3 ${sorting ? "cursor-grabbing" : "cursor-grab"}`}
        {...sortAttributes}
        {...sortListeners}
      >
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
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-ink-2 hover:bg-fill-2 hover:text-ink"
                      >
                        {l.name}
                      </button>
                    ))}
                </div>
              )}
              <MenuItem
                icon={<Magnet size={14} />}
                label={pullOpen ? "Puxar tarefas de prioridade…" : "Puxar todas as tarefas de uma prioridade"}
                disabled={list.kind === "done"}
                onClick={() => setPullOpen((o) => !o)}
              />
              {pullOpen && (
                <div className="mb-1 ml-6 space-y-0.5 border-l border-line pl-2">
                  {[1, 2, 3].map((p) => {
                    const pu = priorityUi(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => action({ action: "pullPriority", priority: p })}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-ink-2 hover:bg-fill-2 hover:text-ink"
                      >
                        <span className={`h-2 w-2 rounded-full ${pu.dot}`} /> {pu.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <MenuItem
                icon={<Archive size={14} />}
                label="Arquivar todas as tarefas desta lista"
                disabled={list.cards.length === 0}
                onClick={archiveAll}
              />
              <MenuItem
                icon={<Sparkles size={14} />}
                label={aiSorting ? "Organizando…" : "Organizar por importância (IA)"}
                disabled={aiSorting || openCount < 2}
                onClick={aiSort}
                accent="blue"
              />
              <div className="my-1 border-t border-line" />
              <MenuItem
                icon={<Undo2 size={14} />}
                label={lastUndo ? `Desfazer: ${lastUndo.label}` : "Desfazer última ação"}
                disabled={!lastUndo || !onUndo}
                onClick={() => {
                  setMenu(false);
                  onUndo?.();
                }}
                accent="orange"
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
              listPriority={list.priority}
              listKind={list.kind}
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
          <form onSubmit={addCard} onPaste={onPasteNewCard} className="space-y-2 rounded-xl border border-line-2 bg-card p-2">
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
            className="btn btn-ghost h-9 w-full justify-start px-2 text-ink-3 hover:bg-fill"
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
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Cor de destaque (texto e ícone), para ações especiais como desfazer e IA. */
  accent?: "orange" | "blue";
}) {
  const tone = danger ? "text-red" : accent === "orange" ? "text-orange" : accent === "blue" ? "text-blue" : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-fill-2 disabled:opacity-40 ${tone}`}
    >
      <span className={tone || "text-ink-3"}>{icon}</span>
      {label}
    </button>
  );
}
