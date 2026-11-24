"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { http } from "@/lib/client";
import { MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_TEXT, splitChecklistInput, type NewChecklistItem } from "@/lib/checklist-input";

export function ChecklistAdd({ cardId, onChanged }: { cardId: string; onChanged: () => void }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<NewChecklistItem[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const queue = useRef<NewChecklistItem[]>([]);
  const busy = useRef(false);
  const failed = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function flush() {
    if (busy.current || failed.current || !queue.current.length) return;
    busy.current = true;
    setSaving(true);
    let changed = false;
    try {
      while (queue.current.length) {
        const batch = queue.current.slice(0, MAX_CHECKLIST_ITEMS);
        await http.post(`/api/cards/${cardId}/checklist`, { items: batch });
        queue.current = queue.current.slice(batch.length);
        setPending([...queue.current]);
        changed = true;
      }
    } catch (e) {
      failed.current = true;
      setError(e instanceof Error ? e.message : "Não foi possível salvar os itens.");
    } finally {
      busy.current = false;
      setSaving(false);
      if (changed) onChanged();
    }
  }

  function accept(value: string, submitLast = false) {
    const { texts, remainder } = splitChecklistInput(value, submitLast);
    if (texts.length + queue.current.length > MAX_CHECKLIST_ITEMS || texts.some(t => t.length > MAX_CHECKLIST_TEXT)) {
      setDraft(value);
      setError(texts.some(t => t.length > MAX_CHECKLIST_TEXT)
        ? `Cada item pode ter até ${MAX_CHECKLIST_TEXT} caracteres.`
        : `Adicione até ${MAX_CHECKLIST_ITEMS} itens por vez.`);
      return;
    }
    setDraft(remainder);
    if (!texts.length) return;
    queue.current.push(...texts.map(text => ({ id: crypto.randomUUID(), text })));
    setPending([...queue.current]);
    if (!failed.current) setError("");
    void flush();
  }

  return <div className="mt-1.5 space-y-1.5">
    <form onSubmit={e => { e.preventDefault(); accept(draft, true); }} className="flex gap-2">
      <input ref={input} value={draft} aria-label="Adicionar itens ao checklist" placeholder="Adicionar item…"
        className="input h-9 min-w-0 py-1 text-base sm:text-sm"
        onChange={e => {
          if ((e.nativeEvent as InputEvent).isComposing) setDraft(e.target.value);
          else accept(e.target.value);
        }}
        onCompositionEnd={e => accept(e.currentTarget.value)}
        onKeyDown={e => { if (e.nativeEvent.isComposing && e.key === "Enter") e.preventDefault(); }}
        onPaste={e => {
          const text = e.clipboardData.getData("text/plain");
          if (!text.includes(",")) return;
          e.preventDefault();
          const el = e.currentTarget;
          accept(el.value.slice(0, el.selectionStart ?? el.value.length) + text + el.value.slice(el.selectionEnd ?? el.value.length), true);
        }} />
      <button type="submit" disabled={!draft.trim()} className="btn h-9 shrink-0 px-3 text-xs">
        <Plus size={13} /> Adicionar
      </button>
    </form>
    <p className="text-xs text-ink-3">Use vírgulas para adicionar vários itens.</p>
    {saving && <p role="status" className="flex items-center gap-1.5 text-xs text-ink-3"><LoaderCircle size={12} className="motion-safe:animate-spin" /> Salvando itens…</p>}
    {error && <div role="alert" className="space-y-1.5 text-xs text-red">
      <p>{error}</p>
      {!!pending.length && <>
        <p className="break-words text-ink-2">Pendentes: {pending.map(item => item.text).join(", ")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} className="btn h-8 px-2 text-xs" onClick={() => { failed.current = false; setError(""); void flush(); }}>Tentar novamente</button>
          <button type="button" disabled={saving} className="btn btn-ghost h-8 px-2 text-xs" onClick={() => {
            setDraft([...queue.current.map(item => item.text), draft].filter(Boolean).join(", "));
            queue.current = []; setPending([]); failed.current = false; setError(""); input.current?.focus();
          }}>Editar itens pendentes</button>
        </div>
      </>}
    </div>}
  </div>;
}
