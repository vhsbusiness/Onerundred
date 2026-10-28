"use client";

import { Activity, Briefcase, Gamepad2, Moon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { TimeField } from "@/components/ui/TimeField";
import type { SettingsDTO, TargetsDTO } from "@/lib/types";
import { MetasHeader } from "./MetasTabs";

type SavePatch = { dailyGoalMinutes?: number; targets?: Partial<TargetsDTO> };

/** Aba Metas › Metas: metas básicas de sono, trabalho, lazer e performance. A IA e a performance do dashboard usam estes valores. */
export function TargetsPage() {
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const load = useCallback(async () => {
    const s = await http.get<SettingsDTO>("/api/settings");
    setSettings(s);
  }, []);
  useEffect(() => {
    // Busca inicial (setState após o await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const save = useCallback(async (patch: SavePatch) => {
    const s = await http.patch<SettingsDTO>("/api/settings", patch);
    setSettings(s);
  }, []);

  return (
    <div className="space-y-5">
      <MetasHeader subtitle="Suas metas básicas. A IA compara seus números com elas e a performance do dashboard usa como referência." />
      <div className="grid gap-4 lg:grid-cols-2">
        <SleepTargetCard settings={settings} save={save} />
        <WorkTargetCard settings={settings} save={save} />
        <LeisureTargetCard settings={settings} save={save} />
        <PerformanceTargetCard settings={settings} save={save} />
      </div>
    </div>
  );
}

type CardProps = { settings: SettingsDTO | null; save: (patch: SavePatch) => Promise<void> };

function useSavedFlag() {
  const [saved, setSaved] = useState(false);
  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return { saved, flash };
}

function SleepTargetCard({ settings, save }: CardProps) {
  const [hours, setHours] = useState("");
  const [bedtime, setBedtime] = useState("");
  const [wake, setWake] = useState("");
  const [ready, setReady] = useState(false);
  const { saved, flash } = useSavedFlag();

  useEffect(() => {
    if (!settings || ready) return;
    // Preenche o formulário uma vez com o que está salvo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHours(settings.targets.sleepMinutes ? String(Math.round((settings.targets.sleepMinutes / 60) * 10) / 10) : "");
    setBedtime(settings.targets.bedtime ?? "");
    setWake(settings.targets.wake ?? "");
    setReady(true);
  }, [settings, ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(hours.replace(",", "."));
    await save({
      targets: {
        sleepMinutes: hours && Number.isFinite(h) && h > 0 ? Math.round(h * 60) : null,
        bedtime: bedtime || null,
        wake: wake || null,
      },
    });
    flash();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Moon size={15} className="text-blue" /> Sono
      </h2>
      <p className="text-xs text-ink-3">Quantas horas você quer dormir por noite e a que horas deitar e acordar. A IA avisa quando a sua média sai disso.</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Horas</span>
          <input value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="8" className="input" disabled={!ready} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Deitar às</span>
          <TimeField value={bedtime} onChange={setBedtime} ariaLabel="Hora de deitar" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Acordar às</span>
          <TimeField value={wake} onChange={setWake} ariaLabel="Hora de acordar" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!ready} className="btn btn-primary">
          Salvar meta
        </button>
        {saved && <span className="pill pill-green">Salvo</span>}
      </div>
    </form>
  );
}

function WorkTargetCard({ settings, save }: CardProps) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [ready, setReady] = useState(false);
  const { saved, flash } = useSavedFlag();

  useEffect(() => {
    if (!settings || ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHours(String(Math.floor(settings.dailyGoalMinutes / 60)));
    setMinutes(String(settings.dailyGoalMinutes % 60));
    setReady(true);
  }, [settings, ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const total = Number(hours || 0) * 60 + Number(minutes || 0);
    if (total <= 0) return;
    await save({ dailyGoalMinutes: total });
    flash();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Briefcase size={15} className="text-orange" /> Trabalho por dia
      </h2>
      <p className="text-xs text-ink-3">Quanto tempo você quer trabalhar por dia. A sessão de trabalho usa isso quando as tarefas do dia não têm estimativa.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Horas</span>
          <input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input w-20" disabled={!ready} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Minutos</span>
          <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input w-20" disabled={!ready} />
        </label>
        <button type="submit" disabled={!ready} className="btn btn-primary">
          Salvar meta
        </button>
        {saved && <span className="pill pill-green">Salvo</span>}
      </div>
    </form>
  );
}

function LeisureTargetCard({ settings, save }: CardProps) {
  const [minutes, setMinutes] = useState("");
  const [ready, setReady] = useState(false);
  const { saved, flash } = useSavedFlag();

  useEffect(() => {
    if (!settings || ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinutes(settings.targets.leisureMinutes ? String(settings.targets.leisureMinutes) : "");
    setReady(true);
  }, [settings, ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(minutes);
    await save({ targets: { leisureMinutes: minutes && Number.isFinite(n) && n > 0 ? Math.round(n) : null } });
    flash();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Gamepad2 size={15} className="text-green" /> Lazer por dia
      </h2>
      <p className="text-xs text-ink-3">Quantos minutos de lazer você quer ter por dia. Entra na performance do dashboard.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Minutos</span>
          <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="60" className="input w-28" disabled={!ready} />
        </label>
        <button type="submit" disabled={!ready} className="btn btn-primary">
          Salvar meta
        </button>
        {saved && <span className="pill pill-green">Salvo</span>}
      </div>
    </form>
  );
}

const PERF_PRESETS = [60, 70, 80, 90];

function PerformanceTargetCard({ settings, save }: CardProps) {
  const [value, setValue] = useState("");
  const [ready, setReady] = useState(false);
  const { saved, flash } = useSavedFlag();

  useEffect(() => {
    if (!settings || ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(settings.targets.performanceTarget ? String(settings.targets.performanceTarget) : "");
    setReady(true);
  }, [settings, ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    await save({ targets: { performanceTarget: value && Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n)) : null } });
    flash();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Activity size={15} className="text-red" /> Performance que quero alcançar
      </h2>
      <p className="text-xs text-ink-3">Nota de 0 a 100 por dia. Um dia conta na constância quando bate esse nível. Sem meta, vale 70.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Nível</span>
          <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="70" className="input w-24" disabled={!ready} />
        </label>
        <div className="flex gap-1 pb-0.5">
          {PERF_PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setValue(String(p))} className={`pill cursor-pointer ${value === String(p) ? "pill-blue" : ""}`}>
              {p}
            </button>
          ))}
        </div>
        <button type="submit" disabled={!ready} className="btn btn-primary">
          Salvar meta
        </button>
        {saved && <span className="pill pill-green">Salvo</span>}
      </div>
    </form>
  );
}
