"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addDays } from "date-fns";
import { dayKey, keyToDate, todayKey } from "@/lib/time";
import { CalendarPopover } from "@/components/ui/CalendarPopover";

/**
 * Escolha do dia no dashboard: setas para o dia anterior/seguinte e o calendário
 * do app. Hoje é a rota "/"; outros dias, "/?dia=yyyy-MM-dd".
 */
export function DayPicker({ value }: { value: string }) {
  const router = useRouter();
  const today = todayKey();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(key: string) {
    setOpen(false);
    router.push(key === today ? "/" : `/?dia=${key}`);
  }
  const prev = dayKey(addDays(keyToDate(value), -1));
  const next = dayKey(addDays(keyToDate(value), 1));

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button type="button" onClick={() => go(prev)} className="btn btn-ghost h-9 w-9 p-0" aria-label="Dia anterior" title="Dia anterior">
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`btn h-9 px-3 text-xs ${open ? "bg-fill-3" : ""}`}
        title="Escolher um dia"
        aria-expanded={open}
      >
        <CalendarDays size={14} className="text-blue" />
        {value === today ? "Hoje" : keyToDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
      </button>
      <button
        type="button"
        onClick={() => go(next)}
        disabled={value >= today}
        className="btn btn-ghost h-9 w-9 p-0 disabled:opacity-30"
        aria-label="Dia seguinte"
        title="Dia seguinte"
      >
        <ChevronRight size={16} />
      </button>

      {open && (
        <CalendarPopover
          key={value}
          value={value}
          max={today}
          onPick={go}
          className="absolute right-0 top-11 z-40"
          footer={
            <>
              <span className="text-[11px] text-ink-3">Dias futuros ficam desativados</span>
              <button type="button" onClick={() => go(today)} className="btn btn-ghost h-7 px-2 text-xs text-orange">
                Hoje
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
