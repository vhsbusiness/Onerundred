import { addDays } from "date-fns";
import { prisma } from "./db";
import { dayKey, keyToDate } from "./time";
import { isWorkout, workoutLabel } from "./workouts";
import { trainingPlanLabel } from "./training-types";

/** Evidence belongs to the activity's day, never the day it was entered/marked. */
export async function getDayActivities(userId: string, day: string) {
  const [workouts, goals, diets, finances] = await Promise.all([
    prisma.workoutLog.findMany({
      where: { dayKey: day, project: { userId } },
      select: { sport: true, planSlot: true, durationSeconds: true, distanceMeters: true, exercises: true, project: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: { userId, workout: null, startDate: { lte: day } },
      select: { name: true, obligations: true, startDate: true, days: true, archivedAt: true,
        checks: { where: { dayKey: day }, select: { done: true, auto: true, note: true } } },
    }),
    prisma.dietDay.findMany({
      where: { dayKey: day, project: { userId } },
      select: { project: { select: { name: true } }, meals: {
        select: { name: true, foods: true, calories: true, eaten: true, time: true }, orderBy: { time: "asc" },
      } },
    }),
    prisma.financeEntry.findMany({
      where: { dayKey: day, account: { userId } },
      select: { kind: true, cents: true, settled: true, account: { select: { space: true } } },
    }),
  ]);
  const metas = goals.filter(p => p.checks.length || (
    (!p.archivedAt || dayKey(p.archivedAt) >= day) &&
    (p.days === 0 || day < dayKey(addDays(keyToDate(p.startDate), p.days)))
  )).map(p => ({
    nome: p.name, obrigacoes: p.obligations,
    estado: p.checks[0] ? (p.checks[0].done ? "cumprida" : p.checks[0].auto ? "nao_registrada" : "nao_cumprida") : "aguardando_registro",
    observacao: p.checks[0]?.note ?? "",
  }));
  const treinos = workouts.map(w => ({
    projeto: w.project.name, modalidade: isWorkout(w.sport) ? workoutLabel(w.sport) : w.sport,
    treino: w.planSlot == null ? null : trainingPlanLabel(w.planSlot),
    duracaoSegundos: w.durationSeconds, distanciaMetros: w.distanceMeters,
    exerciciosRealizados: Array.isArray(w.exercises) ? w.exercises : [],
  }));
  const dietas = diets.map(d => ({ projeto: d.project.name, refeicoes: d.meals.map(m => ({
    nome: m.name, horario: m.time, alimentos: m.foods, calorias: m.calories, consumida: m.eaten,
  })) }));
  const financeiro = ["personal", "business"].map(space => {
    const entries = finances.filter(f => f.account.space === space);
    return { area: space === "personal" ? "Pessoal" : "Empresa", lancamentos: entries.length,
      receitasRecebidasCentavos: entries.filter(f => f.settled && f.kind === "income").reduce((n, f) => n + f.cents, 0),
      despesasPagasCentavos: entries.filter(f => f.settled && f.kind === "expense").reduce((n, f) => n + f.cents, 0),
      transferencias: entries.filter(f => f.kind === "transfer").length,
      pendentes: entries.filter(f => !f.settled).length,
    };
  }).filter(f => f.lancamentos > 0);
  const summary: { label: string; value: string }[] = [];
  if (treinos.length) summary.push({ label: "Treinos", value: `${treinos.length} ${treinos.length === 1 ? "treino registrado" : "treinos registrados"}` });
  if (metas.length) {
    const done = metas.filter(m => m.estado === "cumprida").length;
    const missed = metas.filter(m => m.estado === "nao_cumprida").length;
    const pending = metas.length - done - missed;
    summary.push({ label: "Metas", value: [
      `${done} ${done === 1 ? "cumprida" : "cumpridas"}`,
      ...(missed ? [`${missed} ${missed === 1 ? "não cumprida" : "não cumpridas"}`] : []),
      ...(pending ? [`${pending} sem registro`] : []),
    ].join(" · ") });
  }
  const meals = dietas.flatMap(d => d.refeicoes);
  if (meals.length) summary.push({ label: "Dieta", value: `${meals.filter(m => m.consumida).length} de ${meals.length} ${meals.length === 1 ? "refeição consumida" : "refeições consumidas"}` });
  for (const f of financeiro) summary.push({ label: `Financeiro · ${f.area}`, value: `${f.lancamentos} ${f.lancamentos === 1 ? "lançamento" : "lançamentos"}` });
  return { payload: { treinos, metas, dietas, financeiro }, summary,
    hasActivity: treinos.length > 0 || metas.some(m => m.estado === "cumprida" || m.estado === "nao_cumprida") || meals.some(m => m.consumida) || finances.length > 0 };
}
