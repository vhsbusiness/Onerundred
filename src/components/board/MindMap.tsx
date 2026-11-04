"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Focus, Minus, Maximize, Minimize, Moon, Sun, Plus, Undo2, ExternalLink, SquareDashedMousePointer, Trash2, Type, Square } from "lucide-react";
import { http } from "@/lib/client";
import type { MindNodeDTO } from "@/lib/types";
import { MindColors, type ColorField } from "./MindColors";
import { MindFormat } from "./MindFormat";
import { notify } from "@/components/ui/ConfirmProvider";

const branchColor = (value: string) => value.startsWith("#") ? value : `var(--color-${value})`;
function nodeWidth(node: MindNodeDTO) {
  return Math.min(210, Math.max(node.parentId ? 72 : 120, Math.ceil(node.title.length * node.fontSize * 0.59 + 28)));
}

type Point = { x: number; y: number };
type HitBox = { id: string; rect: DOMRect };
type Gesture = {
  pointer: number; start: Point; origin: Point; moved: boolean;
  mode: "click" | "pan" | "box" | "move"; ids: string[]; boxes: HitBox[];
  node?: string; secondary: boolean;
};
type Paint = { ids: Set<string>; value: string };
function selectionBox(start: Point, end: Point) {
  return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
export function MindMap({ boardId, nodes, undoId = null, onChanged }: {
  boardId: string; nodes: MindNodeDTO[]; undoId?: number | null; onChanged?: () => Promise<void>;
}) {
  const root = nodes.find(n => !n.parentId);
  const [selectedId, setSelectedId] = useState<string>();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const group = new Set(groupIds);
  function select(id?: string) {
    setGroupIds([]);
    setSelectedId(id);
  }
  const [boxTool, setBoxTool] = useState(false);
  const [box, setBox] = useState<ReturnType<typeof selectionBox> | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [menu, setMenu] = useState<{ at: Point; screen: Point } | null>(null);
  const [paints, setPaints] = useState<Partial<Record<ColorField, Paint>>>({});

  const selected = nodes.find(n => n.id === selectedId);
  const [view, setView] = useState({ x: -(root?.x ?? 0), y: -(root?.y ?? 0), zoom: 1 });
  const [drag, setDrag] = useState<(Point & { ids: Set<string> }) | null>(null);
  const [editor, edit] = useState<{id: string; title: string} | null>(null);
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
  const visible = nodes.map(node => {
    let next = node;
    if (drag?.ids.has(node.id)) next = { ...node, x: node.x + drag.x, y: node.y + drag.y };
    for (const field of ["color", "textColor", "highlight"] as const) {
      const paint = paints[field];
      if (paint?.ids.has(node.id)) next = { ...next, [field]: paint.value };
    }
    return next;
  });
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
  function openCreateMenu(client: Point) {
    if (!onChanged || !canvas.current) return;
    const bounds = canvas.current.getBoundingClientRect();
    const x = client.x - bounds.left, y = client.y - bounds.top;
    setMenu({
      screen: { x: Math.max(4, Math.min(x, bounds.width - 196)), y: Math.max(4, Math.min(y, bounds.height - 152)) },
      at: { x: Math.round((x - bounds.width / 2 - view.x) / view.zoom), y: Math.round((y - bounds.height / 2 - view.y) / view.zoom) },
    });
  }
  function start(e: PointerEvent<HTMLDivElement>) {
    const element = e.target as Element;
    const mouse = e.pointerType === "mouse";
    const secondary = mouse && (e.button === 2 || (e.button === 0 && e.ctrlKey));
    const pan = mouse && (e.button === 1 || (secondary && e.altKey));
    if (gesture.current || (!secondary && !pan && e.button !== 0) ||
        element.closest("button,a") || (!secondary && !pan && element.closest("input,textarea"))) return;
    const target = element.closest<HTMLElement>("[data-node]");
    const node = target && byId.get(target.dataset.node!);
    let mode: Gesture["mode"] = "click";
    if (pan) mode = "pan";
    else if (!node && (secondary || boxTool)) mode = "box";
    else if (secondary || !mouse) mode = node && onChanged && !node.locked ? "move" : "pan";
    const ids = node && group.has(node.id) ? groupIds.filter(id => byId.has(id) && !byId.get(id)?.locked) : node ? [node.id] : [];
    if (secondary || pan) {
      e.preventDefault();
      setGrabbing(true);
    }
    if (mode === "box" && editor) commitTitle();
    setMenu(null);
    suppressedClick.current = false;
    gesture.current = {
      pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin: view, moved: false, ids, mode, secondary, node: node?.id,
      boxes: mode === "box" ? Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-node]"), el => ({ id: el.dataset.node!, rect: el.getBoundingClientRect() })) : [],
    };
    (target ?? e.currentTarget).setPointerCapture(e.pointerId);
  }
  function selectArea(g: Gesture, end: Point) {
    const area = selectionBox(g.start, end);
    const bounds = canvas.current!.getBoundingClientRect();
    setBox({ ...area, left: area.left - bounds.left, top: area.top - bounds.top });
    const hits = g.boxes.filter(({ rect }) => rect.right >= area.left && rect.left <= area.left + area.width &&
      rect.bottom >= area.top && rect.top <= area.top + area.height).map(({ id }) => id);
    setSelectedId(hits.length === 1 ? hits[0] : undefined);
    setGroupIds(hits.length > 1 ? hits : []);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    if (!g.secondary && g.mode === "pan") setGrabbing(true);
    if (g.mode === "box") selectArea(g, { x: e.clientX, y: e.clientY });
    if (g.mode === "move") setDrag({ ids: new Set(g.ids), x: Math.round(dx / view.zoom), y: Math.round(dy / view.zoom) });
    if (g.mode === "pan") setView({ ...view, x: g.origin.x + dx, y: g.origin.y + dy });
  }
  function finish(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    suppressedClick.current = g.moved || g.secondary;
    setGrabbing(false);
    setBox(null);
    if (e.type === "pointercancel" || e.type === "lostpointercapture") { setDrag(null); return; }
    if (!g.moved) {
      if (g.secondary && !g.node) openCreateMenu({ x: e.clientX, y: e.clientY });
      else if (g.secondary && g.node && !group.has(g.node)) select(g.node);
      return;
    }
    if (g.mode !== "move" || !g.ids.length) return;
    const dx = Math.round((e.clientX - g.start.x) / view.zoom);
    const dy = Math.round((e.clientY - g.start.y) / view.zoom);
    void save(async () => {
      await http.post(url + "/selecao", { action: "move", ids: g.ids, dx, dy });
    });
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
  function addBranch(parentId: string, point?: Point, shape: "plain" | "rounded" = "plain") {
    if (!onChanged) return;
    const draft = editor;
    setMenu(null);
    if (folded.has(parentId)) toggleFold(parentId);
    skipBlur.current = true;
    edit(null);
    void save(async () => {
      try {
        if (draft?.title.trim() && draft.title.trim() !== byId.get(draft.id)?.title)
          await http.patch(url, {id:draft.id, title:draft.title.trim()});
        const node = await http.post<MindNodeDTO>(url, { parentId, title: "Nova ideia", shape, ...point });
        select(node.id);
        if (!point) focus(node, view.zoom);
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
  const colorIds = selected ? [selected.id] : groupIds;
  function previewColor(field: ColorField, value: string) {
    setPaints(previous => ({ ...previous, [field]: { ids: new Set(colorIds), value } }));
  }
  function commitColor(field: ColorField, value: string) {
    const paint = { ids: new Set(colorIds), value };
    setPaints(previous => ({ ...previous, [field]: paint }));
    void save(async () => {
      if (colorIds.length === 1) await http.patch(url, { id: colorIds[0], [field]: value });
      else await http.post(url + "/selecao", { action: "paint", ids: colorIds, field, value });
    }).finally(() => setPaints(previous => {
      if (previous[field] !== paint) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    }));
  }
  function remove() {
    const ids = colorIds.filter(id => byId.get(id)?.parentId);
    if (!ids.length || !onChanged) return;
    edit(null);
    select(undefined);
    void save(async () => {
      if (ids.length === 1) await http.del(url, { id: ids[0] });
      else await http.post(url + "/selecao", { action: "delete", ids });
    });
  }
  function undo() {
    const waitForSave = pending.current > 0;
    if (undoQueued.current || (!undoId && !waitForSave)) return;
    undoQueued.current = true;
    edit(null);
    setMenu(null);
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
  function dismiss() {
    select(undefined);
    setMenu(null);
    edit(null);
  }
  const selectionKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || document.querySelector('[aria-modal="true"]')) return;
    const target = event.target as HTMLElement;
    if (target !== document.body && !section.current?.contains(target)) return;
    if (event.key === "Escape") { dismiss(); return; }
    if (!onChanged || !["Delete", "Backspace"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || !colorIds.length) return;
    if (target.closest("input,textarea,select,[contenteditable=true]")) {
      if (!(target instanceof HTMLInputElement && target.hasAttribute("data-mind-title") && editor?.title === selected?.title &&
          target.selectionStart === 0 && target.selectionEnd === target.value.length)) return;
    }
    if (!colorIds.some(id => byId.get(id)?.parentId)) return;
    event.preventDefault();
    if (!event.repeat) remove();
  });
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
    const listener = (event: KeyboardEvent) => { selectionKey(event); keyUndo(event); };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  const anchor = selected && byId.get(selected.id);
  return <section ref={section} aria-label="Mapa mental" className={`card mind-map relative isolate min-h-64 flex-1 overflow-hidden bg-surface text-ink ${light ? "mind-canvas-light" : ""} ${full ? "!fixed inset-0 !z-[100] !rounded-none" : ""}`}>
    <div ref={canvas} data-mind-canvas onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} data-grabbing={grabbing}
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
          const marked = active || group.has(n.id);
          const width = nodeWidth(n);
          const isLeft = !!root && n.x < root.x;
          const hasChildren = children.has(n.id);
          return <div key={n.id} className="absolute" style={{ left: n.x, top: n.y }}>
            <div data-node={n.id} role="button" tabIndex={0} aria-pressed={marked} title={n.title}
              onClick={() => { if (!suppressedClick.current && editor?.id !== n.id) rename(n); }}
              onKeyDown={e => {
                if (e.key === "Escape") { dismiss(); return; }
                if (e.target !== e.currentTarget) return;
                if (!active && (e.key === " " || e.key === "Enter")) { e.preventDefault(); rename(n); }
                else if (active) shortcut(e, n.id);
              }}
              className="mind-node" data-shape={n.shape} data-root={!n.parentId}
              style={{ width, borderColor: branchColor(n.color), textDecoration: !n.parentId && n.shape === "plain" && n.color.startsWith("#") ? "underline" : undefined, textDecorationColor: branchColor(n.color), color: n.textColor || undefined, fontSize: n.fontSize, fontWeight: n.bold ? 700 : undefined }}>
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
    {box && <div aria-hidden="true" className="mind-marquee" style={box} />}
    {menu && root && onChanged && <div className="mind-create-menu mind-tools" role="group" aria-label="Criar no mapa" style={{ left: menu.screen.x, top: menu.screen.y }}>
      <button className="mind-tool" onClick={() => addBranch(root.id, menu.at)}><Type size={15} /> Criar texto</button>
      <button className="mind-tool" onClick={() => addBranch(root.id, menu.at, "rounded")}><Square size={15} /> Criar cartão</button>
      {selected?.parentId && <button className="mind-tool" onClick={() => addBranch(selected.id, menu.at)}><Plus size={15} /> Ramo da seleção</button>}
    </div>}
    {anchor && onChanged && !drag && !box && !menu && <div className="mind-context" style={{
      "--mind-x": `${view.x + anchor.x * view.zoom}px`,
      "--mind-y": `${view.y + anchor.y * view.zoom}px`,
    } as React.CSSProperties}>
      <MindFormat key={anchor.id} node={anchor} busy={busy} preview={previewColor} commit={commitColor}
        change={patch => void save(async () => { await http.patch(url, { id: anchor.id, ...patch }); })} remove={remove} />
    </div>}
    {group.size > 1 && !box && !drag && !menu && <div className="mind-tools mind-group" role="group" aria-label="Seleção de ramos">
      <span className="px-1 text-xs">{group.size} selecionados</span>
      {onChanged && byId.has(groupIds[0]) && <>
        <MindColors node={byId.get(groupIds[0])!} preview={previewColor} commit={commitColor} />
        <button className="mind-tool" aria-label="Excluir seleção" title="Excluir seleção" onClick={remove}><Trash2 size={15} /></button>
      </>}
    </div>}
    <div className="mind-tools mind-history">
      <button className="mind-tool" title="Selecionar área" aria-label="Selecionar área" aria-pressed={boxTool} onClick={() => { setBoxTool(!boxTool); setMenu(null); }}><SquareDashedMousePointer size={16} /></button>
      {onChanged && <button className="mind-tool sm:!hidden" aria-label="Criar no mapa" onClick={() => {
        const bounds = canvas.current!.getBoundingClientRect();
        openCreateMenu({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
      }}><Plus size={15} /></button>}
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
      <span aria-live="polite">{busy ? "Salvando…" : onChanged ? "Direito no fundo: criar ou selecionar área · Alt + direito: mover mapa" : "Somente leitura"}</span>
      {selected?.link && <a className="pointer-events-auto inline-flex items-center gap-1 text-blue" href={selected.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Abrir link</a>}
    </div>
    {!onChanged && selected?.link && <a className="mind-tools absolute bottom-16 left-3 p-2 text-xs sm:hidden" href={selected.link} target="_blank" rel="noopener noreferrer">Abrir link</a>}
  </section>;
}
