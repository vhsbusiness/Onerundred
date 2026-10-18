"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPercent, http, TONE_PILL } from "@/lib/client";
import { scoreTone } from "@/lib/metrics";
import type { BoardSummary } from "@/lib/types";

const BLOBS = [
  ["rgba(245,176,110,0.6)", "rgba(127,183,245,0.55)"],
  ["rgba(139,227,166,0.55)", "rgba(245,176,110,0.5)"],
  ["rgba(127,183,245,0.6)", "rgba(139,227,166,0.5)"],
];

export function BoardsGrid() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setBoards(await http.get<BoardSummary[]>("/api/boards"));
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    try {
      await http.post("/api/boards", { name: n });
      setName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quadros</h1>
          <p className="text-sm text-ink-2">Organize suas tarefas em listas, como no Trello.</p>
        </div>
        <form onSubmit={create} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do novo quadro"
            className="input w-56"
          />
          <button type="submit" disabled={creating || !name.trim()} className="btn btn-primary">
            <Plus size={14} /> Criar
          </button>
        </form>
      </div>

      {!boards ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card h-40" />
          <div className="card h-40" />
          <div className="card h-40" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b, i) => {
            const [a, c] = BLOBS[i % BLOBS.length];
            const tone = scoreTone(b.todayScore);
            return (
              <Link
                key={b.id}
                href={`/quadros/${b.id}`}
                className="card blob-surface group flex min-h-40 flex-col p-5 transition hover:border-line-2"
                style={{ "--blob-a": a, "--blob-b": c } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{b.name}</h2>
                  <ArrowUpRight size={18} className="text-ink-3 transition group-hover:text-ink" />
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
                  <span className={TONE_PILL[tone]}>hoje {formatPercent(b.todayScore)}</span>
                  <span className="pill">{b.openCount} abertas</span>
                  <span className="pill">{b.doneTodayCount} feitas hoje</span>
                  <span className="pill">{b.listCount} listas</span>
                  {b.sharedBy ? <span className="pill pill-green">compartilhado por @{b.sharedBy}</span> : b.memberCount > 0 ? <span className="pill pill-green">{b.memberCount + 1} participantes</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
