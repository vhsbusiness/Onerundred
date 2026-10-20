import OpenAI from "openai";
import { subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { PRIORITY_LABEL, asPriority, isOverdue } from "./metrics";
import { boardAccess, getDashboard, getWorkState, reorderListCards } from "./repo";
import { computeStats, listSleep } from "./sleep";
import { listProjects } from "./projects";
import { computeLeisureStats, listLeisure } from "./leisure";
import { dayKey, dayRange, formatDuration, todayKey } from "./time";
import type { AiInsightContent, AiInsightDTO, AiObservation, AiStatusDTO, WorkSessionInsightDTO } from "./types";
import { getAppSettings } from "./admin";

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

/* ───────────── Período de observação ───────────── */

/**
 * Antes de opinar, a IA observa cada dimensão por um mínimo de dias COM dados
 * (configurável pelo admin). Tarefas e trabalho liberam a análise completa;
 * sono e lazer, enquanto não prontos, ficam fora das conclusões.
 */
export async function getObservation(userId: string): Promise<AiObservation> {
  const settings = await getAppSettings();
  const since = subDays(dayRange(todayKey()).start, 60);

  const [cards, work, sleepCount, leisure] = await Promise.all([
    prisma.card.findMany({
      where: { list: { board: boardAccess(userId) }, createdAt: { gte: since } },
      select: { scheduledFor: true },
    }),
    prisma.workSession.findMany({ where: { userId, startedAt: { gte: since } }, select: { startedAt: true } }),
    prisma.sleepLog.count({ where: { userId, wakeAt: { gte: since } } }),
    prisma.leisureLog.findMany({ where: { userId, startAt: { gte: since }, endAt: { not: null } }, select: { dayKey: true } }),
  ]);

  const today = todayKey();
  const taskDays = new Set(cards.map((c) => c.scheduledFor).filter((k) => k <= today)).size;
  const workDays = new Set(work.map((w) => dayKey(w.startedAt))).size;
  const leisureDays = new Set(leisure.map((l) => l.dayKey)).size;

  const dim = (
    key: AiObservation["dimensions"][number]["key"],
    label: string,
    have: number,
    need: number,
    unit: string,
  ) => ({ key, label, have, need, ready: have >= need, unit });

  const dimensions = [
    dim("tasks", "Tarefas", taskDays, settings.aiMinDaysTasks, "dias"),
    dim("work", "Tempo de trabalho", workDays, settings.aiMinDaysWork, "dias"),
    dim("sleep", "Sono", sleepCount, settings.aiMinNightsSleep, "noites"),
    dim("leisure", "Lazer", leisureDays, settings.aiMinDaysLeisure, "dias"),
  ];
  return { dimensions, coreReady: dimensions[0].ready && dimensions[1].ready };
}

/* ───────────── Contexto ───────────── */

async function buildContext(userId: string, observation: AiObservation) {
  const now = new Date();
  const today = todayKey();
  const dash = await getDashboard(userId);
  const since = subDays(dayRange(today).start, 14);

  const [workSessions, taskSessions, memory, tomorrowCards, sleepLogs, projects, leisureLogs] = await Promise.all([
    prisma.workSession.findMany({
      where: { userId, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.taskSession.findMany({
      where: { startedAt: { gte: since }, card: { list: { board: boardAccess(userId) } } },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.aiMemory.findUnique({ where: { userId } }),
    prisma.card.findMany({
      where: { list: { board: boardAccess(userId) }, archivedAt: null, completedAt: null, scheduledFor: { gt: today } },
      select: { title: true, priority: true, scheduledFor: true, estimatedMinutes: true },
      take: 20,
    }),
    listSleep(userId, 14),
    listProjects(userId),
    listLeisure(userId, 14),
  ]);
  const leisure = computeLeisureStats(leisureLogs.filter((l) => l.endAt));
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
    atrasada: isOverdue(c, today),
    emAndamento: Boolean(c.runningSince),
  }));

  return {
    dash,
    memory: memory?.summary ?? null,
    payload: {
      periodoDeObservacao: observation.dimensions.map((d) => ({
        dimensao: d.label,
        diasComDados: d.have,
        minimo: d.need,
        pronta: d.ready,
      })),
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
      metasProjetos: projects
        .filter((p) => !p.archivedAt && p.todayStatus !== "ended")
        .map((p) => ({
          nome: p.name,
          obrigacoes: p.obligations,
          diaAtual: p.daysElapsed,
          totalDias: p.endless ? null : p.days,
          feitos: p.doneCount,
          naoFeitos: p.missedCount,
          sequencia: p.streak,
          hojeMarcado: p.todayStatus,
        })),
      lazer: {
        hojeMin: leisure.todayMin,
        semanaMin: leisure.weekMin,
        mediaDiaria7Min: leisure.avg7Min,
        porAtividade7Dias: leisure.byActivity7,
        porDia14: leisure.byDay14.map((d) => ({ dia: d.key, min: d.minutes })),
        emAndamento: leisureLogs.find((l) => !l.endAt)?.activity ?? null,
      },
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
- periodoDeObservacao diz quais dimensões já têm dados suficientes. Sobre uma dimensão NÃO pronta (pronta=false) você não tira conclusões nem dá sugestões: diga no máximo que ainda está observando (ex.: "sono: 3 de 7 noites registradas"). Se sono não está pronto, devolva sleepAt e wakeAt como "" (vazios) e não fale de sono na note. Se lazer não está pronto, não comente lazer.
- Responda em português do Brasil, direto e humano, sem bajulação e sem listas enormes.
- A nota (score) deve refletir o peso das prioridades: tarefas Alta valem mais; tarefas atrasadas pesam contra; tempo trabalhado abaixo do planejado puxa para baixo; concluir cedo o que importa puxa para cima. Se não há tarefas nem trabalho, seja franco.
- Em nextTasks use somente ids de tarefas abertas de hoje (feita=false), no máximo 3, da mais importante para a menos.
- Os horários (schedule) devem partir dos padrões reais do usuário (histogramas de horas, minutos por dia, registros de sono, memória) e ser realistas: jornada compatível com a meta diária, pausas a cada 90–120 min de trabalho, 7–8h de sono. Se houver registros de sono, use a hora real em que a pessoa acorda e dorme e comente se está dormindo pouco; sem registros, sugira e convide a registrar na aba Sono. Horários no formato HH:MM, 24h.
- Lazer (jogos, séries etc.) não é inimigo: comente o equilíbrio entre trabalho, lazer e sono com base nos números, sem julgar; aponte só quando o lazer está comendo o trabalho planejado ou o sono.
- Se houver metas/projetos (metasProjetos) com o dia de hoje ainda "pending", lembre o usuário de cumprir e marcar; reconheça sequências longas; sem moralizar.
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
  const [latest, used, memory, observation] = await Promise.all([
    prisma.aiInsight.findFirst({ where: { userId, dayKey: today }, orderBy: { createdAt: "desc" } }),
    generationsToday(userId),
    prisma.aiMemory.findUnique({ where: { userId } }),
    getObservation(userId),
  ]);
  const remaining = Math.max(0, MAX_GENERATIONS_PER_DAY - used);
  return {
    enabled: aiEnabled(),
    insight: latest ? serializeInsight(latest, remaining) : null,
    remainingToday: remaining,
    memory: memory?.summary ?? null,
    observation,
  };
}

export async function generateInsight(userId: string): Promise<AiInsightDTO> {
  if (!aiEnabled()) throw new ApiError(503, "IA não configurada (OPENAI_API_KEY ausente)");
  const used = await generationsToday(userId);
  if (used >= MAX_GENERATIONS_PER_DAY) {
    throw new ApiError(429, `Limite de ${MAX_GENERATIONS_PER_DAY} análises por dia atingido`);
  }

  const observation = await getObservation(userId);
  if (!observation.coreReady) {
    const pending = observation.dimensions
      .filter((d) => (d.key === "tasks" || d.key === "work") && !d.ready)
      .map((d) => `${d.label.toLowerCase()} ${d.have}/${d.need} ${d.unit}`)
      .join(", ");
    throw new ApiError(425, `A IA ainda está observando seus hábitos (${pending})`);
  }
  const { payload } = await buildContext(userId, observation);
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

  await prisma.aiUsage.create({
    data: {
      userId,
      kind: "insight",
      model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    },
  });
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

/* ───────────── Visão de uma sessão de trabalho ───────────── */

const MAX_SESSION_INSIGHTS_PER_DAY = 12;

const SESSION_SYSTEM_PROMPT = `Você é um coach de produtividade direto e gentil, em português do Brasil.
Recebe os dados de UMA sessão de trabalho encerrada de um usuário (horário, duração, tarefas em que ele
ligou o cronômetro, tarefas concluídas, meta do dia e as outras sessões do dia) e devolve uma visão curta:
- headline: uma frase de até 60 caracteres resumindo a sessão;
- summary: 2 a 3 frases sobre como foi (ritmo, foco, o que rendeu), sem repetir números que já estão na tela;
- highlights: até 4 observações concretas (ex.: muito tempo numa tarefa só, sessão sem cronômetro em tarefa,
  horário em que rendeu, pausa longa), cada uma com até 90 caracteres;
- suggestion: uma sugestão prática para a próxima sessão, até 140 caracteres.
Não invente dados. Se faltar informação (ex.: nenhuma tarefa com cronômetro), diga isso de forma útil.`;

const sessionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    suggestion: { type: "string" },
  },
  required: ["headline", "summary", "highlights", "suggestion"],
} as const;

/** Visão da IA sobre uma sessão de trabalho já encerrada. */
export async function analyzeWorkSession(userId: string, sessionId: string): Promise<WorkSessionInsightDTO> {
  if (!aiEnabled()) throw new ApiError(503, "IA não configurada (OPENAI_API_KEY ausente)");
  const session = await prisma.workSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new ApiError(404, "Sessão não encontrada");
  if (!session.endedAt) throw new ApiError(400, "Encerre ou pause a sessão antes de pedir a visão da IA");

  const endDay = dayRange(dayKey(session.endedAt));
  const used = await prisma.aiUsage.count({ where: { userId, kind: "session", createdAt: { gte: dayRange(todayKey()).start } } });
  if (used >= MAX_SESSION_INSIGHTS_PER_DAY) throw new ApiError(429, `Limite de ${MAX_SESSION_INSIGHTS_PER_DAY} visões de sessão por dia atingido`);

  const start = session.startedAt;
  const end = session.endedAt;
  const clip = (a: Date, b: Date | null) => {
    const s = Math.max(a.getTime(), start.getTime());
    const e = Math.min((b ?? new Date()).getTime(), end.getTime());
    return Math.max(0, e - s);
  };

  const [taskSessions, completed, daySessions, work] = await Promise.all([
    prisma.taskSession.findMany({
      where: { startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }], card: { list: { board: boardAccess(userId) } } },
      include: { card: { select: { id: true, title: true, priority: true, estimatedMinutes: true, completedAt: true, list: { select: { name: true } } } } },
    }),
    prisma.card.findMany({
      where: { completedAt: { gte: start, lte: end }, list: { board: boardAccess(userId) } },
      select: { id: true, title: true, priority: true, estimatedMinutes: true },
    }),
    prisma.workSession.findMany({ where: { userId, OR: [{ endedAt: { gte: endDay.start, lt: endDay.end } }, { endedAt: null }] }, orderBy: { startedAt: "asc" } }),
    getWorkState(userId),
  ]);

  const byCard = new Map<string, { title: string; minutes: number; done: boolean; priority: number; estimatedMinutes: number | null; list: string }>();
  for (const ts of taskSessions) {
    const cur = byCard.get(ts.card.id) ?? { title: ts.card.title, minutes: 0, done: Boolean(ts.card.completedAt), priority: ts.card.priority, estimatedMinutes: ts.card.estimatedMinutes, list: ts.card.list.name };
    cur.minutes += Math.round(clip(ts.startedAt, ts.endedAt) / 60000);
    byCard.set(ts.card.id, cur);
  }
  const tasks = [...byCard.values()].sort((a, b) => b.minutes - a.minutes);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const focusedMin = tasks.reduce((acc, t) => acc + t.minutes, 0);
  const idx = daySessions.findIndex((s) => s.id === session.id);
  // Hora; com dia/mês na frente quando a sessão atravessou a meia-noite.
  const fmt = (d: Date) =>
    (dayKey(d) !== dayKey(end) ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " : "") +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const payload = {
    sessao: { inicio: fmt(start), fim: fmt(end), atravessouMeiaNoite: dayKey(start) !== dayKey(end), duracaoMin: durationMin, numeroNoDia: idx + 1, totalSessoesNoDia: daySessions.length },
    minutosComCronometroDeTarefa: focusedMin,
    tarefasComCronometro: tasks.map((t) => ({ titulo: t.title, lista: t.list, minutos: t.minutes, prioridade: PRIORITY_LABEL[asPriority(t.priority)], estimativaMin: t.estimatedMinutes, concluida: t.done })),
    tarefasConcluidasNaSessao: completed.map((c) => ({ titulo: c.title, prioridade: PRIORITY_LABEL[asPriority(c.priority)], estimativaMin: c.estimatedMinutes })),
    outrasSessoesDoDia: daySessions.filter((s) => s.id !== session.id).map((s) => ({ inicio: fmt(s.startedAt), fim: s.endedAt ? fmt(s.endedAt) : "em andamento", duracaoMin: Math.round(((s.endedAt ?? new Date()).getTime() - s.startedAt.getTime()) / 60000) })),
    metaDoDiaMin: work.plannedMinutes,
    trabalhadoNoDiaMin: Math.round(work.todayMs / 60000),
  };

  const model = modelName();
  const completion = await openai().chat.completions.create({
    model,
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {}),
    messages: [
      { role: "system", content: SESSION_SYSTEM_PROMPT },
      { role: "user", content: `Dados da sessão em JSON:\n${JSON.stringify(payload)}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "visao_sessao", strict: true, schema: sessionSchema } },
  });
  await prisma.aiUsage.create({
    data: { userId, kind: "session", model, promptTokens: completion.usage?.prompt_tokens ?? 0, completionTokens: completion.usage?.completion_tokens ?? 0 },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new ApiError(502, "A IA não retornou conteúdo");
  const parsed = JSON.parse(raw) as { headline: string; summary: string; highlights: string[]; suggestion: string };

  return {
    sessionId: session.id,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationMin,
    focusedMin,
    tasks: tasks.map((t) => ({ title: t.title, minutes: t.minutes, done: t.done })),
    headline: parsed.headline.slice(0, 80),
    summary: parsed.summary.slice(0, 600),
    highlights: parsed.highlights.slice(0, 4).map((h) => h.slice(0, 120)),
    suggestion: parsed.suggestion.slice(0, 200),
  };
}

/* ───────────── Organizar lista por importância ───────────── */

const SORT_SYSTEM_PROMPT = `Você organiza a lista de tarefas de um usuário brasileiro por importância.
Devolva os ids de TODAS as tarefas recebidas, da mais importante para a menos importante.
Critérios, nesta ordem: tarefas atrasadas primeiro; prioridade Alta antes de Média antes de Baixa;
prazos mais próximos antes; entre iguais, tarefas que parecem bloquear outras, ou de maior impacto
(dinheiro, clientes, saúde, compromissos com outras pessoas) antes de tarefas rotineiras ou vagas;
por último, tarefas curtas antes de longas. Não invente ids.`;

const sortSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    order: { type: "array", items: { type: "string" }, description: "Ids das tarefas, da mais importante para a menos importante" },
    reason: { type: "string", description: "Uma frase curta, em português, explicando o critério principal usado" },
  },
  required: ["order", "reason"],
} as const;

/** Pede à IA a ordem de importância das tarefas abertas de uma lista e aplica (com desfazer). */
export async function organizeListByImportance(userId: string, listId: string): Promise<{ moved: number; reason: string }> {
  if (!aiEnabled()) throw new ApiError(503, "IA não configurada (OPENAI_API_KEY ausente)");
  const list = await prisma.list.findFirst({ where: { id: listId, board: boardAccess(userId) } });
  if (!list) throw new ApiError(404, "Lista não encontrada");
  const cards = await prisma.card.findMany({
    where: { listId, archivedAt: null, completedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, title: true, description: true, priority: true, estimatedMinutes: true, scheduledFor: true },
  });
  if (cards.length < 2) throw new ApiError(400, "A lista precisa ter pelo menos 2 tarefas abertas");

  const today = todayKey();
  const payload = cards.map((c) => ({
    id: c.id,
    titulo: c.title,
    descricao: c.description.slice(0, 300),
    prioridade: PRIORITY_LABEL[asPriority(c.priority)],
    estimativaMin: c.estimatedMinutes,
    dia: c.scheduledFor,
    atrasada: isOverdue({ completedAt: null, scheduledFor: c.scheduledFor, listPriority: list.priority, listKind: list.kind }, today),
  }));

  const model = modelName();
  const completion = await openai().chat.completions.create({
    model,
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {}),
    messages: [
      { role: "system", content: SORT_SYSTEM_PROMPT },
      { role: "user", content: `Hoje é ${today}. Lista "${list.name}" (prioridade da lista: ${PRIORITY_LABEL[asPriority(list.priority)]}).\nTarefas em JSON:\n${JSON.stringify(payload)}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "ordem_importancia", strict: true, schema: sortSchema } },
  });
  await prisma.aiUsage.create({
    data: {
      userId,
      kind: "sortList",
      model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new ApiError(502, "A IA não retornou conteúdo");
  const parsed = JSON.parse(raw) as { order: string[]; reason: string };
  const moved = await reorderListCards(listId, userId, parsed.order, `organizar "${list.name}" por importância (IA)`);
  return { moved, reason: parsed.reason.slice(0, 200) };
}

/** Apaga a memória de hábitos e o histórico de análises do usuário. Os dados (tarefas, sono, lazer) ficam. */
export async function resetAiMemory(userId: string): Promise<{ insights: number; hadMemory: boolean }> {
  const [insights, memory] = await prisma.$transaction([
    prisma.aiInsight.deleteMany({ where: { userId } }),
    prisma.aiMemory.deleteMany({ where: { userId } }),
  ]);
  return { insights: insights.count, hadMemory: memory.count > 0 };
}
