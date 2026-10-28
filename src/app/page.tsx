import { Dashboard } from "@/components/dashboard/Dashboard";
import { DayReview } from "@/components/dashboard/DayReview";
import { PeriodReview } from "@/components/dashboard/PeriodReview";
import { getAiStatus } from "@/lib/ai";
import { requireUserPage } from "@/lib/current-user";
import { getPerformance, getPeriodReview } from "@/lib/performance";
import { getDashboard, getDayReview } from "@/lib/repo";
import { todayKey } from "@/lib/time";

/**
 * O dashboard já chega renderizado com os dados (sem tela de carregamento).
 * ?dia=yyyy-MM-dd mostra a revisão de outro dia; ?dias=N (com ou sem dia) mostra um período de N dias.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ dia?: string; dias?: string; de?: string; ate?: string }> }) {
  const user = await requireUserPage();
  const { dia, dias, de, ate } = await searchParams;
  const today = todayKey();
  // Intervalo escolhido à mão: ?de=yyyy-MM-dd&ate=yyyy-MM-dd
  const isKey = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (isKey(de) && isKey(ate) && de! <= ate! && ate! <= today) {
    const span = Math.round((new Date(ate!).getTime() - new Date(de!).getTime()) / 86400000) + 1;
    if (span === 1) {
      const [review, ai] = await Promise.all([getDayReview(user.id, de!), getAiStatus(user.id, de!)]);
      return <DayReview data={review} initialAi={ai} />;
    }
    if (span <= 90) return <PeriodReview data={await getPeriodReview(user.id, ate!, span)} days={span} range={{ from: de!, to: ate! }} />;
  }
  const endKey = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia <= today ? dia : today;
  const n = dias ? Number(dias) : 1;
  if (Number.isInteger(n) && n >= 2 && n <= 90) {
    return <PeriodReview data={await getPeriodReview(user.id, endKey, n)} days={n} />;
  }
  if (endKey < today) {
    const [review, ai] = await Promise.all([getDayReview(user.id, endKey), getAiStatus(user.id, endKey)]);
    return <DayReview data={review} initialAi={ai} />;
  }
  const [initialData, initialAi, initialPerf] = await Promise.all([getDashboard(user.id), getAiStatus(user.id), getPerformance(user.id)]);
  return <Dashboard initialData={initialData} initialAi={initialAi} initialPerf={initialPerf} />;
}
