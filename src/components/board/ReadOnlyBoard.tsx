"use client";

import { BoardIcon } from "@/components/boards/BoardIcon";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { BoardEditButton } from "@/components/settings/BoardEditButton";
import { DescriptionEditor } from "@/components/ui/DescriptionEditor";
import { Modal } from "@/components/ui/Modal";
import { elapsedSince, priorityUi, useNow } from "@/lib/client";
import { imageUrl } from "@/lib/images";
import { formatDayLong, formatDuration, minutesToLabel } from "@/lib/time";
import type { CardDTO, ListDTO, MindNodeDTO } from "@/lib/types";
import { BoardFrame, BoardScroller, columnClass, KIND_LABEL } from "./BoardLayout";
import { MindMap } from "./MindMap";
import { CardBody } from "./CardItem";

export function ReadOnlyBoard({ viewerId, name, symbol, organization, lists, mindNodes, collaborationId, boardId, pending, today }: {
  viewerId: string; symbol?: string | null; name: string; organization: boolean; lists: ListDTO[]; collaborationId: string;
  mindNodes?: MindNodeDTO[];
  boardId: string; pending: boolean; today: string;
}) {
  const [selected, select] = useState<CardDTO | null>(null);
  const now = useNow(lists.some(list => list.cards.some(card => card.runningSince)), 10000);
  return <BoardFrame>
    <header className="mb-4 flex flex-wrap items-center gap-3">
      <Link href={`/configuracoes/colaboradores/${collaborationId}`} className="btn btn-ghost h-8 px-2" aria-label="Voltar ao relatório" title="Voltar ao relatório"><ArrowLeft size={16} /></Link>
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
      <span className="pill"><BoardIcon symbol={symbol} type={mindNodes ? "mindmap" : organization ? "organization" : "tasks"} />{mindNodes ? "Mapa mental" : organization ? "Organização" : "Lista de tarefas"}</span>
      <span className="pill"><LockKeyhole size={12} /> Somente leitura</span>
      <div className="sm:ml-auto"><BoardEditButton collaborationId={collaborationId} boardId={boardId} pending={pending} /></div>
    </header>
    {mindNodes ? <MindMap key={boardId} viewerId={viewerId} boardId={boardId} nodes={mindNodes} /> : <BoardScroller>
      {lists.map(list => {
        const priority = priorityUi(list.priority);
        const count = organization || list.kind === "done" ? list.cards.length : list.cards.filter(card => !card.completedAt).length;
        return <section key={list.id} data-no-pan className={columnClass}>
          <header className="flex items-center gap-2 px-3 pb-2 pt-3">
            <h2 className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{list.name}<span className="ml-2 text-xs font-normal text-ink-3">{count}</span></h2>
            {list.kind !== "done" && <span className={priority.pill}>{priority.label}</span>}
            {!organization && list.kind !== "normal" && <span className="pill">{KIND_LABEL[list.kind]}</span>}
          </header>
          <div className="min-h-[40px] flex-1 space-y-2 overflow-y-auto px-3 pb-2">
            {list.cards.map(card => <CardBody key={card.id} card={card} listPriority={list.priority} listKind={list.kind} now={now} todayKey={today}
              organization={organization} collaborationId={collaborationId} onOpen={() => select(card)} />)}
            {!list.cards.length && <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">Sem tarefas</p>}
          </div>
        </section>;
      })}
      {!lists.length && <p className="text-sm text-ink-3">Este quadro ainda não tem listas.</p>}
    </BoardScroller>}
    {selected && <Modal wide open onClose={() => select(null)} title={<h2 className="font-semibold [overflow-wrap:anywhere]">{selected.title}</h2>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><span className={priorityUi(selected.priority).pill}>{priorityUi(selected.priority).label}</span>
          {selected.labels.map(label => <span key={label.name} className={`pill pill-${label.color}`}>{label.name}</span>)}</div>
        {selected.description && <section><h3 className="label mb-2">Descrição</h3><DescriptionEditor key={selected.id} value={selected.description} readOnly /></section>}
        {selected.checklist.length > 0 && <section><h3 className="label mb-2">Checklist</h3><ul className="space-y-1">{selected.checklist.map(item =>
          <li key={item.id} className="flex gap-2 rounded-lg border border-line bg-well px-3 py-2 text-sm [overflow-wrap:anywhere]"><span>{item.done ? "☑" : "☐"}</span><span className={item.done ? "text-ink-3 line-through" : ""}>{item.text}</span></li>)}</ul></section>}
        {selected.imageIds.length > 0 && <section><h3 className="label mb-2">Imagens</h3><div className="flex flex-wrap gap-2">{selected.imageIds.map((id, index) =>
          <a key={id} href={imageUrl(id, collaborationId)} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(id, collaborationId)} alt={`Abrir imagem ${index + 1}`} className="h-24 w-32 rounded-lg object-cover" />
          </a>)}</div></section>}
        <div className="flex flex-wrap gap-3 text-sm text-ink-2">
          <span>Lista · {lists.find(list => list.id === selected.listId)?.name}</span>
          {!organization && <><span>Dia · {formatDayLong(selected.scheduledFor)}</span>
            {selected.estimatedMinutes !== null && <span>Estimativa · {minutesToLabel(selected.estimatedMinutes)}</span>}
            <span>Tempo na tarefa · {formatDuration(selected.spentMs + elapsedSince(selected.runningSince, now))}</span></>}
        </div>
      </div>
    </Modal>}
  </BoardFrame>;
}
