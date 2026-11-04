"use client";

import { useEffect, useEffectEvent, useRef, useState, useMemo, type PointerEvent } from "react";
import { Focus, Minus, Maximize, Minimize, Moon, Sun, Plus, Undo2, ExternalLink, MousePointer2, Hand, ImagePlus, GitBranchPlus, Sparkles, Type, Square, Pencil, ClipboardPaste, Spline, Slash, Redo2, Search, X, ChevronUp, ChevronDown, ChevronsDownUp, Download } from "lucide-react";
import { http } from "@/lib/client";
import type { MindNodeDTO } from "@/lib/types";
import { MindColors, type ColorField } from "./MindColors";
import { imagesFromClipboard } from "@/lib/images";
import { prepareMindImage } from "@/lib/mind-image-client";
import { copyMindSelection, readMindClipboard, MIND_CLIPBOARD_MIME, MIND_CLIPBOARD_PREFIX, type MindClipboard } from "@/lib/mind-clipboard";
import { textBlockSize } from "@/lib/mind-size";
import { mindBranchIds } from "@/lib/mind-tree";
import { mindDropTarget } from "@/lib/mind-drop";
import { readMindText, writeMindText, safeMindTextStyle } from "@/lib/mind-text-clipboard";
import { isMindRoot } from "@/lib/mind-root";
import { parseDrawing, normalizeDrawing, inkPath } from "@/lib/mind-drawing";
import { fadeMindItems } from "./mind-motion";
import { exportMindMap } from "@/lib/mind-export";
import { MindConnect } from "./MindConnect";
import { MindFormat } from "./MindFormat";
import { notify } from "@/components/ui/ConfirmProvider";

const branchColor = (value: string) => value.startsWith("#") ? value : `var(--color-${value})`;
function nodeWidth(node: MindNodeDTO) {
  if (node.imageData) return node.imageWidth;
  return textBlockSize(node).width;
}

type Point = { x: number; y: number };
type HitBox = { id: string; rect: DOMRect };
type Gesture = {
  pointer: number; start: Point; origin: Point; moved: boolean;
  mode: "click" | "pan" | "box" | "move" | "draw" | "resize";
  size?: { width: number; height: number };
  draft?: { id: string; title: string };
  ink?: Point[]; color?: string; strokeWidth?: number; ids: string[]; boxes: HitBox[];
  node?: string; roots: string[]; secondary: boolean;
  drop?: { id: string; parentId: string } | null;
};
type Ink = { points: Point[]; color: string; width: number };
type PendingInk = Ink & { key: string; nodeId?: string; failed?: boolean };
type PointerEnd = Pick<globalThis.PointerEvent, "type" | "pointerId" | "clientX" | "clientY">;
type Paint = { ids: Set<string>; value: string };
function selectionBox(start: Point, end: Point) {
  return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
export function MindMap({ boardId, nodes, undoId = null, redoId = null, onChanged, onImport }: {
  boardId: string; nodes: MindNodeDTO[]; undoId?: number | null; redoId?: number | null; onChanged?: () => Promise<void>; onImport?: () => void;
}) {
  const root = nodes.find(isMindRoot);
  const [selectedId, setSelectedId] = useState<string>();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const group = new Set(groupIds);
  function select(id?: string) {
    setGroupIds([]);
    setSelectedId(id);
  }
  const [tool, setTool] = useState<"select" | "hand" | "text" | "draw">("select");
  const [penColor, setPenColor] = useState("blue");
  const [penWidth, setPenWidth] = useState(3);
  const [ink, setInk] = useState<Ink | null>(null);
  const [pendingInk, setPendingInk] = useState<PendingInk[]>([]);
  useEffect(() => {
    const confirmed = new Set(nodes.map(n => n.id));
    // Keep a stroke visible until the server snapshot actually contains it, not just until POST finishes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingInk(old => old.some(s => s.nodeId && confirmed.has(s.nodeId)) ? old.filter(s => !s.nodeId || !confirmed.has(s.nodeId)) : old);
  }, [nodes]);
  const gesture = useRef<Gesture | null>(null);
  const drawings = useMemo(() => new Map(nodes.filter(n => n.drawing).map(n => [n.id, parseDrawing(n.drawing)])), [nodes]);
  const widthOf = (n: MindNodeDTO) => drawings.get(n.id)?.width ?? nodeWidth(n);
  const [animateView, setAnimateView] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState<ReturnType<typeof selectionBox> | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [menu, setMenu] = useState<{ at: Point; screen: Point } | null>(null);
  const [paints, setPaints] = useState<Partial<Record<ColorField, Paint>>>({});

  const selected = nodes.find(n => n.id === selectedId);
  const [view, setView] = useState({ x: -(root?.x ?? 0), y: -(root?.y ?? 0), zoom: 1 });
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [drag, setDrag] = useState<(Point & { ids: Set<string> }) | null>(null);
  const [resize, setResize] = useState<{ id: string; textWidth: number; textHeight: number } | null>(null);
  const [editor, edit] = useState<{id: string; title: string} | null>(null);
  const [full, setFull] = useState(false);
  const [light, setLight] = useState(false);
  const [straightLines, setStraightLines] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultIndex, setResultIndex] = useState(0);
  const matches = query.trim() ? nodes.filter(n => n.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  function reveal(node: MindNodeDTO) {
    commitTitle(); select(node.id);
    const ancestors = new Set<string>();
    let parent = node.parentId;
    while (parent) { ancestors.add(parent); parent = nodes.find(n => n.id === parent)?.parentId ?? null; }
    setFolded(old => new Set([...old].filter(id => !ancestors.has(id))));
    focus(node, Math.max(view.zoom, .8));
  }
  function findResult(index: number) {
    if (!matches.length) return;
    const next = (index + matches.length) % matches.length;
    setResultIndex(next); reveal(matches[next]);
  }
  const section = useRef<HTMLElement>(null);
  const skipBlur = useRef(false);
  const suppressedClick = useRef(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLight(localStorage.getItem("mind-light:" + boardId) === "true");
    setStraightLines(localStorage.getItem("mind-lines:" + boardId) === "straight");
  }, [boardId]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      if (gesture.current?.mode === "draw") return;
      setAnimateView(false);
      const rect = element!.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2, py = e.clientY - rect.top - rect.height / 2;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1);
      setView(old => {
        const zoom = Math.max(0.05, Math.min(2.5, old.zoom * Math.exp(-delta * 0.002)));
        return { zoom, x: px - (px - old.x) * zoom / old.zoom, y: py - (py - old.y) * zoom / old.zoom };
      });
    }
    const sync = () => setFull(document.fullscreenElement === section.current);
    const escape = (e: globalThis.KeyboardEvent) => { if (!e.defaultPrevented && e.key === "Escape" && !document.fullscreenElement) setFull(false); };
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
  const canvas = useRef<HTMLDivElement>(null);
  const url = `/api/boards/${boardId}/mapa`;
  const visible = nodes.map(node => {
    let next = resize?.id === node.id ? { ...node, textWidth: resize.textWidth, textHeight: resize.textHeight } : node;
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
    setAnimateView(true);
    setView({ x: -point.x * zoom, y: -point.y * zoom, zoom });
  }
  function scale(factor: number) {
    setAnimateView(true);
    const zoom = Math.max(0.05, Math.min(2.5, view.zoom * factor));
    setView({ zoom, x: view.x * zoom / view.zoom, y: view.y * zoom / view.zoom });
  }
  function fit() {
    if (!canvas.current || !nodes.length) return;
    const xs = shown.map(n => n.x), ys = shown.map(n => n.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const margin = Math.max(320, ...shown.map(n => widthOf(n) + 80));
    const height = Math.max(160, ...shown.map(n => (drawings.get(n.id)?.height ?? (n.imageData ? n.imageHeight : textBlockSize(n).height)) + 80));
    const zoom = Math.max(0.05, Math.min(1, canvas.current.clientWidth / (right - left + margin), canvas.current.clientHeight / (bottom - top + height)));
    focus({ x: (left + right) / 2, y: (top + bottom) / 2 }, zoom);
  }
  function openCreateMenu(client: Point) {
    if (!onChanged || !canvas.current) return;
    const bounds = canvas.current.getBoundingClientRect();
    const x = client.x - bounds.left, y = client.y - bounds.top;
    setMenu({
      screen: { x: Math.max(4, Math.min(x, bounds.width - 196)), y: Math.max(4, Math.min(y, bounds.height - 196)) },
      at: { x: Math.round((x - bounds.width / 2 - view.x) / view.zoom), y: Math.round((y - bounds.height / 2 - view.y) / view.zoom) },
    });
  }
  function canvasPoint(x: number, y: number): Point {
    const bounds = canvas.current!.getBoundingClientRect();
    return { x: Math.round((x - bounds.left - bounds.width / 2 - view.x) / view.zoom), y: Math.round((y - bounds.top - bounds.height / 2 - view.y) / view.zoom) };
  }
  function startResize(e: PointerEvent<HTMLButtonElement>, node: MindNodeDTO) {
    if (!onChanged || e.button !== 0 || gesture.current) return;
    e.preventDefault(); e.stopPropagation(); commitTitle(); setAnimateView(false);
    gesture.current = { pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin: view, moved: false,
      mode: "resize", size: textBlockSize(node), ids: [node.id], roots: [node.id], boxes: [], node: node.id, secondary: false };
    canvas.current?.setPointerCapture(e.pointerId);
  }
  function start(e: PointerEvent<HTMLDivElement>) {
    const element = e.target as Element;
    const mouse = e.pointerType === "mouse";
    const secondary = mouse && (e.button === 2 || (e.button === 0 && e.ctrlKey));
    const pan = mouse && e.button === 1;
    if (!e.isPrimary || gesture.current || (!secondary && !pan && e.button !== 0) ||
        element.closest("button,a,input:not([data-mind-title]),textarea:not([data-mind-title])")) return;
    setAnimateView(false);
    const target = element.closest<HTMLElement>("[data-node]");
    const node = target && byId.get(target.dataset.node!);
    let mode: Gesture["mode"] = "click";
    if (secondary || pan || tool === "hand") mode = "pan";
    else if (tool === "draw" && onChanged) mode = "draw";
    else if (!node && tool === "text") mode = "click";
    else if (!node && (mouse || tool === "select")) mode = "box";
    else if (node && onChanged && !node.locked) mode = "move";
    else if (!mouse) mode = "pan";
    const roots = node && group.has(node.id) ? groupIds.filter(id => byId.has(id)) : node ? [node.id] : [];
    const ids = mode === "move" ? [...mindBranchIds(nodes, roots)] : roots;
    if (mode === "move" && ids.some(id => byId.get(id)?.locked)) {
      notify("Este ramo contém itens fixados. Desfixe-os para mover o conjunto.", "info");
      return;
    }
    if (secondary || pan) {
      e.preventDefault();
      setGrabbing(true);
    }
    if ((mode === "box" || mode === "draw") && editor) commitTitle();
    if (mode === "draw") {
      e.preventDefault(); select(undefined);
      setInk({ points: [canvasPoint(e.clientX, e.clientY)], color: penColor, width: penWidth });
    }
    setMenu(null);
    suppressedClick.current = false;
    gesture.current = {
      ...(mode === "draw" && { ink: [canvasPoint(e.clientX, e.clientY)], color: penColor, strokeWidth: penWidth }),
      pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin: view, moved: false, ids, roots, mode, secondary, node: node?.id,
      boxes: mode === "box" || mode === "move" ? Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-node]"), el => ({ id: el.dataset.node!, rect: el.getBoundingClientRect() })) : [],
    };
    (mode === "draw" ? e.currentTarget : target ?? e.currentTarget).setPointerCapture(e.pointerId);
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
    if (g.mode === "resize" && g.size && g.node) {
      g.moved = true;
      setResize({ id: g.node, textWidth: Math.min(1200, Math.max(72, Math.round(g.size.width + (e.clientX - g.start.x) * 2 / view.zoom))),
        textHeight: Math.min(1200, Math.max(24, Math.round(g.size.height + (e.clientY - g.start.y) * 2 / view.zoom))) });
      return;
    }
    if (g.mode === "draw") return; // Document capture keeps drawing even if pointer capture is lost.
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved && g.mode === "move") {
      if (editor) { g.draft = editor; skipBlur.current = true; edit(null); }
      if (g.node && !group.has(g.node)) select(g.node);
    }
    g.moved = true;
    if (g.mode === "pan" || g.mode === "move") setGrabbing(true);
    if (g.mode === "box") selectArea(g, { x: e.clientX, y: e.clientY });
    if (g.mode === "move") {
      setDrag({ ids: new Set(g.ids), x: Math.round(dx / view.zoom), y: Math.round(dy / view.zoom) });
      g.drop = e.metaKey || e.ctrlKey ? null : mindDropTarget(nodes, g.roots, g.boxes, { x: e.clientX, y: e.clientY });
      setDropTarget(g.drop?.parentId ?? null);
    }
    if (g.mode === "pan") setView({ ...view, x: g.origin.x + dx, y: g.origin.y + dy });
  }
  function saveStroke(stroke: PendingInk) {
    void save(async () => {
      if (stroke.nodeId) return; // Only refresh if POST succeeded but the following read failed.
      try {
        const node = await http.post<MindNodeDTO>(url, { inkId: stroke.key, detached: true, title: "Desenho", ...normalizeDrawing(stroke.points), color: stroke.color, strokeWidth: stroke.width });
        setPendingInk(old => old.map(s => s.key === stroke.key ? { ...s, nodeId: node.id, failed: false } : s));
      } catch (e) {
        setPendingInk(old => old.map(s => s.key === stroke.key ? { ...s, failed: true } : s));
        throw e;
      }
    });
  }
  function finish(e: PointerEnd) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    suppressedClick.current = g.moved || g.secondary || g.mode === "draw";
    setGrabbing(false);
    setBox(null);
    setDropTarget(null);
    if (g.draft) skipBlur.current = false;
    if (e.type === "pointercancel" || e.type === "lostpointercapture") { setDrag(null); setResize(null); setInk(null); if (g.draft) edit(g.draft); return; }
    if (g.mode === "draw" && g.ink) {
      // A quick release can arrive before the browser dispatches its next pointermove.
      // Always include the release position, even for a stroke shorter than the sampling threshold.
      const last = g.ink[g.ink.length - 1], end = canvasPoint(e.clientX, e.clientY);
      if (last.x !== end.x || last.y !== end.y) {
        if (g.ink.length >= 4096) g.ink = g.ink.filter((_, i) => i % 2 === 0);
        g.ink.push(end);
      }
      const normalized = normalizeDrawing(g.ink);
      setInk(null);
      if (!parseDrawing(normalized.drawing)) { notify("Faça um traço menor para salvar o desenho.", "error"); return; }
      const key = "ink_" + crypto.randomUUID();
      const pendingStroke = { key, points: g.ink, color: g.color!, width: g.strokeWidth! };
      setPendingInk(previous => [...previous, pendingStroke]);
      saveStroke(pendingStroke);
      return;
    }
    if (g.mode === "resize" && g.node && g.size) {
      const textWidth = Math.min(1200, Math.max(72, Math.round(g.size.width + (e.clientX - g.start.x) * 2 / view.zoom)));
      const textHeight = Math.min(1200, Math.max(24, Math.round(g.size.height + (e.clientY - g.start.y) * 2 / view.zoom)));
      if (textWidth === g.size.width && textHeight === g.size.height) { setResize(null); return; }
      void save(async () => { await http.patch(url, { id: g.node, textWidth, textHeight }); }).finally(() => setResize(null));
      return;
    }
    if (!g.moved) {
      if (g.secondary && !g.node) openCreateMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    if (g.mode !== "move" || !g.ids.length) return;
    const modifiers = e as PointerEnd & { metaKey?: boolean; ctrlKey?: boolean };
    const drop = !modifiers.metaKey && !modifiers.ctrlKey && g.drop && mindDropTarget(nodes, g.roots, g.boxes, { x: e.clientX, y: e.clientY });
    if (drop) {
      void save(async () => {
        try {
          await http.post(url + "/estrutura", { action: "connect", ...drop, ...(g.draft?.title.trim() && { title: g.draft.title.trim() }) });
        } catch (error) {
          if (g.draft) edit(previous => previous ?? g.draft!);
          throw error;
        }
        setFolded(old => new Set([...old].filter(id => id !== drop.parentId)));
        select(drop.id);
      }).finally(() => setDrag(null));
      return;
    }
    const dx = Math.round((e.clientX - g.start.x) / view.zoom);
    const dy = Math.round((e.clientY - g.start.y) / view.zoom);
    void save(async () => {
      const result = await http.post<{ autoDisabled?: number }>(url + "/selecao", { action: "move", ids: g.roots, dx, dy, ...(g.draft?.title.trim() && { titleEdit: g.draft }) });
      if (result.autoDisabled) notify("Auto desativado nesta árvore para manter a posição escolhida. Você pode reativá-lo no ramo inicial.", "info");
    }).finally(() => setDrag(null));
  }
  const drawPointer = useEffectEvent((e: globalThis.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.mode !== "draw" || !g.ink || g.pointer !== e.pointerId) return;
    if (e.type === "pointerup" || e.type === "pointercancel") { finish(e); return; }
    const events = e.getCoalescedEvents?.() ?? [];
    for (const event of events.length ? events : [e]) {
      const point = canvasPoint(event.clientX, event.clientY), last = g.ink[g.ink.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) * view.zoom < 1.5) continue;
      if (g.ink.length >= 4096) g.ink = g.ink.filter((_, i) => i % 2 === 0);
      g.ink.push(point);
    }
    g.moved = true;
    setInk({ points: [...g.ink], color: g.color!, width: g.strokeWidth! });
  });
  useEffect(() => {
    const listener = (e: globalThis.PointerEvent) => drawPointer(e);
    for (const type of ["pointermove", "pointerup", "pointercancel"] as const) document.addEventListener(type, listener, true);
    return () => { for (const type of ["pointermove", "pointerup", "pointercancel"] as const) document.removeEventListener(type, listener, true); };
  }, []);
  function rename(n: MindNodeDTO) {
    select(n.id);
    if (onChanged && !n.imageData && !n.drawing) {
      if (canvas.current && canvas.current.clientWidth < 640 && (view.zoom < .7 || widthOf(n) * view.zoom > canvas.current.clientWidth - 60))
        focus(n, Math.max(.05, Math.min(1, (canvas.current.clientWidth - 60) / widthOf(n))));
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
    setTool("select");
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
  const copied = useRef<MindClipboard | null>(null);
  const pasteNumber = useRef(0);
  const [hasCopy, setHasCopy] = useState(false);
  function copySelection(event?: ClipboardEvent) {
    try {
      const data = copyMindSelection(boardId, nodes.map(n => n.id === editor?.id && editor.title.trim() ? { ...n, title: editor.title.trim() } : n), selectedId ? [selectedId] : groupIds);
      const text = MIND_CLIPBOARD_PREFIX + JSON.stringify(data);
      copied.current = data; pasteNumber.current = 0; setHasCopy(true);
      if (event?.clipboardData) {
        event.clipboardData.setData("text/plain", text);
        event.clipboardData.setData(MIND_CLIPBOARD_MIME, text);
        event.preventDefault();
      } else {
        void navigator.clipboard?.writeText(text).catch(() => {});
        notify(`${data.nodes.length} ${data.nodes.length === 1 ? "item copiado" : "itens copiados"}. Use Colar itens ou Ctrl+V / ⌘V.`, "info");
      }
    } catch (e) { notify(e instanceof Error ? e.message : "Não foi possível copiar.", "error"); }
  }
  function pasteSelection(data: MindClipboard, point?: Point) {
    if (!onChanged) return;
    if (data.boardId !== boardId) { notify("Esta cópia pertence a outro mapa.", "error"); return; }
    if (copied.current !== data) { copied.current = data; pasteNumber.current = 0; setHasCopy(true); }
    const offset = 40 * ++pasteNumber.current;
    const dx = point ? Math.round(point.x - Math.min(...data.nodes.map(n => n.x))) : offset;
    const dy = point ? Math.round(point.y - Math.min(...data.nodes.map(n => n.y))) : offset;
    commitTitle(); setMenu(null); setTool("select");
    void save(async () => {
      const result = await http.post<{ ids: string[] }>(url + "/colar", { clipboard: data, dx, dy });
      setSelectedId(result.ids.length === 1 ? result.ids[0] : undefined);
      setGroupIds(result.ids.length > 1 ? result.ids : []);
    });
  }
  async function pasteCopied(point?: Point) {
    if (copied.current) { pasteSelection(copied.current, point); return; }
    try {
      const data = readMindClipboard(await navigator.clipboard.readText());
      if (data) pasteSelection(data, point);
      else notify("Selecione e copie itens deste mapa primeiro.", "error");
    } catch { notify("Use Ctrl+V / ⌘V para colar, ou copie os itens pelo botão Copiar seleção.", "error"); }
  }
  function acceptsClipboard(target: HTMLElement) {
    return !document.querySelector('[aria-modal="true"]') && (target === document.body || !!section.current?.contains(target));
  }
  function editingText(target: HTMLElement) {
    if (!target.closest("input,textarea,[contenteditable=true]")) return false;
    // A click selects a node and its unchanged title. Partial selections / typing remain native text editing.
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.matches("[data-mind-title]"))
      return target.value !== selected?.title || target.selectionStart !== 0 || target.selectionEnd !== target.value.length;
    return true;
  }
  const copyItems = useEffectEvent((event: ClipboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || !acceptsClipboard(target) || !event.clipboardData) return;
    if (target instanceof HTMLTextAreaElement && target.matches("[data-mind-title]") && selected) {
      const text = target.value.slice(target.selectionStart, target.selectionEnd);
      if (!text) return;
      if (!editingText(target)) copySelection(event);
      writeMindText(event.clipboardData, text, byId.get(selected.id) ?? selected);
      event.preventDefault();
      return;
    }
    if (!editingText(target) && (selectedId || groupIds.length)) copySelection(event);
  });
  const pasteItems = useEffectEvent((event: ClipboardEvent) => {
    if (!onChanged || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
    const target = event.target as HTMLElement;
    if (target !== document.body && !section.current?.contains(target)) return;
    if (target.closest("input,textarea,[contenteditable=true]") && !target.matches("[data-mind-title]")) return;
    try {
      const text = event.clipboardData?.getData(MIND_CLIPBOARD_MIME) || event.clipboardData?.getData("text/plain") || "";
      const data = readMindClipboard(text);
      if (target instanceof HTMLTextAreaElement && target.matches("[data-mind-title]") && editor && event.clipboardData) {
        const single = data?.nodes.length === 1 && !data.nodes[0].imageData && !data.nodes[0].drawing ? data.nodes[0] : null;
        const phrase = readMindText(event.clipboardData) ?? (single ? { text: single.title, style: safeMindTextStyle(single) } : null);
        if (phrase) {
          event.preventDefault();
          const start = target.selectionStart;
          const title = target.value.slice(0, start) + phrase.text + target.value.slice(target.selectionEnd);
          if (title.length > 160) { notify("Use até 160 caracteres por ideia.", "error"); return; }
          if (!title.trim()) return;
          const id = editor.id;
          edit({ id, title });
          void save(async () => { await http.patch(url, { id, title, ...phrase.style }); });
          requestAnimationFrame(() => { if (target.isConnected) target.setSelectionRange(start + phrase.text.length, start + phrase.text.length); });
          return;
        }
        if (data) { event.preventDefault(); notify("Para colar vários itens, clique primeiro no fundo do mapa.", "info"); return; }
      }
      if (data && !editingText(target)) {
        event.preventDefault();
        const previous = copied.current;
        pasteSelection(previous && JSON.stringify(previous) === JSON.stringify(data) ? previous : data);
        return;
      }
      const files = imagesFromClipboard(event.clipboardData);
      if (files.length) { event.preventDefault(); insertImages(files); }
    } catch (e) { event.preventDefault(); notify(e instanceof Error ? e.message : "Cópia inválida.", "error"); }
  });
  useEffect(() => {
    const paste = (event: ClipboardEvent) => pasteItems(event);
    const copy = (event: ClipboardEvent) => copyItems(event);
    document.addEventListener("paste", paste); document.addEventListener("copy", copy);
    return () => { document.removeEventListener("paste", paste); document.removeEventListener("copy", copy); };
  }, []);
  function shortcut(e: React.KeyboardEvent, id: string) {
    if (!onChanged || byId.get(id)?.imageData || byId.get(id)?.drawing || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
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
    const ids = colorIds.filter(id => byId.has(id));
    if (!ids.length || !onChanged) return;
    edit(null); select(undefined);
    const animation = fadeMindItems(section.current, new Set(ids.flatMap(id => [id, ...descendants(id)])));
    void save(async () => {
      await Promise.all([
        ids.length === 1 ? http.del(url, { id: ids[0] }) : http.post(url + "/selecao", { action: "delete", ids }),
        animation.finished,
      ]);
    }).finally(animation.cancel);
  }
  function history(redo = false) {
    const expectedId = redo ? redoId : undoId;
    const waitForSave = pending.current > 0;
    if (undoQueued.current || (!expectedId && !waitForSave)) return;
    undoQueued.current = true;
    edit(null);
    setMenu(null);
    void save(async () => {
      try {
        const latest = waitForSave
          ? (await http.get<{ mindUndoId: number | null; mindRedoId: number | null }>(`/api/boards/${boardId}`))[redo ? "mindRedoId" : "mindUndoId"]
          : expectedId;
        if (!latest) return;
        await http.post(url + (redo ? "/refazer" : "/desfazer"), { actionId: latest });
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
    if (event.key === "Escape") {
      if (gesture.current?.mode === "draw") { gesture.current = null; setInk(null); suppressedClick.current = true; }
      setTool("select"); setSearchOpen(false); setExportMenu(false); dismiss(); return;
    }
    if (onChanged && event.key === "Enter" && !event.repeat && !busy && !selectedId && !groupIds.length &&
        !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !target.closest("input,textarea,select,button,a,[contenteditable=true]")) {
      event.preventDefault(); addBranch(null, { point: freePoint() }); return;
    }
    if (!onChanged || !["Delete", "Backspace"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || !colorIds.length) return;
    if (target.closest("input,textarea,select,[contenteditable=true]")) {
      if (!((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.hasAttribute("data-mind-title") && editor?.title === selected?.title &&
          target.selectionStart === 0 && target.selectionEnd === target.value.length)) return;
    }
    if (!colorIds.some(id => byId.has(id))) return;
    event.preventDefault();
    if (!event.repeat) remove();
  });
  const keyUndo = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey ||
        !(event.ctrlKey || event.metaKey) || !["z", "y"].includes(event.key.toLowerCase()) || !onChanged) return;
    const target = event.target as HTMLElement;
    if (gesture.current?.mode === "draw") { event.preventDefault(); gesture.current = null; setInk(null); suppressedClick.current = true; return; }
    if (document.querySelector('[aria-modal="true"]') ||
        (target !== document.body && !section.current?.contains(target))) return;
    if (target.closest("input,textarea,select,[contenteditable=true]")) {
      if (!target.matches("[data-mind-title]") || !editor) return;
      if (editor.title !== selected?.title) {
        // On macOS the browser only binds native text undo to Command+Z.
        if (event.ctrlKey && /Mac/.test(navigator.platform)) {
          event.preventDefault();
          document.execCommand(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
        }
        return;
      }
    }
    const redo = event.shiftKey || event.key.toLowerCase() === "y";
    if (!(redo ? redoId : undoId) && !pending.current) return;
    event.preventDefault();
    if (!event.repeat) history(redo);
  });
  const navigationKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.isComposing || !acceptsClipboard(target)) return;
    const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (command && key === "f") { event.preventDefault(); commitTitle(); setSearchOpen(true); return; }
    if (target.closest("input,textarea,select,button,a,[contenteditable=true]")) return;
    if (command && key === "a") {
      event.preventDefault(); setSelectedId(undefined); setGroupIds(shown.map(n => n.id)); return;
    }
    if (command && key === "d" && onChanged && colorIds.length) {
      event.preventDefault();
      if (!busy && !event.repeat) pasteSelection(copyMindSelection(boardId, nodes, [...mindBranchIds(nodes, colorIds)]));
      return;
    }
    if (command || event.altKey || event.shiftKey) return;
    if (selected && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const siblings = shown.filter(n => n.parentId === selected.parentId && !n.drawing && !n.imageData).sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
      const i = siblings.findIndex(n => n.id === selected.id);
      const next = event.key === "ArrowLeft" ? nodes.find(n => n.id === selected.parentId) : event.key === "ArrowRight" ? nodes.find(n => n.parentId === selected.id) : siblings[i + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) reveal(next);
      return;
    }
    if (selected && event.key === "F2" && onChanged) { event.preventDefault(); rename(selected); return; }
    if (selected && ["Tab", "Enter"].includes(event.key) && onChanged) {
      event.preventDefault();
      const parentId = event.key === "Tab" ? selected.id : selected.parentId;
      if (parentId && !selected.drawing && !selected.imageData && !busy && !event.repeat) addBranch(parentId, { direction: "right" });
      return;
    }
    if (["v", "h", "t", "p"].includes(key)) {
      if (!onChanged && ["t", "p"].includes(key)) return;
      event.preventDefault(); setTool(key === "v" ? "select" : key === "h" ? "hand" : key === "t" ? "text" : "draw");
    } else if (key === "1") { event.preventDefault(); fit(); }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { selectionKey(event); keyUndo(event); navigationKey(event); };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  const anchor = selected && byId.get(selected.id);
  const groupNodes = groupIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const groupAnchor = groupNodes.find(n => !n.imageData) ?? groupNodes[0];
  const mixed = groupAnchor ? (["shape", "fontSize", "bold", "locked", "link", "strokeWidth", "textWidth", "textHeight"] as const).filter(key => groupNodes.some(n => n[key] !== groupAnchor[key])) : [];
  return <section ref={section} data-interacting={!!drag || !!resize || grabbing || !!ink} aria-label="Mapa mental" className={`card mind-map relative isolate min-h-64 flex-1 overflow-hidden bg-surface text-ink ${light ? "mind-canvas-light" : ""} ${full ? "!fixed inset-0 !z-[100] !rounded-none" : ""}`}>
    <div ref={canvas} data-mind-canvas tabIndex={0} aria-label="Área do mapa" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={e => { if (gesture.current?.mode !== "draw") finish(e); }} data-grabbing={grabbing}
      onContextMenu={event => event.preventDefault()}
      onClick={event => {
        if (suppressedClick.current || (event.target as Element).closest("[data-node],button,a,input")) return;
        if (onChanged && tool === "text") {
          addBranch(null, { point: canvasPoint(event.clientX, event.clientY), shape: "plain" });
          setTool("select");
        } else { dismiss(); event.currentTarget.focus({ preventScroll: true }); }
      }} data-tool={tool}
      className="mind-canvas absolute inset-0 touch-none select-none overflow-hidden">
      <div data-animate-view={animateView} className="mind-world absolute left-1/2 top-1/2 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg aria-hidden="true" width="1" height="1" className="mind-connections pointer-events-none absolute overflow-visible">
          {shown.map(n => {
            const parent = n.parentId && byId.get(n.parentId);
            if (!parent) return null;
            const side = n.x >= parent.x ? 1 : -1;
            const start = parent.x + side * widthOf(parent) / 2;
            const end = n.x - side * widthOf(n) / 2;
            const mid = (start + end) / 2;
            return <path key={n.id} data-edge={n.id} d={straightLines ? `M ${start} ${parent.y} L ${end} ${n.y}` : `M ${start} ${parent.y} C ${mid} ${parent.y}, ${mid} ${n.y}, ${end} ${n.y}`} fill="none" stroke={branchColor(n.color)} strokeWidth={2} strokeLinecap="round" />;
          })}
        </svg>
        {shown.map(n => {
          const active = selectedId === n.id;
          const marked = active || group.has(n.id);
          const drawing = drawings.get(n.id);
          const width = widthOf(n);
          const parent = n.parentId ? byId.get(n.parentId) : undefined;
          const isLeft = !!parent && n.x < parent.x;
          const central = isMindRoot(n);
          const hasChildren = children.has(n.id);
          return <div key={n.id} data-ink-object={!!drawing} className="mind-object absolute" style={{ left: n.x, top: n.y }}>
            <div data-node={n.id} data-drop-target={dropTarget === n.id} role="button" tabIndex={0} aria-pressed={marked} title={n.title}
              onClick={event => {
                if (tool === "hand" || tool === "draw" || suppressedClick.current) return;
                if (event.shiftKey || event.metaKey) {
                  commitTitle(); const ids = new Set(selectedId ? [selectedId] : groupIds);
                  if (ids.has(n.id)) ids.delete(n.id); else ids.add(n.id);
                  setSelectedId(undefined); setGroupIds([...ids]); canvas.current?.focus({ preventScroll: true });
                } else if (editor?.id !== n.id) rename(n);
              }}
              onKeyDown={e => {
                if (e.key === "Escape") { dismiss(); return; }
                if (e.target !== e.currentTarget) return;
                if (!active && (e.key === " " || e.key === "Enter")) { e.preventDefault(); rename(n); }
                else if (active) shortcut(e, n.id);
              }}
              className="mind-node" data-shape={n.shape} data-root={central && !n.detached} data-image={!!n.imageData} data-drawing={!!drawing} data-text-size={!!(n.textWidth || n.textHeight)}
              style={{ width, height: drawing?.height ?? (n.imageData ? undefined : textBlockSize(n).height), borderColor: branchColor(n.color), textDecoration: central && !n.detached && n.shape === "plain" && n.color.startsWith("#") ? "underline" : undefined, textDecorationColor: branchColor(n.color), color: n.textColor || undefined, fontSize: n.fontSize, fontWeight: n.bold ? 700 : undefined }}>
              {drawing ? <svg width={drawing.width} height={drawing.height} className="mind-ink" aria-label="Desenho livre">
                <path d={inkPath(drawing.points)} stroke={branchColor(n.color)} strokeWidth={n.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path className="mind-ink-hit" d={inkPath(drawing.points)} stroke="transparent" strokeWidth={Math.max(n.strokeWidth + 8, 12 / view.zoom)} strokeLinecap="round" fill="none" />
              </svg> : n.imageData
                // Images are authenticated board data, not remote optimization sources.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={n.imageData} alt={n.title} draggable={false} style={{ width: n.imageWidth, height: n.imageHeight, objectFit: "contain" }} />
                : editor?.id === n.id && onChanged
                ? <textarea rows={1} data-mind-title aria-label="Texto do ramo" autoFocus onFocus={e => e.target.select()} maxLength={160} value={editor.title}
                    className="w-full min-w-0 resize-none select-text bg-transparent text-center outline-none" style={{ backgroundColor: n.highlight || undefined, height: Math.max(n.fontSize * 1.25, textBlockSize(n).height - (central && !n.detached ? 20 : 14)) }}
                    onChange={e => edit({ id: n.id, title: e.target.value })} onBlur={commitTitle}
                    onKeyDown={e => { if (e.key === "Escape") { commitTitle(); select(undefined); e.stopPropagation(); } else shortcut(e, n.id); }} />
                : <span className="max-h-full w-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ backgroundColor: n.highlight || undefined }}>{n.title}</span>}
            </div>
            {active && onChanged && !n.imageData && !n.drawing && <button className="mind-resize" aria-label="Redimensionar bloco" title="Arraste para ajustar o bloco de texto" onPointerDown={e => startResize(e, n)}
              onKeyDown={e => {
                if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
                e.preventDefault(); e.stopPropagation();
                const size = textBlockSize(n), step = e.shiftKey ? 40 : 10;
                void save(async () => { await http.patch(url, { id: n.id,
                  textWidth: Math.min(1200, Math.max(72, size.width + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0))),
                  textHeight: Math.min(1200, Math.max(24, size.height + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0))) }); });
              }} style={{ left: width / 2, top: textBlockSize(n).height / 2 }} />}
            {active && central && onChanged && <div className="mind-handles" style={{ right: width / 2 + 6 }}><button className="mind-handle" aria-label="Adicionar ramo à esquerda" title="Adicionar ramo à esquerda" disabled={busy} onClick={() => addBranch(n.id, { direction: "left" })}><Plus size={14} /></button></div>}
            {!n.imageData && !n.drawing && (active || folded.has(n.id)) && <div className="mind-handles" style={isLeft && !central ? { right: width / 2 + 4 } : { left: width / 2 + 4 }}>
              {active && onChanged && <button className="mind-handle" aria-label={central ? "Adicionar ramo à direita" : "Adicionar ramo"} title="Adicionar sub-ramo (Tab)" disabled={busy} onClick={() => addBranch(n.id, { direction: "right" })}><Plus size={14} /></button>}
              {hasChildren && <button className="mind-handle" aria-label={folded.has(n.id) ? "Expandir ramo" : "Recolher ramo"} title={folded.has(n.id) ? "Expandir ramo" : "Recolher ramo"} onClick={() => toggleFold(n.id)}>{folded.has(n.id) ? descendants(n.id).length : <Minus size={12} />}</button>}
            </div>}
          </div>;
        })}
        <svg aria-hidden="true" width="1" height="1" className="mind-ink-preview pointer-events-none absolute overflow-visible">
          {pendingInk.filter(stroke => !stroke.nodeId || !byId.has(stroke.nodeId)).map(stroke => <path key={stroke.key} d={inkPath(stroke.points.map(p => [p.x, p.y]))} fill="none" stroke={branchColor(stroke.color)} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
          {ink && <path d={inkPath(ink.points.map(p => [p.x, p.y]))} fill="none" stroke={branchColor(ink.color)} strokeWidth={ink.width} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
    </div>
    {!busy && pendingInk.length > 0 && <button className="mind-tools absolute top-16 right-3 px-3 py-2 text-xs" onClick={() => pendingInk.forEach(saveStroke)}>Tentar salvar desenhos</button>}
    {dropTarget && <div className="mind-tools mind-drop-hint" role="status">Solte para conectar a “{byId.get(dropTarget)?.title}”</div>}
    {box && <div aria-hidden="true" className="mind-marquee" style={box} />}
    {menu && onChanged && <div className="mind-create-menu mind-tools" role="group" aria-label="Criar no mapa" style={{ left: menu.screen.x, top: menu.screen.y }}>
      <button className="mind-tool" onClick={() => void pasteCopied(menu.at)}><ClipboardPaste size={15} /> Colar itens</button>
      <button className="mind-tool" onClick={() => addBranch(null, { point: menu.at })}><Type size={15} /> Criar texto</button>
      <button className="mind-tool" onClick={() => addBranch(null, { point: menu.at, shape: "rounded" })}><Square size={15} /> Criar cartão</button>
      <button className="mind-tool" onClick={() => fileInput.current?.click()}><ImagePlus size={15} /> Inserir imagem</button>
      {selected && !selected.imageData && !selected.drawing && <button className="mind-tool" onClick={() => addBranch(selected.id, { point: menu.at })}><Plus size={15} /> Ramo da seleção</button>}
    </div>}
    {anchor && onChanged && tool !== "draw" && !drag && !box && !menu && !searchOpen && <div className="mind-context" style={{
      "--mind-x": `${view.x + anchor.x * view.zoom}px`,
      "--mind-y": `${view.y + anchor.y * view.zoom}px`,
    } as React.CSSProperties}>
      <MindFormat key={anchor.id} node={anchor}
        organize={() => void save(async () => { const result = await http.post<{ changed: number }>(url + "/estrutura", { action: "organize", id: anchor.id }); if (!result.changed) notify("Esta árvore já está organizada ou seus itens estão fixados.", "info"); })}
        structure={!anchor.imageData && !anchor.drawing ? <MindConnect key={anchor.id} node={anchor} nodes={nodes} busy={busy} connect={parentId => { commitTitle(); void save(async () => { await http.post(url + "/estrutura", { action: "connect", id: anchor.id, parentId }); }); }} /> : undefined} imageOnly={!!anchor.imageData} drawingOnly={!!anchor.drawing} copy={() => copySelection()} busy={busy} preview={previewColor} commit={commitColor}
        change={patch => void save(async () => { await http.patch(url, { id: anchor.id, ...patch }); })} remove={remove} />
    </div>}
    {group.size > 1 && groupAnchor && !box && !drag && !menu && !searchOpen && <div className="mind-group" aria-label="Seleção de ramos">
      {onChanged ? <MindFormat key={groupIds.join(":")} node={groupAnchor} copy={() => copySelection()} count={group.size} mixed={mixed} imageOnly={groupNodes.every(n => !!n.imageData)} drawingOnly={groupNodes.every(n => !!n.drawing)} busy={busy}
        preview={previewColor} commit={commitColor} remove={remove}
        change={patch => void save(async () => { await http.post(url + "/selecao", { action: "format", ids: groupIds, patch }); })} />
        : <span className="mind-tools p-2 text-xs">{group.size} selecionados</span>}
    </div>}
    {tool === "draw" && onChanged && <div className="mind-tools mind-pen-controls" role="group" aria-label="Opções do lápis">
      <Pencil size={15} /><span className="text-xs">Lápis</span>
      <MindColors node={{ color: penColor, textColor: "", highlight: "" }} fields={["color"]} colorLabel="Cor do lápis" preview={(_, value) => setPenColor(value)} commit={(_, value) => setPenColor(value)} />
      <select aria-label="Espessura do lápis" value={penWidth} onChange={e => setPenWidth(Number(e.target.value))}>{[1, 2, 3, 5, 8, 12].map(width => <option value={width} key={width}>{width} px</option>)}</select>
    </div>}
    <input ref={fileInput} type="file" accept="image/*" multiple hidden aria-label="Arquivo de imagem" onChange={e => { insertImages(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    {searchOpen && <form className="mind-tools mind-search" role="search" onSubmit={e => { e.preventDefault(); findResult(resultIndex + 1); }}>
      <Search size={15} /><input autoFocus aria-label="Buscar no mapa" placeholder="Buscar no mapa…" value={query} onChange={e => {
        setQuery(e.target.value); setResultIndex(0);
        const match = e.target.value.trim() && nodes.find(n => n.title.toLocaleLowerCase().includes(e.target.value.trim().toLocaleLowerCase()));
        if (match) reveal(match);
      }} />
      <span aria-live="polite">{matches.length ? `${resultIndex + 1}/${matches.length}` : "0"}</span>
      <button type="button" className="mind-tool" aria-label="Resultado anterior" disabled={!matches.length} onClick={() => findResult(resultIndex - 1)}><ChevronUp size={14} /></button>
      <button className="mind-tool" aria-label="Próximo resultado" disabled={!matches.length}><ChevronDown size={14} /></button>
      <button type="button" className="mind-tool" aria-label="Fechar busca" onClick={() => { setSearchOpen(false); canvas.current?.focus(); }}><X size={14} /></button>
    </form>}
    {exportMenu && <div className="mind-tools mind-export" role="group" aria-label="Exportar mapa">
      {(["png", "svg", "txt"] as const).map(format => <button className="mind-tool" key={format} disabled={exporting || busy} onClick={async () => {
        if (!section.current) return;
        commitTitle(); await queue.current; setExporting(true);
        try { const snapshot = onChanged ? (await http.get<{ mindNodes: MindNodeDTO[] }>(`/api/boards/${boardId}`)).mindNodes : nodes; await exportMindMap(snapshot, section.current!, straightLines, format); setExportMenu(false); }
        catch (e) { notify(e instanceof Error ? e.message : "Não foi possível exportar.", "error"); }
        finally { setExporting(false); }
      }}>{format === "txt" ? "Texto com hierarquia" : format === "svg" ? "SVG · sem perder resolução" : "Imagem PNG"}</button>)}
      <button className="mind-tool" onClick={() => setExportMenu(false)}>Fechar</button>
    </div>}
    <div className="mind-tools mind-sidebar" role="toolbar" aria-label="Ferramentas do mapa">
      <button className="mind-tool" title="Selecionar e mover blocos" aria-label="Selecionar" aria-pressed={tool === "select"} onClick={() => setTool("select")}><MousePointer2 size={18} /></button>
      <button className="mind-tool" title="Mover a visualização" aria-label="Mover visualização" aria-pressed={tool === "hand"} onClick={() => { commitTitle(); setTool("hand"); }}><Hand size={18} /></button>
      <button className="mind-tool" aria-label="Buscar no mapa" title="Buscar no mapa (Ctrl+F / ⌘F)" aria-pressed={searchOpen} onClick={() => { commitTitle(); setSearchOpen(!searchOpen); }}><Search size={17} /></button>
      <button className="mind-tool" aria-label={folded.size ? "Expandir tudo" : "Recolher tudo"} title={folded.size ? "Expandir tudo" : "Recolher até os ramos principais"} onClick={() => { commitTitle(); select(undefined); setFolded(folded.size ? new Set() : new Set(nodes.filter(n => n.parentId && children.has(n.id)).map(n => n.id))); }}><ChevronsDownUp size={17} /></button>
      <button className="mind-tool" aria-label="Exportar mapa" title="Exportar mapa" aria-expanded={exportMenu} onClick={() => { commitTitle(); setExportMenu(!exportMenu); }}><Download size={17} /></button>
      {onChanged && <>
        <span className="mind-divider" />
        <button className="mind-tool" title="Criar texto: escolha um lugar no mapa" aria-label="Criar texto" aria-pressed={tool === "text"} onClick={() => { commitTitle(); select(undefined); setTool("text"); }}><Type size={18} /></button>
        <button className="mind-tool" title="Lápis: desenhar livremente" aria-label="Lápis" aria-pressed={tool === "draw"} onClick={() => { commitTitle(); select(undefined); setTool("draw"); }}><Pencil size={18} /></button>
        <button className="mind-tool" title="Inserir imagem (ou cole com Ctrl+V / ⌘V)" aria-label="Inserir imagem" onClick={() => fileInput.current?.click()}><ImagePlus size={18} /></button>
        <button className="mind-tool" title="Adicionar ramo à seleção (Tab)" aria-label="Novo ramo" disabled={busy || !selected || !!selected.imageData || !!selected.drawing} onClick={() => selected && addBranch(selected.id, { direction: "right" })}><GitBranchPlus size={18} /></button>
        {onImport && <button className="mind-tool" title="Importar prints com IA" aria-label="Importar prints com IA" onClick={onImport}><Sparkles size={18} /></button>}
        {hasCopy && <button className="mind-tool" aria-label="Colar itens" title="Colar cópia (Ctrl+V / ⌘V)" onClick={() => void pasteCopied()}><ClipboardPaste size={17} /></button>}
        <span className="mind-divider" />
        <button className="mind-tool" aria-label="Desfazer" title="Desfazer (Ctrl+Z ou ⌘Z)" disabled={busy || !undoId} onClick={() => history()}><Undo2 size={17} /></button>
        <button className="mind-tool" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z / ⌘Shift+Z)" disabled={busy || !redoId} onClick={() => history(true)}><Redo2 size={17} /></button>
      </>}
    </div>
    <div className="mind-tools mind-history">
      <button className="mind-tool" aria-label="Linhas retas" title={straightLines ? "Voltar às linhas curvas" : "Usar linhas retas"} aria-pressed={straightLines} onClick={() => {
        setStraightLines(!straightLines);
        localStorage.setItem("mind-lines:" + boardId, straightLines ? "curved" : "straight");
      }}>{straightLines ? <Slash size={16} /> : <Spline size={16} />}</button>
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
      <span aria-live="polite">{busy ? "Salvando…" : onChanged ? tool === "draw" ? "Arraste para desenhar · Direito move o mapa · Esc sai do lápis" : "Esquerdo seleciona e move blocos · Direito move o mapa" : "Somente leitura"}</span>
      {selected?.link && <a className="pointer-events-auto inline-flex items-center gap-1 text-blue" href={selected.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Abrir link</a>}
    </div>
    {!onChanged && selected?.link && <a className="mind-tools absolute bottom-16 left-3 p-2 text-xs sm:hidden" href={selected.link} target="_blank" rel="noopener noreferrer">Abrir link</a>}
  </section>;
}
