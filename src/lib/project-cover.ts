import { ApiError } from "./errors";
import { parseMindPicture } from "./mind-picture";

export function coverData(value: unknown) {
  if (!value) return undefined;
  return parseMindPicture({ imageData: value, imageWidth: 280, imageHeight: 280 }).imageData;
}
export function coverResponse(imageData?: string) {
  if (!imageData) throw new ApiError(404, "Imagem não encontrada.");
  const [type, data] = imageData.split(",");
  return new Response(Buffer.from(data, "base64"), {
    headers: {
      "Content-Type": type.slice(5, -7),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
