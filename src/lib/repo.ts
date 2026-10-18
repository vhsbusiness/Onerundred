import { subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { periodScore, workVerdict, type MetricCard } from "./metrics";
import { autoMarkMissedDays } from "./projects";
import { autoStopForgottenLeisure } from "./leisure";
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

/*
 * Todas as funções recebem o `userId` do usuário logado e só enxergam os dados dele.
 * Quadros pertencem ao usuário; listas, tarefas e sessões de tarefa chegam ao usuário
 * pelo quadro. Sessões de trabalho e preferências são por usuário.
 */

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

/* ───────────────────────── Propriedade ───────────────────────── */

async function ownedBoard(id: string, userId: string) {
  const board = await prisma.board.findFirst({ where: { id, userId } });
  if (!board) throw new ApiError(404, "Quadro não encontrado");
  return board;
}

async function ownedList(id: string, userId: string) {
  const list = await prisma.list.findFirst({ where: { id, board: { userId } } });
  if (!list) throw new ApiError(404, "Lista não encontrada");
  return list;
}

async function ownedCard(id: string, userId: string) {
  const card = await prisma.card.findFirst({
    where: { id, list: { board: { userId } } },
    include: { list: true },
  });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");
  return card;
}

/* ───────────────────────── Manutenção diária ───────────────────────── */

/**
 * Executada a cada leitura relevante (vale para todos os usuários):
 *  1. arquiva tarefas concluídas em dias anteriores;
 *  2. encerra cronômetros esquecidos ligados de um dia anterior;
 *  3. move tarefas da lista "Amanhã" cujo dia chegou para a primeira lista normal do quadro;
 *  4. apaga sessões de login expiradas.
 */
export async function runMaintenance(): Promise<void> {
  const today = todayKey();
  const { start } = dayRange(today);

  await prisma.card.updateMany({
    where: { archivedAt: null, completedAt: { lt: start } },
    data: { archivedAt: new Date() },
  });

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

  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await autoMarkMissedDays();
  await autoStopForgottenLeisure();
}

/* ───────────────────────── Quadros ───────────────────────── */

export async function ensureDefaultBoard(userId: string): Promise<void> {
  const count = await prisma.board.count({ where: { userId } });
  if (count > 0) return;
  await prisma.board.create({
    data: {
      userId,
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

/** Id do último quadro aberto pelo usuário, se ele ainda existir. */
export async function lastBoardId(userId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { userId_key: { userId, key: "lastBoardId" } } });
  if (!row) return null;
  const board = await prisma.board.findFirst({ where: { id: row.value, userId }, select: { id: true } });
  return board?.id ?? null;
}

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  await ensureDefaultBoard(userId);
  await runMaintenance();
  const today = todayKey();
  const { start, end } = dayRange(today);

  const boards = await prisma.board.findMany({
    where: { userId },
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

export async function createBoard(userId: string, name: string): Promise<BoardSummary> {
  const max = await prisma.board.aggregate({ where: { userId }, _max: { position: true } });
  const board = await prisma.board.create({
    data: {
      userId,
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

export async function getBoard(id: string, userId: string): Promise<BoardDTO> {
  await runMaintenance();
  const board = await prisma.board.findFirst({
    where: { id, userId },
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
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: "lastBoardId" } },
    create: { userId, key: "lastBoardId", value: board.id },
    update: { value: board.id },
  });
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

export async function updateBoard(id: string, userId: string, data: { name?: string }) {
  await ownedBoard(id, userId);
  await prisma.board.update({ where: { id }, data });
}

export async function deleteBoard(id: string, userId: string) {
  await ownedBoard(id, userId);
  await prisma.board.delete({ where: { id } });
}

/* ───────────────────────── Listas ───────────────────────── */

export async function createList(
  userId: string,
  input: { boardId: string; name: string; priority?: number; kind?: ListKind },
) {
  await ownedBoard(input.boardId, userId);
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
  userId: string,
  data: { name?: string; priority?: number; kind?: ListKind; toIndex?: number },
) {
  const list = await ownedList(id, userId);
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

/** Duplica a lista (nome, prioridade, tipo) com as tarefas abertas, logo à direita da original. */
export async function copyList(id: string, userId: string) {
  const list = await ownedList(id, userId);
  const cards = await prisma.card.findMany({
    where: { listId: id, archivedAt: null },
    orderBy: { position: "asc" },
  });
  const siblings = await prisma.list.findMany({
    where: { boardId: list.boardId },
    orderBy: { position: "asc" },
  });
  const created = await prisma.list.create({
    data: {
      boardId: list.boardId,
      name: `${list.name} (cópia)`,
      priority: list.priority,
      kind: list.kind,
      position: list.position + 1,
      cards: {
        create: cards.map((c, i) => ({
          title: c.title,
          description: c.description,
          priority: c.priority,
          position: i,
          estimatedMinutes: c.estimatedMinutes,
          scheduledFor: c.scheduledFor,
          completedAt: c.completedAt,
        })),
      },
    },
  });
  // Reposiciona as listas para abrir espaço logo após a original.
  const idx = siblings.findIndex((l) => l.id === id);
  const ordered = [...siblings.slice(0, idx + 1), created, ...siblings.slice(idx + 1)];
  await prisma.$transaction(
    ordered.map((l, i) => prisma.list.update({ where: { id: l.id }, data: { position: i } })),
  );
  return created;
}

/** Move todas as tarefas abertas de uma lista para o fim de outra lista do mesmo quadro. */
export async function moveAllCards(fromListId: string, toListId: string, userId: string) {
  const from = await ownedList(fromListId, userId);
  const to = await ownedList(toListId, userId);
  if (from.boardId !== to.boardId) throw new ApiError(400, "As listas precisam ser do mesmo quadro");
  if (from.id === to.id) return 0;
  const cards = await prisma.card.findMany({
    where: { listId: fromListId, archivedAt: null },
    orderBy: { position: "asc" },
  });
  const max = await prisma.card.aggregate({ where: { listId: toListId }, _max: { position: true } });
  let pos = (max._max.position ?? -1) + 1;
  await prisma.$transaction(
    cards.map((c) =>
      prisma.card.update({
        where: { id: c.id },
        data: { listId: toListId, position: pos++, ...kindEffects(to.kind, c) },
      }),
    ),
  );
  return cards.length;
}

/** Arquiva todas as tarefas da lista (concluídas ou não). Elas continuam na aba Arquivadas. */
export async function archiveAllCards(listId: string, userId: string) {
  await ownedList(listId, userId);
  const now = new Date();
  await prisma.taskSession.updateMany({
    where: { endedAt: null, card: { listId } },
    data: { endedAt: now },
  });
  const result = await prisma.card.updateMany({
    where: { listId, archivedAt: null },
    data: { archivedAt: now },
  });
  return result.count;
}

export async function deleteList(id: string, userId: string) {
  await ownedList(id, userId);
  await prisma.list.delete({ where: { id } });
}

/* ───────────────────────── Tarefas ───────────────────────── */

export async function createCard(
  userId: string,
  input: {
    listId: string;
    title: string;
    description?: string;
    priority?: number;
    estimatedMinutes?: number | null;
    scheduledFor?: string;
  },
): Promise<CardDTO> {
  const list = await ownedList(input.listId, userId);
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

export async function getCard(id: string, userId: string): Promise<CardDTO> {
  const card = await prisma.card.findFirst({
    where: { id, list: { board: { userId } } },
    include: cardInclude,
  });
  if (!card) throw new ApiError(404, "Tarefa não encontrada");
  return serializeCard(card);
}

export async function updateCard(
  id: string,
  userId: string,
  data: {
    title?: string;
    description?: string;
    priority?: number;
    estimatedMinutes?: number | null;
    scheduledFor?: string;
  },
): Promise<CardDTO> {
  await ownedCard(id, userId);
  const card = await prisma.card.update({ where: { id }, data, include: cardInclude });
  return serializeCard(card);
}

export async function deleteCard(id: string, userId: string) {
  await ownedCard(id, userId);
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
export async function moveCard(userId: string, cardId: string, toListId: string, toIndex: number) {
  const card = await ownedCard(cardId, userId);
  const target = await ownedList(toListId, userId);
  if (target.boardId !== card.list.boardId) {
    throw new ApiError(400, "Só é possível mover tarefas dentro do mesmo quadro");
  }

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
export async function completeCard(userId: string, cardId: string): Promise<CardDTO> {
  const card = await ownedCard(cardId, userId);
  await stopTaskTimer(userId, cardId);

  const doneList = await prisma.list.findFirst({
    where: { boardId: card.list.boardId, kind: "done" },
    orderBy: { position: "asc" },
  });
  if (doneList) {
    await moveCard(userId, cardId, doneList.id, 0);
  } else {
    await prisma.card.update({ where: { id: cardId }, data: { completedAt: new Date() } });
  }
  return getCard(cardId, userId);
}

/**
 * Reabre uma tarefa concluída.
 * Se ela estiver numa lista "Feitas" (ou arquivada), volta para a primeira lista normal;
 * se foi concluída por engano numa lista comum, só desmarca. Tarefas arquivadas
 * voltam agendadas para hoje; as demais mantêm o dia original.
 */
export async function reopenCard(userId: string, cardId: string): Promise<CardDTO> {
  const card = await ownedCard(cardId, userId);

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
      await moveCard(userId, cardId, normal.id, (max._max.position ?? -1) + 1);
    }
  }
  return getCard(cardId, userId);
}

/* ───────────────────────── Cronômetro da tarefa ───────────────────────── */

export async function startTaskTimer(userId: string, cardId: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  const now = new Date();
  await prisma.$transaction([
    prisma.taskSession.updateMany({
      where: { endedAt: null, card: { list: { board: { userId } } } },
      data: { endedAt: now },
    }),
    prisma.taskSession.create({ data: { cardId, startedAt: now } }),
  ]);
  return getCard(cardId, userId);
}

export async function stopTaskTimer(userId: string, cardId: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  await prisma.taskSession.updateMany({
    where: { cardId, endedAt: null },
    data: { endedAt: new Date() },
  });
  return getCard(cardId, userId);
}

export async function deleteTaskSession(userId: string, sessionId: string) {
  const session = await prisma.taskSession.findFirst({
    where: { id: sessionId, card: { list: { board: { userId } } } },
  });
  if (!session) throw new ApiError(404, "Sessão não encontrada");
  await prisma.taskSession.delete({ where: { id: sessionId } });
}

/* ───────────────────────── Preferências e sessão de trabalho ───────────────────────── */

const DEFAULT_DAILY_GOAL = 8 * 60;

export async function getSettings(userId: string): Promise<SettingsDTO> {
  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key: "dailyGoalMinutes" } },
  });
  const n = row ? Number(row.value) : NaN;
  return { dailyGoalMinutes: Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_GOAL };
}

export async function updateSettings(userId: string, data: Partial<SettingsDTO>): Promise<SettingsDTO> {
  if (data.dailyGoalMinutes !== undefined) {
    await prisma.setting.upsert({
      where: { userId_key: { userId, key: "dailyGoalMinutes" } },
      create: { userId, key: "dailyGoalMinutes", value: String(data.dailyGoalMinutes) },
      update: { value: String(data.dailyGoalMinutes) },
    });
  }
  return getSettings(userId);
}

async function plannedMinutesForToday(userId: string): Promise<number> {
  const today = todayKey();
  const { start } = dayRange(today);
  const cards = await prisma.card.findMany({
    where: {
      list: { board: { userId } },
      archivedAt: null,
      scheduledFor: { lte: today },
      OR: [{ completedAt: null }, { completedAt: { gte: start } }],
    },
    select: { estimatedMinutes: true },
  });
  return cards.reduce((acc, c) => acc + (c.estimatedMinutes ?? 0), 0);
}

export async function getWorkState(userId: string): Promise<WorkState> {
  const today = todayKey();
  const { start } = dayRange(today);
  const sessions = await prisma.workSession.findMany({
    where: { userId, OR: [{ startedAt: { gte: start } }, { endedAt: null }] },
    orderBy: { startedAt: "desc" },
  });
  const running = sessions.find((s) => !s.endedAt) ?? null;
  const todayMs = sumSessions(sessions);
  const settings = await getSettings(userId);
  const estimated = await plannedMinutesForToday(userId);
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

export async function startWork(userId: string): Promise<WorkState> {
  const running = await prisma.workSession.findFirst({ where: { userId, endedAt: null } });
  if (!running) await prisma.workSession.create({ data: { userId } });
  return getWorkState(userId);
}

export async function stopWork(userId: string): Promise<WorkState> {
  const now = new Date();
  await prisma.$transaction([
    prisma.workSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: now } }),
    prisma.taskSession.updateMany({
      where: { endedAt: null, card: { list: { board: { userId } } } },
      data: { endedAt: now },
    }),
  ]);
  return getWorkState(userId);
}

export async function deleteWorkSession(userId: string, id: string) {
  const session = await prisma.workSession.findFirst({ where: { id, userId } });
  if (!session) throw new ApiError(404, "Sessão não encontrada");
  await prisma.workSession.delete({ where: { id } });
}

/* ───────────────────────── Dashboard ───────────────────────── */

export async function getDashboard(userId: string): Promise<DashboardDTO> {
  await ensureDefaultBoard(userId);
  await runMaintenance();

  const today = todayKey();
  const now = new Date();
  const todayR = dayRange(today);
  const weekR = weekRange(now);
  const monthR = monthRange(now);

  const cards = await prisma.card.findMany({
    where: { list: { board: { userId } } },
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
    where: { endedAt: null, card: { list: { board: { userId } } } },
    include: { card: { include: { list: true } } },
  });

  return {
    todayKey: today,
    today: todayScore,
    week: periodScore(metricCards, weekR.start, weekR.end, weekR.endKey),
    month: periodScore(metricCards, monthR.start, monthR.end, monthR.endKey),
    history,
    work: await getWorkState(userId),
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

export async function listArchived(userId: string): Promise<ArchivedCard[]> {
  await runMaintenance();
  const cards = await prisma.card.findMany({
    where: { archivedAt: { not: null }, list: { board: { userId } } },
    orderBy: { archivedAt: "desc" },
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
