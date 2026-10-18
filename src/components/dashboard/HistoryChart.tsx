"use client";

import { useState } from "react";
import { scoreTone } from "@/lib/metrics";
import { keyToDate, weekdayShort } from "@/lib/time";
import type { HistoryPoint } from "@/lib/types";

const TONE_FILL = {
  green: "var(--color-green-deep)",
  blue: "var(--color-blue-deep)",
  orange: "var(--color-orange-deep)",
  neutral: "rgba(255,255,255,0.08)",
} as const;

/** Barras dos últimos 14 dias. Uma única medida (nota do dia), colorida pela faixa. */
export function HistoryChart({ history, todayKey }: { history: HistoryPoint[]; todayKey: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 560;
  const H = 180;
  const padL = 28;
  const padR = 8;
  const padT = 10;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = history.length;
  const slot = innerW / n;
  const barW = Math.min(26, slot * 0.6);

  const y = (v: number) => padT + innerH - (v / 100) * innerH;

  const hovered = hover !== null ? history[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Nota diária dos últimos 14 dias">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            <text x={padL - 6} y={y(g) + 3.5} fontSize={10} textAnchor="end" fill="var(--color-ink-3)">
              {g}
            </text>
          </g>
        ))}

        {history.map((p, i) => {
          const cx = padL + slot * i + slot / 2;
          const x = cx - barW / 2;
          const isToday = p.key === todayKey;
          const tone = scoreTone(p.score);
          const v = p.score ?? 0;
          const top = y(v);
          const h = Math.max(p.score === null ? 0 : 3, padT + innerH - top);
          const d = keyToDate(p.key).getDate();
          return (
            <g
              key={p.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            >
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {p.score === null ? (
                <line
                  x1={x}
                  x2={x + barW}
                  y1={padT + innerH - 1}
                  y2={padT + innerH - 1}
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
              ) : (
                <rect
                  x={x}
                  y={padT + innerH - h}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={TONE_FILL[tone]}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {isToday && (
                <rect
                  x={x - 3}
                  y={padT + innerH - h - 3}
                  width={barW + 6}
                  height={h + 6}
                  rx={6}
                  fill="none"
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
              )}
              <text
                x={cx}
                y={H - 10}
                fontSize={10}
                textAnchor="middle"
                fill={isToday ? "var(--color-ink)" : "var(--color-ink-3)"}
                fontWeight={isToday ? 600 : 400}
              >
                {weekdayShort(p.key)} {d}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line-2 bg-surface-3 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%` }}
        >
          <div className="font-medium">
            {weekdayShort(hovered.key)}, {keyToDate(hovered.key).toLocaleDateString("pt-BR")}
          </div>
          <div className="mt-0.5 text-ink-2">
            {hovered.score === null ? "Sem tarefas" : `${hovered.score}% · ${hovered.doneCount} feitas · ${hovered.openCount} abertas`}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-green-deep" /> ≥ 80%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-deep" /> 50–79%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-orange-deep" /> &lt; 50%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 border-t border-dashed border-white/30" /> sem tarefas
        </span>
      </div>
    </div>
  );
}
