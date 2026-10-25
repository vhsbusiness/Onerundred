"use client";

import { Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/client";
import { TimeField } from "@/components/ui/TimeField";
import type { SettingsDTO, TargetsDTO } from "@/lib/types";

function useTargets() {
  const [targets, setTargets] = useState<TargetsDTO | null>(null);
  const load = useCallback(async () => {
    const s = await http.get<SettingsDTO>("/api/settings");
    setTargets(s.targets);
  }, []);
  useEffect(() => {
    // Busca inicial (setState após o await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  async function save(patch: Partial<TargetsDTO>) {
    const s = await http.patch<SettingsDTO>("/api/settings", { targets: patch });
    setTargets(s.targets);
  }
  return { targets, save };
}

/** Meta de sono: horas por noite, hora de deitar e de acordar. Entra na performance do dashboard. */
export function SleepTargetCard() {
  const { targets, save } = useTargets();
  const [hours, setHours] = useState("");
  const [bedtime, setBedtime] = useState("");
  const [wake, setWake] = useState("");
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!targets || ready) return;
    // Preenche o formulário uma vez com o que está salvo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHours(targets.sleepMinutes ? String(Math.round((targets.sleepMinutes / 60) * 10) / 10) : "");
    setBedtime(targets.bedtime ?? "");
    setWake(targets.wake ?? "");
    setReady(true);
  }, [targets, ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(hours.replace(",", "."));
    await save({
      sleepMinutes: hours && Number.isFinite(h) && h > 0 ? Math.round(h * 60) : null,
      bedtime: bedtime || null,
      wake: wake || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Target size={15} className="text-blue" /> Meta de sono
      </h2>
      <p className="text-xs text-ink-3">Usada na performance do dashboard: horas dormidas e pontualidade ao deitar e acordar.</p>
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

/** Meta de lazer por dia (minutos). Entra na performance do dashboard. */
export function LeisureTargetCard() {
  const { targets, save } = useTargets();
  const [minutes, setMinutes] = useState("");
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!targets || ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinutes(targets.leisureMinutes ? String(targets.leisureMinutes) : "");
    setReady(true);
  }, [targets, ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(minutes);
    await save({ leisureMinutes: minutes && Number.isFinite(n) && n > 0 ? Math.round(n) : null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Target size={15} className="text-green" /> Meta de lazer por dia
      </h2>
      <p className="text-xs text-ink-3">Quantos minutos de lazer você quer ter por dia. Entra na performance do dashboard.</p>
      <div className="flex items-end gap-2">
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
