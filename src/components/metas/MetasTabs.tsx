"use client";

import { Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const subtabs = [
  { href: "/metas/projetos", label: "Projetos" },
  { href: "/metas", label: "Metas" },
  { href: "/metas/basicas", label: "Configurações das metas" },
];

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
      <nav aria-label="Seções de metas" className="flex max-w-full flex-wrap items-center gap-1 rounded-full border border-line bg-fill p-1">
        {subtabs.map((t) => {
          const active = pathname === t.href
            || (t.href === "/metas" && pathname.startsWith("/metas/projetos/"))
            || (t.href === "/metas/projetos" && pathname.startsWith("/metas/treinos/"));
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-2 py-2 text-xs transition sm:px-3.5 sm:py-1.5 sm:text-sm ${
                active ? "bg-fill-3 text-ink" : "text-ink-2 hover:text-ink"
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
