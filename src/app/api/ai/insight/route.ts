import { json, withUser } from "@/lib/api";
import { generateInsight, getAiStatus, resetAiMemory } from "@/lib/ai";

/** Estado da IA para o usuário: última análise de hoje, gerações restantes, memória. */
export const GET = withUser(async (user) => json(await getAiStatus(user.id, user.area)));

/** Gera (ou regenera) a análise do dia. */
export const POST = withUser(async (user) => json(await generateInsight(user.id, user.area), { status: 201 }));

/** Reseta a inteligência da IA para este usuário (memória de hábitos + análises). */
export const DELETE = withUser(async (user) => json(await resetAiMemory(user.id)));
