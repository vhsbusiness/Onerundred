import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "./db";
import { ApiError } from "./errors";

const WINDOW_MS = 15 * 60 * 1000;
/** Persistent compare-and-swap counters: shared by workers and aliases of an account. */
export async function consumeAuthAttempt(scope: "login" | "register", identity: string, limit: number) {
  const window = String(Math.floor(Date.now() / WINDOW_MS)).padStart(12, "0");
  const prefix = "security:rate:";
  const digest = createHash("sha256").update(identity).digest("hex");
  const key = `${prefix}${window}:${scope}:${digest}`;
  // Window prefix sorts numerically for the supported epoch; expires stale counters.
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: prefix, lt: `${prefix}${window}:` } } });
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: "0" }, update: {} });
  for (let attempt = 0; attempt < 30; attempt++) {
    const row = await prisma.appSetting.findUniqueOrThrow({ where: { key } });
    const count = Number(row.value);
    if (!Number.isInteger(count) || count >= limit) throw new ApiError(429, "Muitas tentativas. Tente novamente em 15 minutos.");
    const changed = await prisma.appSetting.updateMany({ where: { key, value: row.value }, data: { value: String(count + 1) } });
    if (changed.count) return;
  }
  throw new ApiError(429, "Muitas tentativas simultâneas. Aguarde e tente novamente.");
}

export function registrationNetwork(req: Request) {
  // Railway documents X-Real-IP as the remote client address. Trust it only in that environment.
  // Other deployments fail closed into a shared bucket until a trusted edge is configured.
  const ip = process.env.RAILWAY_ENVIRONMENT_ID ? req.headers.get("x-real-ip")?.trim() : undefined;
  return ip && isIP(ip) ? ip : "unknown-network";
}
