"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";

type Point = { dayKey: string; score: number | null };
const date = (key: string) => `${key.slice(8)}/${key.slice(5, 7)}`;

/** Mesma nota geral já calculada no servidor. Lacunas não viram zero. */
export function PerformanceHistory({ history, target }: { history: Point[]; target: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(560);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [selected, setSelected] = useState(history.length - 1);
  const point = history[selected];
  const valid = history.filter((p) => p.score !== null);
  const change = valid.length >= 2 ? valid[valid.length - 1].score! - valid[0].score! : null;
  const width = Math.max(availableWidth, 280, history.length * 28);
  const x = (i: number) => 36 + i * (width - 56) / Math.max(1, history.length - 1);
  const y = (score: number) => 188 - score * 1.6;
  let path = "";
  let connected = false;
  history.forEach((p, i) => {
    if (p.score === null) { connected = false; return; }
    path += `${connected ? "L" : "M"}${x(i)},${y(p.score)} `;
    connected = true;
  });
  return <section className="card min-w-0 p-4 sm:p-5" aria-label="Evolução da performance">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium"><TrendingUp size={16} className="text-blue" /> Evolução da performance</h2>
        <p className="mt-1 text-xs text-ink-3">{history.length > 0 ? `${date(history[0].dayKey)} a ${date(history[history.length - 1].dayKey)} · ${history.length} dias` : "Sem histórico"}</p>
      </div>
      {change !== null && <span className={`pill ${change > 0 ? "pill-green" : change < 0 ? "pill-orange" : ""}`}>{change > 0 ? "+" : ""}{change} pontos no período</span>}
    </div>
    {!valid.length && <p className="mt-3 text-sm text-ink-3">Ainda não há dados de performance neste intervalo.</p>}
    <div ref={container} className="mt-3 overflow-x-auto rounded-lg" tabIndex={0} aria-label="Gráfico de 0 a 100 pontos. Role para ver todos os dias.">
      <svg width={width} height="224" className="block w-full" style={{ minWidth: width }} role="group" aria-label="Performance diária">
        {[0, 50, 100].map(n => <g key={n}><line x1="30" x2={width - 12} y1={y(n)} y2={y(n)} stroke="var(--color-line)" /><text x="0" y={y(n) + 4} fill="var(--color-ink-3)" fontSize="10">{n}</text></g>)}
        <line x1="30" x2={width - 12} y1={y(target)} y2={y(target)} stroke="var(--color-green)" strokeDasharray="4 5" opacity="0.6" />
        <path d={path} fill="none" stroke="var(--color-blue)" strokeWidth="2.5" strokeLinejoin="round" />
        {history.map((p, i) => <g key={p.dayKey}>
          <a href={`/?dia=${p.dayKey}`} aria-label={`${date(p.dayKey)}: ${p.score === null ? "sem dados" : `${p.score} de 100`}`} onClick={e => { e.preventDefault(); setSelected(i); }} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)}>
            <rect x={x(i) - 13} y="12" width="26" height="188" rx="6" fill={i === selected ? "var(--color-fill-2)" : "transparent"} />
            <circle cx={x(i)} cy={y(p.score ?? 0)} r={i === selected ? 5 : 3.5} fill={p.score === null ? "var(--color-surface)" : "var(--color-blue)"} stroke={p.score === null ? "var(--color-ink-3)" : "var(--color-blue)"} />
            <title>{`${date(p.dayKey)} · ${p.score === null ? "Sem dados" : `${p.score}/100`}`}</title>
          </a>
          {(history.length <= 14 || i % Math.ceil(history.length / 14) === 0 || i === history.length - 1) && <text x={x(i)} y="216" textAnchor="middle" fill="var(--color-ink-3)" fontSize="10">{date(p.dayKey)}</text>}
        </g>)}
      </svg>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-ink-3">Meta: {target}/100 · Toque em um dia para consultar</span>
      {point && <Link href={`/?dia=${point.dayKey}`} className="text-blue hover:underline" aria-live="polite">{date(point.dayKey)} · {point.score === null ? "sem dados" : `${point.score}/100`} · Ver dia →</Link>}
    </div>
    <p className="mt-2 text-[11px] text-ink-3">Inclui tarefas, sono, lazer e metas. Dias sem dados não são considerados zero.{change !== null ? " A variação compara o primeiro e o último dia com dados." : ""}</p>
  </section>;
}
