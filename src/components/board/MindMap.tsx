"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Focus, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { http } from "@/lib/client";
import type { MindNodeDTO } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";

const colors = { blue: "Azul", orange: "Laranja", green: "Verde", red: "Vermelho" };
type Point = { x: number; y: number };
type Gesture = { pointer: number; start: Point; origin: Point; node?: string; moved: boolean };
type Editor = { mode: "add" | "edit"; id: string; title: string; color: string };

export function MindMap({ boardId, nodes, onChanged }: {
  boardId: string; nodes: MindNodeDTO[]; onChanged?: () => Promise<void>;
}) {
  const root = nodes.find(n => !n.parentId);
  const [selectedId, select] = useState(root?.id);
  const selected = nodes.find(n => n.id === selectedId) ?? root;
  const [view, setView] = useState({ x: -(root?.x ?? 0), y: -(root?.y ?? 0), zoom: 1 });
  const [drag, setDrag] = useState<(Point & { id: string }) | null>(null);
  const [editor, edit] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const url = `/api/boards/${boardId}/mapa`;
  const visible = nodes.map(n => n.id === drag?.id ? { ...n, x: drag.x, y: drag.y } : n);
  const byId = new Map(visible.map(n => [n.id, n]));
  async function save(operation: () => Promise<void>) {
    if (!onChanged || lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await operation(); await onChanged(); }
    catch (e) { notify(e instanceof Error ? e.message : "Não foi possível salvar a ideia.", "error"); }
    finally { lock.current = false; setBusy(false); setDrag(null); }
  }
  function focus(point: Point, zoom: number) {
    setView({ x: -point.x * zoom, y: -point.y * zoom, zoom });
  }
  function scale(factor: number) {
    const zoom = Math.max(0.2, Math.min(2.5, view.zoom * factor));
    setView({ zoom, x: view.x * zoom / view.zoom, y: view.y * zoom / view.zoom });
  }
  function fit() {
    if (!canvas.current || !nodes.length) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const zoom = Math.max(0.05, Math.min(1, canvas.current.clientWidth / (right - left + 230), canvas.current.clientHeight / (bottom - top + 135)));
    focus({ x: (left + right) / 2, y: (top + bottom) / 2 }, zoom);
  }
  function start(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || gesture.current || lock.current) return;
    const target = (e.target as Element).closest<HTMLButtonElement>("[data-node]");
    const n = target && byId.get(target.dataset.node!);
    if (n) select(n.id);
    gesture.current = { pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin: n && onChanged ? n : view, node: n && onChanged ? n.id : undefined, moved: false };
    (target ?? e.currentTarget).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    if (g.node) setDrag({ id: g.node, x: Math.round(g.origin.x + dx / view.zoom), y: Math.round(g.origin.y + dy / view.zoom) });
    else setView({ ...view, x: g.origin.x + dx, y: g.origin.y + dy });
  }
  function finish(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    if (e.type === "pointercancel" || !g.node || !g.moved) { setDrag(null); return; }
    const x = Math.round(g.origin.x + (e.clientX - g.start.x) / view.zoom);
    const y = Math.round(g.origin.y + (e.clientY - g.start.y) / view.zoom);
    void save(async () => { await http.patch(url, { id: g.node, x, y }); });
  }
  function openEditor(mode: Editor["mode"], n = selected) {
    if (n && onChanged) edit({ mode, id: n.id, title: mode === "edit" ? n.title : "", color: n.color });
  }
  async function remove() {
    if (!selected?.parentId || !(await askConfirm({ title: "Excluir ramo?", message: "Esta ideia e todos os seus subtópicos serão excluídos.", confirmLabel: "Excluir ramo", danger: true }))) return;
    await save(async () => { await http.del(url, { id: selected.id }); select(selected.parentId!); });
  }
  return <section aria-label="Mapa mental" className="card flex min-h-64 flex-1 flex-col overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-2 sm:px-4">
      {onChanged && <div className="flex flex-wrap items-center gap-1">
        <button className="btn btn-primary" disabled={busy || !selected} onClick={() => openEditor("add")}><Plus size={15} /> Ramo</button>
        <button className="btn" aria-label="Editar ideia" title="Editar ideia" disabled={busy || !selected} onClick={() => openEditor("edit")}><Pencil size={15} /></button>
        <button className="btn" aria-label="Excluir ramo" title="Excluir ramo" disabled={busy || !selected?.parentId} onClick={remove}><Trash2 size={15} /></button>
      </div>}
      <div className="ml-auto flex items-center gap-1">
        <button className="btn" aria-label="Diminuir zoom" onClick={() => scale(0.8)}><Minus size={14} /></button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <button className="btn" aria-label="Aumentar zoom" onClick={() => scale(1.25)}><Plus size={14} /></button>
        <button className="btn" aria-label="Enquadrar mapa" title="Enquadrar mapa" onClick={fit}><Focus size={15} /></button>
      </div>
    </div>
    <div ref={canvas} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      className="relative min-h-40 flex-1 touch-none select-none overflow-hidden bg-well cursor-grab active:cursor-grabbing"
      style={{ backgroundImage: "radial-gradient(var(--color-line-2) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
      <div className="absolute left-1/2 top-1/2 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg aria-hidden="true" width="1" height="1" className="pointer-events-none absolute overflow-visible">
          {visible.map(n => {
            const p = n.parentId && byId.get(n.parentId);
            if (!p) return null;
            const mid = (p.x + n.x) / 2;
            return <path key={n.id} d={`M ${p.x} ${p.y} C ${mid} ${p.y}, ${mid} ${n.y}, ${n.x} ${n.y}`} fill="none" stroke={`var(--color-${n.color})`} strokeWidth={3} opacity={0.7} />;
          })}
        </svg>
        {visible.map(n => <button key={n.id} data-node={n.id} aria-pressed={selected?.id === n.id} title={n.title} onClick={() => select(n.id)} onDoubleClick={() => openEditor("edit", n)}
          className={`absolute flex h-16 w-44 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-2 bg-surface-2 px-3 text-sm shadow-sm ${n.parentId ? "" : "font-semibold"} ${selected?.id === n.id ? "ring-2 ring-ink-3 ring-offset-2 ring-offset-surface" : ""}`}
          style={{ left: n.x, top: n.y, borderColor: `var(--color-${n.color})` }}><span className="line-clamp-3 [overflow-wrap:anywhere]">{n.title}</span></button>)}
      </div>
    </div>
    <p className="border-t border-line px-3 py-2 text-xs text-ink-2" aria-live="polite">{busy ? "Salvando…" : selected?.title}</p>
    <Modal open={!!editor} onClose={() => { if (!busy) edit(null); }} title={editor?.mode === "add" ? "Novo ramo" : "Editar ideia"}>
      {editor && <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        if (!editor.title.trim()) return;
        void save(async () => {
          if (editor.mode === "add") {
            const node = await http.post<MindNodeDTO>(url, { parentId: editor.id, title: editor.title });
            select(node.id); focus(node, view.zoom);
          } else await http.patch(url, { id: editor.id, title: editor.title, color: editor.color });
          edit(null);
        });
      }}>
        <label className="block text-sm">Ideia<input autoFocus maxLength={160} required className="input mt-1" value={editor.title} onChange={e => edit({ ...editor, title: e.target.value })} /></label>
        {editor.mode === "edit" && <label className="block text-sm">Cor<select className="input mt-1" value={editor.color} onChange={e => edit({ ...editor, color: e.target.value })}>{Object.entries(colors).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <button disabled={busy || !editor.title.trim()} className="btn btn-primary">Salvar</button>
      </form>}
    </Modal>
  </section>;
}
