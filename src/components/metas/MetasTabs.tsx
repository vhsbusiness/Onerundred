"use client";

import { Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const subtabs = [{ href: "/metas", label: "Projetos" }];

export function MetasHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Target size={22} className="text-orange" /> {title ?? "Metas"}
        </h1>
        <p className="text-sm text-ink-2">{subtitle ?? "Compromissos de vários dias que você marca dia a dia."}</p>
      </div>
      <nav className="flex items-center gap-1 rounded-full border border-line bg-white/[0.03] p-1">
        {subtabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith("/metas/projetos");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                active ? "bg-white/[0.08] text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
