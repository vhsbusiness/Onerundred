// Em projetos de luta, a modalidade é o valor salvo. "Luta" só agrupa as opções no formulário.
export const ACTIVITIES = { strength: "Musculação", running: "Corrida", cycling: "Bike" } as const;
export const FIGHT_STYLES = {
  boxing: "Boxe",
  "jiu-jitsu": "Jiu-jítsu",
  "muay-thai": "Muay Thai",
  judo: "Judô",
  karate: "Caratê",
  taekwondo: "Taekwondo",
  mma: "MMA",
} as const;

export type Workout = keyof typeof ACTIVITIES | keyof typeof FIGHT_STYLES;

export function isFightStyle(value: unknown): value is keyof typeof FIGHT_STYLES {
  return typeof value === "string" && Object.hasOwn(FIGHT_STYLES, value);
}

export function isWorkout(value: unknown): value is Workout {
  return typeof value === "string" && (Object.hasOwn(ACTIVITIES, value) || isFightStyle(value));
}

export function workoutLabel(value: Workout): string {
  return isFightStyle(value) ? `Luta · ${FIGHT_STYLES[value]}` : ACTIVITIES[value];
}
