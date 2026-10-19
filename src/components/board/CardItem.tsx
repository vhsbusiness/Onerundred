"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Pause, Play } from "lucide-react";
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
  dragging = false,
}: {
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
  const done = Boolean(card.completedAt);
  const spent = card.spentMs + (running ? elapsedSince(card.runningSince, now) : 0);
  const overdue = isOverdue({ ...card, listPriority, listKind }, todayKey);
  const future = !done && card.scheduledFor > todayKey;

  return (
    <div
      className={`group relative rounded-xl border px-3 py-2.5 transition ${
        running
          ? "border-green/35 bg-green/[0.07]"
          : "border-line bg-card hover:border-line-3 hover:bg-card-hover"
      } ${done ? "opacity-60" : ""} ${dragging ? "rotate-[1.5deg] shadow-2xl" : ""}`}
      onClick={onOpen}
      role="button"
    >
      {card.imageIds.length > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl(card.imageIds[0])}
          alt=""
          className="mb-2 h-28 w-full rounded-lg object-cover"
          loading="lazy"
          draggable={false}
        />
      )}
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${p.dot}`} title={`Prioridade ${p.label}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-sm leading-snug ${done ? "line-through" : ""}`}>{card.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            {card.description ? <AlignLeft size={11} className="text-ink-3" /> : null}
            {card.imageIds.length > 1 ? <span>{card.imageIds.length} imagens</span> : null}
            {card.estimatedMinutes ? <span>est. {minutesToLabel(card.estimatedMinutes)}</span> : null}
            {spent > 0 ? (
              <span className={running ? "font-medium text-green" : ""}>{formatDuration(spent)}</span>
            ) : null}
            {overdue ? <span className="pill pill-red px-1.5 py-0 text-[10px]">atrasada</span> : null}
            {future ? <span className="pill px-1.5 py-0 text-[10px]">amanhã</span> : null}
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
              running ? "pill-green border-green/40" : "md:opacity-0 md:group-hover:opacity-100"
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
  card: CardDTO;
  listId: string;
  listPriority: number;
  listKind: string;
  now: number;
  todayKey: string;
  onOpen: () => void;
  onTimer: () => void;
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
