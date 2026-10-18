"use client";

import { useEffect, useState } from "react";
import { http } from "@/lib/client";
import type { SettingsDTO } from "@/lib/types";

export function SettingsForm() {
  const [hours, setHours] = useState("8");
  const [minutes, setMinutes] = useState("0");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    http.get<SettingsDTO>("/api/settings").then((s) => {
      setHours(String(Math.floor(s.dailyGoalMinutes / 60)));
      setMinutes(String(s.dailyGoalMinutes % 60));
      setLoaded(true);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const total = Number(hours) * 60 + Number(minutes);
    await http.patch("/api/settings", { dailyGoalMinutes: total });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-5">
        <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-ink-2">
          Meta diária de trabalho. Usada quando as tarefas do dia não têm estimativa de tempo.
        </p>
        <form onSubmit={save} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Horas</span>
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="input w-24"
              disabled={!loaded}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Minutos</span>
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="input w-24"
              disabled={!loaded}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!loaded}>
            Salvar
          </button>
          {saved && <span className="pill pill-green">Salvo</span>}
        </form>
      </section>

      <section className="card p-5 text-sm text-ink-2">
        <h2 className="text-base font-semibold text-ink">Como a nota é calculada</h2>
        <p className="mt-2">
          Cada tarefa tem um peso: <span className="text-ink">prioridade da tarefa</span> (Alta 3, Média 2,
          Baixa 1) multiplicada pela <span className="text-ink">prioridade da lista</span> (Alta ×1,5, Média
          ×1, Baixa ×0,5).
        </p>
        <p className="mt-2">
          A nota do dia é o peso das tarefas concluídas dividido pelo peso concluído mais o peso das tarefas
          que ficaram abertas no fim do dia. Tarefas agendadas para amanhã não entram na conta de hoje.
          Semana e mês seguem a mesma regra sobre o período inteiro.
        </p>
        <p className="mt-2">
          A sessão de trabalho compara o tempo trabalhado com a soma das estimativas das tarefas do dia (ou
          com a meta acima) para dizer se você trabalhou o suficiente.
        </p>
        <p className="mt-2 text-ink-3">
          Em breve: integração com IA para analisar as tarefas e sugerir horários de trabalho, pausas e
          sono.
        </p>
      </section>
    </div>
  );
}
