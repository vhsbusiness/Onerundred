import { NextResponse } from "next/server";
import type { CurrentUser } from "./auth";
import { requireAdmin, requireUser } from "./current-user";

import { apiPrincipal } from "./personal-api";
import type { Area } from "./api-permissions";
import { ApiError } from "./errors";
import { aiProviderError } from "./ai-errors";

export { ApiError };

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Origem não autorizada");
  const origin = req.headers.get("origin");
  if (origin) {
    let source: URL;
    try { source = new URL(origin); } catch { throw new ApiError(403, "Origem não autorizada"); }
    const target = new URL(req.url);
    const host = req.headers.get("host") ?? target.host;
    const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const protocol = forwarded === "https" || forwarded === "http" ? forwarded + ":" : target.protocol;
    if (source.host !== host || source.protocol !== protocol || !["http:", "https:"].includes(source.protocol)) throw new ApiError(403, "Origem não autorizada");
  }
}

export async function readBody<T = Record<string, unknown>>(req: Request, maxBytes = 2 * 1024 * 1024): Promise<T> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "Envie JSON");
  if (Number(req.headers.get("content-length")) > maxBytes) throw new ApiError(413, "Requisição grande demais");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "JSON inválido");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "Requisição grande demais"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data: unknown;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ApiError(400, "JSON inválido"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(400, "Objeto JSON inválido");
  return data as T;
}

/** Envolve um handler para transformar erros em respostas JSON. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      if (args[0] instanceof Request) assertSameOrigin(args[0]);
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: err.message }, { status: err.status });
      }
      const providerError = aiProviderError(err);
      if (providerError) {
        console.error("Falha no provedor de IA", { status: providerError.status });
        return json({ error: providerError.message }, { status: providerError.status });
      }
      console.error("Erro interno na API", { type: err instanceof Error ? err.name : "unknown" });
      return json({ error: "Erro interno" }, { status: 500 });
    }
  };
}

export function requireString(v: unknown, field: string, { allowEmpty = false } = {}): string {
  if (typeof v !== "string" || (!allowEmpty && v.trim() === "")) {
    throw new ApiError(400, `Campo "${field}" inválido`);
  }
  return v.trim();
}

export function optionalPriority(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (n !== 1 && n !== 2 && n !== 3) throw new ApiError(400, "Prioridade deve ser 1, 2 ou 3");
  return n;
}

export function optionalMinutes(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, "Minutos inválidos");
  return n;
}

export function optionalDayKey(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new ApiError(400, "Data deve estar no formato yyyy-MM-dd");
  }
  return v;
}

/** Rota que exige usuário logado: o handler recebe o usuário como último argumento. */
export function withUser<Args extends unknown[]>(
  fn: (user: CurrentUser, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return handle(async (...args: Args) => {
    const user = await requireUser();
    return fn(user, ...args);
  });
}

/** Rota que exige administrador. */
export function withAdmin<Args extends unknown[]>(
  fn: (user: CurrentUser, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return handle(async (...args: Args) => {
    const user = await requireAdmin();
    return fn(user, ...args);
  });
}

/** Opt-in scope on a concrete route handler. Unannotated endpoints require a web session. */
export function withAccess<Args extends unknown[]>(scope: Area | "finance",
  fn: (user: CurrentUser, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return handle(async (...args: Args) => {
    const req = args[0];
    if (!(req instanceof Request) || !req.headers.has("authorization")) return fn(await requireUser(), ...args);
    let area: Area;
    if (scope === "finance") {
      const { space } = await (args[1] as { params: Promise<{space:string}> }).params;
      if (space !== "personal" && space !== "business") throw new ApiError(404,"Espaço inválido.");
      area = space;
    } else area = scope;
    const user = await apiPrincipal(req,area);
    return fn(user,...args);
  });
}
