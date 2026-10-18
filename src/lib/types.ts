import type { PeriodScore, Tone, WorkVerdict } from "./metrics";

export type ListKind = "normal" | "tomorrow" | "done";

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

export interface BoardDTO {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  lists: ListDTO[];
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
  work: WorkState;
  todayCards: TodayCard[];
  runningTask: { cardId: string; boardId: string; title: string; startedAt: string } | null;
  counts: { done: number; inProgress: number; pending: number; overdue: number };
  streak: number;
}

export interface ArchivedCard extends CardDTO {
  listName: string;
  boardId: string;
  boardName: string;
}

export interface SettingsDTO {
  dailyGoalMinutes: number;
}

export type { Tone };

/* ───────────── Autenticação e admin ───────────── */

export interface MeDTO {
  id: string;
  email: string;
  username: string;
  name: string;
  role: "user" | "admin";
}

export interface AppSettingsDTO {
  allowRegistration: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: "user" | "admin";
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  boards: number;
  openCards: number;
  doneCards: number;
  doneToday: number;
  workedTodayMs: number;
  workedTotalMs: number;
  taskMs: number;
  activeSessions: number;
}

export interface AdminOverview {
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

export type ProjectDayStatus = "done" | "missed" | "pending" | "future";

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
  endDate: string;
  days: number;
  createdAt: string;
  archivedAt: string | null;
  doneCount: number;
  missedCount: number;
  pendingCount: number;
  futureCount: number;
  /** % de dias feitos entre os dias já passados (inclui hoje se marcado). */
  completion: number | null;
  streak: number;
  todayStatus: ProjectDayStatus | "ended" | "not-started";
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
