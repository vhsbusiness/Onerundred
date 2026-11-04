"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { Highlighter, Type } from "lucide-react";
import type { MindNodeDTO } from "@/lib/types";

export type ColorField = "color" | "textColor" | "highlight";
export type ColorHandler = (field: ColorField, value: string) => void;
const palette: Record<string, string> = { orange: "#f5b06e", blue: "#7fb7f5", green: "#8be3a6", red: "#f08a8a" };
const labels = { color: "Cor do ramo", textColor: "Cor do texto", highlight: "Marca-texto" };

function ColorInput({ field, value, preview, commit, label }: {
  field: ColorField; value: string; preview: ColorHandler; commit: ColorHandler; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const swatch = palette[value] || value;
  const defaultValue = field === "highlight" ? "#f9df96" : "#30343a";
  function finish(element: HTMLInputElement) {
    if (!pending.current && element.value === swatch) return;
    pending.current = false;
    commit(field, element.value);
  }
  const confirmed = useEffectEvent((element: HTMLInputElement) => finish(element));
  useEffect(() => {
    const element = input.current!;
    // Native input previews the continuous picker; native change commits the choice.
    const changed = () => confirmed(element);
    element.addEventListener("change", changed);
    return () => element.removeEventListener("change", changed);
  }, []);
  return <label title={label ?? labels[field]} className="mind-tool relative">
    {field === "color" ? <span className="size-4 rounded-full" style={{ background: swatch }} />
      : field === "textColor" ? <Type size={16} style={{ borderBottom: "2px solid " + (swatch || "currentColor") }} />
      : <Highlighter size={16} style={{ borderBottom: "2px solid " + (swatch || "transparent") }} />}
    <input ref={input} type="color" aria-label={label ?? labels[field]} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      value={swatch || defaultValue} onPointerDown={e => e.currentTarget.focus({ preventScroll: true })}
      onInput={e => { pending.current = true; preview(field, e.currentTarget.value); }}
      onBlur={e => { if (pending.current) finish(e.currentTarget); }} />
  </label>;
}

export function MindColors({ node, preview, commit, fields = ["color", "textColor", "highlight"], colorLabel }: {
  node: Pick<MindNodeDTO, "color" | "textColor" | "highlight">; preview: ColorHandler; commit: ColorHandler; fields?: ColorField[]; colorLabel?: string;
}) {
  return fields.map(field =>
    <ColorInput key={field} field={field} label={field === "color" ? colorLabel : undefined} value={node[field]} preview={preview} commit={commit} />);
}
