"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Focus, Minus, Maximize, Minimize, Moon, Sun, Plus, Undo2, ExternalLink, MousePointer2, Hand, ImagePlus, GitBranchPlus, Sparkles, Type, Square } from "lucide-react";
import { http } from "@/lib/client";
import type { MindNodeDTO } from "@/lib/types";
import { type ColorField } from "./MindColors";
import { imagesFromClipboard } from "@/lib/images";
import { prepareMindImage } from "@/lib/mind-image-client";
import { MindFormat } from "./MindFormat";
import { notify } from "@/components/ui/ConfirmProvider";

const branchColor = (value: string) => value.startsWith("#") ? value : `var(--color-${value})`;
function nodeWidth(node: MindNodeDTO) {
  if (node.imageData) return node.imageWidth;
  return Math.min(320, Math.max(node.parentId ? 72 : 120, Math.ceil(node.title.length * node.fontSize * 0.59 + 28)));
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
export function MindMap({ boardId, nodes, undoId = null, onChanged, onImport }: {
  boardId: string; nodes: MindNodeDTO[]; undoId?: number | null; onChanged?: () => Promise<void>; onImport?: () => void;
}) {
  const root = nodes.find(n => !n.parentId && !n.detached);
  const [selectedId, setSelectedId] = useState<string>();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const group = new Set(groupIds);
  function select(id?: string) {
    setGroupIds([]);
    setSelectedId(id);
  }
  const [tool, setTool] = useState<"select" | "hand" | "text" | "card">("select");
  const fileInput = useRef<HTMLInputElement>(null);
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
      finally { if (!--pending.current) setBusy(false); }
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
    const margin = Math.max(320, ...shown.map(n => nodeWidth(n) + 80));
    const height = Math.max(160, ...shown.map(n => n.imageData ? n.imageHeight + 80 : 160));
    const zoom = Math.max(0.05, Math.min(1, canvas.current.clientWidth / (right - left + margin), canvas.current.clientHeight / (bottom - top + height)));
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
    const pan = mouse && e.button === 1;
    if (gesture.current || (!secondary && !pan && e.button !== 0) ||
        element.closest("button,a,input:not([data-mind-title]),textarea")) return;
    const target = element.closest<HTMLElement>("[data-node]");
    const node = target && byId.get(target.dataset.node!);
    let mode: Gesture["mode"] = "click";
    if (secondary || pan || tool === "hand") mode = "pan";
    else if (!node && (tool === "text" || tool === "card")) mode = "click";
    else if (!node && (mouse || tool === "select")) mode = "box";
    else if (node && onChanged && !node.locked) mode = "move";
    else if (!mouse) mode = "pan";
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
    if (!g.moved && g.mode === "move") {
      if (editor) commitTitle();
      if (g.node && !group.has(g.node)) select(g.node);
    }
    g.moved = true;
    if (g.mode === "pan" || g.mode === "move") setGrabbing(true);
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
      return;
    }
    if (g.mode !== "move" || !g.ids.length) return;
    const dx = Math.round((e.clientX - g.start.x) / view.zoom);
    const dy = Math.round((e.clientY - g.start.y) / view.zoom);
    void save(async () => {
      await http.post(url + "/selecao", { action: "move", ids: g.ids, dx, dy });
    }).finally(() => setDrag(null));
  }
  function rename(n: MindNodeDTO) {
    select(n.id);
    if (onChanged && !n.imageData) {
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
  function addBranch(parentId: string | null, options: { point?: Point; shape?: "plain" | "rounded"; direction?: "right" | "left" } = {}) {
    const { point, shape = "plain", direction } = options;
    if (!onChanged) return;
    const draft = editor;
    setMenu(null);
    if (parentId && folded.has(parentId)) toggleFold(parentId);
    skipBlur.current = true;
    edit(null);
    void save(async () => {
      try {
        if (draft?.title.trim() && draft.title.trim() !== byId.get(draft.id)?.title)
          await http.patch(url, {id:draft.id, title:draft.title.trim()});
        const node = await http.post<MindNodeDTO>(url, { parentId, detached: parentId === null, title: parentId ? "Nova ideia" : "Novo texto", shape, direction, ...point });
        select(node.id);
        if (!point) focus(node, view.zoom);
        edit({id:node.id, title:node.title});
      } finally { skipBlur.current = false; }
    });
  }
  function centerPoint(): Point { return { x: Math.round(-view.x / view.zoom), y: Math.round(-view.y / view.zoom) }; }
  function freePoint() {
    const point = centerPoint();
    while (nodes.some(n => Math.abs(n.x - point.x) < 180 && Math.abs(n.y - point.y) < 64)) point.y += 80;
    return point;
  }
  function canvasPoint(x: number, y: number): Point {
    const bounds = canvas.current!.getBoundingClientRect();
    return { x: Math.round((x - bounds.left - bounds.width / 2 - view.x) / view.zoom), y: Math.round((y - bounds.top - bounds.height / 2 - view.y) / view.zoom) };
  }
  function insertImages(files: File[]) {
    if (!onChanged || !files.length) return;
    commitTitle(); setMenu(null); setTool("select");
    const point = freePoint();
    void save(async () => {
      for (const [index, file] of files.entries()) {
        const image = await prepareMindImage(file);
        const node = await http.post<MindNodeDTO>(url, { detached: true, title: file.name.slice(0, 160) || "Imagem", ...image, x: point.x + index * 40, y: point.y + index * 40 });
        select(node.id); focus(node, view.zoom);
      }
    });
  }
  const pasteImages = useEffectEvent((event: ClipboardEvent) => {
    if (!onChanged || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
    const target = event.target as HTMLElement;
    if (target !== document.body && !section.current?.contains(target)) return;
    if (target.closest("input,textarea,[contenteditable=true]") && !target.matches("[data-mind-title]")) return;
    const files = imagesFromClipboard(event.clipboardData);
    if (files.length) { event.preventDefault(); insertImages(files); }
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => pasteImages(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);
  function shortcut(e: React.KeyboardEvent, id: string) {
    if (!onChanged || byId.get(id)?.imageData || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat && !busy) {
        const parentId = e.key === "Enter" ? byId.get(id)?.parentId : id;
        if (!parentId) {
          commitTitle();
          return;
        }
        addBranch(parentId, { direction: "right" });
      }
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
    const ids = colorIds.filter(id => byId.get(id)?.parentId || byId.get(id)?.detached);
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
    commitTitle();
    select(undefined);
    setMenu(null);
    edit(null);
  }
  const selectionKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || document.querySelector('[aria-modal="true"]')) return;
    const target = event.target as HTMLElement;
    if (target !== document.body && !section.current?.contains(target)) return;
    if (event.key === "Escape") { dismiss(); return; }
    if (onChanged && event.key === "Enter" && !event.repeat && !busy && !selectedId && !groupIds.length &&
        !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !target.closest("input,textarea,select,button,a,[contenteditable=true]")) {
      event.preventDefault(); addBranch(null, { point: freePoint() }); return;
    }
    if (!onChanged || !["Delete", "Backspace"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || !colorIds.length) return;
    if (target.closest("input,textarea,select,[contenteditable=true]")) {
      if (!(target instanceof HTMLInputElement && target.hasAttribute("data-mind-title") && editor?.title === selected?.title &&
          target.selectionStart === 0 && target.selectionEnd === target.value.length)) return;
    }
    if (!colorIds.some(id => byId.get(id)?.parentId || byId.get(id)?.detached)) return;
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
  const groupNodes = groupIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const groupAnchor = groupNodes.find(n => !n.imageData) ?? groupNodes[0];
  const mixed = groupAnchor ? (["shape", "fontSize", "bold", "locked", "link"] as const).filter(key => groupNodes.some(n => n[key] !== groupAnchor[key])) : [];
  return <section ref={section} aria-label="Mapa mental" className={`card mind-map relative isolate min-h-64 flex-1 overflow-hidden bg-surface text-ink ${light ? "mind-canvas-light" : ""} ${full ? "!fixed inset-0 !z-[100] !rounded-none" : ""}`}>
    <div ref={canvas} data-mind-canvas tabIndex={0} aria-label="Área do mapa" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} data-grabbing={grabbing}
      onContextMenu={event => event.preventDefault()}
      onClick={event => {
        if (suppressedClick.current || (event.target as Element).closest("[data-node],button,a,input")) return;
        if (onChanged && (tool === "text" || tool === "card")) {
          addBranch(null, { point: canvasPoint(event.clientX, event.clientY), shape: tool === "card" ? "rounded" : "plain" });
          setTool("select");
        } else { dismiss(); event.currentTarget.focus({ preventScroll: true }); }
      }} data-tool={tool}
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
            return <path key={n.id} d={`M ${start} ${parent.y} C ${mid} ${parent.y}, ${mid} ${n.y}, ${end} ${n.y}`} fill="none" stroke={branchColor(n.color)} strokeWidth={2} strokeLinecap="round" />;
          })}
        </svg>
        {shown.map(n => {
          const active = selectedId === n.id;
          const marked = active || group.has(n.id);
          const width = nodeWidth(n);
          const isLeft = !!root && n.x < root.x;
          const central = !n.parentId && !n.detached;
          const hasChildren = children.has(n.id);
          return <div key={n.id} className="absolute" style={{ left: n.x, top: n.y }}>
            <div data-node={n.id} role="button" tabIndex={0} aria-pressed={marked} title={n.title}
              onClick={() => { if (tool !== "hand" && !suppressedClick.current && editor?.id !== n.id) rename(n); }}
              onKeyDown={e => {
                if (e.key === "Escape") { dismiss(); return; }
                if (e.target !== e.currentTarget) return;
                if (!active && (e.key === " " || e.key === "Enter")) { e.preventDefault(); rename(n); }
                else if (active) shortcut(e, n.id);
              }}
              className="mind-node" data-shape={n.shape} data-root={central} data-image={!!n.imageData}
              style={{ width, borderColor: branchColor(n.color), textDecoration: central && n.shape === "plain" && n.color.startsWith("#") ? "underline" : undefined, textDecorationColor: branchColor(n.color), color: n.textColor || undefined, fontSize: n.fontSize, fontWeight: n.bold ? 700 : undefined }}>
              {n.imageData
                // Images are authenticated board data, not remote optimization sources.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={n.imageData} alt={n.title} draggable={false} style={{ width: n.imageWidth, height: n.imageHeight, objectFit: "contain" }} />
                : editor?.id === n.id && onChanged
                ? <input data-mind-title aria-label="Texto do ramo" autoFocus onFocus={e => e.target.select()} maxLength={160} value={editor.title}
                    className="w-full min-w-0 select-text bg-transparent text-center outline-none" style={{ backgroundColor: n.highlight || undefined }}
                    onChange={e => edit({ id: n.id, title: e.target.value })} onBlur={commitTitle}
                    onKeyDown={e => { if (e.key === "Escape") { commitTitle(); select(undefined); e.stopPropagation(); } else shortcut(e, n.id); }} />
                : <span className="line-clamp-3 [overflow-wrap:anywhere]" style={{ backgroundColor: n.highlight || undefined }}>{n.title}</span>}
            </div>
            {active && central && onChanged && <div className="mind-handles" style={{ right: width / 2 + 6 }}><button className="mind-handle" aria-label="Adicionar ramo à esquerda" title="Adicionar ramo à esquerda" disabled={busy} onClick={() => addBranch(n.id, { direction: "left" })}><Plus size={14} /></button></div>}
            {!n.imageData && (active || folded.has(n.id)) && <div className="mind-handles" style={isLeft && !central ? { right: width / 2 + 4 } : { left: width / 2 + 4 }}>
              {active && onChanged && <button className="mind-handle" aria-label={central ? "Adicionar ramo à direita" : "Adicionar ramo"} title="Adicionar sub-ramo (Tab)" disabled={busy} onClick={() => addBranch(n.id, { direction: "right" })}><Plus size={14} /></button>}
              {hasChildren && <button className="mind-handle" aria-label={folded.has(n.id) ? "Expandir ramo" : "Recolher ramo"} title={folded.has(n.id) ? "Expandir ramo" : "Recolher ramo"} onClick={() => toggleFold(n.id)}>{folded.has(n.id) ? descendants(n.id).length : <Minus size={12} />}</button>}
            </div>}
          </div>;
        })}
      </div>
    </div>
    {box && <div aria-hidden="true" className="mind-marquee" style={box} />}
    {menu && root && onChanged && <div className="mind-create-menu mind-tools" role="group" aria-label="Criar no mapa" style={{ left: menu.screen.x, top: menu.screen.y }}>
      <button className="mind-tool" onClick={() => addBranch(null, { point: menu.at })}><Type size={15} /> Criar texto</button>
      <button className="mind-tool" onClick={() => addBranch(null, { point: menu.at, shape: "rounded" })}><Square size={15} /> Criar cartão</button>
      <button className="mind-tool" onClick={() => fileInput.current?.click()}><ImagePlus size={15} /> Inserir imagem</button>
      {selected && !selected.imageData && <button className="mind-tool" onClick={() => addBranch(selected.id, { point: menu.at })}><Plus size={15} /> Ramo da seleção</button>}
    </div>}
    {anchor && onChanged && !drag && !box && !menu && <div className="mind-context" style={{
      "--mind-x": `${view.x + anchor.x * view.zoom}px`,
      "--mind-y": `${view.y + anchor.y * view.zoom}px`,
    } as React.CSSProperties}>
      <MindFormat key={anchor.id} node={anchor} imageOnly={!!anchor.imageData} busy={busy} preview={previewColor} commit={commitColor}
        change={patch => void save(async () => { await http.patch(url, { id: anchor.id, ...patch }); })} remove={remove} />
    </div>}
    {group.size > 1 && groupAnchor && !box && !drag && !menu && <div className="mind-group" aria-label="Seleção de ramos">
      {onChanged ? <MindFormat key={groupIds.join(":")} node={groupAnchor} count={group.size} mixed={mixed} imageOnly={groupNodes.every(n => !!n.imageData)} busy={busy}
        preview={previewColor} commit={commitColor} remove={remove}
        change={patch => void save(async () => { await http.post(url + "/selecao", { action: "format", ids: groupIds, patch }); })} />
        : <span className="mind-tools p-2 text-xs">{group.size} selecionados</span>}
    </div>}
    <input ref={fileInput} type="file" accept="image/*" multiple hidden aria-label="Arquivo de imagem" onChange={e => { insertImages(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    <div className="mind-tools mind-sidebar" role="toolbar" aria-label="Ferramentas do mapa">
      <button className="mind-tool" title="Selecionar e mover blocos" aria-label="Selecionar" aria-pressed={tool === "select"} onClick={() => setTool("select")}><MousePointer2 size={18} /></button>
      <button className="mind-tool" title="Mover a visualização" aria-label="Mover visualização" aria-pressed={tool === "hand"} onClick={() => { commitTitle(); setTool("hand"); }}><Hand size={18} /></button>
      {onChanged && <>
        <span className="mind-divider" />
        <button className="mind-tool" title="Criar texto: escolha um lugar no mapa" aria-label="Criar texto" aria-pressed={tool === "text"} onClick={() => { commitTitle(); select(undefined); setTool("text"); }}><Type size={18} /></button>
        <button className="mind-tool" title="Criar cartão: escolha um lugar no mapa" aria-label="Criar cartão" aria-pressed={tool === "card"} onClick={() => { commitTitle(); select(undefined); setTool("card"); }}><Square size={18} /></button>
        <button className="mind-tool" title="Inserir imagem (ou cole com Ctrl+V / ⌘V)" aria-label="Inserir imagem" onClick={() => fileInput.current?.click()}><ImagePlus size={18} /></button>
        <button className="mind-tool" title="Adicionar ramo à seleção (Tab)" aria-label="Novo ramo" disabled={busy || !selected || !!selected.imageData} onClick={() => selected && addBranch(selected.id, { direction: "right" })}><GitBranchPlus size={18} /></button>
        {onImport && <button className="mind-tool" title="Importar prints com IA" aria-label="Importar prints com IA" onClick={onImport}><Sparkles size={18} /></button>}
        <span className="mind-divider" />
        <button className="mind-tool" aria-label="Desfazer" title="Desfazer (Ctrl+Z ou ⌘Z)" disabled={busy || !undoId} onClick={undo}><Undo2 size={17} /></button>
      </>}
    </div>
    <div className="mind-tools mind-history">
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
      <span aria-live="polite">{busy ? "Salvando…" : onChanged ? "Esquerdo seleciona e move blocos · Direito move o mapa" : "Somente leitura"}</span>
      {selected?.link && <a className="pointer-events-auto inline-flex items-center gap-1 text-blue" href={selected.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Abrir link</a>}
    </div>
    {!onChanged && selected?.link && <a className="mind-tools absolute bottom-16 left-3 p-2 text-xs sm:hidden" href={selected.link} target="_blank" rel="noopener noreferrer">Abrir link</a>}
  </section>;
}
