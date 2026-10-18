import { subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./api";
import { periodScore, workVerdict, type MetricCard } from "./metrics";
import {
  dayKey,
  dayRange,
  monthRange,
  sumSessions,
  todayKey,
  tomorrowKey,
  weekRange,
} from "./time";
import type {
  ArchivedCard,
  BoardDTO,
  BoardSummary,
  CardDTO,
  DashboardDTO,
  ListDTO,
  ListKind,
  SessionDTO,
  SettingsDTO,
  TodayCard,
  WorkState,
} from "./types";

/* ───────────────────────── Serialização ───────────────────────── */

interface SessionRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
}

interface CardRow {
  id: string;
  listId: string;
  title: string;
  description: string;
  priority: number;
  position: number;
  estimatedMinutes: number | null;
  scheduledFor: string;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  sessions: SessionRow[];
}

export function serializeSession(s: SessionRow): SessionDTO {
  return {
    id: s.id,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  };
}

export function serializeCard(c: CardRow): CardDTO {
  const closed = c.sessions.filter((s) => s.endedAt);
  const running = c.sessions.find((s) => !s.endedAt);
  return {
    id: c.id,
    listId: c.listId,
    title: c.title,
    description: c.description,
    priority: c.priority,
    position: c.position,
    estimatedMinutes: c.estimatedMinutes,
    scheduledFor: c.scheduledFor,
    createdAt: c.createdAt.toISOString(),
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
    spentMs: sumSessions(closed),
    runningSince: running ? running.startedAt.toISOString() : null,
    sessions: c.sessions
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map(serializeSession),
  };
}

const cardInclude = { sessions: true } as const;

/* ───────────────────────── Manutenção diária ───────────────────────── */

/**
 * Executada a cada leitura relevante:
 *  1. arquiva tarefas concluídas em dias anteriores;
 *  2. move tarefas da lista "Amanhã" cujo dia chegou para a primeira lista normal do quadro.
 */
export async function runMaintenance(): Promise<void> {
  const today = todayKey();
  const { start } = dayRange(today);

  await prisma.card.updateMany({
    where: { archivedAt: null, completedAt: { lt: start } },
    data: { archivedAt: new Date() },
  });

  // Cronômetros esquecidos ligados de um dia anterior são encerrados na virada do dia,
  // para não inflar o tempo trabalhado de hoje.
  const forgottenWork = await prisma.workSession.findMany({
    where: { endedAt: null, startedAt: { lt: start } },
  });
  for (const s of forgottenWork) {
    await prisma.workSession.update({
      where: { id: s.id },
      data: { endedAt: dayRange(dayKey(s.startedAt)).end },
    });
  }
  const forgottenTasks = await prisma.taskSession.findMany({
    where: { endedAt: null, startedAt: { lt: start } },
  });
  for (const s of forgottenTasks) {
    await prisma.taskSession.update({
      where: { id: s.id },
      data: { endedAt: dayRange(dayKey(s.startedAt)).end },
    });
  }

  const tomorrowLists = await prisma.list.findMany({
    where: { kind: "tomorrow" },
    include: {
      cards: { where: { archivedAt: null, scheduledFor: { lte: today } } },
      board: {
        include: {
          lists: { where: { kind: "normal" }, orderBy: { position: "asc" }, take: 1 },
        },
      },
    },
  });

  for (const list of tomorrowLists) {
    const target = list.board.lists[0];
    if (!target || list.cards.length === 0) continue;
    const max = await prisma.card.aggregate({
      where: { listId: target.id },
      _max: { position: true },
    });
    let pos = (max._max.position ?? -1) + 1;
    for (const card of list.cards) {
      await prisma.card.update({
        where: { id: card.id },
        data: { listId: target.id, position: pos++ },
      });
    }
  }
}

/* ───────────────────────── Quadros ───────────────────────── */

export async function ensureDefaultBoard(): Promise<void> {
  const count = await prisma.board.count();
  if (count > 0) return;
  await prisma.board.create({
    data: {
      name: "Meu dia",
      position: 0,
      lists: {
        create: [
          { name: "Hoje", position: 0, priority: 1, kind: "normal" },
          { name: "Esta semana", position: 1, priority: 2, kind: "normal" },
          { name: "Amanhã", position: 2, priority: 2, kind: "tomorrow" },
          { name: "Feitas", position: 3, priority: 2, kind: "done" },
        ],
      },
    },
  });
}

export async function listBoards(): Promise<BoardSummary[]> {
  await ensureDefaultBoard();
  await runMaintenance();
  const today = todayKey();
  const { start, end } = dayRange(today);

  const boards = await prisma.board.findMany({
    orderBy: { position: "asc" },
    include: {
      lists: {
        include: { cards: { where: { archivedAt: null } } },
      },
    },
  });

  return boards.map((b) => {
    const metricCards: MetricCard[] = [];
    let openCount = 0;
    let doneTodayCount = 0;
    for (const l of b.lists) {
      for (const c of l.cards) {
        metricCards.push({ ...c, listPriority: l.priority });
        if (!c.completedAt) openCount += 1;
        else if (c.completedAt >= start && c.completedAt < end) doneTodayCount += 1;
      }
    }
    return {
      id: b.id,
      name: b.name,
      position: b.position,
      createdAt: b.createdAt.toISOString(),
      listCount: b.lists.length,
      openCount,
      doneTodayCount,
      todayScore: periodScore(metricCards, start, end, today).score,
    };
  });
}

export async function createBoard(name: string): Promise<BoardSummary> {
  const max = await prisma.board.aggregate({ _max: { position: true } });
  const board = await prisma.board.create({
    data: {
      name,
      position: (max._max.position ?? -1) + 1,
      lists: {
        create: [
          { name: "A fazer", position: 0, priority: 2, kind: "normal" },
          { name: "Feitas", position: 1, priority: 2, kind: "done" },
        ],
      },
    },
  });
  return {
    id: board.id,
    name: board.name,
    position: board.position,
    createdAt: board.createdAt.toISOString(),
    listCount: 2,
    openCount: 0,
    doneTodayCount: 0,
    todayScore: null,
  };
}

export async function getBoard(id: string): Promise<BoardDTO> {
  await runMaintenance();
  const board = await prisma.board.findUnique({
    where: { id },
    include: {
      lists: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            where: { archivedAt: null },
            orderBy: { position: "asc" },
            include: cardInclude,
          },
        },
      },
    },
  });
  if (!board) throw new ApiError(404, "Quadro não encontrado");
  return {
    id: board.id,
    name: board.name,
    position: board.position,
    createdAt: board.createdAt.toISOString(),
    lists: board.lists.map(
      (l): ListDTO => ({
        id: l.id,
        boardId: l.boardId,
        name: l.name,
        position: l.position,
        priority: l.priority,
        kind: l.kind as ListKind,
        cards: l.cards.map(serializeCard),
      }),
    ),
  };
}

export async function updateBoard(id: string, data: { name?: string }) {
  await prisma.board.update({ where: { id }, data });
}

export async function deleteBoard(id: string) {
  await prisma.board.delete({ where: { id } });
}

/* ───────────────────────── Listas ───────────────────────── */

export async function createList(input: {
  boardId: string;
  name: string;
  priority?: number;
  kind?: ListKind;
}) {
  const board = await prisma.board.findUnique({ where: { id: input.boardId } });
  if (!board) throw new ApiError(404, "Quadro não encontrado");
  const max = await prisma.list.aggregate({
    where: { boardId: input.boardId },
    _max: { position: true },
  });
  return prisma.list.create({
    data: {
      boardId: input.boardId,
      name: input.name,
      priority: input.priority ?? 2,
      kind: input.kind ?? "normal",
      position: (max._max.position ?? -1) + 1,
    },
  });
}

export async function updateList(
  id: string,
  data: { name?: string; priority?: number; kind?: ListKind; toIndex?: number },
) {
  const list = await prisma.list.findUnique({ where: { id } });
  if (!list) throw new ApiError(404, "Lista não encontrada");

  const { toIndex, ...rest } = data;
  await prisma.list.update({ where: { id }, data: rest });

  if (toIndex !== undefined) {
    const siblings = await prisma.list.findMany({
      where: { boardId: list.boardId, NOT: { id } },
      orderBy: { position: "asc" },
    });
    const idx = Math.max(0, Math.min(toIndex, siblings.length));
    const ordered = [...siblings.slice(0, idx), list, ...siblings.slice(idx)];
    await prisma.$transaction(
      ordered.map((l, i) => prisma.list.update({ where: { id: l.id }, data: { position: i } })),
    );
  }
}

export async function deleteList(id: string) {
  await prisma.list.delete({ where: { id } });
}

/* ───────────────────────── Tarefas ───────────────────────── */

export async function createCard(input: {
  listId: string;
  title: string;
  description?: string;
  priority?: number;
  estimatedMinutes?: number | null;
  scheduledFor?: string;
}): Promise<CardDTO> {
  const list = await prisma.list.findUnique({ where: { id: input.listId } });
  if (!list) throw new ApiError(404, "Lista não encontrada");
  const max = await prisma.card.aggregate({
    where: { listId: input.listId },
    _max: { position: true },
  });
  const scheduledFor =
    input.scheduledFor ?? (list.kind === "tomorrow" ? tomorrowKey() : todayKey());
  const card = await prisma.card.create({
    data: {
      listId: input.listId,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? 2,
      estimatedMinutes: input.estimatedMinutes ?? null,
      scheduledFor,
      position: (max._max.position ?? -1) + 1,
      completedAt: list.kind === "done" ? new Date() : null,
    },
    include: cardInclude,
  });
  return serializeCard(card);
}

export async function getCard(id: string): Promise<CardDTO> {
  const card = await prisma.card.findUnique({ where: { id }, include: cardInclude });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");
  return serializeCard(card);
}

export async function updateCard(
  id: string,
  data: {
    title?: string;
    description?: string;
    priority?: number;
    estimatedMinutes?: number | null;
    scheduledFor?: string;
  },
): Promise<CardDTO> {
  const card = await prisma.card.update({ where: { id }, data, include: cardInclude });
  return serializeCard(card);
}

export async function deleteCard(id: string) {
  await prisma.card.delete({ where: { id } });
}

/** Ajustes de estado ao entrar numa lista de determinado tipo. */
function kindEffects(kind: string, card: { completedAt: Date | null; scheduledFor: string }) {
  const today = todayKey();
  const data: { completedAt?: Date | null; scheduledFor?: string } = {};
  if (kind === "done") {
    if (!card.completedAt) data.completedAt = new Date();
  } else {
    if (card.completedAt) data.completedAt = null;
    if (kind === "tomorrow") {
      if (card.scheduledFor <= today) data.scheduledFor = tomorrowKey();
    } else if (card.scheduledFor > today) {
      data.scheduledFor = today;
    }
  }
  return data;
}

/** Move uma tarefa para `toListId` na posição `toIndex`, reescrevendo posições. */
export async function moveCard(cardId: string, toListId: string, toIndex: number) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");
  const target = await prisma.list.findUnique({ where: { id: toListId } });
  if (!target) throw new ApiError(404, "Lista não encontrada");

  const fromListId = card.listId;
  const targetCards = await prisma.card.findMany({
    where: { listId: toListId, archivedAt: null, NOT: { id: cardId } },
    orderBy: { position: "asc" },
  });
  const idx = Math.max(0, Math.min(toIndex, targetCards.length));
  const ordered = [...targetCards.slice(0, idx), card, ...targetCards.slice(idx)];

  const ops = ordered.map((c, i) =>
    prisma.card.update({
      where: { id: c.id },
      data:
        c.id === cardId
          ? { listId: toListId, position: i, ...kindEffects(target.kind, card) }
          : { position: i },
    }),
  );

  if (fromListId !== toListId) {
    const sourceCards = await prisma.card.findMany({
      where: { listId: fromListId, archivedAt: null, NOT: { id: cardId } },
      orderBy: { position: "asc" },
    });
    sourceCards.forEach((c, i) => {
      ops.push(prisma.card.update({ where: { id: c.id }, data: { position: i } }));
    });
  }

  await prisma.$transaction(ops);
}

/** Marca como concluída: move para a lista "Feitas" do quadro, se existir. */
export async function completeCard(cardId: string): Promise<CardDTO> {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");

  await stopTaskTimer(cardId);

  const doneList = await prisma.list.findFirst({
    where: { boardId: card.list.boardId, kind: "done" },
    orderBy: { position: "asc" },
  });
  if (doneList) {
    await moveCard(cardId, doneList.id, 0);
  } else {
    await prisma.card.update({ where: { id: cardId }, data: { completedAt: new Date() } });
  }
  return getCard(cardId);
}

/**
 * Reabre uma tarefa concluída.
 * Se ela estiver numa lista "Feitas" (ou arquivada), volta para a primeira lista normal;
 * se foi concluída por engano numa lista comum, só desmarca. Tarefas arquivadas
 * voltam agendadas para hoje; as demais mantêm o dia original.
 */
export async function reopenCard(cardId: string): Promise<CardDTO> {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { list: true } });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");

  await prisma.card.update({
    where: { id: cardId },
    data: {
      archivedAt: null,
      completedAt: null,
      scheduledFor: card.archivedAt ? todayKey() : card.scheduledFor,
    },
  });

  if (card.list.kind === "done" || card.archivedAt) {
    const normal = await prisma.list.findFirst({
      where: { boardId: card.list.boardId, kind: "normal" },
      orderBy: { position: "asc" },
    });
    if (normal) {
      const max = await prisma.card.aggregate({ where: { listId: normal.id }, _max: { position: true } });
      await moveCard(cardId, normal.id, (max._max.position ?? -1) + 1);
    }
  }
  return getCard(cardId);
}

/* ───────────────────────── Cronômetro da tarefa ───────────────────────── */

export async function startTaskTimer(cardId: string): Promise<CardDTO> {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");
  const now = new Date();
  await prisma.$transaction([
    prisma.taskSession.updateMany({ where: { endedAt: null }, data: { endedAt: now } }),
    prisma.taskSession.create({ data: { cardId, startedAt: now } }),
  ]);
  return getCard(cardId);
}

export async function stopTaskTimer(cardId: string): Promise<CardDTO> {
  await prisma.taskSession.updateMany({
    where: { cardId, endedAt: null },
    data: { endedAt: new Date() },
  });
  return getCard(cardId);
}

export async function deleteTaskSession(sessionId: string) {
  await prisma.taskSession.delete({ where: { id: sessionId } });
}

/* ───────────────────────── Sessão de trabalho ───────────────────────── */

const DEFAULT_DAILY_GOAL = 8 * 60;

export async function getSettings(): Promise<SettingsDTO> {
  const row = await prisma.setting.findUnique({ where: { key: "dailyGoalMinutes" } });
  const n = row ? Number(row.value) : NaN;
  return { dailyGoalMinutes: Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_GOAL };
}

export async function updateSettings(data: Partial<SettingsDTO>): Promise<SettingsDTO> {
  if (data.dailyGoalMinutes !== undefined) {
    await prisma.setting.upsert({
      where: { key: "dailyGoalMinutes" },
      create: { key: "dailyGoalMinutes", value: String(data.dailyGoalMinutes) },
      update: { value: String(data.dailyGoalMinutes) },
    });
  }
  return getSettings();
}

async function plannedMinutesForToday(): Promise<number> {
  const today = todayKey();
  const { start } = dayRange(today);
  const cards = await prisma.card.findMany({
    where: {
      archivedAt: null,
      scheduledFor: { lte: today },
      OR: [{ completedAt: null }, { completedAt: { gte: start } }],
    },
    select: { estimatedMinutes: true },
  });
  return cards.reduce((acc, c) => acc + (c.estimatedMinutes ?? 0), 0);
}

export async function getWorkState(): Promise<WorkState> {
  const today = todayKey();
  const { start } = dayRange(today);
  const sessions = await prisma.workSession.findMany({
    where: { OR: [{ startedAt: { gte: start } }, { endedAt: null }] },
    orderBy: { startedAt: "desc" },
  });
  const running = sessions.find((s) => !s.endedAt) ?? null;
  const todayMs = sumSessions(sessions);
  const settings = await getSettings();
  const estimated = await plannedMinutesForToday();
  const plannedMinutes = estimated > 0 ? estimated : settings.dailyGoalMinutes;

  return {
    todayMs,
    running: running ? { id: running.id, startedAt: running.startedAt.toISOString() } : null,
    sessions: sessions.map(serializeSession),
    plannedMinutes,
    dailyGoalMinutes: settings.dailyGoalMinutes,
    verdict: workVerdict(todayMs / 60000, plannedMinutes),
  };
}

export async function startWork(): Promise<WorkState> {
  const running = await prisma.workSession.findFirst({ where: { endedAt: null } });
  if (!running) await prisma.workSession.create({ data: {} });
  return getWorkState();
}

export async function stopWork(): Promise<WorkState> {
  const now = new Date();
  await prisma.$transaction([
    prisma.workSession.updateMany({ where: { endedAt: null }, data: { endedAt: now } }),
    prisma.taskSession.updateMany({ where: { endedAt: null }, data: { endedAt: now } }),
  ]);
  return getWorkState();
}

export async function deleteWorkSession(id: string) {
  await prisma.workSession.delete({ where: { id } });
}

/* ───────────────────────── Dashboard ───────────────────────── */

export async function getDashboard(): Promise<DashboardDTO> {
  await ensureDefaultBoard();
  await runMaintenance();

  const today = todayKey();
  const now = new Date();
  const todayR = dayRange(today);
  const weekR = weekRange(now);
  const monthR = monthRange(now);

  const cards = await prisma.card.findMany({
    include: { list: { include: { board: true } }, sessions: true },
  });

  const metricCards: MetricCard[] = cards.map((c) => ({ ...c, listPriority: c.list.priority }));

  const history = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(subDays(now, i));
    const r = dayRange(key);
    const s = periodScore(metricCards, r.start, r.end, key);
    history.push({ key, score: s.score, doneCount: s.doneCount, openCount: s.openCount });
  }

  let streak = 0;
  for (let i = 1; i <= 60; i++) {
    const key = dayKey(subDays(now, i));
    const r = dayRange(key);
    const s = periodScore(metricCards, r.start, r.end, key);
    if (s.score === null) continue;
    if (s.score >= 70) streak += 1;
    else break;
  }
  const todayScore = periodScore(metricCards, todayR.start, todayR.end, today);
  if (todayScore.score !== null && todayScore.score >= 70) streak += 1;

  const todayCards: TodayCard[] = cards
    .filter(
      (c) =>
        !c.archivedAt &&
        c.scheduledFor <= today &&
        (!c.completedAt || c.completedAt >= todayR.start),
    )
    .sort((a, b) => {
      if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.position - b.position;
    })
    .map((c) => ({
      ...serializeCard(c),
      listName: c.list.name,
      listPriority: c.list.priority,
      listKind: c.list.kind as ListKind,
      boardId: c.list.boardId,
      boardName: c.list.board.name,
    }));

  const counts = { done: 0, inProgress: 0, pending: 0, overdue: 0 };
  for (const c of todayCards) {
    if (c.completedAt) counts.done += 1;
    else if (c.runningSince || c.spentMs > 0) counts.inProgress += 1;
    else counts.pending += 1;
    if (!c.completedAt && c.scheduledFor < today) counts.overdue += 1;
  }

  const runningSession = await prisma.taskSession.findFirst({
    where: { endedAt: null },
    include: { card: { include: { list: true } } },
  });

  return {
    todayKey: today,
    today: todayScore,
    week: periodScore(metricCards, weekR.start, weekR.end, weekR.endKey),
    month: periodScore(metricCards, monthR.start, monthR.end, monthR.endKey),
    history,
    work: await getWorkState(),
    todayCards,
    runningTask: runningSession
      ? {
          cardId: runningSession.cardId,
          boardId: runningSession.card.list.boardId,
          title: runningSession.card.title,
          startedAt: runningSession.startedAt.toISOString(),
        }
      : null,
    counts,
    streak,
  };
}

/* ───────────────────────── Arquivadas ───────────────────────── */

export async function listArchived(): Promise<ArchivedCard[]> {
  await runMaintenance();
  const cards = await prisma.card.findMany({
    where: { archivedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    include: { list: { include: { board: true } }, sessions: true },
    take: 500,
  });
  return cards.map((c) => ({
    ...serializeCard(c),
    listName: c.list.name,
    boardId: c.list.boardId,
    boardName: c.list.board.name,
  }));
}
