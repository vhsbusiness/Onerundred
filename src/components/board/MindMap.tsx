"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Focus, Minus, Maximize, Minimize, Moon, Sun, Plus, Undo2, ExternalLink } from "lucide-react";
import { http } from "@/lib/client";
import type { MindNodeDTO } from "@/lib/types";
import { MindFormat } from "./MindFormat";
import { notify } from "@/components/ui/ConfirmProvider";

const branchColor = (value: string) => value.startsWith("#") ? value : `var(--color-${value})`;
function nodeWidth(node: MindNodeDTO) {
  return Math.min(210, Math.max(node.parentId ? 72 : 120, Math.ceil(node.title.length * node.fontSize * 0.59 + 28)));
}

type Point = { x: number; y: number };
type Gesture = { pointer: number; start: Point; origin: Point; node?: string; moved: boolean; selectOnly: boolean };
export function MindMap({ boardId, nodes, undoId = null, onChanged }: {
  boardId: string; nodes: MindNodeDTO[]; undoId?: number | null; onChanged?: () => Promise<void>;
}) {
  const root = nodes.find(n => !n.parentId);
  const [selectedId, select] = useState<string>();
  const selected = nodes.find(n => n.id === selectedId);
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
  const undoQueued = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const url = `/api/boards/${boardId}/mapa`;
  const visible = nodes.map(n => n.id === drag?.id ? { ...n, x: drag.x, y: drag.y } : n);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const ids = children.get(node.parentId) ?? [];
    ids.push(node.id);
    children.set(node.parentId, ids);
  }
  const hidden = new Set<string>();
  function descendants(id: string) {
    const ids = [...(children.get(id) ?? [])];
    for (let index = 0; index < ids.length; index++) ids.push(...(children.get(ids[index]) ?? []));
    return ids;
  }
  for (const id of folded) {
    if (!hidden.has(id)) for (const child of descendants(id)) hidden.add(child);
  }
  const shown = visible.filter(node => !hidden.has(node.id));
  function toggleFold(id: string) {
    setFolded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
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
    const zoom = Math.max(0.05, Math.min(2.5, view.zoom * factor));
    setView({ zoom, x: view.x * zoom / view.zoom, y: view.y * zoom / view.zoom });
  }
  function fit() {
    if (!canvas.current || !nodes.length) return;
    const xs = shown.map(n => n.x), ys = shown.map(n => n.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const zoom = Math.max(0.05, Math.min(1, canvas.current.clientWidth / (right - left + 230), canvas.current.clientHeight / (bottom - top + 135)));
    focus({ x: (left + right) / 2, y: (top + bottom) / 2 }, zoom);
  }
  function start(e: PointerEvent<HTMLDivElement>) {
    const element = e.target as Element;
    const mouse = e.pointerType === "mouse";
    const rightDrag = mouse && e.button === 2;
    if (gesture.current || (!rightDrag && e.button !== 0) || (!rightDrag && element.closest("input,textarea,button,a"))) return;
    const target = element.closest<HTMLElement>("[data-node]");
    const node = target && byId.get(target.dataset.node!);
    const selectOnly = mouse && !rightDrag;
    const moveNode = !selectOnly && onChanged && node && !node.locked ? node : null;
    if (rightDrag) e.preventDefault();
    suppressedClick.current = false;
    gesture.current = {
      pointer: e.pointerId, start: { x: e.clientX, y: e.clientY },
      origin: moveNode ?? view, node: moveNode?.id, moved: false, selectOnly,
    };
    (target ?? e.currentTarget).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    if (g.selectOnly) return;
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
    if (onChanged) {
      if (view.zoom < 0.7 && canvas.current && canvas.current.clientWidth < 640) focus(n, 1);
      edit({ id: n.id, title: n.title });
    }
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
    if (folded.has(parentId)) toggleFold(parentId);
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
    void save(async () => { await http.del(url, {id:selected.id}); select(undefined); });
  }
  function undo() {
    const waitForSave = pending.current > 0;
    if (undoQueued.current || (!undoId && !waitForSave)) return;
    undoQueued.current = true;
    edit(null);
    setConfirmDelete(false);
    void save(async () => {
      try {
        const latest = waitForSave
          ? (await http.get<{ mindUndoId: number | null }>(`/api/boards/${boardId}`)).mindUndoId
          : undoId;
        if (!latest || (waitForSave && latest === undoId)) return;
        await http.post(url + "/desfazer", { actionId: latest });
        edit(null);
        select(undefined);
      } finally {
        undoQueued.current = false;
      }
    });
  }
  const keyUndo = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || !onChanged) return;
    const target = event.target as HTMLElement;
    if (document.querySelector('[aria-modal="true"]') ||
        (target !== document.body && !section.current?.contains(target))) return;
    if (target.closest("input,textarea,select,[contenteditable=true]")) {
      if (!target.matches("[data-mind-title]") || !editor) return;
      if (editor.title !== selected?.title) {
        // On macOS the browser only binds native text undo to Command+Z.
        if (event.ctrlKey && /Mac/.test(navigator.platform)) {
          event.preventDefault();
          document.execCommand("undo");
        }
        return;
      }
    }
    if (!undoId && !pending.current) return;
    event.preventDefault();
    if (!event.repeat) undo();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyUndo(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  function dismiss() {
    select(undefined);
    setConfirmDelete(false);
    edit(null);
  }
  const anchor = selected && byId.get(selected.id);
  return <section ref={section} aria-label="Mapa mental" className={`card mind-map relative isolate min-h-64 flex-1 overflow-hidden bg-surface text-ink ${light ? "mind-canvas-light" : ""} ${full ? "!fixed inset-0 !z-[100] !rounded-none" : ""}`}>
    <div ref={canvas} data-mind-canvas onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      onContextMenu={event => event.preventDefault()}
      onClick={event => { if (!suppressedClick.current && !(event.target as Element).closest("[data-node],button,a")) dismiss(); }}
      className="mind-canvas absolute inset-0 touch-none select-none overflow-hidden">
      <div className="absolute left-1/2 top-1/2 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg aria-hidden="true" width="1" height="1" className="pointer-events-none absolute overflow-visible">
          {shown.map(n => {
            const parent = n.parentId && byId.get(n.parentId);
            if (!parent) return null;
            const side = n.x >= parent.x ? 1 : -1;
            const start = parent.x + side * nodeWidth(parent) / 2;
            const end = n.x - side * nodeWidth(n) / 2;
            const mid = (start + end) / 2;
            return <path key={n.id} d={`M ${start} ${parent.y} C ${mid} ${parent.y}, ${mid} ${n.y}, ${end} ${n.y}`} fill="none" stroke={branchColor(n.color)} strokeWidth={parent.parentId ? 1.7 : 2.5} strokeLinecap="round" />;
          })}
        </svg>
        {shown.map(n => {
          const active = selectedId === n.id;
          const width = nodeWidth(n);
          const isLeft = !!root && n.x < root.x;
          const hasChildren = children.has(n.id);
          return <div key={n.id} className="absolute" style={{ left: n.x, top: n.y }}>
            <div data-node={n.id} role="button" tabIndex={0} aria-pressed={active} title={n.title}
              onClick={() => { if (!suppressedClick.current && editor?.id !== n.id) rename(n); }}
              onKeyDown={e => {
                if (e.key === "Escape") { dismiss(); return; }
                if (e.target !== e.currentTarget) return;
                if (!active && (e.key === " " || e.key === "Enter")) { e.preventDefault(); rename(n); }
                else if (active) shortcut(e, n.id);
              }}
              className="mind-node" data-shape={n.shape} data-root={!n.parentId}
              style={{ width, borderColor: branchColor(n.color), color: n.textColor || undefined, fontSize: n.fontSize, fontWeight: n.bold ? 700 : undefined }}>
              {editor?.id === n.id && onChanged
                ? <input data-mind-title aria-label="Texto do ramo" autoFocus onFocus={e => e.target.select()} maxLength={160} value={editor.title}
                    className="w-full min-w-0 select-text bg-transparent text-center outline-none" style={{ backgroundColor: n.highlight || undefined }}
                    onChange={e => edit({ id: n.id, title: e.target.value })} onBlur={commitTitle}
                    onKeyDown={e => { if (e.key === "Escape") { edit(null); select(undefined); e.stopPropagation(); } else shortcut(e, n.id); }} />
                : <span className="line-clamp-3 [overflow-wrap:anywhere]" style={{ backgroundColor: n.highlight || undefined }}>{n.title}</span>}
            </div>
            {(active || folded.has(n.id)) && <div className="mind-handles" style={isLeft ? { right: width / 2 + 4 } : { left: width / 2 + 4 }}>
              {active && onChanged && <button className="mind-handle" aria-label="Adicionar ramo" title="Adicionar ramo (Tab ou Enter)" disabled={busy} onClick={() => addBranch(n.id)}><Plus size={14} /></button>}
              {hasChildren && <button className="mind-handle" aria-label={folded.has(n.id) ? "Expandir ramo" : "Recolher ramo"} title={folded.has(n.id) ? "Expandir ramo" : "Recolher ramo"} onClick={() => toggleFold(n.id)}>{folded.has(n.id) ? descendants(n.id).length : <Minus size={12} />}</button>}
            </div>}
          </div>;
        })}
      </div>
    </div>
    {anchor && onChanged && !drag && <div className="mind-context" style={{
      "--mind-x": `${view.x + anchor.x * view.zoom}px`,
      "--mind-y": `${view.y + anchor.y * view.zoom}px`,
    } as React.CSSProperties}>
      <MindFormat key={anchor.id} node={anchor} busy={busy} change={patch => void save(async () => { await http.patch(url, { id: anchor.id, ...patch }); })} remove={() => setConfirmDelete(true)} />
      {confirmDelete && <div className="mind-tools mt-1 flex-wrap p-2 text-xs" role="group" aria-label="Confirmar exclusão">
        <span>Excluir este ramo e seus subtópicos?</span>
        <button className="mind-tool text-red" onClick={remove}>Confirmar exclusão</button>
        <button className="mind-tool" onClick={() => setConfirmDelete(false)}>Cancelar</button>
      </div>}
    </div>}
    <div className="mind-tools mind-history">
      {onChanged && <button className="mind-tool" aria-label="Desfazer" title="Desfazer (Ctrl+Z ou ⌘Z)" disabled={busy || !undoId} onClick={undo}><Undo2 size={16} /></button>}
      <button className="mind-tool" aria-label="Fundo claro" title="Fundo claro" aria-pressed={light} onClick={() => { setLight(!light); localStorage.setItem("mind-light:" + boardId, String(!light)); }}>{light ? <Moon size={16} /> : <Sun size={16} />}</button>
      <button className="mind-tool" aria-label={full ? "Sair da tela cheia" : "Tela cheia"} title={full ? "Sair da tela cheia" : "Tela cheia"} onClick={toggleFull}>{full ? <Minimize size={16} /> : <Maximize size={16} />}</button>
    </div>
    <div className="mind-tools mind-zoom">
      <button className="mind-tool" aria-label="Diminuir zoom" onClick={() => scale(0.8)}><Minus size={15} /></button>
      <span className="min-w-9 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
      <button className="mind-tool" aria-label="Aumentar zoom" onClick={() => scale(1.25)}><Plus size={15} /></button>
      <button className="mind-tool" aria-label="Enquadrar mapa" title="Enquadrar mapa" onClick={fit}><Focus size={16} /></button>
    </div>
    <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-1 text-xs text-ink-2 sm:flex">
      <span aria-live="polite">{busy ? "Salvando…" : onChanged ? "Esquerdo seleciona · Direito arrasta" : "Somente leitura"}</span>
      {selected?.link && <a className="pointer-events-auto inline-flex items-center gap-1 text-blue" href={selected.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Abrir link</a>}
    </div>
    {!onChanged && selected?.link && <a className="mind-tools absolute bottom-16 left-3 p-2 text-xs sm:hidden" href={selected.link} target="_blank" rel="noopener noreferrer">Abrir link</a>}
  </section>;
}
