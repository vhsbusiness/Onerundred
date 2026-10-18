/**
 * Métricas de produtividade.
 *
 * Cada tarefa tem um peso = peso da prioridade da tarefa × multiplicador da
 * prioridade da lista em que ela está.
 *
 *   Prioridade da tarefa: 1 = alta (3 pts), 2 = média (2 pts), 3 = baixa (1 pt)
 *   Prioridade da lista:  1 = alta (×1.5),  2 = média (×1),    3 = baixa (×0.5)
 *
 * A nota de um período (dia, semana, mês) é:
 *
 *   peso das tarefas concluídas no período
 *   ─────────────────────────────────────────────────────────────
 *   peso concluído + peso das tarefas ainda abertas ao fim do período
 *
 * Só contam como "abertas" as tarefas já agendadas até o último dia do período
 * (tarefas de amanhã não puxam a nota de hoje para baixo).
 */

export type Priority = 1 | 2 | 3;

export const CARD_WEIGHT: Record<Priority, number> = { 1: 3, 2: 2, 3: 1 };
export const LIST_MULTIPLIER: Record<Priority, number> = { 1: 1.5, 2: 1, 3: 0.5 };

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Alta",
  2: "Média",
  3: "Baixa",
};

export interface MetricCard {
  priority: number;
  listPriority: number;
  scheduledFor: string; // yyyy-MM-dd
  createdAt: Date | string;
  completedAt: Date | string | null;
  archivedAt: Date | string | null;
}

export function asPriority(n: number): Priority {
  return n === 1 || n === 3 ? n : 2;
}

export function cardWeight(c: Pick<MetricCard, "priority" | "listPriority">): number {
  return CARD_WEIGHT[asPriority(c.priority)] * LIST_MULTIPLIER[asPriority(c.listPriority)];
}

export interface PeriodScore {
  /** 0–100, ou null quando não havia nada a fazer no período. */
  score: number | null;
  doneWeight: number;
  openWeight: number;
  doneCount: number;
  openCount: number;
}

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

/**
 * Calcula a nota de um período [start, end).
 * `endKey` é a chave yyyy-MM-dd do último dia do período.
 */
export function periodScore(
  cards: MetricCard[],
  start: Date,
  end: Date,
  endKey: string,
): PeriodScore {
  let doneWeight = 0;
  let openWeight = 0;
  let doneCount = 0;
  let openCount = 0;

  for (const c of cards) {
    const w = cardWeight(c);
    const completedAt = toDate(c.completedAt);
    const archivedAt = toDate(c.archivedAt);
    const createdAt = toDate(c.createdAt) ?? new Date(0);

    if (completedAt && completedAt >= start && completedAt < end) {
      doneWeight += w;
      doneCount += 1;
      continue;
    }

    const existedAtEnd = createdAt < end;
    const stillOpenAtEnd = !completedAt || completedAt >= end;
    const notArchivedAtEnd = !archivedAt || archivedAt >= end;
    const dueByEnd = c.scheduledFor <= endKey;

    if (existedAtEnd && stillOpenAtEnd && notArchivedAtEnd && dueByEnd) {
      openWeight += w;
      openCount += 1;
    }
  }

  const total = doneWeight + openWeight;
  return {
    score: total > 0 ? Math.round((doneWeight / total) * 100) : null,
    doneWeight,
    openWeight,
    doneCount,
    openCount,
  };
}

export type Tone = "green" | "blue" | "orange" | "neutral";

export function scoreTone(score: number | null): Tone {
  if (score === null) return "neutral";
  if (score >= 80) return "green";
  if (score >= 50) return "blue";
  return "orange";
}

export interface WorkVerdict {
  label: string;
  tone: Tone;
  ratio: number | null;
}

/**
 * Compara o tempo trabalhado com o tempo planejado do dia
 * (soma das estimativas das tarefas de hoje ou, na falta delas, a meta diária).
 */
export function workVerdict(workedMinutes: number, plannedMinutes: number): WorkVerdict {
  if (plannedMinutes <= 0) {
    return { label: "Sem meta para hoje", tone: "neutral", ratio: null };
  }
  const ratio = workedMinutes / plannedMinutes;
  if (ratio >= 1) return { label: "Meta batida", tone: "green", ratio };
  if (ratio >= 0.7) return { label: "No ritmo", tone: "blue", ratio };
  if (ratio >= 0.35) return { label: "Abaixo do planejado", tone: "orange", ratio };
  return { label: "Começando o dia", tone: "neutral", ratio };
}
