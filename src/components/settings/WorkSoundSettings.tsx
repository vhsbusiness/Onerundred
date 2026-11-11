import { useState, type FormEvent } from "react";
import { Volume2 } from "lucide-react";
import { http } from "@/lib/client";
import { notifyChimeSettingsChanged } from "@/lib/work-chime";
import { MAX_CHIME_MINUTES, validChimeInterval, type WorkChimeSettings } from "@/lib/work-chime-settings";
import type { SettingsDTO } from "@/lib/types";

export function WorkSoundSettings({ initial }: { initial: WorkChimeSettings }) {
  const [saved, setSaved] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [minutes, setMinutes] = useState(String(initial.intervalMinutes));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const interval = Number(minutes);
  const dirty = enabled !== saved.enabled || interval !== saved.intervalMinutes;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const intervalMinutes = enabled || validChimeInterval(interval) ? interval : saved.intervalMinutes;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await http.patch<SettingsDTO>("/api/settings", { workChime: { enabled, intervalMinutes } });
      setSaved(result.workChime);
      setMinutes(String(result.workChime.intervalMinutes));
      notifyChimeSettingsChanged();
      setMessage("Preferência salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card min-w-0 p-5">
    <h2 className="flex items-center gap-2 text-base font-semibold"><Volume2 size={17} className="text-blue" /> Som da sessão de trabalho</h2>
    <form onSubmit={save} onChange={() => { setMessage(""); setError(""); }}>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" role="switch" className="h-4 w-4 accent-blue" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Ativar aviso sonoro
        </label>
        <label className="block text-sm text-ink-2">Intervalo entre sons (minutos)
          <input className="input mt-1 block max-w-36 disabled:opacity-50" type="number" inputMode="numeric" required min={1} max={MAX_CHIME_MINUTES}
            step={1} disabled={!enabled} value={minutes} onChange={e => setMinutes(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn" disabled={!dirty}>{busy ? "Salvando…" : "Salvar som"}</button>
          <span role="status" className="text-xs text-ink-2">{message}</span>
          {error && <span role="alert" className="text-sm text-red">{error}</span>}
        </div>
      </fieldset>
    </form>
  </section>;
}
