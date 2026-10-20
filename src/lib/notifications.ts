import webpush from "web-push";
import { addDays, subDays } from "date-fns";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { getObservation } from "./ai";
import { periodScore, type MetricCard } from "./metrics";
import { computeStats as sleepStats, listSleep } from "./sleep";
import { computeLeisureStats, listLeisure } from "./leisure";
import { listProjects } from "./projects";
import { boardAccess } from "./repo";
import { dayKey, dayRange, formatDuration, sumSessions, todayKey, weekRange } from "./time";
import type { NotificationPrefsDTO, NotificationType } from "./types";

/*
 * Notificações push (Web Push + VAPID).
 *
 * Tudo começa desligado. O usuário ativa no Perfil: primeiro a permissão do
 * aparelho (inscrição), depois cada tipo. Os tipos que dependem da IA só podem
 * ser ligados quando o período de observação terminou (tarefas + trabalho).
 *
 * O agendador (`tick`) roda a cada poucos minutos (instrumentation.ts) e
 * decide o que enviar; `NotificationLog` garante um envio por dia/semana.
 */

export const AI_REQUIRED: NotificationType[] = ["longWork", "weekly", "balance"];
export const ALL_TYPES: NotificationType[] = ["goalReminder", "longWork", "weekly", "balance", "overdue", "sleepLog", "reminders"];

const LONG_WORK_MINUTES = 5 * 60;
const DEFAULT_GOAL_REMINDER = "23:00";

function vapidReady(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureVapid() {
  if (configured || !vapidReady()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@onerundred.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/* ───────────── Preferências ───────────── */

async function prefRow(userId: string) {
  return prisma.notificationPref.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function getPrefs(userId: string): Promise<NotificationPrefsDTO> {
  const [pref, devices, obs, goalTime] = await Promise.all([
    prefRow(userId),
    prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    getObservation(userId),
    goalReminderTime(userId),
  ]);
  return {
    enabled: pref.enabled && devices.length > 0,
    types: {
      goalReminder: pref.goalReminder,
      longWork: pref.longWork,
      weekly: pref.weekly,
      balance: pref.balance,
      overdue: pref.overdue,
      sleepLog: pref.sleepLog,
      reminders: pref.reminders,
    },
    aiRequired: AI_REQUIRED,
    aiReady: obs.coreReady,
    devices: devices.map((d) => ({ id: d.id, userAgent: d.userAgent, createdAt: d.createdAt.toISOString() })),
    goalReminderTime: goalTime,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  };
}

export async function updatePrefs(userId: string, input: Partial<Record<NotificationType | "enabled", boolean>>): Promise<NotificationPrefsDTO> {
  const data: Record<string, boolean> = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  const obs = await getObservation(userId);
  for (const t of ALL_TYPES) {
    const v = input[t];
    if (v === undefined) continue;
    if (v && AI_REQUIRED.includes(t) && !obs.coreReady) {
      throw new ApiError(400, "Essa notificação depende da IA: espere o período de observação terminar");
    }
    data[t] = v;
  }
  await prisma.notificationPref.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return getPrefs(userId);
}

/* ───────────── Inscrições (aparelhos) ───────────── */

export async function subscribe(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
) {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new ApiError(400, "Inscrição inválida");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) },
  });
  await prisma.notificationPref.upsert({ where: { userId }, create: { userId, enabled: true }, update: { enabled: true } });
}

export async function unsubscribe(userId: string, endpoint?: string, id?: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, ...(endpoint ? { endpoint } : {}), ...(id ? { id } : {}) } });
}

/* ───────────── Envio ───────────── */

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Envia para todos os aparelhos do usuário; remove inscrições mortas. Devolve quantos receberam. */
export async function sendToUser(userId: string, msg: PushMessage): Promise<number> {
  if (!vapidReady()) return 0;
  ensureVapid();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { TTL: 60 * 60 },
      );
      delivered += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      } else {
        console.error("push falhou", status, (err as Error).message);
      }
    }
  }
  return delivered;
}

async function alreadySent(userId: string, type: string, period: string): Promise<boolean> {
  const row = await prisma.notificationLog.findUnique({ where: { userId_type_period: { userId, type, period } } });
  return Boolean(row);
}

async function markSent(userId: string, type: string, period: string) {
  await prisma.notificationLog.upsert({
    where: { userId_type_period: { userId, type, period } },
    create: { userId, type, period },
    update: { sentAt: new Date() },
  });
}

/* ───────────── Regras ───────────── */

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesNow(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Janela de disparo: entre o horário alvo e alvo + 15 min (o tick roda a cada 5). */
function inWindow(now: Date, targetMin: number, width = 15): boolean {
  const n = minutesNow(now);
  return n >= targetMin && n < targetMin + width;
}

/** Horário do lembrete de meta: 1h antes do horário médio de dormir (últimas 7 noites), senão 23:00. */
export async function goalReminderTime(userId: string): Promise<string> {
  const logs = await listSleep(userId, 14);
  const stats = sleepStats(logs);
  if (!stats.avgSleepTime7 || logs.length < 3) return DEFAULT_GOAL_REMINDER;
  let min = clockToMinutes(stats.avgSleepTime7) - 60;
  if (min < 0) min += 1440;
  // Nunca antes das 18h nem depois das 23:30 (dormir de madrugada vira lembrete à noite).
  if (min < 18 * 60 || min > 23 * 60 + 30) min = min < 18 * 60 ? 23 * 60 + 30 : min;
  return `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;
}

function weekKey(d: Date): string {
  const { start } = weekRange(d);
  return `w-${dayKey(start)}`;
}

async function workedTodayMin(userId: string): Promise<number> {
  const { start } = dayRange(todayKey());
  const sessions = await prisma.workSession.findMany({ where: { userId, OR: [{ startedAt: { gte: start } }, { endedAt: null }] } });
  return Math.round(sumSessions(sessions) / 60000);
}

async function workedAvg7Min(userId: string): Promise<number> {
  const since = subDays(dayRange(todayKey()).start, 7);
  const sessions = await prisma.workSession.findMany({ where: { userId, startedAt: { gte: since, lt: dayRange(todayKey()).start }, endedAt: { not: null } } });
  return Math.round(sumSessions(sessions) / 60000 / 7);
}

/** Avalia todas as regras para um usuário e envia o que couber. Devolve os tipos enviados. */
export async function evaluateUser(userId: string, now = new Date()): Promise<string[]> {
  const pref = await prisma.notificationPref.findUnique({ where: { userId } });
  if (!pref?.enabled) return [];
  const subs = await prisma.pushSubscription.count({ where: { userId } });
  if (subs === 0) return [];

  const today = todayKey();
  const sent: string[] = [];
  const aiOk = AI_REQUIRED.some((t) => pref[t]) ? (await getObservation(userId)).coreReady : false;

  // 1. Lembrete de meta antes de dormir
  if (pref.goalReminder && !(await alreadySent(userId, "goalReminder", today))) {
    const target = clockToMinutes(await goalReminderTime(userId));
    if (inWindow(now, target)) {
      const projects = (await listProjects(userId)).filter((p) => !p.archivedAt && p.todayStatus === "pending");
      if (projects.length > 0) {
        const names = projects.map((p) => p.name).slice(0, 3).join(", ");
        await sendToUser(userId, {
          title: projects.length === 1 ? "Marcou sua meta de hoje?" : `Marque suas ${projects.length} metas de hoje`,
          body: `${names}${projects.length > 3 ? "…" : ""} — sem marcação até a virada do dia, conta como não feito.`,
          url: "/metas",
          tag: "goal-reminder",
        });
        await markSent(userId, "goalReminder", today);
        sent.push("goalReminder");
      }
    }
  }

  // 2. Trabalhando há muitas horas (IA)
  if (pref.longWork && aiOk && !(await alreadySent(userId, "longWork", today))) {
    const min = await workedTodayMin(userId);
    if (min >= LONG_WORK_MINUTES) {
      await sendToUser(userId, {
        title: `Você já trabalhou ${formatDuration(min * 60000)} hoje`,
        body: "Só avisando. Uma pausa agora costuma render mais do que insistir.",
        url: "/",
        tag: "long-work",
      });
      await markSent(userId, "longWork", today);
      sent.push("longWork");
    }
  }

  // 3. Resumo semanal (IA): segunda-feira, 09:00
  if (pref.weekly && aiOk && now.getDay() === 1 && inWindow(now, 9 * 60, 60)) {
    const period = weekKey(now);
    if (!(await alreadySent(userId, "weekly", period))) {
      const cards = await prisma.card.findMany({
        where: { list: { board: boardAccess(userId) } },
        include: { list: { select: { priority: true, kind: true } } },
      });
      const metric: MetricCard[] = cards.map((c) => ({ ...c, listPriority: c.list.priority, listKind: c.list.kind }));
      const last = weekRange(subDays(now, 7));
      const prev = weekRange(subDays(now, 14));
      const a = periodScore(metric, last.start, last.end, last.endKey).score;
      const b = periodScore(metric, prev.start, prev.end, prev.endKey).score;
      if (a !== null) {
        let body: string;
        if (b === null) body = `Semana passada você fechou com ${a}%. Bora manter.`;
        else if (a > b) body = `Semana passada: ${a}%, ${a - b} pontos acima da anterior (${b}%). Boa.`;
        else if (a < b) body = `Semana passada: ${a}%, ${b - a} pontos abaixo da anterior (${b}%). Dá para recuperar esta semana.`;
        else body = `Semana passada: ${a}%, igual à anterior.`;
        await sendToUser(userId, { title: "Seu resumo da semana", body, url: "/", tag: "weekly" });
        await markSent(userId, "weekly", period);
        sent.push("weekly");
      }
    }
  }

  // 4. Equilíbrio lazer/trabalho (IA): às 20:00
  if (pref.balance && aiOk && inWindow(now, 20 * 60, 60) && !(await alreadySent(userId, "balance", today))) {
    const leisure = computeLeisureStats((await listLeisure(userId, 14)).filter((l) => l.endAt));
    const worked = await workedTodayMin(userId);
    const workAvg = await workedAvg7Min(userId);
    let msg: PushMessage | null = null;
    if (leisure.avg7Min > 0 && leisure.todayMin > Math.max(120, leisure.avg7Min * 1.5)) {
      msg = {
        title: "Lazer acima do seu normal hoje",
        body: `${formatDuration(leisure.todayMin * 60000)} de lazer hoje, contra uma média de ${formatDuration(leisure.avg7Min * 60000)} por dia. Tudo bem descansar; só confira o que ficou pendente.`,
        url: "/lazer",
        tag: "balance",
      };
    } else if (workAvg > 0 && worked > Math.max(6 * 60, workAvg * 1.5)) {
      msg = {
        title: "Trabalho acima do seu normal hoje",
        body: `${formatDuration(worked * 60000)} hoje, contra uma média de ${formatDuration(workAvg * 60000)}. Vale encerrar o dia e descansar.`,
        url: "/",
        tag: "balance",
      };
    }
    if (msg) {
      await sendToUser(userId, msg);
      await markSent(userId, "balance", today);
      sent.push("balance");
    }
  }

  // 5. Tarefas atrasadas: 09:00
  if (pref.overdue && inWindow(now, 9 * 60, 60) && !(await alreadySent(userId, "overdue", today))) {
    const n = await prisma.card.count({
      // Só listas normais de prioridade Alta atrasam (ver isOverdue em metrics.ts).
      where: { list: { board: boardAccess(userId), kind: "normal", priority: 1 }, archivedAt: null, completedAt: null, scheduledFor: { lt: today } },
    });
    if (n > 0) {
      await sendToUser(userId, {
        title: n === 1 ? "1 tarefa atrasada" : `${n} tarefas atrasadas`,
        body: "Elas seguem puxando sua nota para baixo até serem feitas ou reagendadas.",
        url: "/quadros",
        tag: "overdue",
      });
      await markSent(userId, "overdue", today);
      sent.push("overdue");
    }
  }

  // 6. Registrar o sono: 10:00, se usa a aba Sono e ainda não registrou hoje
  if (pref.sleepLog && inWindow(now, 10 * 60, 60) && !(await alreadySent(userId, "sleepLog", today))) {
    const recent = await prisma.sleepLog.count({ where: { userId, wakeAt: { gte: subDays(new Date(), 14) } } });
    const todayLog = await prisma.sleepLog.findFirst({ where: { userId, dayKey: today } });
    if (recent > 0 && !todayLog) {
      await sendToUser(userId, {
        title: "Como foi a noite?",
        body: "Registre que horas deitou, dormiu e acordou para a IA acertar seus horários.",
        url: "/sono",
        tag: "sleep-log",
      });
      await markSent(userId, "sleepLog", today);
      sent.push("sleepLog");
    }
  }

  // 7. Lembretes do usuário
  if (pref.reminders) {
    const due = await prisma.reminder.findMany({ where: { userId, active: true, at: { lte: now } }, orderBy: { at: "asc" } });
    for (const r of due) {
      await sendToUser(userId, { title: r.title, body: r.note || "Lembrete", url: "/lembretes", tag: `reminder-${r.id}` });
      const next = r.repeat === "daily" ? addDays(r.at, 1) : r.repeat === "weekly" ? addDays(r.at, 7) : null;
      // Se ficou muito para trás (app parado), avança até o futuro.
      let nextAt = next;
      while (nextAt && nextAt <= now) nextAt = addDays(nextAt, r.repeat === "daily" ? 1 : 7);
      await prisma.reminder.update({
        where: { id: r.id },
        data: { lastSentAt: now, ...(nextAt ? { at: nextAt } : { active: false }) },
      });
      sent.push("reminder");
    }
  }

  return sent;
}

/** Uma rodada do agendador: avalia todos os usuários com notificações ligadas. */
export async function tick(now = new Date()): Promise<{ users: number; sent: number }> {
  if (!vapidReady()) return { users: 0, sent: 0 };
  const users = await prisma.notificationPref.findMany({ where: { enabled: true }, select: { userId: true } });
  let total = 0;
  for (const u of users) {
    try {
      total += (await evaluateUser(u.userId, now)).length;
    } catch (err) {
      console.error("notificações: falha para", u.userId, (err as Error).message);
    }
  }
  return { users: users.length, sent: total };
}

/** Teste manual pelo Perfil. */
export async function sendTest(userId: string): Promise<number> {
  return sendToUser(userId, {
    title: "Onerundred",
    body: "Notificações ativas neste aparelho. 🎯",
    url: "/perfil",
    tag: "test",
  });
}
