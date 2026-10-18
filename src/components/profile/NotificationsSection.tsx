"use client";

import { Bell, BellOff, BellRing, Lock, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { notify } from "@/components/ui/ConfirmProvider";
import type { NotificationPrefsDTO, NotificationType } from "@/lib/types";

const TYPES: { key: NotificationType; title: string; desc: string }[] = [
  { key: "goalReminder", title: "Lembrete de meta antes de dormir", desc: "Se alguma meta ainda estiver sem marcação, avisa às 23h ou, quando o app já conhece seu horário de dormir, 1 hora antes dele." },
  { key: "reminders", title: "Meus lembretes", desc: "Os lembretes que você cria na aba Lembretes chegam como notificação na hora marcada." },
  { key: "overdue", title: "Tarefas atrasadas", desc: "Às 9h, quantas tarefas passaram do dia e continuam abertas." },
  { key: "sleepLog", title: "Registrar o sono", desc: "Às 10h, se você usa a aba Sono e ainda não registrou a noite." },
  { key: "longWork", title: "Trabalhando há muitas horas", desc: "Quando passar de 5 horas trabalhadas no dia." },
  { key: "weekly", title: "Resumo semanal", desc: "Segunda às 9h: sua nota da semana comparada com a anterior." },
  { key: "balance", title: "Equilíbrio lazer e trabalho", desc: "Às 20h, se o lazer ou o trabalho do dia ficaram bem acima do seu normal." },
];

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(ua: string): string {
  if (/iPhone|iPad/.test(ua)) return "iPhone/iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Aparelho";
}

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefsDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [thisDevice, setThisDevice] = useState<string | null>(null); // endpoint deste navegador
  const [standaloneHint, setStandaloneHint] = useState(false);

  const load = useCallback(async () => {
    setPrefs(await http.get<NotificationPrefsDTO>("/api/notificacoes"));
  }, []);

  useEffect(() => {
    // Busca inicial e checagem de suporte do navegador (fontes externas; setState após await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    const isIos = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setStandaloneHint(isIos && !standalone);
    if (ok) {
      navigator.serviceWorker
        .getRegistration("/sw.js")
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setThisDevice(sub?.endpoint ?? null))
        .catch(() => {});
    }
  }, [load]);

  async function enable() {
    if (!prefs?.vapidPublicKey) {
      notify("Notificações não configuradas no servidor", "error");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        notify("Permissão negada no aparelho. Libere nas configurações do navegador.", "error");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(prefs.vapidPublicKey) }));
      const next = await http.post<NotificationPrefsDTO>("/api/notificacoes/inscricao", { subscription: sub.toJSON() });
      setPrefs(next);
      setThisDevice(sub.endpoint);
      notify("Notificações ativadas neste aparelho");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível ativar", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disableThisDevice() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await http.del("/api/notificacoes/inscricao", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setThisDevice(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(id: string) {
    setPrefs(await http.del<NotificationPrefsDTO>("/api/notificacoes/inscricao", { id }));
  }

  async function toggle(key: NotificationType | "enabled", value: boolean) {
    try {
      setPrefs(await http.patch<NotificationPrefsDTO>("/api/notificacoes", { [key]: value }));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível salvar", "error");
    }
  }

  async function test() {
    const r = await http.post<{ delivered: number }>("/api/notificacoes/teste");
    notify(r.delivered > 0 ? `Enviada para ${r.delivered} aparelho(s)` : "Nenhum aparelho recebeu", r.delivered > 0 ? "info" : "error");
  }

  if (!prefs) return <section className="card h-40 animate-pulse" />;

  const active = prefs.enabled;

  return (
    <section className="card space-y-5 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {active ? <BellRing size={18} className="text-green" /> : <Bell size={18} className="text-ink-3" />} Notificações
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Tudo vem desligado. Primeiro libere no aparelho; depois escolha o que quer receber.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {thisDevice ? (
            <>
              <button type="button" onClick={test} className="btn">
                <BellRing size={14} /> Enviar teste
              </button>
              <button type="button" onClick={disableThisDevice} disabled={busy} className="btn btn-ghost text-ink-3 hover:text-red">
                <BellOff size={14} /> Desligar neste aparelho
              </button>
            </>
          ) : (
            <button type="button" onClick={enable} disabled={busy || !supported} className="btn btn-primary">
              <Bell size={14} /> {busy ? "Ativando…" : "Ativar notificações neste aparelho"}
            </button>
          )}
        </div>
      </div>

      {!supported && (
        <p className="rounded-xl border border-orange/30 bg-orange/10 px-3 py-2 text-sm text-orange">
          Este navegador não suporta notificações push.
        </p>
      )}
      {standaloneHint && (
        <p className="rounded-xl border border-blue/30 bg-blue/10 px-3 py-2 text-sm text-blue">
          No iPhone, as notificações só funcionam com o app instalado na tela inicial: no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”, abra por lá e ative aqui.
        </p>
      )}

      {prefs.devices.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Aparelhos com notificação</div>
          <ul className="space-y-1">
            {prefs.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-1.5 text-sm">
                <Smartphone size={14} className="text-ink-3" />
                <span>{deviceLabel(d.userAgent)}</span>
                <span className="text-xs text-ink-3">desde {new Date(d.createdAt).toLocaleDateString("pt-BR")}</span>
                <button type="button" onClick={() => removeDevice(d.id)} className="ml-auto text-ink-3 hover:text-red" aria-label="Remover aparelho">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`space-y-2 ${active ? "" : "opacity-60"}`}>
        <div className="flex items-center justify-between rounded-xl border border-line bg-black/20 px-3 py-2.5">
          <div>
            <div className="text-sm font-medium">Receber notificações</div>
            <div className="text-xs text-ink-3">Chave geral. Desligada, nada é enviado.</div>
          </div>
          <Switch checked={prefs.enabled} disabled={prefs.devices.length === 0} onChange={(v) => toggle("enabled", v)} />
        </div>

        {TYPES.map((t) => {
          const locked = prefs.aiRequired.includes(t.key) && !prefs.aiReady;
          return (
            <div key={t.key} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-black/20 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {t.title}
                  {prefs.aiRequired.includes(t.key) && (
                    <span className={`pill px-1.5 py-0 text-[10px] ${locked ? "" : "pill-blue"}`}>
                      {locked ? <Lock size={9} /> : null} IA
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-3">
                  {t.desc}
                  {t.key === "goalReminder" && ` Hoje: ${prefs.goalReminderTime}.`}
                  {locked && " Libera quando a IA terminar o período de observação."}
                </div>
              </div>
              <Switch checked={prefs.types[t.key]} disabled={!active || locked} onChange={(v) => toggle(t.key, v)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
        checked ? "border-green/50 bg-green-deep" : "border-line-2 bg-white/[0.06]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-ink transition ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
