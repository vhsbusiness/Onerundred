import { ACTIVITIES, FIGHT_STYLES, isFightStyle, isWorkout, type Workout } from "@/lib/workouts";

export function SportPicker({ value, onChange }: { value: Workout; onChange: (v: Workout) => void }) {
  const fight = isFightStyle(value);
  return <div className="flex flex-wrap gap-3">
    <label className="min-w-0 flex-1 text-sm">Esporte
      <select aria-label="Esporte" className="input mt-1" value={fight ? "fight" : value} onChange={e => {
        if (e.target.value === "fight") onChange("boxing");
        else if (isWorkout(e.target.value)) onChange(e.target.value);
      }}>
        {Object.entries(ACTIVITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        <option value="fight">Luta</option>
      </select>
    </label>
    {fight && <label className="min-w-0 flex-1 text-sm">Modalidade de luta
      <select aria-label="Modalidade de luta" className="input mt-1" value={value} onChange={e => { if (isFightStyle(e.target.value)) onChange(e.target.value); }}>
        {Object.entries(FIGHT_STYLES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>}
  </div>;
}
