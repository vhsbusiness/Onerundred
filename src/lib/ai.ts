import OpenAI from "openai";
import { subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { PRIORITY_LABEL, asPriority } from "./metrics";
import { getDashboard } from "./repo";
import { computeStats, listSleep } from "./sleep";
import { dayKey, dayRange, formatDuration, todayKey } from "./time";
import type { AiInsightContent, AiInsightDTO, AiStatusDTO } from "./types";

/*
 * Camada de IA (OpenAI).
 *
 * A cada análise, o modelo recebe um retrato compacto do dia do usuário
 * (tarefas, prioridades, estimativas, tempo gasto, sessões de trabalho,
 * histórico de 14 dias) e a memória de hábitos anterior. Ele devolve:
 *   - uma nota 0–100 explicada,
 *   - sugestões práticas,
 *   - as próximas tarefas a atacar,
 *   - horários sugeridos de trabalho, pausas e sono,
 *   - a memória de hábitos atualizada (persistida em AiMemory).
 */

export const MAX_GENERATIONS_PER_DAY = 12;

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function modelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/* ───────────── Contexto ───────────── */

async function buildContext(userId: string) {
  const now = new Date();
  const today = todayKey();
  const dash = await getDashboard(userId);
  const since = subDays(dayRange(today).start, 14);

  const [workSessions, taskSessions, memory, tomorrowCards, sleepLogs] = await Promise.all([
    prisma.workSession.findMany({
      where: { userId, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.taskSession.findMany({
      where: { startedAt: { gte: since }, card: { list: { board: { userId } } } },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.aiMemory.findUnique({ where: { userId } }),
    prisma.card.findMany({
      where: { list: { board: { userId } }, archivedAt: null, completedAt: null, scheduledFor: { gt: today } },
      select: { title: true, priority: true, scheduledFor: true, estimatedMinutes: true },
      take: 20,
    }),
    listSleep(userId, 14),
  ]);
  const sleepStats = computeStats(sleepLogs);

  // Minutos trabalhados por dia (14 dias) e distribuição por hora do dia
  const workByDay: Record<string, number> = {};
  const hourHistogram = new Array(24).fill(0) as number[];
  for (const s of workSessions) {
    const end = s.endedAt ?? now;
    const key = dayKey(s.startedAt);
    workByDay[key] = (workByDay[key] ?? 0) + Math.round((end.getTime() - s.startedAt.getTime()) / 60000);
    const cursor = new Date(s.startedAt);
    while (cursor < end) {
      hourHistogram[cursor.getHours()] += 1;
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
  }
  const focusHours = new Array(24).fill(0) as number[];
  for (const s of taskSessions) {
    const end = s.endedAt ?? now;
    const cursor = new Date(s.startedAt);
    while (cursor < end) {
      focusHours[cursor.getHours()] += 1;
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
  }

  const tasks = dash.todayCards.map((c) => ({
    id: c.id,
    titulo: c.title,
    lista: c.listName,
    prioridadeLista: PRIORITY_LABEL[asPriority(c.listPriority)],
    prioridade: PRIORITY_LABEL[asPriority(c.priority)],
    estimativaMin: c.estimatedMinutes,
    gastoMin: Math.round(c.spentMs / 60000),
    feita: Boolean(c.completedAt),
    atrasada: !c.completedAt && c.scheduledFor < today,
    emAndamento: Boolean(c.runningSince),
  }));

  return {
    dash,
    memory: memory?.summary ?? null,
    payload: {
      agora: now.toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      metaDiariaMin: dash.work.dailyGoalMinutes,
      planejadoHojeMin: dash.work.plannedMinutes,
      trabalhadoHojeMin: Math.round(dash.work.todayMs / 60000),
      sessaoDeTrabalhoAtiva: Boolean(dash.work.running),
      notaHoje: dash.today.score,
      notaSemana: dash.week.score,
      notaMes: dash.month.score,
      sequenciaDias70: dash.streak,
      contagens: dash.counts,
      tarefasDeHoje: tasks,
      tarefasFuturas: tomorrowCards.map((c) => ({
        titulo: c.title,
        prioridade: PRIORITY_LABEL[asPriority(c.priority)],
        dia: c.scheduledFor,
        estimativaMin: c.estimatedMinutes,
      })),
      historico14Dias: dash.history.map((h) => ({ dia: h.key, nota: h.score, feitas: h.doneCount, abertas: h.openCount })),
      minutosTrabalhadosPorDia: workByDay,
      horasComSessaoDeTrabalho: hourHistogram,
      horasComFocoEmTarefa: focusHours,
      sono: {
        noitesRegistradas14Dias: sleepLogs.length,
        mediaDormidoMin7Dias: sleepStats.avgDuration7,
        horaMediaDeitar7Dias: sleepStats.avgBedTime7,
        horaMediaAcordar7Dias: sleepStats.avgWakeTime7,
        minutosParaPegarNoSono7Dias: sleepStats.avgLatency7,
        ultimasNoites: sleepLogs.slice(0, 7).map((l) => ({
          dia: l.dayKey,
          deitei: l.bedTime,
          dormi: l.sleepTime,
          acordei: l.wakeTime,
          dormidoMin: l.durationMin,
          qualidade1a5: l.quality,
        })),
      },
      memoriaAnterior: memory?.summary ?? "(primeira análise deste usuário)",
    },
  };
}

/* ───────────── Esquema da resposta ───────────── */

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100, description: "Nota do dia até agora, 0 a 100" },
    headline: { type: "string", description: "Frase curta (até 80 caracteres) resumindo o dia" },
    assessment: { type: "string", description: "2 a 4 frases: o que foi bem, o que ficou para trás, comparação com o histórico" },
    suggestions: { type: "array", items: { type: "string" }, description: "3 a 5 sugestões práticas e curtas" },
    nextTasks: {
      type: "array",
      description: "Até 3 tarefas abertas de hoje, na ordem em que devem ser atacadas",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cardId: { type: "string" },
          title: { type: "string" },
          reason: { type: "string" },
        },
        required: ["cardId", "title", "reason"],
      },
    },
    schedule: {
      type: "object",
      additionalProperties: false,
      properties: {
        startWork: { type: "string", description: "HH:MM" },
        stopWork: { type: "string", description: "HH:MM" },
        breakAt: { type: "array", items: { type: "string" }, description: "Horários HH:MM de pausas" },
        sleepAt: { type: "string", description: "HH:MM" },
        wakeAt: { type: "string", description: "HH:MM" },
        note: { type: "string", description: "Uma frase explicando os horários" },
      },
      required: ["startWork", "stopWork", "breakAt", "sleepAt", "wakeAt", "note"],
    },
    memorySummary: {
      type: "string",
      description: "Memória de hábitos atualizada deste usuário (até 1200 caracteres): padrões de horário, ritmo, estimativas vs. realidade, pontos fortes e recorrentes",
    },
  },
  required: ["score", "headline", "assessment", "suggestions", "nextTasks", "schedule", "memorySummary"],
} as const;

const SYSTEM_PROMPT = `Você é o analista de produtividade do Onerundred, um painel pessoal onde o usuário organiza tarefas em quadros (estilo Trello) com prioridade Alta/Média/Baixa, estima tempo, cronometra cada tarefa e registra sessões de trabalho.

Regras:
- Responda em português do Brasil, direto e humano, sem bajulação e sem listas enormes.
- A nota (score) deve refletir o peso das prioridades: tarefas Alta valem mais; tarefas atrasadas pesam contra; tempo trabalhado abaixo do planejado puxa para baixo; concluir cedo o que importa puxa para cima. Se não há tarefas nem trabalho, seja franco.
- Em nextTasks use somente ids de tarefas abertas de hoje (feita=false), no máximo 3, da mais importante para a menos.
- Os horários (schedule) devem partir dos padrões reais do usuário (histogramas de horas, minutos por dia, registros de sono, memória) e ser realistas: jornada compatível com a meta diária, pausas a cada 90–120 min de trabalho, 7–8h de sono. Se houver registros de sono, use a hora real em que a pessoa acorda e dorme e comente se está dormindo pouco; sem registros, sugira e convide a registrar na aba Sono. Horários no formato HH:MM, 24h.
- memorySummary é a memória de longo prazo deste usuário. Reescreva-a por completo a partir da memória anterior mais o que você aprendeu agora. Guarde padrões (horário em que rende mais, se subestima tempo, se acumula atrasos, dias fracos da semana), não detalhes do dia. Até 1200 caracteres.`;

/* ───────────── Geração ───────────── */

function serializeInsight(
  row: { id: string; dayKey: string; model: string; content: string; createdAt: Date },
  remainingToday: number,
): AiInsightDTO {
  const content = JSON.parse(row.content) as AiInsightContent;
  return {
    ...content,
    id: row.id,
    dayKey: row.dayKey,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    remainingToday,
  };
}

async function generationsToday(userId: string): Promise<number> {
  return prisma.aiInsight.count({ where: { userId, dayKey: todayKey() } });
}

export async function getAiStatus(userId: string): Promise<AiStatusDTO> {
  const today = todayKey();
  const [latest, used, memory] = await Promise.all([
    prisma.aiInsight.findFirst({ where: { userId, dayKey: today }, orderBy: { createdAt: "desc" } }),
    generationsToday(userId),
    prisma.aiMemory.findUnique({ where: { userId } }),
  ]);
  const remaining = Math.max(0, MAX_GENERATIONS_PER_DAY - used);
  return {
    enabled: aiEnabled(),
    insight: latest ? serializeInsight(latest, remaining) : null,
    remainingToday: remaining,
    memory: memory?.summary ?? null,
  };
}

export async function generateInsight(userId: string): Promise<AiInsightDTO> {
  if (!aiEnabled()) throw new ApiError(503, "IA não configurada (OPENAI_API_KEY ausente)");
  const used = await generationsToday(userId);
  if (used >= MAX_GENERATIONS_PER_DAY) {
    throw new ApiError(429, `Limite de ${MAX_GENERATIONS_PER_DAY} análises por dia atingido`);
  }

  const { payload } = await buildContext(userId);
  const model = modelName();
  const supportsReasoning = /^(gpt-5|o\d)/.test(model);

  const completion = await openai().chat.completions.create({
    model,
    ...(supportsReasoning ? { reasoning_effort: "low" as const } : {}),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Dados do usuário em JSON:\n${JSON.stringify(payload)}\n\nTempo trabalhado hoje formatado: ${formatDuration(payload.trabalhadoHojeMin * 60000)}.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "analise_do_dia", strict: true, schema: responseSchema },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new ApiError(502, "A IA não retornou conteúdo");
  const parsed = JSON.parse(raw) as AiInsightContent & { memorySummary: string };
  const { memorySummary, ...content } = parsed;

  // Garante que nextTasks aponte só para tarefas abertas de hoje do próprio usuário
  const openIds = new Set(payload.tarefasDeHoje.filter((t) => !t.feita).map((t) => t.id));
  content.nextTasks = content.nextTasks.filter((t) => openIds.has(t.cardId)).slice(0, 3);
  content.score = Math.max(0, Math.min(100, Math.round(content.score)));

  const [row] = await prisma.$transaction([
    prisma.aiInsight.create({
      data: {
        userId,
        dayKey: todayKey(),
        model,
        content: JSON.stringify(content),
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
    }),
    prisma.aiMemory.upsert({
      where: { userId },
      create: { userId, summary: memorySummary.slice(0, 2000) },
      update: { summary: memorySummary.slice(0, 2000) },
    }),
  ]);

  return serializeInsight(row, Math.max(0, MAX_GENERATIONS_PER_DAY - used - 1));
}
