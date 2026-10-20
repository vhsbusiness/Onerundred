"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addDays, addMonths, startOfMonth } from "date-fns";
import { dayKey, keyToDate, todayKey } from "@/lib/time";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Escolha do dia no dashboard: setas para o dia anterior/seguinte e um calendário
 * próprio (no estilo do app). Hoje é a rota "/"; outros dias, "/?dia=yyyy-MM-dd".
 */
export function DayPicker({ value }: { value: string }) {
  const router = useRouter();
  const today = todayKey();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(keyToDate(value)));
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

  // Grade do mês: começa no domingo da semana do dia 1 e vai até fechar 6 linhas.
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthKeyPrefix = dayKey(first).slice(0, 7);
  const canGoNextMonth = dayKey(first).slice(0, 7) < today.slice(0, 7);

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button type="button" onClick={() => go(prev)} className="btn btn-ghost h-9 w-9 p-0" aria-label="Dia anterior" title="Dia anterior">
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => {
          setMonth(startOfMonth(keyToDate(value)));
          setOpen((o) => !o);
        }}
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
        <div className="absolute right-0 top-11 z-40 w-[290px] rounded-2xl border border-line-2 bg-surface-3 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} className="btn btn-ghost h-8 w-8 p-0" aria-label="Mês anterior">
              <ChevronLeft size={15} />
            </button>
            <div className="text-sm font-semibold capitalize">
              {MONTHS[first.getMonth()]} <span className="text-ink-3">{first.getFullYear()}</span>
            </div>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              disabled={!canGoNextMonth}
              className="btn btn-ghost h-8 w-8 p-0 disabled:opacity-30"
              aria-label="Mês seguinte"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-3">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const key = dayKey(d);
              const inMonth = key.slice(0, 7) === monthKeyPrefix;
              const future = key > today;
              const selected = key === value;
              const isToday = key === today;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={future}
                  onClick={() => go(key)}
                  className={`relative flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition ${
                    selected
                      ? "bg-ink font-semibold text-on-ink"
                      : future
                        ? "cursor-not-allowed text-ink-3/40"
                        : inMonth
                          ? "text-ink hover:bg-fill-3"
                          : "text-ink-3 hover:bg-fill-2"
                  }`}
                  aria-label={key}
                  aria-pressed={selected}
                >
                  {d.getDate()}
                  {isToday && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-orange" />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="text-[11px] text-ink-3">Dias futuros ficam desativados</span>
            <button type="button" onClick={() => go(today)} className="btn btn-ghost h-7 px-2 text-xs text-orange">
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
