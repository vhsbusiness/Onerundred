"use client";

import { useState } from "react";
import { Bold, Eraser, ExternalLink, Highlighter, Link2, Lock, LockOpen, Trash2, Type } from "lucide-react";
import type { MindNodeDTO } from "@/lib/types";

const palette: Record<string, string> = { orange: "#f5b06e", blue: "#7fb7f5", green: "#8be3a6", red: "#f08a8a" };

export function MindFormat({ node, change, remove, busy }: {
  node: MindNodeDTO;
  change: (patch: Partial<MindNodeDTO>) => void;
  remove: () => void;
  busy: boolean;
}) {
  const [editingLink, setEditingLink] = useState(false);
  const [link, setLink] = useState("");
  return <div className="mind-tools mind-format" aria-label="Formatação do ramo" role="group">
    <select aria-label="Forma do ramo" value={node.shape} onChange={e => change({ shape: e.target.value })}>
      <option value="plain">Sem moldura</option><option value="rounded">Cartão</option>
      <option value="pill">Cápsula</option><option value="rectangle">Retângulo</option>
    </select>
    {(["color", "textColor", "highlight"] as const).map(key => {
      const label = { color: "Cor do ramo", textColor: "Cor do texto", highlight: "Marca-texto" }[key];
      const value = palette[node[key]] || node[key];
      return <label key={key} title={label} className="mind-tool relative">
        {key === "color" ? <span className="size-4 rounded-full" style={{ background: value }} />
          : key === "textColor" ? <Type size={16} style={{ borderBottom: "2px solid " + (value || "currentColor") }} />
          : <Highlighter size={16} style={{ borderBottom: "2px solid " + (value || "transparent") }} />}
        <input type="color" aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={value || (key === "highlight" ? "#f9df96" : "#30343a")} onChange={e => change({ [key]: e.target.value })} />
      </label>;
    })}
    <button className="mind-tool" title="Negrito" aria-label="Negrito" aria-pressed={node.bold} onClick={() => change({ bold: !node.bold })}><Bold size={16} /></button>
    <select aria-label="Tamanho do texto" value={node.fontSize} onChange={e => change({ fontSize: Number(e.target.value) })}>
      {[12, 14, 16, 20].map(size => <option key={size} value={size}>{size} px</option>)}
    </select>
    <button className="mind-tool" title="Editar link" aria-label="Editar link" aria-expanded={editingLink} onClick={() => { setLink(node.link); setEditingLink(!editingLink); }}><Link2 size={16} /></button>
    {node.link && <a className="mind-tool" title="Abrir link" aria-label="Abrir link" href={node.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /></a>}
    <button className="mind-tool" title="Fixar posição" aria-label="Fixar posição" aria-pressed={node.locked} onClick={() => change({ locked: !node.locked })}>{node.locked ? <Lock size={15} /> : <LockOpen size={15} />}</button>
    <button className="mind-tool" title="Limpar estilo" aria-label="Limpar estilo" onClick={() => change({ bold: false, textColor: "", highlight: "", shape: node.parentId ? "plain" : "rounded", fontSize: 14 })}><Eraser size={15} /></button>
    {node.parentId && <button className="mind-tool" disabled={busy} title="Excluir ramo" aria-label="Excluir ramo" onClick={remove}><Trash2 size={15} /></button>}
    {editingLink && <form className="flex w-full gap-1 border-t border-line pt-1" onSubmit={e => { e.preventDefault(); change({ link: link.trim() }); setEditingLink(false); }}>
      <input className="input min-w-0 flex-1" aria-label="Endereço do link" autoFocus type="url" pattern="https?://.+" maxLength={2048} placeholder="https://" value={link} onChange={e => setLink(e.target.value)} />
      <button className="mind-tool">Salvar link</button>
      {node.link && <button type="button" className="mind-tool" onClick={() => { change({ link: "" }); setEditingLink(false); }}>Remover</button>}
    </form>}
  </div>;
}
