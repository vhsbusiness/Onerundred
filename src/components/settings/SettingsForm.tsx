"use client";

import { Brain, Check, Moon, RotateCcw, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { http } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import type { SettingsDTO } from "@/lib/types";
import type { Theme } from "@/lib/theme";
import { applyTheme, currentTheme } from "@/lib/theme-client";

export function SettingsForm() {
  const [hours, setHours] = useState("8");
  const [minutes, setMinutes] = useState("0");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(currentTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("theme-changed", onChange);
    return () => window.removeEventListener("theme-changed", onChange);
  }, []);

  async function chooseTheme(t: Theme) {
    applyTheme(t);
    await http.patch("/api/settings", { theme: t }).catch(() => {});
  }

  async function resetAi() {
    setResetting(true);
    try {
      const r = await http.del<{ insights: number; hadMemory: boolean }>("/api/ai/insight");
      setResetMsg(
        r.hadMemory || r.insights > 0
          ? `Inteligência resetada: ${r.insights} análise(s) e a memória de hábitos foram apagadas.`
          : "Não havia memória nem análises para apagar.",
      );
      setResetOpen(false);
      setUnderstood(false);
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Não foi possível resetar");
    } finally {
      setResetting(false);
    }
  }

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

      <section className="card p-5">
        <h2 className="text-base font-semibold">Aparência</h2>
        <p className="mt-1 text-sm text-ink-2">Escolha o tema. Vale para a sua conta em qualquer aparelho.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(
            [
              { key: "dark", label: "Escuro", icon: Moon, bg: "#0b0c0f", card: "#15171c", ink: "#f4f5f7", muted: "#6b7280" },
              { key: "light", label: "Claro", icon: Sun, bg: "#f3f1ec", card: "#ffffff", ink: "#17181c", muted: "#b5b9c2" },
            ] as const
          ).map((t) => {
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTheme(t.key)}
                aria-pressed={active}
                className={`group rounded-2xl border p-2 text-left transition ${active ? "border-blue/60 bg-blue/10" : "border-line hover:border-line-3"}`}
              >
                <div className="relative overflow-hidden rounded-xl border border-black/10 p-2.5" style={{ backgroundColor: t.bg }}>
                  <div className="flex gap-1.5">
                    <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: "#f5b06e" }} />
                    <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: "#8be3a6" }} />
                    <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: "#7fb7f5" }} />
                  </div>
                  <div className="mt-2 space-y-1.5 rounded-lg p-2" style={{ backgroundColor: t.card }}>
                    <span className="block h-1.5 w-3/5 rounded-full" style={{ backgroundColor: t.ink }} />
                    <span className="block h-1.5 w-4/5 rounded-full" style={{ backgroundColor: t.muted }} />
                    <span className="block h-1.5 w-2/5 rounded-full" style={{ backgroundColor: t.muted }} />
                  </div>
                  {active && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue text-bg">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5 px-1 text-sm font-medium">
                  <t.icon size={14} className={t.key === "dark" ? "text-blue" : "text-orange"} /> {t.label}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-5 text-sm text-ink-2 lg:col-span-2">
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
        <p className="mt-2">
          A IA do dashboard lê tarefas, tempo de trabalho, sono, lazer e metas e devolve uma nota explicada,
          sugestões e horários. A cada análise ela reescreve uma memória de hábitos sua, que entra na análise
          seguinte.
        </p>
      </section>

      <section className="card p-5 lg:col-span-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Brain size={18} className="text-blue" /> Inteligência da IA
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Tudo o que a IA aprendeu sobre você fica numa memória de hábitos, reescrita a cada análise. Se ela
          ficou desatualizada (mudou de rotina, por exemplo), você pode zerar e deixar a IA aprender de novo.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setResetOpen(true)} className="btn text-red hover:text-red">
            <RotateCcw size={14} /> Resetar inteligência da IA
          </button>
          {resetMsg && <span className="text-sm text-ink-2">{resetMsg}</span>}
        </div>
      </section>

      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setUnderstood(false);
        }}
        title={<h2 className="text-lg font-semibold">Resetar inteligência da IA</h2>}
      >
        <div className="space-y-4 text-sm text-ink-2">
          <p>
            <span className="font-medium text-ink">Como funciona:</span> a cada análise do dia, a IA guarda uma memória
            de hábitos sobre você (horários em que rende mais, se costuma subestimar tempo, atrasos recorrentes, padrão
            de sono e lazer). Essa memória entra como contexto na análise seguinte, por isso ela vai ficando mais
            precisa com o tempo.
          </p>
          <div className="rounded-xl border border-line bg-well p-3">
            <p className="font-medium text-ink">Ao resetar:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>a memória de hábitos é apagada;</li>
              <li>o histórico de análises do dia é apagado;</li>
              <li>suas tarefas, quadros, sono, lazer e metas <span className="text-ink">não</span> são afetados;</li>
              <li>a IA recomeça a aprender do zero na próxima análise.</li>
            </ul>
          </div>
          <p className="text-red">Isso não pode ser desfeito.</p>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            Entendi o que será apagado
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={resetAi} disabled={!understood || resetting} className="btn pill-red border-red/40">
              {resetting ? "Resetando…" : "Confirmar reset"}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetOpen(false);
                setUnderstood(false);
              }}
              className="btn btn-ghost"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
