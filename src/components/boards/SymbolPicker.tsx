"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { boardSymbols } from "@/lib/board-icons";
import { BoardIcon } from "./BoardIcon";

const choices = [["", "Do tipo"], ...Object.entries(boardSymbols)];
export function SymbolPicker({ type, value, change }: {
  type: string; value?: string | null; change: (value: string) => void;
}) {
  const [offset, setOffset] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (offset === null) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOffset(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [offset]);
  function close() {
    setOffset(null);
    trigger.current?.focus();
  }
  return <div ref={root} className="relative" onKeyDown={e => { if (e.key === "Escape" && offset !== null) { e.stopPropagation(); close(); } }}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOffset(null); }}>
    <button ref={trigger} type="button" aria-label="Ícone do quadro" title="Escolher ícone do quadro" aria-expanded={offset !== null}
      className="btn h-full gap-2" onClick={() => {
        const rect = root.current!.getBoundingClientRect();
        setOffset(offset === null ? Math.max(8 - rect.left, Math.min(0, innerWidth - rect.left - 232 - 8)) : null);
      }}>
      <BoardIcon type={type} symbol={value} size={22} /><span className="text-xs">Ícone</span><ChevronDown size={12} />
    </button>
    {offset !== null && <div role="group" aria-label="Escolher símbolo" className="absolute top-full z-40 mt-2 grid w-[232px] grid-cols-3 gap-1 rounded-xl border border-line-2 bg-surface p-2 shadow-lg" style={{ left: offset }}>
      {choices.map(([id, name]) => <button key={id} type="button" aria-pressed={(value || "") === id}
        className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-2 text-[11px] text-ink-2 hover:bg-fill-2 aria-pressed:border-line-2 aria-pressed:bg-fill-2"
        onClick={() => { change(id); close(); }}><BoardIcon type={type} symbol={id} size={26} />{name}</button>)}
    </div>}
  </div>;
}
