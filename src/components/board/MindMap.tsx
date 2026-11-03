"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Focus, Minus, Maximize, Minimize, Moon, Sun, Plus, Trash2, ExternalLink } from "lucide-react";
import { http } from "@/lib/client";
import type { MindNodeDTO } from "@/lib/types";
import { MindFormat } from "./MindFormat";
import { notify } from "@/components/ui/ConfirmProvider";

const branchColor = (value: string) => value.startsWith("#") ? value : `var(--color-${value})`;
type Point = { x: number; y: number };
type Gesture = { pointer: number; start: Point; origin: Point; node?: string; moved: boolean };
export function MindMap({ boardId, nodes, onChanged }: {
  boardId: string; nodes: MindNodeDTO[]; onChanged?: () => Promise<void>;
}) {
  const root = nodes.find(n => !n.parentId);
  const [selectedId, select] = useState(root?.id);
  const selected = nodes.find(n => n.id === selectedId) ?? root;
  const [view, setView] = useState({ x: -(root?.x ?? 0), y: -(root?.y ?? 0), zoom: 1 });
  const [drag, setDrag] = useState<(Point & { id: string }) | null>(null);
  const [editor, edit] = useState<{id: string; title: string} | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [full, setFull] = useState(false);
  const [light, setLight] = useState(false);
  const section = useRef<HTMLElement>(null);
  const skipBlur = useRef(false);
  const suppressedClick = useRef(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLight(localStorage.getItem("mind-light:" + boardId) === "true");
  }, [boardId]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      const rect = element!.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2, py = e.clientY - rect.top - rect.height / 2;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1);
      setView(old => {
        const zoom = Math.max(0.05, Math.min(2.5, old.zoom * Math.exp(-delta * 0.002)));
        return { zoom, x: px - (px - old.x) * zoom / old.zoom, y: py - (py - old.y) * zoom / old.zoom };
      });
    }
    const sync = () => setFull(document.fullscreenElement === section.current);
    const escape = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) setFull(false); };
    element.addEventListener("wheel", wheel, { passive:false });
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", escape);
    return () => { element.removeEventListener("wheel", wheel); document.removeEventListener("fullscreenchange", sync); document.removeEventListener("keydown", escape); };
  }, []);
  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (full) setFull(false);
    else if (section.current?.requestFullscreen) {
      try { await section.current.requestFullscreen(); } catch { setFull(true); }
    } else setFull(true);
  }
  const [busy, setBusy] = useState(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const url = `/api/boards/${boardId}/mapa`;
  const visible = nodes.map(n => n.id === drag?.id ? { ...n, x: drag.x, y: drag.y } : n);
  const byId = new Map(visible.map(n => [n.id, n]));
  async function save(operation: () => Promise<void>) {
    if (!onChanged) return;
    pending.current++;
    setBusy(true);
    queue.current = queue.current.then(async () => {
      try { await operation(); await onChanged(); }
      catch (e) { notify(e instanceof Error ? e.message : "Não foi possível salvar a ideia.", "error"); }
      finally { if (!--pending.current) setBusy(false); setDrag(null); }
    });
    return queue.current;
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
    if (e.button !== 0 || gesture.current || (e.target as Element).closest("input,textarea")) return;
    const target = (e.target as Element).closest<HTMLButtonElement>("[data-node]");
    const n = target && byId.get(target.dataset.node!);
    if (n) select(n.id);
    suppressedClick.current = false;
    gesture.current = { pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin: n && onChanged && !n.locked ? n : view, node: n && onChanged && !n.locked ? n.id : undefined, moved: false };
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
    suppressedClick.current = g.moved;
    if (e.type === "pointercancel" || !g.node || !g.moved) { setDrag(null); return; }
    const x = Math.round(g.origin.x + (e.clientX - g.start.x) / view.zoom);
    const y = Math.round(g.origin.y + (e.clientY - g.start.y) / view.zoom);
    void save(async () => { await http.patch(url, { id: g.node, x, y }); });
  }
  function rename(n: MindNodeDTO) {
    select(n.id);
    if (onChanged) edit({id:n.id, title:n.title});
  }
  function commitTitle() {
    if (skipBlur.current || !editor) return;
    const draft = editor;
    edit(null);
    if (draft.title.trim() && draft.title.trim() !== byId.get(draft.id)?.title)
      void save(async () => { await http.patch(url, {id:draft.id, title:draft.title.trim()}); });
  }
  function addBranch(parentId: string) {
    if (!onChanged) return;
    const draft = editor;
    skipBlur.current = true;
    edit(null);
    void save(async () => {
      try {
        if (draft?.title.trim() && draft.title.trim() !== byId.get(draft.id)?.title)
          await http.patch(url, {id:draft.id, title:draft.title.trim()});
        const node = await http.post<MindNodeDTO>(url, { parentId, title:"Nova ideia" });
        select(node.id);
        focus(node, view.zoom);
        edit({id:node.id, title:node.title});
      } finally { skipBlur.current = false; }
    });
  }
  function shortcut(e: React.KeyboardEvent, id: string) {
    if (!onChanged || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat && !busy) addBranch(id);
    }
  }
  function remove() {
    if (!selected?.parentId) return;
    setConfirmDelete(false);
    void save(async () => { await http.del(url, {id:selected.id}); select(selected.parentId!); });
  }
  return <section ref={section} aria-label="Mapa mental" className={`card flex min-h-64 flex-1 flex-col overflow-hidden bg-surface text-ink ${light ? "mind-canvas-light" : ""} ${full ? "!fixed inset-0 !z-[100] !rounded-none" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-2 sm:px-4">
      {onChanged && <div className="flex flex-wrap items-center gap-1">
        <button className="btn btn-primary" disabled={busy || !selected} onClick={() => selected && addBranch(selected.id)}><Plus size={15} /> Ramo</button>
        <button className="btn" aria-label="Excluir ramo" title="Excluir ramo" disabled={busy || !selected?.parentId} onClick={()=>setConfirmDelete(true)}><Trash2 size={15} /></button>
      </div>}
      <div className="ml-auto flex items-center gap-1">
        <button className="btn" title="Fundo claro" aria-label="Fundo claro" aria-pressed={light} onClick={()=>{setLight(!light);localStorage.setItem("mind-light:"+boardId,String(!light));}}>{light ? <Moon size={15}/> : <Sun size={15}/>}</button>
        <button className="btn" aria-label={full ? "Sair da tela cheia" : "Tela cheia"} onClick={toggleFull}>{full ? <Minimize size={15}/> : <Maximize size={15}/>}</button>
        <button className="btn" aria-label="Diminuir zoom" onClick={() => scale(0.8)}><Minus size={14} /></button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <button className="btn" aria-label="Aumentar zoom" onClick={() => scale(1.25)}><Plus size={14} /></button>
        <button className="btn" aria-label="Enquadrar mapa" title="Enquadrar mapa" onClick={fit}><Focus size={15} /></button>
      </div>
    </div>
    {selected && onChanged && <MindFormat key={selected.id} node={selected} change={patch=>void save(async()=>{await http.patch(url,{id:selected.id,...patch});})}/>}
    {confirmDelete && selected && <div className="flex flex-wrap items-center gap-2 border-t border-line p-2 text-sm">Excluir “{selected.title}” e seus subtópicos?
      <button className="btn text-red" onClick={remove}>Confirmar exclusão</button><button className="btn" onClick={()=>setConfirmDelete(false)}>Cancelar</button></div>}
    <div ref={canvas} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      className="relative min-h-40 flex-1 touch-none select-none overflow-hidden bg-well cursor-grab active:cursor-grabbing"
      style={{ backgroundImage: "radial-gradient(var(--color-line-2) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
      <div className="absolute left-1/2 top-1/2 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg aria-hidden="true" width="1" height="1" className="pointer-events-none absolute overflow-visible">
          {visible.map(n => {
            const p = n.parentId && byId.get(n.parentId);
            if (!p) return null;
            const mid = (p.x + n.x) / 2;
            return <path key={n.id} d={`M ${p.x} ${p.y} C ${mid} ${p.y}, ${mid} ${n.y}, ${n.x} ${n.y}`} fill="none" stroke={branchColor(n.color)} strokeWidth={3} opacity={0.7} />;
          })}
        </svg>
        {visible.map(n => <div key={n.id} data-node={n.id} role="button" tabIndex={0} aria-pressed={selected?.id === n.id} title={n.title}
          onClick={()=>{if (!suppressedClick.current && editor?.id !== n.id) rename(n);}}
          onKeyDown={e=>{if (e.target === e.currentTarget) shortcut(e,n.id);}}
          className={`absolute flex h-16 w-44 -translate-x-1/2 -translate-y-1/2 items-center justify-center px-2 text-center ${n.shape === "plain" ? "" : "border-2 bg-surface-2 shadow-sm"} ${n.shape === "pill" ? "rounded-full" : "rounded-2xl"} ${selected?.id === n.id ? "ring-2 ring-ink-3" : ""}`}
          style={{ left:n.x, top:n.y, borderColor:branchColor(n.color), color:n.textColor || undefined, fontSize:n.fontSize, fontWeight:n.bold ? 700 : 400 }}>
          {editor?.id === n.id && onChanged
            ? <input aria-label="Texto do ramo" autoFocus onFocus={e=>e.target.select()} maxLength={160} value={editor.title}
                className="w-full min-w-0 bg-transparent text-center outline-none select-text" style={{backgroundColor:n.highlight || undefined}}
                onChange={e=>edit({id:n.id,title:e.target.value})} onBlur={commitTitle}
                onKeyDown={e=>{if(e.key==="Escape"){edit(null);e.stopPropagation();}else shortcut(e,n.id);}} />
            : <span className="line-clamp-3 [overflow-wrap:anywhere]" style={{backgroundColor:n.highlight || undefined}}>{n.title}</span>}
        </div>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink-2">
      <span aria-live="polite">{busy ? "Salvando…" : selected?.title}</span>
      {selected?.link && <a className="inline-flex items-center gap-1 text-blue" target="_blank" rel="noopener noreferrer" href={selected.link}><ExternalLink size={13}/>Abrir link</a>}
      {onChanged && <span className="ml-auto hidden sm:inline">Clique para editar · Tab ou Enter cria um ramo conectado</span>}
    </div>
  </section>;
}
