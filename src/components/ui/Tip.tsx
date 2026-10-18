"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Balão de explicação no estilo do app. Abre ao passar o mouse ou focar;
 * no toque, um tap abre e outro fecha.
 */
export function Tip({ text, children, className = "" }: { text: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const enabled = text.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative block ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      tabIndex={enabled ? 0 : -1}
    >
      {children}
      {open && enabled && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-40 mt-2 w-64 max-w-[80vw] rounded-xl border border-line-2 bg-surface-3 px-3 py-2 text-xs font-normal leading-relaxed text-ink-2 shadow-2xl"
        >
          <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-line-2 bg-surface-3" />
          {text}
        </span>
      )}
    </span>
  );
}
