"use client";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import { RotateCcw, Search, Trash2 } from "lucide-react";
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

  const filtered = useMemo(() => {
    if (!cards) return null;
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      [c.title, c.description, c.boardName, c.listName].some((v) => v.toLowerCase().includes(q)),
    );
  }, [cards, query]);

  const groups = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, ArchivedCard[]>();
    for (const c of filtered) {
      const key = dayKey(new Date(c.completedAt ?? c.archivedAt ?? c.createdAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  async function removeAll() {
    if (!cards || cards.length === 0) return;
    const ok = await askConfirm({
      title: "Excluir tudo",
      message: `Excluir definitivamente as ${cards.length} tarefas arquivadas?\n\nElas deixam de contar no histórico e nas notas dos dias anteriores. Não dá para desfazer.`,
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
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar tarefa, quadro ou lista"
              className="input w-64 pl-9"
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
        groups.map(([key, items]) => (
          <section key={key} className="card p-5">
            <h2 className="mb-3 text-sm font-medium text-ink-2">
              {key === "sem-data" ? "Sem data" : formatDayLong(key)}{" "}
              <span className="text-ink-3">· {items.length}</span>
            </h2>
            <ul className="space-y-1.5">
              {items.map((c) => {
                const p = priorityUi(c.priority);
                return (
                  <li
                    key={c.id}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-2"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm">
                        {c.title}
                        {!c.completedAt && <span className="pill px-1.5 py-0 text-[10px]">não concluída</span>}
                      </div>
                      <div className="text-[11px] text-ink-3">
                        <Link href={`/quadros/${c.boardId}`} className="hover:text-ink">
                          {c.boardName}
                        </Link>{" "}
                        · {c.listName}
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
                      className="btn h-8 px-2.5 text-xs md:opacity-0 md:group-hover:opacity-100"
                      title="Reabrir tarefa"
                    >
                      <RotateCcw size={13} /> Reabrir
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="btn btn-ghost h-8 w-8 p-0 text-ink-3 md:opacity-0 hover:text-red md:group-hover:opacity-100"
                      aria-label="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
