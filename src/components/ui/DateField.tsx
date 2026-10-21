"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { keyToDate, todayKey } from "@/lib/time";
import { CalendarPopover } from "./CalendarPopover";

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function label(key: string) {
  if (!key) return "Escolher dia";
  const today = todayKey();
  const d = keyToDate(key);
  const ddmm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
  if (key === today) return `Hoje · ${ddmm}`;
  return `${WEEK[d.getDay()]}, ${ddmm}`;
}

/**
 * Campo de data no padrão do app: botão com o dia escolhido e o calendário próprio
 * (CalendarPopover) ao clicar. Substitui o <input type="date"> nativo.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  className = "",
  ariaLabel = "Dia",
}: {
  value: string;
  onChange: (key: string) => void;
  min?: string;
  max?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = todayKey();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    // capture: fecha o calendário antes de o modal por trás reagir ao Esc.
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const todayAllowed = (!min || today >= min) && (!max || today <= max);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center gap-2 text-left ${open ? "border-line-3" : ""}`}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <CalendarDays size={15} className="shrink-0 text-blue" />
        <span className={`truncate ${value ? "" : "text-ink-3"}`}>{label(value)}</span>
      </button>
      {open && (
        <CalendarPopover
          key={value}
          value={value}
          min={min}
          max={max}
          onPick={(k) => {
            onChange(k);
            setOpen(false);
          }}
          className="absolute left-0 top-full z-50 mt-1"
          footer={
            <>
              <span className="text-[11px] text-ink-3">{min && max ? "Dias fora do período ficam desativados" : max ? "Dias futuros ficam desativados" : min ? "Dias passados ficam desativados" : ""}</span>
              <button
                type="button"
                disabled={!todayAllowed}
                onClick={() => {
                  onChange(today);
                  setOpen(false);
                }}
                className="btn btn-ghost h-7 px-2 text-xs text-orange disabled:opacity-30"
              >
                Hoje
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
