"use client";

import { useState } from "react";
import { Bold, Circle, ExternalLink, Highlighter, Link2, Lock, LockOpen, Type } from "lucide-react";
import type { MindNodeDTO } from "@/lib/types";

const fallback: Record<string, string> = { orange: "#f5b06e", blue: "#7fb7f5", green: "#8be3a6", red: "#f5838c" };
export function MindFormat({ node, change }: { node: MindNodeDTO; change: (patch: Partial<MindNodeDTO>) => void }) {
  const [linkForm, showLink] = useState(false);
  const [link, setLink] = useState("");
  return <div aria-label="Formatação do ramo" role="group" className="flex flex-wrap items-center gap-1 border-t border-line bg-surface-2 px-2 py-1.5">
    <select aria-label="Forma do ramo" className="input !w-auto !p-1.5 text-xs" value={node.shape} onChange={e => change({shape:e.target.value})}>
      <option value="rounded">Cartão</option><option value="pill">Cápsula</option><option value="plain">Sem moldura</option>
    </select>
    {(["color", "textColor", "highlight"] as const).map(key => {
      const [label, Icon] = key === "color" ? ["Cor do ramo", Circle] as const : key === "highlight" ? ["Marca-texto", Highlighter] as const : ["Cor do texto", Type] as const;
      return <label key={key} title={label} className="btn relative cursor-pointer !px-2">
        <Icon size={16} style={{color: node[key]?.startsWith("#") ? node[key] : undefined}} />
        <input aria-label={label} type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={fallback[node[key]] ?? (node[key] || (key === "highlight" ? "#ffe5ae" : "#30343a"))} onChange={e=>change({[key]:e.target.value})} />
      </label>;
    })}
    <button className="btn !px-2" aria-label="Negrito" aria-pressed={node.bold} onClick={()=>change({bold:!node.bold})}><Bold size={16} /></button>
    <select aria-label="Tamanho do texto" className="input !w-auto !p-1.5 text-xs" value={node.fontSize} onChange={e=>change({fontSize:Number(e.target.value)})}>{[12,14,16,20].map(s=><option key={s} value={s}>{s} px</option>)}</select>
    <button aria-label="Editar link" title="Editar link" className="btn !px-2" onClick={()=>{setLink(node.link);showLink(!linkForm);}}><Link2 size={16} /></button>
    {node.link && <a aria-label="Abrir link" title="Abrir link" className="btn !px-2" href={node.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/></a>}
    <button className="btn !px-2" aria-label="Fixar posição" title="Fixar posição" aria-pressed={node.locked} onClick={()=>change({locked:!node.locked})}>{node.locked ? <Lock size={15}/> : <LockOpen size={15}/>}</button>
    <button className="btn btn-ghost text-xs" onClick={()=>change({bold:false,textColor:"",highlight:"",shape:"rounded",fontSize:14})}>Limpar estilo</button>
    {linkForm && <form className="flex w-full flex-wrap gap-1" onSubmit={e=>{e.preventDefault();change({link:link.trim()});showLink(false);}}>
      <input className="input min-w-0 flex-1" aria-label="Endereço do link" autoFocus type="url" pattern="https?://.+" maxLength={2048} placeholder="https://" value={link} onChange={e=>setLink(e.target.value)} />
      <button className="btn">Salvar link</button><button type="button" className="btn btn-ghost" onClick={()=>{change({link:""});showLink(false);}}>Remover link</button>
    </form>}
  </div>;
}
