import { ApiError, json, withUser } from "@/lib/api";
import { getPerformance, getPeriodReview } from "@/lib/performance";

/** Performance de hoje (+ histórico e constância); com ?fim=yyyy-MM-dd&dias=N, a revisão do período. */
export const GET = withUser(async (user, req: Request) => {
  const url = new URL(req.url);
  const dias = url.searchParams.get("dias");
  if (dias) {
    const n = Number(dias);
    const fim = url.searchParams.get("fim") ?? "";
    if (!Number.isInteger(n) || n < 2 || n > 90) throw new ApiError(400, "dias deve ser de 2 a 90");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) throw new ApiError(400, "fim deve ser yyyy-MM-dd");
    return json(await getPeriodReview(user.id, fim, n));
  }
  return json(await getPerformance(user.id));
});
