import { subDays } from "date-fns";
import { prisma } from "./db";
import { DEFAULT_THEME, isTheme } from "./theme";
import { ApiError } from "./errors";
import { isOverdue, periodScore, type MetricCard, workVerdict } from "./metrics";
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
  checklist?: { id: string; text: string; done: boolean; position: number }[];
  images?: { id: string }[];
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
    imageIds: (c.images ?? []).map((i) => i.id),
    checklist: (c.checklist ?? []).map((i) => ({ id: i.id, text: i.text, done: i.done, position: i.position })),
    sessions: c.sessions
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map(serializeSession),
  };
}

const cardInclude = {
  sessions: true,
  images: { select: { id: true }, orderBy: { createdAt: "asc" } },
  checklist: { orderBy: { position: "asc" } },
} as const;

/* ───────────────────────── Propriedade / acesso ───────────────────────── */

/** Filtro Prisma: quadros que o usuário possui ou dos quais é membro. */
export function boardAccess(userId: string) {
  return { OR: [{ userId }, { members: { some: { userId } } }] };
}

async function ownedBoard(id: string, userId: string) {
  const board = await prisma.board.findFirst({ where: { id, ...boardAccess(userId) } });
  if (!board) throw new ApiError(404, "Quadro não encontrado");
  return board;
}

async function ownedList(id: string, userId: string) {
  const list = await prisma.list.findFirst({ where: { id, board: boardAccess(userId) } });
  if (!list) throw new ApiError(404, "Lista não encontrada");
  return list;
}

async function ownedCard(id: string, userId: string) {
  const card = await prisma.card.findFirst({
    where: { id, list: { board: boardAccess(userId) } },
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
let lastMaintenanceAt = 0;
let lastMaintenanceDay = "";

export async function runMaintenance(): Promise<void> {
  const today = todayKey();
  // Roda no máximo uma vez por minuto por instância (e sempre na virada do dia).
  if (Date.now() - lastMaintenanceAt < 60_000 && lastMaintenanceDay === today) return;
  lastMaintenanceAt = Date.now();
  lastMaintenanceDay = today;
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

/* ───────────────────────── Desfazer ───────────────────────── */

type UndoPayload =
  | { kind: "restoreCards"; cards: { id: string; listId: string; position: number; completedAt: string | null; scheduledFor: string }[] }
  | { kind: "unarchiveCards"; cardIds: string[] }
  | { kind: "deleteList"; listId: string }
  | { kind: "deleteCard"; cardId: string };

const UNDO_KEEP = 20;

async function recordUndo(userId: string, label: string, payload: UndoPayload) {
  await prisma.undoAction.create({ data: { userId, kind: payload.kind, label, payload: JSON.stringify(payload) } });
  const old = await prisma.undoAction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: UNDO_KEEP,
    select: { id: true },
  });
  if (old.length) await prisma.undoAction.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

/** Retrato das tarefas antes de uma movimentação, para poder voltar. */
function snapshotCards(cards: { id: string; listId: string; position: number; completedAt: Date | null; scheduledFor: string }[]) {
  return cards.map((c) => ({
    id: c.id,
    listId: c.listId,
    position: c.position,
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    scheduledFor: c.scheduledFor,
  }));
}

export async function getLastUndo(userId: string): Promise<{ id: string; label: string } | null> {
  const row = await prisma.undoAction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return row ? { id: row.id, label: row.label } : null;
}

/** Reverte a última ação registrada e a remove da pilha. */
export async function undoLast(userId: string): Promise<{ label: string } | null> {
  const row = await prisma.undoAction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!row) return null;
  const payload = JSON.parse(row.payload) as UndoPayload;

  if (payload.kind === "restoreCards") {
    const ops = [];
    for (const c of payload.cards) {
      const exists = await prisma.card.findFirst({ where: { id: c.id, list: { board: boardAccess(userId) } }, select: { id: true } });
      const listOk = await prisma.list.findFirst({ where: { id: c.listId, board: boardAccess(userId) }, select: { id: true } });
      if (!exists || !listOk) continue;
      ops.push(
        prisma.card.update({
          where: { id: c.id },
          data: {
            listId: c.listId,
            position: c.position,
            completedAt: c.completedAt ? new Date(c.completedAt) : null,
            scheduledFor: c.scheduledFor,
          },
        }),
      );
    }
    if (ops.length) await prisma.$transaction(ops);
  } else if (payload.kind === "unarchiveCards") {
    await prisma.card.updateMany({
      where: { id: { in: payload.cardIds }, list: { board: boardAccess(userId) } },
      data: { archivedAt: null },
    });
  } else if (payload.kind === "deleteList") {
    await prisma.list.deleteMany({ where: { id: payload.listId, board: boardAccess(userId) } });
  } else if (payload.kind === "deleteCard") {
    await prisma.card.deleteMany({ where: { id: payload.cardId, list: { board: boardAccess(userId) } } });
  }

  await prisma.undoAction.delete({ where: { id: row.id } });
  return { label: row.label };
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
  const board = await prisma.board.findFirst({ where: { id: row.value, ...boardAccess(userId) }, select: { id: true } });
  return board?.id ?? null;
}

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  await ensureDefaultBoard(userId);
  await runMaintenance();
  const today = todayKey();
  const { start, end } = dayRange(today);

  const boards = await prisma.board.findMany({
    where: boardAccess(userId),
    orderBy: { position: "asc" },
    include: {
      user: { select: { username: true, name: true } },
      _count: { select: { members: true } },
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
      sharedBy: b.userId === userId ? null : b.user.username,
      memberCount: b._count.members,
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
    sharedBy: null,
    memberCount: 0,
  };
}

export async function getBoard(id: string, userId: string): Promise<BoardDTO> {
  await runMaintenance();
  const board = await prisma.board.findFirst({
    where: { id, ...boardAccess(userId) },
    include: {
      user: { select: { id: true, name: true, username: true, avatar: true } },
      members: { include: { user: { select: { id: true, name: true, username: true, avatar: true } } }, orderBy: { createdAt: "asc" } },
      invites: { where: { status: "pending" }, include: { to: { select: { id: true, name: true, username: true, avatar: true } } } },
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
    lastUndo: await getLastUndo(userId),
    owner: board.user,
    isOwner: board.userId === userId,
    members: board.members.map((m) => m.user),
    pendingInvites: board.invites.map((i) => i.to),
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
  const board = await prisma.board.findFirst({ where: { id, userId } });
  if (!board) throw new ApiError(403, "Só o dono pode excluir o quadro");
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
  await recordUndo(userId, `copiar a lista "${list.name}"`, { kind: "deleteList", listId: created.id });
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
  if (to.kind === "done") {
    await prisma.taskSession.updateMany({ where: { card: { listId: fromListId }, endedAt: null }, data: { endedAt: new Date() } });
  }
  await prisma.$transaction(
    cards.map((c) =>
      prisma.card.update({
        where: { id: c.id },
        data: { listId: toListId, position: pos++, ...kindEffects(to.kind, c) },
      }),
    ),
  );
  if (cards.length) {
    await recordUndo(userId, `mover ${cards.length} tarefa(s) para "${to.name}"`, {
      kind: "restoreCards",
      cards: snapshotCards(cards),
    });
  }
  return cards.length;
}

/** Puxa para esta lista todas as tarefas abertas de uma prioridade, vindas das outras listas do quadro. */
export async function pullByPriority(listId: string, priority: number, userId: string) {
  const target = await ownedList(listId, userId);
  const cards = await prisma.card.findMany({
    where: {
      priority,
      archivedAt: null,
      completedAt: null,
      listId: { not: listId },
      list: { boardId: target.boardId, kind: { not: "done" } },
    },
    orderBy: [{ listId: "asc" }, { position: "asc" }],
  });
  if (cards.length === 0) return 0;
  const max = await prisma.card.aggregate({ where: { listId }, _max: { position: true } });
  let pos = (max._max.position ?? -1) + 1;
  await prisma.$transaction(
    cards.map((c) =>
      prisma.card.update({
        where: { id: c.id },
        data: { listId, position: pos++, ...kindEffects(target.kind, c) },
      }),
    ),
  );
  const label = { 1: "alta", 2: "média", 3: "baixa" }[priority as 1 | 2 | 3] ?? "";
  await recordUndo(userId, `puxar ${cards.length} tarefa(s) de prioridade ${label} para "${target.name}"`, {
    kind: "restoreCards",
    cards: snapshotCards(cards),
  });
  return cards.length;
}

/** Arquiva todas as tarefas da lista (concluídas ou não). Elas continuam na aba Arquivadas. */
export async function archiveAllCards(listId: string, userId: string) {
  const list = await ownedList(listId, userId);
  const now = new Date();
  const ids = (await prisma.card.findMany({ where: { listId, archivedAt: null }, select: { id: true } })).map((c) => c.id);
  await prisma.taskSession.updateMany({
    where: { endedAt: null, card: { listId } },
    data: { endedAt: now },
  });
  const result = await prisma.card.updateMany({
    where: { listId, archivedAt: null },
    data: { archivedAt: now },
  });
  if (ids.length) {
    await recordUndo(userId, `arquivar ${ids.length} tarefa(s) de "${list.name}"`, { kind: "unarchiveCards", cardIds: ids });
  }
  return result.count;
}

/** Reordena as tarefas abertas de uma lista na ordem dada (ids), guardando a ordem anterior para desfazer. */
export async function reorderListCards(listId: string, userId: string, orderedIds: string[], label: string): Promise<number> {
  const list = await ownedList(listId, userId);
  const cards = await prisma.card.findMany({ where: { listId: list.id, archivedAt: null }, orderBy: { position: "asc" } });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const ordered = orderedIds.filter((id) => byId.has(id) && !seen.has(id) && seen.add(id)).map((id) => byId.get(id)!);
  // Tarefas que a ordem não mencionou ficam no fim, na ordem atual.
  for (const c of cards) if (!seen.has(c.id)) ordered.push(c);
  const changed = ordered.some((c, i) => c.id !== cards[i]?.id);
  if (!changed) return 0;
  await recordUndo(userId, label, { kind: "restoreCards", cards: snapshotCards(cards) });
  await prisma.$transaction(ordered.map((c, i) => prisma.card.update({ where: { id: c.id }, data: { position: i } })));
  return ordered.length;
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
    where: { id, list: { board: boardAccess(userId) } },
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

/** Duplica a tarefa logo abaixo da original (sem o tempo cronometrado). */
export async function copyCard(userId: string, cardId: string): Promise<CardDTO> {
  const card = await ownedCard(cardId, userId);
  const siblings = await prisma.card.findMany({
    where: { listId: card.listId, archivedAt: null },
    orderBy: { position: "asc" },
  });
  const created = await prisma.card.create({
    data: {
      listId: card.listId,
      title: card.title,
      description: card.description,
      priority: card.priority,
      estimatedMinutes: card.estimatedMinutes,
      scheduledFor: card.scheduledFor,
      completedAt: card.completedAt,
      position: card.position + 1,
    },
    include: cardInclude,
  });
  const images = await prisma.cardImage.findMany({ where: { cardId }, orderBy: { createdAt: "asc" } });
  if (images.length) {
    await prisma.cardImage.createMany({ data: images.map((i) => ({ cardId: created.id, data: i.data })) });
  }
  const checklist = await prisma.checklistItem.findMany({ where: { cardId }, orderBy: { position: "asc" } });
  if (checklist.length) {
    await prisma.checklistItem.createMany({
      data: checklist.map((i) => ({ cardId: created.id, text: i.text, done: i.done, position: i.position })),
    });
  }
  const idx = siblings.findIndex((c) => c.id === cardId);
  const ordered = [...siblings.slice(0, idx + 1), created, ...siblings.slice(idx + 1)];
  await prisma.$transaction(
    ordered.map((c, i) => prisma.card.update({ where: { id: c.id }, data: { position: i } })),
  );
  await recordUndo(userId, `copiar a tarefa "${card.title}"`, { kind: "deleteCard", cardId: created.id });
  return getCard(created.id, userId);
}

/** Arquiva a tarefa (concluída ou não); ela some do quadro e fica em Arquivadas. */
export async function archiveCard(userId: string, cardId: string): Promise<void> {
  const card = await ownedCard(cardId, userId);
  const now = new Date();
  await prisma.$transaction([
    prisma.taskSession.updateMany({ where: { cardId, endedAt: null }, data: { endedAt: now } }),
    prisma.card.update({ where: { id: cardId }, data: { archivedAt: now } }),
  ]);
  await recordUndo(userId, `arquivar a tarefa "${card.title}"`, { kind: "unarchiveCards", cardIds: [cardId] });
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

  // Tarefa concluída não fica com o cronômetro rodando: ao cair em "Feitas", a sessão aberta encerra.
  if (target.kind === "done") {
    await prisma.taskSession.updateMany({ where: { cardId, endedAt: null }, data: { endedAt: new Date() } });
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

/* ───────────────────────── Imagens da tarefa ───────────────────────── */

export const MAX_CARD_IMAGE_CHARS = 700 * 1024; // ~500 KB de imagem em base64
export const MAX_CARD_IMAGES = 10;

/* ───────────────────────── Checklist ───────────────────────── */

const MAX_CHECKLIST_ITEMS = 50;

export async function addChecklistItem(userId: string, cardId: string, text: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  const clean = text.trim().slice(0, 200);
  if (!clean) throw new ApiError(400, "Escreva o item");
  const count = await prisma.checklistItem.count({ where: { cardId } });
  if (count >= MAX_CHECKLIST_ITEMS) throw new ApiError(400, `No máximo ${MAX_CHECKLIST_ITEMS} itens por tarefa`);
  await prisma.checklistItem.create({ data: { cardId, text: clean, position: count } });
  return getCard(cardId, userId);
}

export async function updateChecklistItem(
  userId: string,
  cardId: string,
  itemId: string,
  data: { text?: string; done?: boolean },
): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, cardId } });
  if (!item) throw new ApiError(404, "Item não encontrado");
  const text = data.text === undefined ? undefined : data.text.trim().slice(0, 200);
  if (text !== undefined && !text) throw new ApiError(400, "O item não pode ficar vazio");
  await prisma.checklistItem.update({ where: { id: itemId }, data: { text, done: data.done } });
  return getCard(cardId, userId);
}

export async function removeChecklistItem(userId: string, cardId: string, itemId: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  await prisma.checklistItem.deleteMany({ where: { id: itemId, cardId } });
  const rest = await prisma.checklistItem.findMany({ where: { cardId }, orderBy: { position: "asc" } });
  await prisma.$transaction(rest.map((i, idx) => prisma.checklistItem.update({ where: { id: i.id }, data: { position: idx } })));
  return getCard(cardId, userId);
}

export async function addCardImage(userId: string, cardId: string, data: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  if (!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new ApiError(400, "Imagem inválida");
  if (data.length > MAX_CARD_IMAGE_CHARS) throw new ApiError(400, "Imagem grande demais (máx. 500 KB)");
  const count = await prisma.cardImage.count({ where: { cardId } });
  if (count >= MAX_CARD_IMAGES) throw new ApiError(400, `No máximo ${MAX_CARD_IMAGES} imagens por tarefa`);
  await prisma.cardImage.create({ data: { cardId, data } });
  return getCard(cardId, userId);
}

export async function removeCardImage(userId: string, cardId: string, imageId: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  await prisma.cardImage.deleteMany({ where: { id: imageId, cardId } });
  return getCard(cardId, userId);
}

/** Lê a imagem (com checagem de dono) para servir pela rota /api/imagens/[id]. */
export async function getCardImage(userId: string, imageId: string): Promise<{ data: string } | null> {
  const img = await prisma.cardImage.findFirst({
    where: { id: imageId, card: { list: { board: boardAccess(userId) } } },
    select: { data: true },
  });
  return img;
}

/* ───────────────────────── Cronômetro da tarefa ───────────────────────── */

export async function startTaskTimer(userId: string, cardId: string): Promise<CardDTO> {
  await ownedCard(cardId, userId);
  const now = new Date();
  await prisma.$transaction([
    prisma.taskSession.updateMany({
      where: { endedAt: null, card: { list: { board: boardAccess(userId) } } },
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
    where: { id: sessionId, card: { list: { board: boardAccess(userId) } } },
  });
  if (!session) throw new ApiError(404, "Sessão não encontrada");
  await prisma.taskSession.delete({ where: { id: sessionId } });
}

/* ───────────────────────── Preferências e sessão de trabalho ───────────────────────── */

const DEFAULT_DAILY_GOAL = 8 * 60;

export async function getSettings(userId: string): Promise<SettingsDTO> {
  const rows = await prisma.setting.findMany({ where: { userId, key: { in: ["dailyGoalMinutes", "theme"] } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const n = Number(get("dailyGoalMinutes") ?? NaN);
  const theme = get("theme");
  return {
    dailyGoalMinutes: Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_GOAL,
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
  };
}

export async function updateSettings(userId: string, data: Partial<SettingsDTO>): Promise<SettingsDTO> {
  const entries: [string, string][] = [];
  if (data.dailyGoalMinutes !== undefined) entries.push(["dailyGoalMinutes", String(data.dailyGoalMinutes)]);
  if (data.theme !== undefined) entries.push(["theme", data.theme]);
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value },
    });
  }
  return getSettings(userId);
}

async function plannedMinutesForToday(userId: string): Promise<number> {
  const today = todayKey();
  const { start } = dayRange(today);
  const cards = await prisma.card.findMany({
    where: {
      list: { board: boardAccess(userId) },
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
  const endedRow = await prisma.setting.findUnique({ where: { userId_key: { userId, key: "workEndedDay" } } });

  return {
    todayMs,
    running: running ? { id: running.id, startedAt: running.startedAt.toISOString() } : null,
    ended: !running && endedRow?.value === today,
    sessions: sessions.map(serializeSession),
    plannedMinutes,
    dailyGoalMinutes: settings.dailyGoalMinutes,
    verdict: workVerdict(todayMs / 60000, plannedMinutes),
  };
}

async function setWorkEnded(userId: string, ended: boolean) {
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: "workEndedDay" } },
    create: { userId, key: "workEndedDay", value: ended ? todayKey() : "" },
    update: { value: ended ? todayKey() : "" },
  });
}

/** Começar ou retomar: abre uma sessão (e reabre o dia, se estava encerrado). */
export async function startWork(userId: string): Promise<WorkState> {
  const running = await prisma.workSession.findFirst({ where: { userId, endedAt: null } });
  if (!running) await prisma.workSession.create({ data: { userId } });
  await setWorkEnded(userId, false);
  return getWorkState(userId);
}

/** Pausar: fecha a sessão em andamento (e o cronômetro de tarefa); o dia continua aberto. */
export async function pauseWork(userId: string): Promise<WorkState> {
  const now = new Date();
  await prisma.$transaction([
    prisma.workSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: now } }),
    prisma.taskSession.updateMany({
      where: { endedAt: null, card: { list: { board: boardAccess(userId) } } },
      data: { endedAt: now },
    }),
  ]);
  return getWorkState(userId);
}

/** Encerrar o dia: pausa e marca o dia como encerrado. */
export async function endWork(userId: string): Promise<WorkState> {
  await pauseWork(userId);
  await setWorkEnded(userId, true);
  return getWorkState(userId);
}

/** Compatibilidade: "stop" equivale a pausar. */
export const stopWork = pauseWork;

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
    where: { list: { board: boardAccess(userId) } },
    include: { list: { include: { board: true } }, sessions: true, images: { select: { id: true } } },
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
    if (isOverdue(c, today)) counts.overdue += 1;
  }

  const runningSession = await prisma.taskSession.findFirst({
    where: { endedAt: null, card: { list: { board: boardAccess(userId) } } },
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

/** Apaga definitivamente todas as tarefas arquivadas do usuário. */
export async function deleteAllArchived(userId: string): Promise<number> {
  const r = await prisma.card.deleteMany({ where: { archivedAt: { not: null }, list: { board: boardAccess(userId) } } });
  return r.count;
}

export async function listArchived(userId: string): Promise<ArchivedCard[]> {
  await runMaintenance();
  const cards = await prisma.card.findMany({
    where: { archivedAt: { not: null }, list: { board: boardAccess(userId) } },
    orderBy: { archivedAt: "desc" },
    include: { list: { include: { board: true } }, sessions: true, images: { select: { id: true } } },
    take: 500,
  });
  return cards.map((c) => ({
    ...serializeCard(c),
    listName: c.list.name,
    boardId: c.list.boardId,
    boardName: c.list.board.name,
  }));
}
