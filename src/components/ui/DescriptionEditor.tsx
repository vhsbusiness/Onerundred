"use client";

import { Bold, Italic, List, Strikethrough, Pencil, Eye } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

// Render only React nodes, never user-supplied HTML. Links allow HTTP(S) only.
function inline(text: string, depth = 0): ReactNode {
  if (depth > 8) return text;
  const tokens = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|\*\*[^\n]+?\*\*|~~[^\n]+?~~|\*[^*\n]+?\*)/gi;
  const result: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(tokens)) {
    const start = match.index!;
    result.push(text.slice(end, start));
    const token = match[0];
    if (/^(https?:\/\/|www\.)/i.test(token)) {
      const url = token.replace(/[.,;:!?]+$/, "");
      const href = /^www\./i.test(url) ? `https://${url}` : url;
      try {
        const parsed = new URL(href);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
        result.push(<a key={start} href={href} target="_blank" rel="noopener noreferrer" className="break-all text-blue underline underline-offset-2 hover:text-ink">{url}</a>, token.slice(url.length));
      } catch { result.push(token); }
    } else if (token.startsWith("**")) {
      result.push(<strong key={start}>{inline(token.slice(2, -2), depth + 1)}</strong>);
    } else if (token.startsWith("~~")) {
      result.push(<s key={start}>{inline(token.slice(2, -2), depth + 1)}</s>);
    } else {
      result.push(<em key={start}>{inline(token.slice(1, -1), depth + 1)}</em>);
    }
    end = start + token.length;
  }
  result.push(text.slice(end));
  return result;
}

export function DescriptionText({ value }: { value: string }) {
  const lines = value.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^- /.test(lines[i])) {
      const items: ReactNode[] = [];
      const key = i;
      while (i < lines.length && /^- /.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].slice(2))}</li>);
        i++;
      }
      i--;
      blocks.push(<ul key={key} className="list-disc pl-5">{items}</ul>);
    } else {
      blocks.push(<div key={i} className="min-h-[1.5em]">{inline(lines[i])}</div>);
    }
  }
  return <div className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{blocks}</div>;
}

export function DescriptionEditor({ value, onChange, onSave }: {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(!value);
  const field = useRef<HTMLTextAreaElement>(null);

  function handleFormat(marker: string) {
    const input = field.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end);
    let next: string;
    let from: number;
    let to: number;
    if (marker === "- ") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const block = value.slice(lineStart, end);
      const formatted = block.split("\n").map((line) => line.startsWith("- ") ? line.slice(2) : `- ${line}`).join("\n");
      next = value.slice(0, lineStart) + formatted + value.slice(end);
      from = lineStart; to = lineStart + formatted.length;
    } else if (value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker) {
      next = value.slice(0, start - marker.length) + selected + value.slice(end + marker.length);
      from = start - marker.length; to = end - marker.length;
    } else {
      next = value.slice(0, start) + marker + selected + marker + value.slice(end);
      from = start + marker.length; to = end + marker.length;
    }
    onChange(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(from, to); });
  }

  function handleToolbarClick(event: React.MouseEvent<HTMLButtonElement>) {
    handleFormat(event.currentTarget.dataset.marker!);
  }

  return <div className="min-w-0 overflow-hidden rounded-xl border border-line-2 bg-well">
    <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
      {editing && [{ Icon: Bold, label: "Negrito", marker: "**" }, { Icon: Italic, label: "Itálico", marker: "*" }, { Icon: Strikethrough, label: "Riscado", marker: "~~" }, { Icon: List, label: "Lista", marker: "- " }].map(({ Icon, label, marker }) =>
        <button key={label} type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} data-marker={marker} onClick={handleToolbarClick} className="btn btn-ghost h-10 w-10 p-0"><Icon size={16} /></button>
      )}
      <button type="button" className="btn btn-ghost ml-auto min-h-10 px-2 text-xs" onClick={() => {
        if (editing) onSave(value);
        setEditing(!editing);
      }}>{editing ? <Eye size={14} /> : <Pencil size={14} />}{editing ? "Visualizar" : "Editar"}</button>
    </div>
    {editing ? <>
      <textarea ref={field} aria-label="Descrição" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => onSave(value)} onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && ["b", "i"].includes(e.key.toLowerCase())) { e.preventDefault(); handleFormat(e.key.toLowerCase() === "b" ? "**" : "*"); }
      }} rows={5} placeholder="Detalhes, links…" className="block min-h-32 w-full resize-y bg-transparent px-3 py-2 text-base text-ink outline-none sm:text-sm" />
      <p className="px-3 pb-2 text-xs text-ink-3">Selecione o texto para formatar. Links abrem em Visualizar.</p>
    </> : <div className="min-h-24 p-3">{value ? <DescriptionText value={value} /> : <span className="text-sm text-ink-3">Nenhuma descrição.</span>}</div>}
  </div>;
}
