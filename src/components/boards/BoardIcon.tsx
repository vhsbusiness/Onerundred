import type { ReactNode } from "react";
import { isBoardSymbol, type BoardSymbol } from "@/lib/board-icons";
import type { BoardType } from "@/lib/types";

type Glyph = { tone: string; art: ReactNode };
const glyphs: Record<BoardType | BoardSymbol, Glyph> = {
  tasks: { tone: "text-orange", art: <>
    <rect x="7" y="4" width="18" height="22" rx="4" transform="rotate(-12 16 16)" opacity=".35" />
    <rect x="9" y="7" width="18" height="22" rx="4" />
    <path className="board-icon-cut" d="m13 14 1.6 1.7 3-3.5M20 14h3M14 20h9M14 24h6" />
  </> },
  organization: { tone: "text-blue", art: <>
    <path d="M3 8a3 3 0 0 1 3-3h7l3 3h9a3 3 0 0 1 3 3v13H4z" opacity=".48" />
    <path d="m7 13 17-2 .6 8-17 2z" fill="var(--color-surface)" />
    <path d="M6 14h21c1.5 0 2.3 1.1 2 2.5l-2 9a3 3 0 0 1-3 2.4H7a3 3 0 0 1-3-2.4l-1.5-8.8C2.2 15.2 3.7 14 6 14Z" />
    <path className="board-icon-cut" d="M9 21h7" />
  </> },
  mindmap: { tone: "text-green", art: <>
    <path fill="none" stroke="currentColor" strokeWidth="2.3" d="M6 16h6c6 0 2-10 10-10h3M12 16h15M12 16c7 0 2 10 10 10h3" />
    <rect x="1.5" y="12.5" width="9" height="7" rx="3" /><circle cx="25" cy="6" r="3.5" /><circle cx="27" cy="16" r="3" opacity=".65" /><circle cx="25" cy="26" r="3.5" />
  </> },
  star: { tone: "text-orange", art: <>
    <path d="m16 2.7 4.1 8.2 9.1 1.4-6.6 6.4 1.6 9.2-8.2-4.3-8.2 4.3 1.6-9.2-6.6-6.4 9.1-1.4z" />
    <path d="m16 7-2.4 7.1-5.5-.5 5-1.2z" fill="var(--color-surface)" opacity=".72" />
  </> },
  rocket: { tone: "text-red", art: <>
    <path d="m12 11-6 1-4 7 9-1 3 5 1 7 6-6 1-6z" opacity=".5" />
    <path d="M8.5 17C11.5 9 19.3 3.8 28.3 3.4c-.2 9.7-5.7 16.7-14 20.2z" />
    <circle cx="21.2" cy="10.8" r="2.8" fill="var(--color-surface)" /><path d="M9 22c-3 .3-5.2 3.3-5.4 6.5 3.5-.6 6-2.4 7.2-5.2z" />
  </> },
  briefcase: { tone: "text-orange", art: <>
    <path fill="none" stroke="currentColor" strokeWidth="2.7" d="M11 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
    <rect x="3" y="9" width="26" height="18" rx="4" opacity=".56" />
    <path d="M3 12a3 3 0 0 1 3-3h20a3 3 0 0 1 3 3v4c-8 4-18 4-26 0z" /><rect x="14" y="15.5" width="4" height="5" rx="1.3" fill="var(--color-surface)" />
  </> },
  book: { tone: "text-blue", art: <>
    <path d="M3 6q7-2 12 2v20q-5-4-12-2z" /><path d="M17 8q5-4 12-2v20q-7-2-12 2z" opacity=".67" />
    <path className="board-icon-cut" d="m6.5 12 5 1m-5 4 5 1" />
  </> },
  target: { tone: "text-green", art: <>
    <circle cx="15" cy="17" r="12" opacity=".32" /><circle cx="15" cy="17" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="15" cy="17" r="3.8" /><path stroke="currentColor" strokeWidth="2.6" d="m15 17 11-12" /><path d="m21 9 1-6 3.2 1.5L29 6l-4 4z" />
  </> },
  heart: { tone: "text-red", art: <>
    <path d="M16 27C13 24.5 3 18.3 3 11.2 3 4.8 11 2 16 8c5-6 13-3.2 13 3.2 0 7.1-10 13.3-13 15.8Z" />
    <path className="board-icon-cut" d="M7.4 11.8c0-2.2 1-3.5 3.2-3.6" opacity=".72" />
  </> },
};

export function BoardIcon({ type, symbol, size = 18 }: { type: string; symbol?: string | null; size?: number }) {
  const key = isBoardSymbol(symbol) ? symbol : type === "mindmap" || type === "organization" ? type : "tasks";
  const { art, tone } = glyphs[key];
  return <svg data-board-icon={key} aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" className={`shrink-0 ${tone}`}
    fill="currentColor" strokeLinecap="round" strokeLinejoin="round">{art}</svg>;
}
