import { json, withUser } from "@/lib/api";
import { generateInsight, getAiStatus } from "@/lib/ai";

/** Estado da IA para o usuário: última análise de hoje, gerações restantes, memória. */
export const GET = withUser(async (user) => json(await getAiStatus(user.id)));

/** Gera (ou regenera) a análise do dia. */
export const POST = withUser(async (user) => json(await generateInsight(user.id), { status: 201 }));
