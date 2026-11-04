"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Highlighter, Type, RotateCcw, Palette, X } from "lucide-react";
import type { MindNodeDTO } from "@/lib/types";

export type ColorField = "color" | "textColor" | "highlight";
export type ColorHandler = (field: ColorField, value: string) => void;
const palette: Record<string, string> = { orange: "#f5b06e", blue: "#7fb7f5", green: "#8be3a6", red: "#f08a8a" };
const presets = [
  ["Preto", "#17181c"], ["Cinza", "#6b7280"], ["Branco", "#ffffff"],
  ["Vermelho", "#f08a8a"], ["Laranja", "#f5b06e"], ["Amarelo", "#f9df96"],
  ["Verde", "#8be3a6"], ["Azul", "#7fb7f5"], ["Roxo", "#b9a0f5"],
  ["Rosa", "#ef9ec5"], ["Verde escuro", "#2a9a5c"], ["Azul escuro", "#2f74c4"],
];
const labels = { color: "Cor do ramo", textColor: "Cor do texto", highlight: "Marca-texto" };

type OpenPalette = { host: HTMLElement; left: number; top: number };
function ColorInput({ field, value, preview, commit, label }: {
  field: ColorField; value: string; preview: ColorHandler; commit: ColorHandler; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [open, setOpen] = useState<OpenPalette | null>(null);
  const swatch = palette[value] || value;
  const defaultValue = field === "highlight" ? "#f9df96" : "#30343a";
  const title = label ?? labels[field];
  function finish(element: HTMLInputElement) {
    if (!pending.current && element.value === swatch) return;
    pending.current = false;
    commit(field, element.value);
  }
  function close(focus = false) {
    if (pending.current && input.current) finish(input.current);
    setOpen(null);
    if (focus) trigger.current?.focus({ preventScroll: true });
  }
  const confirmed = useEffectEvent((element: HTMLInputElement) => finish(element));
  const outside = useEffectEvent((event: Event) => {
    if (panel.current?.contains(event.target as Node) || trigger.current?.contains(event.target as Node)) return;
    close();
  });
  useEffect(() => {
    if (!open) return;
    const element = input.current!;
    // Continuous native changes preview; confirmation/blur saves once.
    const changed = () => confirmed(element);
    const dismiss = (event: Event) => outside(event);
    element.addEventListener("change", changed);
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", dismiss);
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    return () => {
      element.removeEventListener("change", changed);
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);
  function toggle() {
    if (open) { close(); return; }
    const button = trigger.current, host = button?.closest<HTMLElement>(".mind-map");
    if (!button || !host) return;
    const a = button.getBoundingClientRect(), b = host.getBoundingClientRect();
    const height = 226, width = 248;
    const left = Math.max(8, Math.min(a.left - b.left, b.width - width - 8));
    const below = a.bottom - b.top + 8;
    const top = below + height <= b.height - 8 ? below : Math.max(8, a.top - b.top - height - 8);
    setOpen({ host, left, top });
  }
  function choose(color: string) {
    pending.current = false;
    commit(field, color);
    setOpen(null);
    trigger.current?.focus({ preventScroll: true });
  }
  return <>
    <button ref={trigger} type="button" title={title} aria-label={title} aria-haspopup="dialog" aria-expanded={!!open} className="mind-tool" onClick={toggle}>
      {field === "color" ? <span className="size-4 rounded-full" style={{ background: swatch }} />
        : field === "textColor" ? <Type size={16} style={{ borderBottom: "2px solid " + (swatch || "currentColor") }} />
        : <Highlighter size={16} style={{ borderBottom: "2px solid " + (swatch || "transparent") }} />}
    </button>
    {open && createPortal(<div ref={panel} role="dialog" aria-label={title} className="mind-tools mind-color-popover" style={{ left: open.left, top: open.top }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); close(true); }
      }}>
      <div className="flex items-center justify-between gap-2 text-xs"><span>{title}</span><button type="button" aria-label="Fechar cores" className="mind-tool !w-auto !min-h-6" onClick={() => close(true)}><X size={14} /></button></div>
      <div className="mind-color-grid" role="group" aria-label="Cores prontas">
        {presets.map(([name, color]) => <button type="button" className="mind-color-swatch" key={color} aria-label={name} title={name} aria-pressed={swatch.toLowerCase() === color} onClick={() => choose(color)}><span style={{ backgroundColor: color }} /></button>)}
      </div>
      <button type="button" className="mind-tool" onClick={() => choose(field === "color" ? "blue" : "")}><RotateCcw size={14} />{field === "highlight" ? "Sem marca-texto" : "Cor padrão"}</button>
      <label className="mind-tool relative"><Palette size={14} />Cor personalizada
        <input ref={input} type="color" aria-label={`Personalizar ${title.toLowerCase()}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={swatch || defaultValue} onPointerDown={e => e.currentTarget.focus({ preventScroll: true })}
          onInput={e => { pending.current = true; preview(field, e.currentTarget.value); }}
          onBlur={e => { if (pending.current) finish(e.currentTarget); }} />
      </label>
    </div>, open.host)}
  </>;
}

export function MindColors({ node, preview, commit, fields = ["color", "textColor", "highlight"], colorLabel }: {
  node: Pick<MindNodeDTO, "color" | "textColor" | "highlight">; preview: ColorHandler; commit: ColorHandler; fields?: ColorField[]; colorLabel?: string;
}) {
  return fields.map(field =>
    <ColorInput key={field} field={field} label={field === "color" ? colorLabel : undefined} value={node[field]} preview={preview} commit={commit} />);
}
