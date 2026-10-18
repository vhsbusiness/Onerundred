import { ApiError, handle, json } from "@/lib/api";
import { tick } from "@/lib/notifications";

/** Dispara uma rodada do agendador por fora (cron externo): Authorization: Bearer CRON_SECRET */
export const POST = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) throw new ApiError(401, "Não autorizado");
  return json(await tick());
});
