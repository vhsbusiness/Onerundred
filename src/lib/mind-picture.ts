import { ApiError } from "./errors";
export function mindImageDimension(n: unknown): n is number { return typeof n === "number" && Number.isInteger(n) && n >= 24 && n <= 800; }
export function parseMindPicture(body: Record<string, unknown>) {
  if (body.imageData === undefined) return {};
  const data = body.imageData;
  if (typeof data !== "string" || data.length > 700 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new ApiError(400, "Use uma imagem PNG, JPEG ou WebP de até 500 KB.");
  const bytes = Buffer.from(data.split(",")[1], "base64");
  const mime = data.slice(11, data.indexOf(";"));
  const valid = mime === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid || !mindImageDimension(body.imageWidth) || !mindImageDimension(body.imageHeight)) throw new ApiError(400, "Imagem inválida.");
  return { imageData: data, imageWidth: body.imageWidth, imageHeight: body.imageHeight };
}

