"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ListKind } from "@/lib/types";

export const KIND_LABEL: Record<ListKind, string> = {
  normal: "Normal",
  today: "Hoje",
  tomorrow: "Amanhã",
  done: "Feitas",
};

export const columnClass = "board-column card flex max-h-full w-[86vw] max-w-[300px] shrink-0 snap-start flex-col bg-list transition md:w-[300px]";

export function BoardFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col [--board-offset:11.5rem] md:[--board-offset:7.5rem]"
      style={{ height: "calc(100dvh - var(--board-offset) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))" }}
    >
      {children}
    </div>
  );
}

export function BoardScroller({ children }: { children: ReactNode }) {
  const [panning, setPanning] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; left: number } | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function updateEdges() {
      if (!scroller) return;
      const left = scroller.scrollLeft > 1;
      const right = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1;
      setEdges(current => current.left === left && current.right === right ? current : { left, right });
    }

    const frame = requestAnimationFrame(updateEdges);
    const resize = new ResizeObserver(updateEdges);
    const children = new MutationObserver(updateEdges);
    resize.observe(scroller);
    children.observe(scroller, { childList: true });
    scroller.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      children.disconnect();
      scroller.removeEventListener("scroll", updateEdges);
    };
  }, []);

  // Rolagem lateral arrastando o mouse em qualquer área vazia do quadro.
  function onPanStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || !scrollerRef.current) return;
    if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
    panRef.current = { x: e.clientX, left: scrollerRef.current.scrollLeft };
    setPanning(true);
    e.preventDefault();
  }
  function onPanMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!panRef.current || !scrollerRef.current) return;
    scrollerRef.current.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
  }
  function onPanEnd() {
    panRef.current = null;
    setPanning(false);
  }

  return (
    <div className="board-viewport relative min-h-0 flex-1" data-edge-left={edges.left} data-edge-right={edges.right}>
      <div
        ref={scrollerRef}
        onMouseDown={onPanStart}
        onMouseMove={onPanMove}
        onMouseUp={onPanEnd}
        onMouseLeave={onPanEnd}
        className={`board-scroller mx-[calc(50%_-_50vw)] flex h-full min-h-0 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-[calc(50vw_-_50%_+_1rem)] pb-4 sm:px-[calc(50vw_-_50%_+_1.5rem)] md:snap-none md:gap-4 ${panning ? "cursor-grabbing select-none" : "cursor-grab"}`}
      >
        {children}
      </div>
    </div>
  );
}
