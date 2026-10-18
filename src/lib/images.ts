"use client";

/** Reduz uma imagem no navegador (máx. `maxW` px de largura) e devolve um JPEG em data URL. */
export async function toImageDataUrl(file: File, maxW = 1280, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let q = quality;
  let url = canvas.toDataURL("image/jpeg", q);
  while (url.length > 600 * 1024 && q > 0.4) {
    q -= 0.1;
    url = canvas.toDataURL("image/jpeg", q);
  }
  return url;
}

/** Extrai arquivos de imagem de um evento de colar. */
export function imagesFromClipboard(data: DataTransfer | null): File[] {
  return Array.from(data?.items ?? [])
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter((f): f is File => Boolean(f));
}

export function imageUrl(id: string): string {
  return `/api/imagens/${id}`;
}
