"use client";
import { useState } from "react";
import { Plus, Tags, X, Check, ChevronDown } from "lucide-react";
import type { CardLabel } from "@/lib/types";
import { http } from "@/lib/client";
import { labelColors } from "@/lib/labels";
import { notify } from "@/components/ui/ConfirmProvider";

export function TaskLabels({ boardId, labels, onSave }: { boardId?: string; labels: CardLabel[]; onSave: (labels: CardLabel[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CardLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  async function loadCatalog() {
    if (!boardId) return;
    setLoading(true); setLoadError(false);
    try { setCatalog(await http.get<CardLabel[]>(`/api/boards/${boardId}/etiquetas`)); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }
  const [name, setName] = useState("");
  const [color, setColor] = useState<CardLabel["color"]>("blue");
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(next: CardLabel[]) {
    if (busy) return;
    setBusy(true);
    try { await onSave(next); setName(""); setEditing(null); await loadCatalog(); }
    catch (e) { notify(e instanceof Error ? e.message : "Não foi possível salvar a etiqueta."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2" aria-label="Etiquetas">
    <button type="button" aria-expanded={open} className="flex min-h-8 items-center gap-1.5 text-xs text-ink-3 hover:text-ink" onClick={() => { setOpen(!open); if (!open) void loadCatalog(); }}><Tags size={13} /> Etiquetas {labels.length ? `(${labels.length})` : ""}<ChevronDown size={13} className={open ? "rotate-180" : ""} /></button>
    <div className="flex flex-wrap gap-2">
      {labels.map((label, i) => <span key={label.name} className={`pill pill-${label.color} max-w-full gap-1`}>
        <button type="button" disabled={busy} title="Editar etiqueta" className="min-w-0 break-words text-left" onClick={() => { setName(label.name); setColor(label.color); setEditing(i); setOpen(true); void loadCatalog(); }}>{label.name}</button>
        {open && <button type="button" disabled={busy} className="p-1" aria-label={`Remover etiqueta ${label.name}`} onClick={() => void save(labels.filter((_, index) => index !== i))}><X size={12} /></button>}
      </span>)}
    </div>
    {open && <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div className="text-xs text-ink-3">Salvas neste quadro · toque para adicionar ou retirar da tarefa</div>
      {loading && <p className="text-xs text-ink-3" role="status">Carregando etiquetas…</p>}
      {loadError && <button type="button" className="text-xs text-red" onClick={() => void loadCatalog()}>Não foi possível carregar. Tentar novamente</button>}
      {!loading && !loadError && !catalog.length && <p className="text-xs text-ink-3">Crie a primeira etiqueta abaixo.</p>}
      <div className="flex flex-wrap gap-2">{catalog.map(label => {
        const selected = labels.some(l => l.name.toLocaleLowerCase("pt-BR") === label.name.toLocaleLowerCase("pt-BR"));
        return <button type="button" key={label.name} aria-pressed={selected} disabled={busy || loading || (!selected && labels.length >= 10)} className={`pill pill-${label.color} min-h-8 max-w-full cursor-pointer gap-1 whitespace-normal break-words`} onClick={() => void save(selected ? labels.filter(l => l.name.toLocaleLowerCase("pt-BR") !== label.name.toLocaleLowerCase("pt-BR")) : [...labels, label])}>{selected && <Check size={12} />}{label.name}</button>;
      })}</div>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Nome da etiqueta" className="input min-w-0 basis-full sm:basis-0 sm:flex-1" maxLength={32} placeholder="Ex.: Cliente, Financeiro…" value={name} disabled={busy} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && name.trim()) { e.preventDefault(); void save(editing === null ? [...labels, { name, color }] : labels.map((l, i) => i === editing ? { name, color } : l)); } }} />
      <button type="button" className="btn" disabled={busy || !name.trim() || (editing === null && labels.length >= 10)} onClick={() => void save(editing === null ? [...labels, { name, color }] : labels.map((l, i) => i === editing ? { name, color } : l))}>{editing === null ? <Plus size={14} /> : <Check size={14} />}{editing === null ? "Adicionar etiqueta" : "Salvar etiqueta"}</button>
      {editing !== null && <button type="button" className="btn" disabled={busy} onClick={() => { setEditing(null); setName(""); }}>Cancelar</button>}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Cor da etiqueta">{(Object.keys(labelColors) as CardLabel["color"][]).map(c => <button key={c} type="button" disabled={busy} aria-pressed={color === c} onClick={() => setColor(c)} className={`pill pill-${c} min-h-8 cursor-pointer gap-1 px-3 ${color === c ? "ring-1 ring-current" : ""}`}>{color === c && <Check size={12} />}{labelColors[c]}</button>)}</div>
    </div>}
  </section>;
}
