/** Screen-space grid density; world-aligned levels are powers of four. */
export function mindGrid(zoom: number) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  // Keep the small cells between 16 and 64 CSS pixels, even far from the map.
  const level = Math.ceil(Math.log(16 / (80 * safeZoom)) / Math.log(4));
  const step = 80 * 4 ** level * safeZoom;
  const fade = Math.max(0, Math.min(1, Math.log(step / 16) / Math.log(4)));
  // At a level boundary the fading minor lines disappear; the old major lines
  // become the new minor lines in exactly the same place and at full opacity.
  return { step, majorStep: step * 4, fade };
}
