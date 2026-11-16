import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { generateInsight, getAiStatus, resetAiMemory } from "@/lib/ai";
import { todayKey } from "@/lib/time";

function dayParam(v: unknown): string {
  if (v === undefined || v === null || v === "") return todayKey();
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ApiError(400, "Dia inválido (yyyy-MM-dd)");
  return v;
}

/** Estado da IA para o usuário num dia (padrão hoje): última análise, gerações restantes, memória. */
export const GET = withAccess("ai", async (user, req: Request) => {
  const day = dayParam(new URL(req.url).searchParams.get("dia"));
  return json(await getAiStatus(user.id, day));
});

/** Gera (ou regenera) a análise do dia (body opcional: { dayKey }). */
export const POST = withAccess("ai", async (user, req: Request) => {
  const body = await readBody(req).catch(() => ({}) as Record<string, unknown>);
  return json(await generateInsight(user.id, dayParam(body.dayKey)), { status: 201 });
});

/** Reseta a inteligência da IA para este usuário (memória de hábitos + análises). */
export const DELETE = withAccess("ai", async (user) => json(await resetAiMemory(user.id)));
