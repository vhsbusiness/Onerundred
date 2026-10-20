"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { addDays } from "date-fns";
import { dayKey, keyToDate, todayKey } from "@/lib/time";

/**
 * Escolha do dia no dashboard: setas para o dia anterior/seguinte e um calendário.
 * Hoje é a rota "/"; outros dias ficam em "/?dia=yyyy-MM-dd".
 */
export function DayPicker({ value }: { value: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  function go(key: string) {
    router.push(key === today ? "/" : `/?dia=${key}`);
  }
  const prev = dayKey(addDays(keyToDate(value), -1));
  const next = dayKey(addDays(keyToDate(value), 1));

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => go(prev)} className="btn btn-ghost h-9 w-9 p-0" aria-label="Dia anterior" title="Dia anterior">
        <ChevronLeft size={16} />
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            const el = inputRef.current;
            if (!el) return;
            if (typeof el.showPicker === "function") el.showPicker();
            else el.click();
          }}
          className="btn h-9 px-3 text-xs"
          title="Escolher um dia"
        >
          <CalendarDays size={14} /> {value === today ? "Hoje" : keyToDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </button>
        <input
          ref={inputRef}
          type="date"
          value={value}
          max={today}
          onChange={(e) => {
            if (e.target.value && e.target.value <= today) go(e.target.value);
          }}
          className="absolute inset-0 h-full w-full opacity-0"
          style={{ pointerEvents: "none" }}
          tabIndex={-1}
          aria-hidden
        />
      </div>
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
    </div>
  );
}
