"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Star } from "lucide-react";
import { http } from "@/lib/client";
import { notify } from "@/components/ui/ConfirmProvider";
import type { BoardType } from "@/lib/types";

type FavoriteBoard = { id: string; name: string; type: BoardType; symbol: string | null };
const FavoriteContext = createContext<{
  boards: FavoriteBoard[]; ready: boolean; busy: boolean; toggle: (id: string) => Promise<void>;
}>({ boards: [], ready: false, busy: false, toggle: async () => {} });
export const useFavoriteBoards = () => useContext(FavoriteContext);

export function FavoriteBoardsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [boards, setBoards] = useState<FavoriteBoard[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    if (pathname === "/login") return;
    let active = true;
    const request = ++revision.current;
    http.get<FavoriteBoard[]>("/api/boards/favoritos").then((value) => {
      if (active && request === revision.current) { setBoards(value); setReady(true); }
    }).catch(() => {});
    return () => { active = false; };
  }, [pathname]);

  async function toggle(id: string) {
    if (!ready || saving.current) return;
    const selected = boards.some((board) => board.id === id);
    if (!selected && boards.length >= 3) {
      notify("Você pode favoritar até três quadros. Remova um favorito para adicionar outro.");
      return;
    }
    saving.current = true;
    setBusy(true);
    revision.current++;
    try {
      const ids = selected ? boards.filter((board) => board.id !== id).map((board) => board.id) : [...boards.map((board) => board.id), id];
      setBoards(await http.put<FavoriteBoard[]>("/api/boards/favoritos", { ids }));
    } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível atualizar os favoritos."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <FavoriteContext.Provider value={{ boards, ready, busy, toggle }}>{children}</FavoriteContext.Provider>;
}

export function FavoriteBoardButton({ boardId }: { boardId: string }) {
  const { boards, ready, busy, toggle } = useFavoriteBoards();
  const selected = boards.some((board) => board.id === boardId);
  const label = selected ? "Remover quadro dos favoritos" : "Favoritar quadro";
  return <button type="button" className={`btn btn-ghost h-9 w-9 shrink-0 p-0 ${selected ? "text-orange" : "text-ink-3"}`}
    title={label} aria-label={label} aria-pressed={selected} disabled={!ready || busy}
    onClick={() => void toggle(boardId)}>
    <Star size={17} fill={selected ? "currentColor" : "none"} />
  </button>;
}
