"use client";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import { PanelsTopLeft, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { http, priorityUi } from "@/lib/client";
import { dayKey, formatDayLong, formatDuration } from "@/lib/time";
import type { ArchivedCard } from "@/lib/types";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ArchiveList() {
  const [cards, setCards] = useState<ArchivedCard[] | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setCards(await http.get<ArchivedCard[]>("/api/arquivadas"));
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const [boardFilter, setBoardFilter] = useState("");
  const boards = useMemo(() => {
    const byId = new Map((cards ?? []).map(c => [c.origin.id, c.origin]));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
  }, [cards]);
  const selectedBoard = boards.some(b => b.id === boardFilter) ? boardFilter : "";

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const byBoard = new Map<string, { days: Map<string, ArchivedCard[]>; count: number }>();
    for (const card of cards ?? []) {
      if (selectedBoard && selectedBoard !== card.origin.id) continue;
      if (q && ![card.title, card.description, card.origin.name, card.boardName, card.listName]
        .some(text => text.toLocaleLowerCase("pt-BR").includes(q))) continue;
      const group = byBoard.get(card.origin.id) ?? { days: new Map<string, ArchivedCard[]>(), count: 0 };
      const day = dayKey(new Date(card.completedAt ?? card.archivedAt ?? card.createdAt));
      const items = group.days.get(day) ?? [];
      items.push(card);
      group.days.set(day, items);
      group.count++;
      byBoard.set(card.origin.id, group);
    }
    return boards.flatMap(board => {
      const group = byBoard.get(board.id);
      return group ? [{ board, count: group.count, days: [...group.days].sort(([a], [b]) => b.localeCompare(a)) }] : [];
    });
  }, [boards, cards, query, selectedBoard]);

  async function removeAll() {
    if (!cards || cards.length === 0) return;
    const ok = await askConfirm({
      title: "Excluir tudo",
      message: `Excluir definitivamente as ${cards.length} tarefas arquivadas de todos os quadros?\n\nElas deixam de contar no histórico e nas notas dos dias anteriores. Não dá para desfazer.`,
      confirmLabel: "Excluir tudo",
      danger: true,
    });
    if (!ok) return;
    await http.del("/api/arquivadas");
    load();
  }

  async function reopen(c: ArchivedCard) {
    await http.patch(`/api/cards/${c.id}`, { completed: false });
    load();
  }

  async function remove(c: ArchivedCard) {
    if (!(await askConfirm({ title: "Excluir tarefa", message: `Excluir definitivamente "${c.title}"?`, confirmLabel: "Excluir", danger: true }))) return;
    await http.del(`/api/cards/${c.id}`);
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Arquivadas</h1>
          <p className="text-sm text-ink-2">
            Tarefas concluídas são arquivadas automaticamente no dia seguinte. Elas continuam contando nas
            métricas.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {boards.length > 1 && (
            <select aria-label="Filtrar por quadro de origem" className="input w-full sm:w-44" value={selectedBoard} onChange={e => setBoardFilter(e.target.value)}>
              <option value="">Todos os quadros</option>
              {boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}
            </select>
          )}
          <label className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar tarefa, quadro ou lista"
              aria-label="Pesquisar tarefas arquivadas"
              className="input w-full pl-9 sm:w-64"
            />
          </label>
          <button
            type="button"
            onClick={removeAll}
            disabled={!cards || cards.length === 0}
            className="btn text-red hover:text-red disabled:opacity-40"
          >
            <Trash2 size={14} /> Excluir tudo
          </button>
        </div>
      </div>

      {!cards ? (
        <div className="card h-40 animate-pulse" />
      ) : cards.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-3">Nada arquivado ainda.</div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-3">Nenhuma tarefa arquivada combina com “{query}”.</div>
      ) : (
        groups.map(({ board, days, count }) => (
          <section key={board.id} aria-labelledby={`archive-${board.id}`} className="card space-y-5 p-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <PanelsTopLeft size={17} aria-hidden className="shrink-0 text-ink-2" />
              <h2 id={`archive-${board.id}`} className="min-w-0 break-words font-semibold">
                <Link href={`/quadros/${board.id}`} className="hover:underline">{board.name}</Link>
              </h2>
              <span className="pill shrink-0">{count} {count === 1 ? "tarefa" : "tarefas"}</span>
            </div>
            {days.map(([key, items]) => (
              <div key={key}>
                <h3 className="mb-2 text-sm font-medium text-ink-2">
                  {formatDayLong(key)} <span className="text-ink-3">· {items.length}</span>
                </h3>
                <ul className="space-y-1.5">
                  {items.map((c) => {
                    const p = priorityUi(c.priority);
                    return (
                      <li
                        key={c.id}
                        className="group flex items-center gap-3 rounded-xl border border-line bg-well px-3 py-2"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{c.title}</span>
                            {!c.completedAt && <span className="pill px-1.5 py-0 text-[10px]">não concluída</span>}
                          </div>
                          <div className="text-[11px] text-ink-3">
                            {c.boardId !== board.id && (
                              <><Link href={`/quadros/${c.boardId}`} className="hover:underline">{c.boardName}</Link> · </>
                            )}
                            {c.listName}
                            {c.spentMs > 0 ? ` · ${formatDuration(c.spentMs)}` : ""}
                            {c.estimatedMinutes ? ` · est. ${formatDuration(c.estimatedMinutes * 60000)}` : ""}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3 tabular-nums">
                            <span>criada {fmtDateTime(c.createdAt)}</span>
                            {c.completedAt ? <span className="text-green">concluída {fmtDateTime(c.completedAt)}</span> : null}
                            {c.archivedAt ? <span>arquivada {fmtDateTime(c.archivedAt)}</span> : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => reopen(c)}
                          className="btn h-8 px-2.5 text-xs md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                          title="Reabrir tarefa"
                        >
                          <RotateCcw size={13} /><span className="sr-only sm:not-sr-only">Reabrir</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          className="btn btn-ghost h-8 w-8 p-0 text-ink-3 md:opacity-0 hover:text-red md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                          aria-label="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
