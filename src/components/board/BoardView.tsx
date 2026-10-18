"use client";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { http, useNow } from "@/lib/client";
import { todayKey } from "@/lib/time";
import type { BoardDTO, CardDTO } from "@/lib/types";
import { CardBody } from "./CardItem";
import { CardModal } from "./CardModal";
import { ImportModal } from "./ImportModal";
import { CardContextMenu, type ContextMenuState } from "./CardContextMenu";
import { ListColumn } from "./ListColumn";

export function BoardView({ boardId, initialBoard }: { boardId: string; initialBoard?: BoardDTO }) {
  const router = useRouter();
  const [board, setBoard] = useState<BoardDTO | null>(initialBoard ?? null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  // Tarefa aberta via URL (?card=ID) ou por clique
  const [openCardId, setOpenCardId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("card"),
  );
  const [addingList, setAddingList] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const [boardMenu, setBoardMenu] = useState(false);
  const boardMenuRef = useRef<HTMLDivElement>(null);

  const [listName, setListName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [boardName, setBoardName] = useState(initialBoard?.name ?? "");
  const [panning, setPanning] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; left: number } | null>(null);
  const today = todayKey();

  useEffect(() => {
    if (!boardMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) setBoardMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [boardMenu]);

  // Rolagem lateral arrastando o mouse em qualquer área vazia do quadro.
  function onPanStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || !scrollerRef.current) return;
    if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
    panRef.current = { x: e.clientX, left: scrollerRef.current.scrollLeft };
    setPanning(true);
    e.preventDefault();
  }
  function onPanMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!panRef.current || !scrollerRef.current) return;
    scrollerRef.current.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
  }
  function onPanEnd() {
    panRef.current = null;
    setPanning(false);
  }

  const load = useCallback(async () => {
    try {
      const b = await http.get<BoardDTO>(`/api/boards/${boardId}`);
      setBoard(b);
      setBoardName(b.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [boardId]);

  useEffect(() => {
    // Sem dados iniciais do servidor, busca ao montar (o setState ocorre após o await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialBoard) load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load, initialBoard]);

  async function undo() {
    if (!board?.lastUndo) return;
    if (!(await askConfirm({ title: "Desfazer", message: `Desfazer: ${board.lastUndo.label}?`, confirmLabel: "Desfazer" }))) return;
    await http.post("/api/undo");
    load();
  }

  async function copyCard(cardId: string) {
    setCtxMenu(null);
    await http.post(`/api/cards/${cardId}/acoes`, { action: "copy" });
    load();
  }

  async function archiveCard(cardId: string) {
    setCtxMenu(null);
    await http.post(`/api/cards/${cardId}/acoes`, { action: "archive" });
    if (openCardId === cardId) setOpenCardId(null);
    load();
  }

  const anyRunning = useMemo(
    () => board?.lists.some((l) => l.cards.some((c) => c.runningSince)) ?? false,
    [board],
  );
  const now = useNow(anyRunning);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // No toque, segurar 220 ms inicia o arrasto; antes disso o dedo rola a tela normalmente.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findListId = useCallback(
    (id: UniqueIdentifier): string | null => {
      if (!board) return null;
      if (board.lists.some((l) => l.id === id)) return String(id);
      const list = board.lists.find((l) => l.cards.some((c) => c.id === id));
      return list ? list.id : null;
    },
    [board],
  );

  const activeCard = useMemo(() => {
    if (!board || !activeId) return null;
    for (const l of board.lists) {
      const c = l.cards.find((x) => x.id === activeId);
      if (c) return c;
    }
    return null;
  }, [board, activeId]);

  const openCard = useMemo(() => {
    if (!board || !openCardId) return null;
    for (const l of board.lists) {
      const c = l.cards.find((x) => x.id === openCardId);
      if (c) return c;
    }
    return null;
  }, [board, openCardId]);

  function onDragStart(e: DragStartEvent) {
    setActiveId(e.active.id);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || !board) return;
    const from = findListId(active.id);
    const to = findListId(over.id);
    if (!from || !to || from === to) return;

    setBoard((prev) => {
      if (!prev) return prev;
      const fromList = prev.lists.find((l) => l.id === from)!;
      const toList = prev.lists.find((l) => l.id === to)!;
      const card = fromList.cards.find((c) => c.id === active.id);
      if (!card) return prev;

      const overIndex = toList.cards.findIndex((c) => c.id === over.id);
      let newIndex: number;
      if (overIndex === -1) {
        newIndex = toList.cards.length;
      } else {
        const isBelow =
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        newIndex = overIndex + (isBelow ? 1 : 0);
      }

      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id === from) return { ...l, cards: l.cards.filter((c) => c.id !== active.id) };
          if (l.id === to) {
            const cards = [...l.cards];
            cards.splice(newIndex, 0, { ...card, listId: to });
            return { ...l, cards };
          }
          return l;
        }),
      };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over || !board) return;
    const from = findListId(active.id);
    const to = findListId(over.id);
    if (!from || !to) return;

    let finalLists = board.lists;
    if (from === to) {
      const list = board.lists.find((l) => l.id === from)!;
      const oldIndex = list.cards.findIndex((c) => c.id === active.id);
      const newIndex = list.cards.findIndex((c) => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        finalLists = board.lists.map((l) =>
          l.id === from ? { ...l, cards: arrayMove(l.cards, oldIndex, newIndex) } : l,
        );
        setBoard({ ...board, lists: finalLists });
      }
    }

    const targetList = finalLists.find((l) => l.id === to)!;
    const toIndex = targetList.cards.findIndex((c) => c.id === active.id);
    if (toIndex === -1) return;

    try {
      await http.post("/api/cards/move", { cardId: active.id, toListId: to, toIndex });
    } finally {
      load();
    }
  }

  async function timer(card: CardDTO) {
    await http.post(`/api/cards/${card.id}/timer`, { action: card.runningSince ? "stop" : "start" });
    load();
  }

  async function addList(e: React.FormEvent) {
    e.preventDefault();
    const n = listName.trim();
    if (!n) return;
    await http.post("/api/lists", { boardId, name: n });
    setListName("");
    setAddingList(false);
    load();
  }

  async function saveBoardName() {
    setEditingName(false);
    const n = boardName.trim();
    if (!board || !n || n === board.name) {
      setBoardName(board?.name ?? "");
      return;
    }
    await http.patch(`/api/boards/${boardId}`, { name: n });
    load();
  }

  async function removeBoard() {
    if (!board) return;
    if (!(await askConfirm({ title: "Excluir quadro", message: `Excluir o quadro "${board.name}" com todas as listas e tarefas?`, confirmLabel: "Excluir", danger: true }))) return;
    await http.del(`/api/boards/${boardId}`);
    router.push("/quadros?lista=1");
  }

  if (error) {
    return (
      <div className="card p-6 text-sm text-red">
        {error} ·{" "}
        <Link href="/quadros?lista=1" className="underline">
          voltar aos quadros
        </Link>
      </div>
    );
  }
  if (!board) {
    return (
      <div className="flex animate-pulse gap-4">
        <div className="card h-72 w-[300px]" />
        <div className="card h-72 w-[300px]" />
        <div className="card h-72 w-[300px]" />
      </div>
    );
  }

  const openCount = board.lists.reduce((a, l) => a + l.cards.filter((c) => !c.completedAt).length, 0);
  const doneCount = board.lists.reduce((a, l) => a + l.cards.filter((c) => c.completedAt).length, 0);

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] flex-col md:h-[calc(100dvh-7.5rem)]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/quadros?lista=1" className="btn btn-ghost h-8 px-2" aria-label="Todos os quadros" title="Todos os quadros">
          <ArrowLeft size={16} />
        </Link>
        {editingName ? (
          <input
            autoFocus
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            onBlur={saveBoardName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveBoardName();
              if (e.key === "Escape") {
                setBoardName(board.name);
                setEditingName(false);
              }
            }}
            className="input h-9 w-72 text-lg font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="truncate text-xl font-semibold tracking-tight sm:text-2xl"
            title="Renomear quadro"
          >
            {board.name}
          </button>
        )}
        <span className="pill">{openCount} abertas</span>
        <span className="pill pill-green">{doneCount} feitas</span>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setAddingList(true)} className="btn">
            <Plus size={14} /> <span className="hidden sm:inline">Nova lista</span>
          </button>
          <div className="relative" ref={boardMenuRef}>
            <button
              type="button"
              onClick={() => setBoardMenu((m) => !m)}
              className="btn btn-ghost h-9 w-9 p-0"
              aria-label="Opções do quadro"
              title="Opções do quadro"
            >
              <MoreHorizontal size={16} />
            </button>
            {boardMenu && (
              <div className="absolute right-0 top-10 z-30 w-60 rounded-xl border border-line-2 bg-surface-3 p-1 text-sm shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setBoardMenu(false);
                    setImporting(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"
                >
                  <Sparkles size={14} className="text-blue" /> Trazer dados do Trello
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBoardMenu(false);
                    setEditingName(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"
                >
                  <Pencil size={14} className="text-ink-3" /> Renomear quadro
                </button>
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={() => {
                    setBoardMenu(false);
                    removeBoard();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-red hover:bg-white/[0.06]"
                >
                  <Trash2 size={14} /> Excluir quadro
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <DndContext
        id={`board-${boardId}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          load();
        }}
      >
        <div
          ref={scrollerRef}
          onMouseDown={onPanStart}
          onMouseMove={onPanMove}
          onMouseUp={onPanEnd}
          onMouseLeave={onPanEnd}
          className={`mx-[calc(50%_-_50vw)] flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-[calc(50vw_-_50%_+_1rem)] pb-4 sm:px-[calc(50vw_-_50%_+_1.5rem)] md:snap-none md:gap-4 ${
            panning ? "cursor-grabbing select-none" : "cursor-grab"
          }`}
        >
          {board.lists.map((list, i) => (
            <ListColumn
              key={list.id}
              list={list}
              lists={board.lists}
              index={i}
              count={board.lists.length}
              now={now}
              todayKey={today}
              onChanged={load}
              onOpenCard={(c) => setOpenCardId(c.id)}
              onTimer={timer}
              onCardContextMenu={(e, c) => setCtxMenu({ cardId: c.id, x: e.clientX, y: e.clientY })}
              lastUndo={board.lastUndo}
              onUndo={undo}
            />
          ))}

          {addingList ? (
            <form onSubmit={addList} data-no-pan className="card w-[86vw] max-w-[300px] shrink-0 snap-start space-y-2 p-3 md:w-[300px]">
              <input
                autoFocus
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAddingList(false);
                }}
                placeholder="Nome da lista"
                className="input"
              />
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary h-8 flex-1">
                  Criar lista
                </button>
                <button type="button" onClick={() => setAddingList(false)} className="btn btn-ghost h-8">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              data-no-pan
              onClick={() => setAddingList(true)}
              className="flex h-12 w-[86vw] max-w-[300px] shrink-0 snap-start items-center justify-center gap-2 rounded-card border border-dashed border-line text-sm text-ink-3 transition hover:border-line-2 hover:text-ink md:w-[300px]"
            >
              <Plus size={15} /> Nova lista
            </button>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="w-[276px]">
              <CardBody card={activeCard} now={now} todayKey={today} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ImportModal boardId={boardId} open={importing} onClose={() => setImporting(false)} onImported={load} />

      <CardContextMenu
        state={ctxMenu}
        onClose={closeCtxMenu}
        onOpen={(id) => {
          setCtxMenu(null);
          setOpenCardId(id);
        }}
        onCopy={copyCard}
        onArchive={archiveCard}
      />

      {openCard && (
        <CardModal
          key={openCard.id}
          card={openCard}
          lists={board.lists}
          onCopy={() => copyCard(openCard.id)}
          onArchive={() => archiveCard(openCard.id)}
          onClose={() => {
            setOpenCardId(null);
            if (window.location.search.includes("card=")) {
              window.history.replaceState(null, "", window.location.pathname);
            }
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
