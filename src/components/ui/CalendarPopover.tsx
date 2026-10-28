"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, addMonths, startOfMonth } from "date-fns";
import { dayKey, keyToDate, todayKey } from "@/lib/time";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Grade de calendário no estilo do app (um mês por vez). `value`, `min` e `max`
 * são chaves yyyy-MM-dd; dias fora de [min, max] ficam desativados.
 */
export function CalendarPopover({
  value,
  min,
  max,
  onPick,
  footer,
  className = "",
  rangeStart,
  rangeEnd,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (key: string) => void;
  footer?: React.ReactNode;
  className?: string;
  /** Intervalo em seleção/selecionado: dias entre início e fim ficam tingidos. */
  rangeStart?: string;
  rangeEnd?: string;
}) {
  const today = todayKey();
  const [month, setMonth] = useState(() => startOfMonth(keyToDate(value || today)));
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthPrefix = dayKey(first).slice(0, 7);
  const prevMonthOk = !min || dayKey(addDays(first, -1)) >= min.slice(0, 7) + "-01";
  const nextMonthOk = !max || dayKey(addMonths(first, 1)).slice(0, 7) <= max.slice(0, 7);

  return (
    <div className={`w-[290px] rounded-2xl border border-line-2 bg-surface-3 p-3 shadow-2xl ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} disabled={!prevMonthOk} className="btn btn-ghost h-8 w-8 p-0 disabled:opacity-30" aria-label="Mês anterior">
          <ChevronLeft size={15} />
        </button>
        <div className="text-sm font-semibold capitalize">
          {MONTHS[first.getMonth()]} <span className="text-ink-3">{first.getFullYear()}</span>
        </div>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={!nextMonthOk} className="btn btn-ghost h-8 w-8 p-0 disabled:opacity-30" aria-label="Mês seguinte">
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
          const inMonth = key.slice(0, 7) === monthPrefix;
          const disabled = (min !== undefined && key < min) || (max !== undefined && key > max);
          const selected = key === value || key === rangeStart || key === rangeEnd;
          const isToday = key === today;
          const inRange =
            !!rangeStart && !!rangeEnd && key > (rangeStart < rangeEnd ? rangeStart : rangeEnd) && key < (rangeStart < rangeEnd ? rangeEnd : rangeStart);
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(key)}
              className={`relative flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition ${
                selected
                  ? "bg-ink font-semibold text-on-ink"
                  : inRange
                    ? "bg-blue/20 text-ink"
                    : disabled
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
      {footer && <div className="mt-2 flex items-center justify-between border-t border-line pt-2">{footer}</div>}
    </div>
  );
}
