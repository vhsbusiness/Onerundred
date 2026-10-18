"use client";

import { Eye, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { Avatar } from "@/components/profile/ProfilePage";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { formatDuration } from "@/lib/time";
import type { AdminOverview, AdminUser, MeDTO } from "@/lib/types";

function fmtDate(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[1.8rem] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-sm text-ink-2">{label}</div>
    </div>
  );
}

export function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [me, setMe] = useState<MeDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, meRes] = await Promise.all([
        http.get<{ overview: AdminOverview; users: AdminUser[] }>("/api/admin/users"),
        http.get<{ user: MeDTO | null }>("/api/auth/me"),
      ]);
      setOverview(data.overview);
      setUsers(data.users);
      setMe(meRes.user);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    }
  }

  const [obs, setObs] = useState<Record<string, string>>({});
  const [obsSaved, setObsSaved] = useState(false);
  const OBS_FIELDS = [
    { key: "aiMinDaysTasks", label: "Tarefas", unit: "dias" },
    { key: "aiMinDaysWork", label: "Tempo de trabalho", unit: "dias" },
    { key: "aiMinNightsSleep", label: "Sono", unit: "noites" },
    { key: "aiMinDaysLeisure", label: "Lazer", unit: "dias" },
  ] as const;

  async function saveObservation(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, number> = {};
    for (const f of OBS_FIELDS) {
      const v = obs[f.key] ?? String(overview?.settings[f.key] ?? "");
      payload[f.key] = Number(v);
    }
    await act(() => http.patch("/api/admin/settings", payload));
    setObsSaved(true);
    setTimeout(() => setObsSaved(false), 2000);
  }

  function toggleRegistration() {
    if (!overview) return;
    act(() =>
      http.patch("/api/admin/settings", { allowRegistration: !overview.settings.allowRegistration }),
    );
  }

  function setRole(u: AdminUser, role: "user" | "admin") {
    act(() => http.patch(`/api/admin/users/${u.id}`, { role }));
  }

  function setActive(u: AdminUser, active: boolean) {
    if (!active && !confirm(`Desativar a conta de ${u.name}? A pessoa será deslogada.`)) return;
    act(() => http.patch(`/api/admin/users/${u.id}`, { active }));
  }

  function remove(u: AdminUser) {
    if (!confirm(`Excluir ${u.name} (${u.email}) e TODOS os dados dessa conta? Não dá para desfazer.`)) return;
    act(() => http.del(`/api/admin/users/${u.id}`));
  }

  if (error) return <div className="card p-6 text-sm text-red">{error}</div>;
  if (!overview) {
    return (
      <div className="grid animate-pulse gap-4">
        <div className="card h-32" />
        <div className="card h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck size={22} className="text-green" /> Admin
          </h1>
          <p className="text-sm text-ink-2">Contas, uso geral e configurações do app.</p>
        </div>
        <label className="pill cursor-pointer select-none gap-2 px-3 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={overview.settings.allowRegistration}
            onChange={toggleRegistration}
            className="accent-[var(--color-green)]"
          />
          Permitir novos cadastros
        </label>
      </div>

      <section className="card p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
          <Tile value={String(overview.users)} label="Contas" />
          <Tile value={String(overview.activeToday)} label="Entraram hoje" />
          <Tile value={String(overview.newThisWeek)} label="Novas na semana" />
          <Tile value={String(overview.doneToday)} label="Tarefas feitas hoje" />
          <Tile value={String(overview.openCards)} label="Tarefas abertas" />
          <Tile value={formatDuration(overview.workedTodayMs)} label="Trabalhado hoje (todos)" />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <Eye size={15} className="text-blue" /> Período de observação da IA
        </h2>
        <p className="mt-1 text-xs text-ink-3">
          Mínimo de dias com dados antes de a IA opinar em cada dimensão (padrão: tarefas 3, trabalho 3, sono 7, lazer 7). Depois disso a IA continua aprendendo a cada análise. Tarefas e tempo de trabalho liberam a análise completa; sono e lazer, enquanto não atingem o mínimo, ficam fora das conclusões. Zero desliga a observação daquela dimensão.
        </p>
        <form onSubmit={saveObservation} className="mt-4 flex flex-wrap items-end gap-3">
          {OBS_FIELDS.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">
                {f.label} ({f.unit})
              </span>
              <input
                value={obs[f.key] ?? String(overview.settings[f.key])}
                inputMode="numeric"
                onChange={(e) => setObs((o) => ({ ...o, [f.key]: e.target.value.replace(/\D/g, "") }))}
                className="input w-24"
              />
            </label>
          ))}
          <button type="submit" className="btn btn-primary">
            Salvar
          </button>
          {obsSaved && <span className="pill pill-green">Salvo</span>}
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-medium text-ink-2">Usuários</h2>
          <span className="pill">{users.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-y border-line bg-black/20 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-5 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Papel</th>
                <th className="px-3 py-2 font-medium">Último login</th>
                <th className="px-3 py-2 font-medium text-right">Quadros</th>
                <th className="px-3 py-2 font-medium text-right">Abertas</th>
                <th className="px-3 py-2 font-medium text-right">Feitas</th>
                <th className="px-3 py-2 font-medium text-right">Hoje</th>
                <th className="px-3 py-2 font-medium text-right">Trab. hoje</th>
                <th className="px-3 py-2 font-medium text-right">Trab. total</th>
                <th className="px-5 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = me?.id === u.id;
                return (
                  <tr key={u.id} className={`border-b border-line ${u.active ? "" : "opacity-50"}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar me={u} size={32} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            {u.name}
                            {isMe && <span className="pill px-1.5 py-0 text-[10px]">você</span>}
                            {!u.active && <span className="pill pill-red px-1.5 py-0 text-[10px]">desativada</span>}
                          </div>
                          <div className="text-xs text-ink-3">
                            @{u.username} · {u.email} · desde {fmtDate(u.createdAt)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={u.role === "admin" ? "pill pill-green" : "pill"}>
                        {u.role === "admin" ? "Admin" : "Usuário"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2 tabular-nums">{fmtDate(u.lastLoginAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{u.boards}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{u.openCards}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{u.doneCards}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{u.doneToday}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatDuration(u.workedTodayMs)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatDuration(u.workedTotalMs)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {u.role === "admin" ? (
                          <button
                            type="button"
                            disabled={isMe}
                            onClick={() => setRole(u, "user")}
                            className="btn btn-ghost h-8 whitespace-nowrap px-2 text-xs"
                            title="Tirar admin"
                          >
                            Tirar admin
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRole(u, "admin")}
                            className="btn btn-ghost h-8 whitespace-nowrap px-2 text-xs"
                            title="Tornar admin"
                          >
                            Tornar admin
                          </button>
                        )}
                        {u.active ? (
                          <button
                            type="button"
                            disabled={isMe}
                            onClick={() => setActive(u, false)}
                            className="btn btn-ghost h-8 w-8 p-0"
                            title="Desativar conta"
                            aria-label="Desativar conta"
                          >
                            <UserX size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActive(u, true)}
                            className="btn btn-ghost h-8 w-8 p-0 text-green"
                            title="Reativar conta"
                            aria-label="Reativar conta"
                          >
                            <UserCheck size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isMe}
                          onClick={() => remove(u)}
                          className="btn btn-ghost h-8 w-8 p-0 text-ink-3 hover:text-red"
                          title="Excluir conta"
                          aria-label="Excluir conta"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
