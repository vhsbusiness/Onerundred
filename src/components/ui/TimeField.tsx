"use client";

import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));

/**
 * Campo de horário (HH:MM) com seletor no visual do app, no lugar do
 * <input type="time"> nativo. Dá para digitar direto ou escolher nas colunas.
 */
export function TimeField({
  value,
  onChange,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Rascunho enquanto o usuário digita; null = mostra o valor atual.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const ref = useRef<HTMLDivElement>(null);
  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    // Rola as colunas até o valor atual.
    const [h, m] = value.split(":");
    hourCol.current?.querySelector<HTMLElement>(`[data-v="${h}"]`)?.scrollIntoView({ block: "center" });
    minCol.current?.querySelector<HTMLElement>(`[data-v="${m}"]`)?.scrollIntoView({ block: "center" });
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, value]);

  function commitText() {
    if (draft === null) return;
    const m = /^(\d{1,2})[:h]?(\d{2})?$/.exec(draft.trim());
    setDraft(null);
    if (!m) return;
    const h = Math.min(23, Number(m[1]));
    const min = Math.min(59, Number(m[2] ?? 0));
    onChange(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
  }

  const [curH, curM] = value.split(":");
  const col = "max-h-44 w-14 overflow-y-auto overscroll-contain py-1 [scrollbar-width:none]";
  const item = (active: boolean) =>
    `block w-full rounded-lg px-2 py-1.5 text-center text-sm tabular-nums transition ${
      active ? "bg-ink text-bg font-semibold" : "text-ink-2 hover:bg-fill-3 hover:text-ink"
    }`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="relative">
        <input
          value={text}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d:h]/g, "").slice(0, 5))}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitText();
              setOpen(false);
            }
          }}
          onFocus={() => setOpen(true)}
          inputMode="numeric"
          placeholder="HH:MM"
          aria-label={ariaLabel}
          className="input pr-9 tabular-nums"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
          aria-label="Escolher horário"
          tabIndex={-1}
        >
          <Clock size={15} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 flex gap-1 rounded-xl border border-line-2 bg-surface-3 p-1.5 shadow-2xl">
          <div ref={hourCol} className={col}>
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                data-v={h}
                onClick={() => onChange(`${h}:${curM ?? "00"}`)}
                className={item(h === curH)}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="my-2 w-px bg-line" />
          <div ref={minCol} className={col}>
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                data-v={m}
                onClick={() => {
                  onChange(`${curH ?? "00"}:${m}`);
                  setOpen(false);
                }}
                className={item(m === curM)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
