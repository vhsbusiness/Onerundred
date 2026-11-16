import { ApiError } from "./errors";
import { DOCUMENT_LIMIT } from "./document-types";

export async function readUpload(req: Request) {
  const tooLarge = () => new ApiError(413, "Escolha um arquivo de até 8 MB.");
  if (Number(req.headers.get("content-length")) > DOCUMENT_LIMIT) throw tooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Escolha um arquivo.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > DOCUMENT_LIMIT) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new ApiError(400, "O arquivo está vazio.");
  return Buffer.concat(chunks);
}

export function documentDataUrl(bytes: Buffer, type: string) {
  const signature = bytes.subarray(0, 12);
  const matches =
    type === "application/pdf"
      ? signature.toString("ascii").startsWith("%PDF-")
      : type === "image/png"
        ? signature.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        : type === "image/jpeg"
          ? signature.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
          : type === "image/webp" &&
            signature.toString("ascii", 0, 4) === "RIFF" &&
            signature.toString("ascii", 8, 12) === "WEBP";
  if (!matches) throw new ApiError(400, "O conteúdo do arquivo não corresponde ao formato selecionado.");
  return "data:" + type + ";base64," + bytes.toString("base64");
}
