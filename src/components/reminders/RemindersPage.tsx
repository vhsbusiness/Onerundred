"use client";

import { Bell, BellOff, Check, Plus, Repeat, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { askConfirm } from "@/components/ui/ConfirmProvider";
import { TimeField } from "@/components/ui/TimeField";
import { todayKey } from "@/lib/time";
import type { NotificationPrefsDTO, ReminderDTO } from "@/lib/types";

const REPEAT_LABEL = { none: "Uma vez", daily: "Todo dia", weekly: "Toda semana" } as const;

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function RemindersPage() {
  const [items, setItems] = useState<ReminderDTO[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefsDTO | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60000);
    return `${d.getHours().toString().padStart(2, "0")}:${(Math.ceil(d.getMinutes() / 5) * 5 % 60).toString().padStart(2, "0")}`;
  });
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [list, p] = await Promise.all([http.get<ReminderDTO[]>("/api/lembretes"), http.get<NotificationPrefsDTO>("/api/notificacoes")]);
    setItems(list);
    setPrefs(p);
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const [y, m, d] = date.split("-").map(Number);
      const [h, min] = time.split(":").map(Number);
      const at = new Date(y, m - 1, d, h, min, 0, 0);
      await http.post("/api/lembretes", { title, note, at: at.toISOString(), repeat });
      setTitle("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(r: ReminderDTO) {
    await http.patch(`/api/lembretes/${r.id}`, { active: !r.active });
    load();
  }

  async function remove(r: ReminderDTO) {
    if (!(await askConfirm({ title: "Apagar lembrete", message: `Apagar "${r.title}"?`, confirmLabel: "Apagar", danger: true }))) return;
    await http.del(`/api/lembretes/${r.id}`);
    load();
  }

  const notifOk = Boolean(prefs?.enabled && prefs.types.reminders);
  const upcoming = items?.filter((r) => r.active) ?? [];
  const past = items?.filter((r) => !r.active) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bell size={22} className="text-orange" /> Lembretes
        </h1>
        <p className="text-sm text-ink-2">Na hora marcada, chega uma notificação no seu aparelho com o título do lembrete.</p>
      </div>

      {prefs && !notifOk && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-orange">
          <BellOff size={16} />
          <span className="flex-1">
            Os lembretes só funcionam com as notificações ativas{prefs.enabled ? ' e o tipo "Meus lembretes" ligado' : ""}. Eles ficam salvos, mas não serão enviados até você ativar.
          </span>
          <Link href="/perfil" className="btn h-8 px-3 text-xs">
            Ativar no Perfil
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <form onSubmit={create} className="card space-y-3 p-5 lg:col-span-4">
          <h2 className="text-sm font-medium text-ink-2">Novo lembrete</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (vira o título da notificação)" className="input" maxLength={120} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalhe (opcional)" className="input" maxLength={300} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Dia</span>
              <input type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Hora</span>
              <TimeField value={time} onChange={setTime} />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Repetir</span>
            <div className="flex gap-1.5">
              {(Object.keys(REPEAT_LABEL) as (keyof typeof REPEAT_LABEL)[]).map((k) => (
                <button key={k} type="button" onClick={() => setRepeat(k)} className={`pill cursor-pointer ${repeat === k ? "pill-blue" : ""}`}>
                  {REPEAT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={busy || !title.trim()} className="btn btn-primary w-full">
            <Plus size={14} /> {busy ? "Salvando…" : "Criar lembrete"}
          </button>
        </form>

        <div className="space-y-4 lg:col-span-8">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-medium text-ink-2">Próximos</h2>
            {!items ? (
              <div className="h-24 animate-pulse" />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-ink-3">Nenhum lembrete agendado.</p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((r) => (
                  <li key={r.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-well px-3 py-2 text-sm">
                    <Bell size={14} className="text-orange" />
                    <span className="font-medium">{r.title}</span>
                    {r.note && <span className="truncate text-xs text-ink-3">{r.note}</span>}
                    <span className="ml-auto text-xs text-ink-2 tabular-nums">{fmt(r.at)}</span>
                    {r.repeat !== "none" && (
                      <span className="pill">
                        <Repeat size={10} /> {REPEAT_LABEL[r.repeat]}
                      </span>
                    )}
                    <button type="button" onClick={() => toggleActive(r)} className="btn btn-ghost h-8 px-2 text-xs" title="Pausar lembrete">
                      Pausar
                    </button>
                    <button type="button" onClick={() => remove(r)} className="btn btn-ghost h-8 w-8 p-0 text-ink-3 hover:text-red" aria-label="Apagar">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-medium text-ink-2">Enviados ou pausados</h2>
              <ul className="space-y-1.5">
                {past.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-well px-3 py-2 text-sm opacity-70">
                    <Check size={14} className="text-green" />
                    <span>{r.title}</span>
                    <span className="ml-auto text-xs text-ink-3 tabular-nums">{r.lastSentAt ? `enviado ${fmt(r.lastSentAt)}` : fmt(r.at)}</span>
                    <button type="button" onClick={() => toggleActive(r)} className="btn btn-ghost h-8 px-2 text-xs">
                      Reativar
                    </button>
                    <button type="button" onClick={() => remove(r)} className="btn btn-ghost h-8 w-8 p-0 text-ink-3 hover:text-red" aria-label="Apagar">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
