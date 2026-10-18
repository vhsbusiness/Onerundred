/**
 * Agendador interno de notificações: roda `tick()` a cada 5 minutos enquanto o
 * servidor estiver no ar. Só no runtime Node (não no build nem no edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.DISABLE_NOTIFICATION_SCHEDULER === "1") return;

  const g = globalThis as unknown as { __onerundredScheduler?: ReturnType<typeof setInterval> };
  if (g.__onerundredScheduler) return;

  const { tick } = await import("./lib/notifications");
  const run = async () => {
    try {
      const r = await tick();
      if (r.sent > 0) console.log(`[notificações] ${r.sent} enviada(s) para ${r.users} usuário(s)`);
    } catch (err) {
      console.error("[notificações] erro no agendador", (err as Error).message);
    }
  };
  g.__onerundredScheduler = setInterval(run, 5 * 60 * 1000);
  setTimeout(run, 15 * 1000);
  console.log(
    `[notificações] agendador iniciado (a cada 5 min; VAPID ${process.env.VAPID_PUBLIC_KEY ? "ok" : "AUSENTE"}; fuso ${process.env.TZ ?? "padrão"})`,
  );
}
