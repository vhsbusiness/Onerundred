"use client";
import { useState } from "react";
import type { MindNodeDTO } from "@/lib/types";
import { mindBranchIds } from "@/lib/mind-tree";
import { GitBranchPlus, Unplug } from "lucide-react";
export function MindConnect({ node, nodes, busy, connect }: { node: MindNodeDTO; nodes: MindNodeDTO[]; busy: boolean; connect: (id: string | null) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const excluded = mindBranchIds(nodes, [node.id]);
  const choices = nodes.filter(n => !excluded.has(n.id) && !n.imageData && !n.drawing && n.id !== node.parentId && n.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <button className="mind-tool" title="Conectar a outro ramo" aria-label="Conectar a outro ramo" aria-expanded={open} onClick={() => setOpen(!open)}><GitBranchPlus size={15} /></button>
    {open && <div className="mind-connect">
      <input className="input" autoFocus aria-label="Buscar ramo de destino" placeholder="Buscar ramo de destino…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="mind-connect-results">
        {node.parentId && <button className="mind-tool" disabled={busy} onClick={() => { connect(null); setOpen(false); }}><Unplug size={14} />Tornar ramo independente</button>}
        {choices.slice(0, 30).map(n => <button className="mind-tool" key={n.id} disabled={busy} title={n.title} onClick={() => { connect(n.id); setOpen(false); }}><span className="truncate">{n.title}</span><small>{n.parentId ? "Ramo" : "Inicial"}</small></button>)}
        {!choices.length && <p className="p-2 text-xs">Nenhum outro ramo encontrado.</p>}
      </div>
    </div>}
  </>;
}
