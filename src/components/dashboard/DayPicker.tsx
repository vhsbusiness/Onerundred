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
const PERIODS = [
  { n: 1, label: "Dia" },
  { n: 3, label: "3 dias" },
  { n: 7, label: "7 dias" },
  { n: 14, label: "14 dias" },
  { n: 30, label: "30 dias" },
];

export function DayPicker({ value, days = 1 }: { value: string; days?: number }) {
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

  function go(key: string, n: number = days) {
    setOpen(false);
    const params = new URLSearchParams();
    if (key !== today) params.set("dia", key);
    if (n > 1) params.set("dias", String(n));
    const q = params.toString();
    router.push(q ? `/?${q}` : "/");
  }
  const prev = dayKey(addDays(keyToDate(value), -1));
  const next = dayKey(addDays(keyToDate(value), 1));

  return (
    <div className="relative flex flex-wrap items-center gap-1" ref={ref}>
      {/* Período: um dia ou vários dias terminando no dia escolhido. */}
      <div className="mr-1 flex items-center rounded-full border border-line bg-fill p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.n}
            type="button"
            onClick={() => go(value, p.n)}
            className={`rounded-full px-2 py-1 text-[11px] transition ${days === p.n ? "bg-fill-3 text-ink" : "text-ink-3 hover:text-ink"}`}
            title={p.n === 1 ? "Só o dia escolhido" : `Os ${p.n} dias até o dia escolhido`}
          >
            {p.label}
          </button>
        ))}
      </div>
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
