import { boardSymbols } from "@/lib/board-icons";

export function SymbolPicker({ value, change }: { value?: string | null; change: (value: string) => void }) {
  return <select className="input !w-auto max-w-full" aria-label="Ícone do quadro" value={value || ""} onChange={e=>change(e.target.value)}>
    <option value="">Ícone do tipo</option>
    {Object.entries(boardSymbols).map(([key,label])=><option key={key} value={key}>{label}</option>)}
  </select>;
}
