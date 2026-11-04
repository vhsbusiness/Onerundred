import type { MindNodeDTO } from "./types";
import { textBlockSize } from "./mind-size";
import { inkPath, parseDrawing } from "./mind-drawing";

const NS = "http://www.w3.org/2000/svg";
function element(name: string, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export async function exportMindMap(nodes: MindNodeDTO[], host: HTMLElement, straight: boolean, format: "svg" | "png" | "txt") {
  if (!nodes.length) throw new Error("O mapa está vazio.");
  if (format === "txt") {
    const children = new Map<string | null, MindNodeDTO[]>();
    for (const n of nodes) { const list = children.get(n.parentId) ?? []; list.push(n); children.set(n.parentId, list); }
    for (const list of children.values()) list.sort((a, b) => a.y - b.y);
    const lines: string[] = [], stack = [...(children.get(null) ?? [])].reverse().map(n => ({ n, depth: 0 }));
    while (stack.length) { const { n, depth } = stack.pop()!; lines.push("  ".repeat(Math.min(depth, 50)) + "• " + n.title.replaceAll("\n", " / ") + (n.link ? " — " + n.link : "")); for (const child of [...(children.get(n.id) ?? [])].reverse()) stack.push({ n: child, depth: depth + 1 }); }
    download(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), "mapa-mental.txt"); return;
  }
  const computed = getComputedStyle(host), probe = document.createElement("span"); host.appendChild(probe);
  function color(value: string) { probe.style.color = value.startsWith("#") || value.startsWith("rgb") ? value : computed.getPropertyValue("--color-" + value).trim(); return getComputedStyle(probe).color; }
  const ink = color("ink"), bg = color(host.classList.contains("mind-canvas-light") ? "surface" : "bg"), panel = color("surface");
  const colors = new Map(nodes.map(n => [n.id, color(n.color)])); probe.remove();
  const items = nodes.map(n => { const drawing = parseDrawing(n.drawing); return { n, drawing, size: drawing ?? (n.imageData ? { width: n.imageWidth, height: n.imageHeight } : textBlockSize(n)) }; });
  const byId = new Map(items.map(item => [item.n.id, item]));
  const left = Math.min(...items.map(({ n, size }) => n.x - size.width / 2)) - 40, top = Math.min(...items.map(({ n, size }) => n.y - size.height / 2)) - 40;
  const width = Math.max(...items.map(({ n, size }) => n.x + size.width / 2)) - left + 40, height = Math.max(...items.map(({ n, size }) => n.y + size.height / 2)) - top + 40;
  const svg = element("svg", { xmlns: NS, viewBox: `${left} ${top} ${width} ${height}`, width, height });
  svg.appendChild(element("rect", { x: left, y: top, width, height, fill: bg }));
  for (const { n, size } of items) {
    const parent = n.parentId && byId.get(n.parentId); if (!parent) continue;
    const side = n.x >= parent.n.x ? 1 : -1, start = parent.n.x + side * parent.size.width / 2, end = n.x - side * size.width / 2, mid = (start + end) / 2;
    svg.appendChild(element("path", { d: straight ? `M ${start} ${parent.n.y} L ${end} ${n.y}` : `M ${start} ${parent.n.y} C ${mid} ${parent.n.y}, ${mid} ${n.y}, ${end} ${n.y}`, stroke: colors.get(n.id)!, "stroke-width": 2, fill: "none", "stroke-linecap": "round" }));
  }
  const measure = document.createElement("canvas").getContext("2d")!;
  for (const [i, { n, size, drawing }] of items.entries()) {
    const x = n.x - size.width / 2, y = n.y - size.height / 2, group = element("g"); svg.appendChild(group);
    if (drawing) { group.appendChild(element("path", { transform: `translate(${x} ${y})`, d: inkPath(drawing.points), fill: "none", stroke: colors.get(n.id)!, "stroke-width": n.strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round" })); continue; }
    if (n.imageData) { group.appendChild(element("image", { x, y, width: size.width, height: size.height, href: n.imageData })); continue; }
    if (n.shape !== "plain") group.appendChild(element("rect", { x, y, width: size.width, height: size.height, rx: n.shape === "pill" ? size.height / 2 : n.shape === "rectangle" ? 0 : 8, fill: panel, stroke: colors.get(n.id)!, "stroke-width": 1.5 }));
    const clip = element("clipPath", { id: "text-" + i }); clip.appendChild(element("rect", { x: x + 9, y: y + 5, width: size.width - 18, height: size.height - 10 })); svg.appendChild(clip);
    const bold = n.bold || (!n.parentId && !n.detached), lines: string[] = [];
    measure.font = `${bold ? 700 : 400} ${n.fontSize}px Arial`;
    for (const paragraph of n.title.split("\n")) {
      let line = "";
      for (const char of Array.from(paragraph)) { if (line && measure.measureText(line + char).width > size.width - 20) { lines.push(line); line = ""; } line += char; }
      lines.push(line);
    }
    const lineHeight = n.fontSize * 1.25, origin = n.y - Math.min(lines.length * lineHeight, size.height - 14) / 2 + n.fontSize;
    const textGroup = element("g", { "clip-path": `url(#text-${i})` }); group.appendChild(textGroup);
    if (n.highlight) textGroup.appendChild(element("rect", { x: x + 9, y: origin - n.fontSize, width: size.width - 18, height: lines.length * lineHeight, fill: n.highlight }));
    for (const [j, line] of lines.entries()) { const text = element("text", { x: n.x, y: origin + j * lineHeight, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": n.fontSize, "font-weight": bold ? 700 : 400, fill: n.textColor || ink }); text.textContent = line; textGroup.appendChild(text); }
  }
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
  if (format === "svg") { download(blob, "mapa-mental.svg"); return; }
  const scale = Math.min(2, 4096 / width, 4096 / height), canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale)); canvas.height = Math.max(1, Math.ceil(height * scale));
  svg.setAttribute("width", String(canvas.width)); svg.setAttribute("height", String(canvas.height));
  const raster = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(raster), image = new Image();
  try { await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Não foi possível exportar a imagem.")); image.src = url; });
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Não foi possível exportar a imagem."); download(png, "mapa-mental.png");
  } finally { URL.revokeObjectURL(url); }
}
