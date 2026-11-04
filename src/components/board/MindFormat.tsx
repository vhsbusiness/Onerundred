"use client";

import { useState } from "react";
import { Bold, Eraser, ExternalLink, Link2, Lock, LockOpen, Trash2, Network } from "lucide-react";
import type { MindNodeDTO } from "@/lib/types";
import { MindColors, type ColorHandler } from "./MindColors";

export function MindFormat({ node, change, remove, busy, preview, commit, count = 1, mixed = [], imageOnly = false }: {
  node: MindNodeDTO;
  change: (patch: Partial<MindNodeDTO>) => void;
  remove: () => void;
  busy: boolean;
  preview: ColorHandler;
  commit: ColorHandler;
  count?: number;
  mixed?: (keyof MindNodeDTO)[];
  imageOnly?: boolean;
}) {
  const [editingLink, setEditingLink] = useState(false);
  const [link, setLink] = useState("");
  const [size, setSize] = useState<string | null>(null);
  const root = count === 1 && !node.parentId && !node.detached;
  function saveSize() {
    if (size === null) return;
    const value = Number(size);
    if (Number.isInteger(value) && value >= 8 && value <= 72) change({ fontSize: value });
    setSize(null);
  }
  return <div className="mind-tools mind-format" aria-label={count > 1 ? "Formatação da seleção" : "Formatação do ramo"} role="group">
    {count > 1 && <span className="mind-selection-count">{count} selecionados</span>}
    {!imageOnly && <>
      <select aria-label="Forma do ramo" value={mixed.includes("shape") ? "mixed" : node.shape} onChange={e => change({ shape: e.target.value })}>
        {mixed.includes("shape") && <option value="mixed" disabled>Formas variadas</option>}
        <option value="plain">Sem moldura</option><option value="rounded">Cartão</option>
        <option value="pill">Cápsula</option><option value="rectangle">Retângulo</option>
      </select>
      {root && <button className="mind-tool mind-auto" aria-label="Organizar ramos automaticamente" title="Auto: organiza os ramos ao criar, editar ou remover ideias" aria-pressed={node.autoLayout} disabled={busy} onClick={() => change({ autoLayout: !node.autoLayout })}>
        <Network size={15} /><span className="mind-switch" />Auto
      </button>}
      <MindColors node={node} preview={preview} commit={commit} />
      <button className="mind-tool" title="Negrito" aria-label="Negrito" aria-pressed={mixed.includes("bold") ? "mixed" : node.bold} onClick={() => change({ bold: mixed.includes("bold") || !node.bold })}><Bold size={16} /></button>
      <input className="mind-font-size" aria-label="Tamanho do texto" title="Tamanho do texto (8 a 72 px)" type="number" min={8} max={72}
        placeholder="—" value={size ?? (mixed.includes("fontSize") ? "" : node.fontSize)}
        onChange={e => setSize(e.target.value)} onBlur={saveSize} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
      <button className="mind-tool" title="Editar link" aria-label="Editar link" aria-expanded={editingLink} onClick={() => { setLink(mixed.includes("link") ? "" : node.link); setEditingLink(!editingLink); }}><Link2 size={16} /></button>
      {count === 1 && node.link && <a className="mind-tool" title="Abrir link" aria-label="Abrir link" href={node.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /></a>}
    </>}
    {imageOnly && count === 1 && <>
      <span className="px-2 text-xs">Imagem</span>
      <button className="mind-tool" aria-label="Diminuir imagem" disabled={node.imageWidth <= 48 || node.imageHeight <= 48} onClick={() => change({ imageWidth: Math.max(24, Math.round(node.imageWidth * .8)), imageHeight: Math.max(24, Math.round(node.imageHeight * .8)) })}>−</button>
      <button className="mind-tool" aria-label="Aumentar imagem" disabled={Math.max(node.imageWidth, node.imageHeight) >= 640} onClick={() => change({ imageWidth: Math.round(node.imageWidth * 1.25), imageHeight: Math.round(node.imageHeight * 1.25) })}>+</button>
    </>}
    <button className="mind-tool" title="Fixar posição" aria-label="Fixar posição" aria-pressed={mixed.includes("locked") ? "mixed" : node.locked} onClick={() => change({ locked: mixed.includes("locked") || !node.locked })}>{node.locked ? <Lock size={15} /> : <LockOpen size={15} />}</button>
    {!imageOnly && <button className="mind-tool" title="Limpar estilo" aria-label="Limpar estilo" onClick={() => change({ bold: false, textColor: "", highlight: "", shape: "plain", fontSize: 14 })}><Eraser size={15} /></button>}
    {!root && <button className="mind-tool" disabled={busy} title={count > 1 ? "Excluir seleção" : "Excluir ramo"} aria-label={count > 1 ? "Excluir seleção" : "Excluir ramo"} onClick={remove}><Trash2 size={15} /></button>}
    {editingLink && <form className="flex w-full gap-1 border-t border-line pt-1" onSubmit={e => { e.preventDefault(); change({ link: link.trim() }); setEditingLink(false); }}>
      <input className="input min-w-0 flex-1" aria-label="Endereço do link" autoFocus type="url" pattern="https?://.+" maxLength={2048} placeholder="https://" value={link} onChange={e => setLink(e.target.value)} />
      <button className="mind-tool">Salvar link</button>
      <button type="button" className="mind-tool" onClick={() => { change({ link: "" }); setEditingLink(false); }}>Remover</button>
    </form>}
  </div>;
}
