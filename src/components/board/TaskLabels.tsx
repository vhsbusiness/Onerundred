"use client";
import { useState } from "react";
import { Plus, Tags, X, Check } from "lucide-react";
import type { CardLabel } from "@/lib/types";
import { labelColors } from "@/lib/labels";
import { notify } from "@/components/ui/ConfirmProvider";

export function TaskLabels({ labels, onSave }: { labels: CardLabel[]; onSave: (labels: CardLabel[]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<CardLabel["color"]>("blue");
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(next: CardLabel[]) {
    if (busy) return;
    setBusy(true);
    try { await onSave(next); setName(""); setEditing(null); }
    catch (e) { notify(e instanceof Error ? e.message : "Não foi possível salvar a etiqueta."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2" aria-label="Etiquetas">
    <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-3"><Tags size={13} /> Etiquetas</div>
    <div className="flex flex-wrap gap-2">
      {labels.map((label, i) => <span key={label.name} className={`pill pill-${label.color} max-w-full gap-1`}>
        <button type="button" disabled={busy} title="Editar etiqueta" className="min-w-0 break-words text-left" onClick={() => { setName(label.name); setColor(label.color); setEditing(i); }}>{label.name}</button>
        <button type="button" disabled={busy} className="p-1" aria-label={`Remover etiqueta ${label.name}`} onClick={() => void save(labels.filter((_, index) => index !== i))}><X size={12} /></button>
      </span>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Nome da etiqueta" className="input min-w-0 flex-1" maxLength={32} placeholder="Ex.: Cliente, Financeiro…" value={name} disabled={busy} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && name.trim()) { e.preventDefault(); void save(editing === null ? [...labels, { name, color }] : labels.map((l, i) => i === editing ? { name, color } : l)); } }} />
      <button type="button" className="btn" disabled={busy || !name.trim() || (editing === null && labels.length >= 10)} onClick={() => void save(editing === null ? [...labels, { name, color }] : labels.map((l, i) => i === editing ? { name, color } : l))}>{editing === null ? <Plus size={14} /> : <Check size={14} />}{editing === null ? "Adicionar etiqueta" : "Salvar etiqueta"}</button>
      {editing !== null && <button type="button" className="btn" disabled={busy} onClick={() => { setEditing(null); setName(""); }}>Cancelar</button>}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Cor da etiqueta">{(Object.keys(labelColors) as CardLabel["color"][]).map(c => <button key={c} type="button" disabled={busy} aria-pressed={color === c} onClick={() => setColor(c)} className={`pill pill-${c} min-h-8 cursor-pointer gap-1 px-3 ${color === c ? "ring-1 ring-current" : ""}`}>{color === c && <Check size={12} />}{labelColors[c]}</button>)}</div>
  </section>;
}
