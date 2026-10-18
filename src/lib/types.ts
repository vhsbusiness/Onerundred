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
