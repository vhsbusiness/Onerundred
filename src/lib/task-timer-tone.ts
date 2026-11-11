export function taskTimerTone(spentMs: number, estimatedMinutes: number | null) {
  const limit = (estimatedMinutes ?? 0) * 60_000;
  if (limit <= 0 || spentMs <= limit) return "normal";
  return spentMs >= limit * 1.5 ? "critical" : "warning";
}

export const taskTimerLabel = {
  normal: "Cronômetro em andamento",
  warning: "Passou do tempo estimado",
  critical: "Passou da estimativa em 50% ou mais",
};
