import type { Theme, Design } from "./theme";
import type { PeriodScore, Tone, WorkVerdict } from "./metrics";

export type ListKind = "normal" | "today" | "tomorrow" | "done";

export interface SessionDTO {
  id: string;
  startedAt: string;
  endedAt: string | null;
}

export interface CardDTO {
  id: string;
  listId: string;
  title: string;
  description: string;
  priority: number;
  position: number;
  estimatedMinutes: number | null;
  scheduledFor: string;
  createdAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  /** Tempo acumulado em sessões encerradas (ms). */
  spentMs: number;
  /** Quando a sessão atual começou, se houver uma rodando. */
  runningSince: string | null;
  sessions?: SessionDTO[];
  /** Ids das imagens anexadas (URL: /api/imagens/{id}); a primeira é a capa. */
  imageIds: string[];
  /** Itens da checklist, em ordem. */
  checklist: ChecklistItemDTO[];
  /** Dias em que a tarefa saiu da lista "Hoje" sem ser feita (realocada). */
  postponedDays: string[];
  /** Tarefa contínua que gera este card, se houver. */
  recurring: RecurringDTO | null;
}

export interface RecurringDTO {
  id: string;
  listId: string;
  title: string;
  /** 0=dom … 6=sáb */
  weekdays: number[];
  active: boolean;
}

export interface ChecklistItemDTO {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface ListDTO {
  id: string;
  boardId: string;
  name: string;
  position: number;
  priority: number;
  kind: ListKind;
  cards: CardDTO[];
}

export interface UserBrief {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
}

export interface BoardDTO {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  owner: UserBrief;
  isOwner: boolean;
  members: UserBrief[];
  pendingInvites: UserBrief[];
  lists: ListDTO[];
  /** Última ação em lote que pode ser desfeita (do usuário, em qualquer quadro). */
  lastUndo: { id: string; label: string } | null;
  /** Média histórica de minutos por tarefa (para estimar as sem estimativa). */
  avgTaskMinutes: number;
}

export interface BoardSummary {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  listCount: number;
  openCount: number;
  doneTodayCount: number;
  todayScore: number | null;
  /** @ do dono, quando o quadro foi compartilhado com você. */
  sharedBy: string | null;
  memberCount: number;
}

export interface TodayCard extends CardDTO {
  listName: string;
  listPriority: number;
  listKind: ListKind;
  boardId: string;
  boardName: string;
}

export interface WorkState {
  todayMs: number;
  running: { id: string; startedAt: string } | null;
  /** Dia de trabalho encerrado pelo usuário (pode reabrir). */
  ended: boolean;
  sessions: SessionDTO[];
  plannedMinutes: number;
  dailyGoalMinutes: number;
  verdict: WorkVerdict;
}

export interface HistoryPoint {
  key: string;
  score: number | null;
  doneCount: number;
  openCount: number;
}

export interface DashboardDTO {
  todayKey: string;
  today: PeriodScore;
  week: PeriodScore;
  month: PeriodScore;
  history: HistoryPoint[];
  /** As mesmas notas contando as tarefas abertas de todas as listas (não só a "Hoje"). */
  allLists: { today: PeriodScore; week: PeriodScore; month: PeriodScore };
  work: WorkState;
  todayCards: TodayCard[];
  runningTask: { cardId: string; boardId: string; title: string; startedAt: string } | null;
  counts: { done: number; inProgress: number; pending: number; overdue: number; postponed: number };
  streak: number;
  /** Quanto falta para fechar as tarefas abertas de hoje. */
  remaining: {
    /** Minutos que faltam, somando estimativa menos tempo gasto (ou a média, sem estimativa). */
    minutes: number;
    openCount: number;
    /** Quantas das abertas têm estimativa própria. */
    estimatedCount: number;
    /** Média histórica usada nas tarefas sem estimativa (min). */
    avgMinutes: number;
  };
}

/** Revisão de um dia já passado (ou de hoje): o que foi feito. */
export interface DayReviewDTO {
  dayKey: string;
  score: PeriodScore;
  done: {
    id: string;
    title: string;
    priority: number;
    listName: string;
    boardId: string;
    boardName: string;
    completedAt: string;
    spentMs: number;
    estimatedMinutes: number | null;
    archived: boolean;
  }[];
  workSessions: { id: string; startedAt: string; endedAt: string; ms: number }[];
  workMs: number;
  leisureMin: number;
  /** Tarefas realocadas nesse dia (saíram da "Hoje" sem ser feitas) e não concluídas nele. */
  postponed: { id: string; title: string; priority: number; boardId: string; boardName: string; listName: string }[];
}

export interface ArchivedCard extends CardDTO {
  listName: string;
  boardId: string;
  boardName: string;
}

export interface SettingsDTO {
  dailyGoalMinutes: number;
  /** Tema da interface escolhido pelo usuário. */
  theme: Theme;
  /** Design 2.0 experimental (só o admin pode ligar). */
  design: Design;
  /** Metas pessoais usadas na performance (null = não definida). */
  targets: TargetsDTO;
}

export interface TargetsDTO {
  /** Minutos de sono por noite. */
  sleepMinutes: number | null;
  /** Hora de deitar (HH:MM). */
  bedtime: string | null;
  /** Hora de acordar (HH:MM). */
  wake: string | null;
  /** Minutos de lazer por dia. */
  leisureMinutes: number | null;
  /** Nível de performance (0–100) que o usuário quer alcançar por dia. */
  performanceTarget: number | null;
}

/* ───────────── Performance ───────────── */

export type PerfKey = "tasks" | "sleep" | "leisure" | "goals";

export interface PerfComponent {
  key: PerfKey;
  label: string;
  /** 0–100, ou null quando não há dado para o dia. */
  score: number | null;
  /** Peso relativo na nota geral. */
  weight: number;
  /** Texto curto com o que foi medido (ex.: "7h 20m de 8h"). */
  detail: string;
  /** Dica quando falta meta ou registro. */
  hint?: string;
}

export interface PerformanceDayDTO {
  dayKey: string;
  score: number | null;
  components: PerfComponent[];
  /** Nota das tarefas (periodScore) do dia. */
  taskScore: PeriodScore;
  doneCount: number;
  postponedCount: number;
  workMs: number;
  leisureMin: number;
  sleepMin: number | null;
}

export interface PerformanceDTO {
  today: PerformanceDayDTO;
  /** Dias seguidos (até hoje) com performance ≥ perfTarget. */
  streak: number;
  /** Nível alvo em vigor (meta do usuário ou 70). */
  perfTarget: number;
  /** Últimos 14 dias, do mais antigo ao mais recente. */
  history: { dayKey: string; score: number | null }[];
  targets: TargetsDTO;
}

export interface PeriodReviewDTO {
  startKey: string;
  endKey: string;
  days: PerformanceDayDTO[];
  avgScore: number | null;
  avgTaskScore: number | null;
  doneTotal: number;
  postponedTotal: number;
  workMsTotal: number;
  leisureMinTotal: number;
  avgSleepMin: number | null;
  streak: number;
  perfTarget: number;
  targets: TargetsDTO;
}

export type { Tone };

/* ───────────── Autenticação e admin ───────────── */

export interface MeDTO {
  id: string;
  email: string;
  username: string;
  name: string;
  role: "user" | "admin";
  avatar: string | null;
}

export interface AppSettingsDTO {
  allowRegistration: boolean;
  /** Período de observação da IA (dias/noites com dados) antes de analisar. */
  aiMinDaysTasks: number;
  aiMinDaysWork: number;
  aiMinNightsSleep: number;
  aiMinDaysLeisure: number;
}

export interface AiObservationDimension {
  key: "tasks" | "work" | "sleep" | "leisure";
  label: string;
  have: number;
  need: number;
  ready: boolean;
  unit: string;
}

export interface AiObservation {
  dimensions: AiObservationDimension[];
  /** Tarefas e trabalho prontos: libera a análise completa. */
  coreReady: boolean;
}

export interface AdminUser {
  id: string;
  avatar: string | null;
  name: string;
  email: string;
  username: string;
  role: "user" | "admin";
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeSessions: number;
  ai: {
    calls: number;
    calls30: number;
    promptTokens: number;
    completionTokens: number;
    /** Custo estimado em dólares (total e últimos 30 dias). */
    costUsd: number;
    costUsd30: number;
  };
}

export interface AdminOverview {
  aiCostUsd30: number;
  aiCalls30: number;
  users: number;
  activeToday: number;
  newThisWeek: number;
  doneToday: number;
  workedTodayMs: number;
  openCards: number;
  settings: AppSettingsDTO;
}

/* ───────────── IA ───────────── */

export interface AiNextTask {
  cardId: string;
  title: string;
  reason: string;
}

export interface AiSchedule {
  startWork: string;
  stopWork: string;
  breakAt: string[];
  sleepAt: string;
  wakeAt: string;
  note: string;
}

export interface AiInsightContent {
  score: number;
  headline: string;
  assessment: string;
  suggestions: string[];
  nextTasks: AiNextTask[];
  schedule: AiSchedule;
}

/** Visão da IA sobre uma sessão de trabalho encerrada. */
export interface WorkSessionInsightDTO {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationMin: number;
  /** Minutos com cronômetro de tarefa ligado dentro da sessão. */
  focusedMin: number;
  tasks: { title: string; minutes: number; done: boolean }[];
  headline: string;
  summary: string;
  highlights: string[];
  suggestion: string;
}

export interface AiInsightDTO extends AiInsightContent {
  id: string;
  dayKey: string;
  model: string;
  createdAt: string;
  /** Gerações restantes hoje para este usuário. */
  remainingToday: number;
}

export interface AiStatusDTO {
  enabled: boolean;
  insight: AiInsightDTO | null;
  remainingToday: number;
  memory: string | null;
  observation: AiObservation;
}

/* ───────────── Sono ───────────── */

export interface SleepLogDTO {
  id: string;
  dayKey: string;
  bedAt: string;
  sleepAt: string;
  wakeAt: string;
  bedTime: string;
  sleepTime: string;
  wakeTime: string;
  quality: number | null;
  note: string;
  /** Minutos dormidos (dormi → acordei). */
  durationMin: number;
  /** Minutos para pegar no sono (deitei → dormi). */
  latencyMin: number;
}

export interface SleepStats {
  nights: number;
  avgDuration7: number | null;
  avgDuration30: number | null;
  avgLatency7: number | null;
  avgBedTime7: string | null;
  avgSleepTime7: string | null;
  avgWakeTime7: string | null;
  lastNight: SleepLogDTO | null;
}

export interface SleepPageDTO {
  logs: SleepLogDTO[];
  stats: SleepStats;
}

/* ───────────── Metas: projetos ───────────── */

/** today = o dia de hoje, que só se marca amanhã; pending = ontem, ainda sem marcação. */
export type ProjectDayStatus = "done" | "missed" | "pending" | "today" | "future";

export interface ProjectDayDTO {
  index: number;
  dayKey: string;
  status: ProjectDayStatus;
  auto: boolean;
  note: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  description: string;
  obligations: string[];
  startDate: string;
  /** null quando o projeto não tem data para acabar */
  endDate: string | null;
  /** 0 = sem data para acabar */
  days: number;
  endless: boolean;
  createdAt: string;
  archivedAt: string | null;
  doneCount: number;
  missedCount: number;
  pendingCount: number;
  futureCount: number;
  /** % de dias feitos entre os dias já passados (inclui hoje se marcado). */
  completion: number | null;
  streak: number;
  /** Status do dia a marcar (sempre o dia anterior): a meta de um dia é marcada no dia seguinte. */
  markStatus: ProjectDayStatus | "ended" | "not-started";
  /** yyyy-MM-dd do dia a marcar (ontem). */
  markDayKey: string;
  daysElapsed: number;
  dayList: ProjectDayDTO[];
}

/* ───────────── Lazer ───────────── */

export interface LeisureLogDTO {
  id: string;
  dayKey: string;
  activity: string;
  startAt: string;
  endAt: string | null;
  startTime: string;
  endTime: string | null;
  note: string;
  durationMin: number;
}

export interface LeisureStats {
  todayMin: number;
  weekMin: number;
  avg7Min: number;
  byActivity7: { activity: string; minutes: number }[];
  byDay14: { key: string; minutes: number }[];
}

export interface LeisurePageDTO {
  logs: LeisureLogDTO[];
  running: LeisureLogDTO | null;
  stats: LeisureStats;
  activities: string[];
}

/* ───────────── Importar do Trello (print) ───────────── */

export interface ImportPlanCard {
  title: string;
  priority: 1 | 2 | 3;
  estimatedMinutes: number | null;
  done: boolean;
  /** Já existe uma tarefa com esse título no quadro. */
  exists: boolean;
}

export interface ImportPlanList {
  name: string;
  kind: ListKind;
  priority: 1 | 2 | 3;
  /** Lista do quadro com o mesmo nome, se houver. */
  existingListId: string | null;
  cards: ImportPlanCard[];
}

export interface ImportPlan {
  boardId: string;
  lists: ImportPlanList[];
  newLists: number;
  newCards: number;
  doneCards: number;
}

/* ───────────── Notificações e lembretes ───────────── */

export type NotificationType = "goalReminder" | "longWork" | "weekly" | "balance" | "overdue" | "sleepLog" | "reminders" | "workEnded";

export interface NotificationPrefsDTO {
  enabled: boolean;
  types: Record<NotificationType, boolean>;
  /** Tipos que exigem a IA pronta (período de observação concluído). */
  aiRequired: NotificationType[];
  aiReady: boolean;
  devices: { id: string; userAgent: string; createdAt: string }[];
  /** Horário em que o lembrete de meta será enviado hoje (HH:MM). */
  goalReminderTime: string;
  vapidPublicKey: string | null;
}

export interface ReminderDTO {
  id: string;
  title: string;
  note: string;
  at: string;
  repeat: "none" | "daily" | "weekly";
  active: boolean;
  lastSentAt: string | null;
  /** Tarefa associada, se houver. */
  card: { id: string; title: string; boardId: string; done: boolean } | null;
}

/** Tarefa aberta resumida, para associar a um lembrete. */
export interface OpenCardBrief {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  listName: string;
}

/* ───────────── Convites de quadro ───────────── */

export interface BoardInviteDTO {
  id: string;
  boardId: string;
  boardName: string;
  from: UserBrief;
  createdAt: string;
}
