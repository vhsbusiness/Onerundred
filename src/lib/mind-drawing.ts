export type InkPoint = { x: number; y: number };
export type MindDrawing = { width: number; height: number; points: [number, number][] };

/** Only numeric geometry is accepted, never arbitrary SVG or markup. */
export function parseDrawing(value: unknown): MindDrawing | null {
  if (typeof value === "string") {
    if (value.length > 180_000) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { width, height, points } = value as Partial<MindDrawing>;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 24 || height < 24 || width > 20_000 || height > 20_000 || !Array.isArray(points) || !points.length || points.length > 4096) return null;
  if (!points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
      p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height)) return null;
  return { width, height, points: points.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) };
}

export function normalizeDrawing(points: InkPoint[]) {
  const left = Math.floor(Math.min(...points.map(p => p.x))) - 12;
  const top = Math.floor(Math.min(...points.map(p => p.y))) - 12;
  const width = Math.max(24, Math.ceil(Math.max(...points.map(p => p.x))) - left + 12);
  const height = Math.max(24, Math.ceil(Math.max(...points.map(p => p.y))) - top + 12);
  return { x: Math.round(left + width / 2), y: Math.round(top + height / 2),
    drawing: { width, height, points: points.map(p => [p.x - left, p.y - top] as [number, number]) } };
}

export function inkPath(points: readonly (readonly [number, number])[]) {
  if (!points.length) return "";
  let path = `M ${points[0][0]} ${points[0][1]}`;
  if (points.length === 1) return path + " l 0.01 0";
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], next = points[i + 1];
    path += ` Q ${x} ${y} ${(x + next[0]) / 2} ${(y + next[1]) / 2}`;
  }
  const last = points[points.length - 1];
  return path + ` L ${last[0]} ${last[1]}`;
}
