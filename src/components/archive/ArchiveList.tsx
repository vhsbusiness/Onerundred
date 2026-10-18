"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { http, priorityUi } from "@/lib/client";
import { dayKey, formatDayLong, formatDuration } from "@/lib/time";
import type { ArchivedCard } from "@/lib/types";

export function ArchiveList() {
  const [cards, setCards] = useState<ArchivedCard[] | null>(null);

  const load = useCallback(async () => {
    setCards(await http.get<ArchivedCard[]>("/api/arquivadas"));
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!cards) return [];
    const map = new Map<string, ArchivedCard[]>();
    for (const c of cards) {
      const key = c.completedAt ? dayKey(new Date(c.completedAt)) : "sem-data";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [cards]);

  async function reopen(c: ArchivedCard) {
    await http.patch(`/api/cards/${c.id}`, { completed: false });
    load();
  }

  async function remove(c: ArchivedCard) {
    if (!confirm(`Excluir definitivamente "${c.title}"?`)) return;
    await http.del(`/api/cards/${c.id}`);
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Arquivadas</h1>
        <p className="text-sm text-ink-2">
          Tarefas concluídas são arquivadas automaticamente no dia seguinte. Elas continuam contando nas
          métricas.
        </p>
      </div>

      {!cards ? (
        <div className="card h-40 animate-pulse" />
      ) : cards.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-3">Nada arquivado ainda.</div>
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
                      <div className="truncate text-sm">{c.title}</div>
                      <div className="text-[11px] text-ink-3">
                        <Link href={`/quadros/${c.boardId}`} className="hover:text-ink">
                          {c.boardName}
                        </Link>{" "}
                        · {c.listName}
                        {c.spentMs > 0 ? ` · ${formatDuration(c.spentMs)}` : ""}
                        {c.estimatedMinutes ? ` · est. ${formatDuration(c.estimatedMinutes * 60000)}` : ""}
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
