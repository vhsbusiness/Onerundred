export const MAX_CHIME_MINUTES = 24 * 60;

export interface WorkChimeSettings {
  enabled: boolean;
  intervalMinutes: number;
  changedAt: number;
}

export const DEFAULT_WORK_CHIME: WorkChimeSettings = {
  enabled: true,
  intervalMinutes: 90,
  changedAt: 0,
};

export function validChimeInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_CHIME_MINUTES;
}

export function readWorkChimeSetting(raw: string | undefined): WorkChimeSettings {
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      if (typeof saved?.enabled === "boolean" && validChimeInterval(saved.intervalMinutes)) {
        return {
          enabled: saved.enabled,
          intervalMinutes: saved.intervalMinutes,
          changedAt: Number.isFinite(saved.changedAt) ? saved.changedAt : 0,
        };
      }
    } catch { /* Preferência antiga ou ilegível: usa o intervalo original. */ }
  }
  return DEFAULT_WORK_CHIME;
}
