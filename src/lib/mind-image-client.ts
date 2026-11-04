"use client";

export async function prepareMindImage(file: File) {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("Use uma imagem de até 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("Imagem inválida.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível processar a imagem.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let imageData = canvas.toDataURL("image/webp", .85);
    if (imageData.length > 700 * 1024) imageData = canvas.toDataURL("image/webp", .55);
    if (imageData.length > 700 * 1024) throw new Error("A imagem ainda está grande. Tente uma versão menor.");
    const displayScale = 280 / Math.max(bitmap.width, bitmap.height);
    return { imageData, imageWidth: Math.max(24, Math.round(bitmap.width * displayScale)), imageHeight: Math.max(24, Math.round(bitmap.height * displayScale)) };
  } finally { bitmap.close(); }
}
