"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, ListChecks, Pause, Play, Repeat } from "lucide-react";
import { taskTimerLabel, taskTimerTone } from "@/lib/task-timer-tone";
import { elapsedSince, priorityUi } from "@/lib/client";
import { isOverdue } from "@/lib/metrics";
import { imageUrl } from "@/lib/images";
import { formatDuration, minutesToLabel } from "@/lib/time";
import type { CardDTO } from "@/lib/types";

export function CardBody({
  card,
  listPriority = 2,
  listKind = "normal",
  now,
  todayKey,
  onOpen,
  onTimer,
  collaborationId,
  dragging = false,
  organization = false,
}: {
  collaborationId?: string;
  organization?: boolean;
  card: CardDTO;
  listPriority?: number;
  listKind?: string;
  now: number;
  todayKey: string;
  onOpen?: () => void;
  onTimer?: () => void;
  dragging?: boolean;
}) {
  const p = priorityUi(card.priority);
  const running = Boolean(card.runningSince);
  const done = !organization && Boolean(card.completedAt);
  const spent = card.spentMs + (running ? elapsedSince(card.runningSince, now) : 0);
  const tone = taskTimerTone(spent, card.estimatedMinutes);
  const overdue = !organization && isOverdue({ ...card, listPriority, listKind }, todayKey);
  const future = !organization && !done && card.scheduledFor > todayKey;
  // Saiu da lista Hoje sem ser feita (ex.: jogada para Amanhã): marcada como realocada.
  const postponed = !organization && !done && !overdue && card.postponedDays.length > 0;

  return (
    <div
      data-task-timer={running && !organization ? tone : undefined}
      className={`task-card group relative rounded-xl border px-3 py-2.5 transition ${
        running
          ? ""
          : "border-line bg-card hover:border-line-3 hover:bg-card-hover"
      } ${done ? "opacity-60" : ""} ${dragging ? "rotate-[1.5deg] shadow-2xl" : ""}`}
      onClick={onOpen}
      role="button"
      tabIndex={collaborationId ? 0 : undefined}
      onKeyDown={collaborationId ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      } : undefined}
    >
      {card.imageIds.length > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl(card.imageIds[0], collaborationId)}
          alt=""
          className="mb-2 h-28 w-full rounded-lg object-cover"
          loading="lazy"
          draggable={false}
        />
      )}
      {card.labels.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{card.labels.map(label => <span key={label.name} className={`pill pill-${label.color} max-w-full break-words text-[10px]`}>{label.name}</span>)}</div>}
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${p.dot}`} title={`Prioridade ${p.label}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-sm leading-snug [overflow-wrap:anywhere] ${done ? "line-through" : ""}`}>{card.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            {card.description ? <AlignLeft size={11} className="text-ink-3" /> : null}
            {card.checklist.length > 0 ? (
              <span
                className={`inline-flex items-center gap-0.5 ${card.checklist.every((i) => i.done) ? "text-green" : ""}`}
                title="Checklist"
              >
                <ListChecks size={11} /> {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
              </span>
            ) : null}
            {card.imageIds.length > 1 ? <span>{card.imageIds.length} imagens</span> : null}
            {!organization && card.estimatedMinutes ? <span>est. {minutesToLabel(card.estimatedMinutes)}</span> : null}
            {!organization && (running || spent > 0) ? (
              <span className={running ? "task-timer-value font-medium" : ""} title={running ? taskTimerLabel[tone] : undefined}>{formatDuration(spent)}</span>
            ) : null}
            {overdue ? <span className="pill pill-red px-1.5 py-0 text-[10px]">atrasada</span> : null}
            {postponed ? <span className="pill pill-orange px-1.5 py-0 text-[10px]">realocada</span> : null}
            {!organization && card.recurring ? (
              <span className="inline-flex items-center text-ink-3" title="Tarefa contínua: repete nos dias escolhidos" aria-label="Tarefa contínua">
                <Repeat size={11} />
              </span>
            ) : null}
            {future && !postponed ? <span className="pill px-1.5 py-0 text-[10px]">amanhã</span> : null}
          </div>
        </div>
        {!done && onTimer && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTimer();
            }}
            className={`btn h-7 w-7 shrink-0 p-0 ${
              running ? "task-timer-control" : "md:opacity-0 md:group-hover:opacity-100"
            }`}
            aria-label={running ? "Pausar cronômetro" : "Iniciar cronômetro"}
            title={running ? "Pausar" : "Iniciar"}
          >
            {running ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function CardItem(props: {
  organization?: boolean;
  card: CardDTO;
  listId: string;
  listPriority: number;
  listKind: string;
  now: number;
  todayKey: string;
  onOpen: () => void;
  onTimer?: () => void;
  onContextMenu?: (e: React.MouseEvent, card: CardDTO) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id,
    data: { type: "card", listId: props.listId },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => {
        if (!props.onContextMenu) return;
        e.preventDefault();
        props.onContextMenu(e, props.card);
      }}
    >
      <CardBody {...props} />
    </div>
  );
}
