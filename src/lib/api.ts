import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "JSON inválido");
  }
}

/** Envolve um handler para transformar erros em respostas JSON. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: err.message }, { status: err.status });
      }
      console.error(err);
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
