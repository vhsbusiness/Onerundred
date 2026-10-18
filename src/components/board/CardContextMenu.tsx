"use client";

import { Archive, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

export interface ContextMenuState {
  cardId: string;
  x: number;
  y: number;
}

/** Menu do botão direito da tarefa: abrir, copiar, arquivar. */
export function CardContextMenu({
  state,
  onClose,
  onOpen,
  onCopy,
  onArchive,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
  onOpen: (cardId: string) => void;
  onCopy: (cardId: string) => void;
  onArchive: (cardId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  // Mantém o menu dentro da janela.
  const width = 200;
  const height = 130;
  const left = Math.min(state.x, window.innerWidth - width - 8);
  const top = Math.min(state.y, window.innerHeight - height - 8);
  const item = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-white/[0.06]";

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[200px] rounded-xl border border-line-2 bg-surface-3 p-1 shadow-2xl"
      style={{ left, top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" className={item} onClick={() => onOpen(state.cardId)}>
        <ExternalLink size={14} className="text-ink-3" /> Abrir tarefa
      </button>
      <button type="button" className={item} onClick={() => onCopy(state.cardId)}>
        <Copy size={14} className="text-ink-3" /> Copiar tarefa
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={item} onClick={() => onArchive(state.cardId)}>
        <Archive size={14} className="text-ink-3" /> Arquivar
      </button>
    </div>
  );
}
