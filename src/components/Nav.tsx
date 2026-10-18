"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { formatDayLong, todayKey } from "@/lib/time";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/quadros", label: "Quadros" },
  { href: "/arquivadas", label: "Arquivadas" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 28 28" className="h-7 w-7">
          <rect x="3" y="15" width="6" height="10" rx="2" fill="#f5b06e" transform="skewX(-12)" />
          <rect x="11" y="9" width="6" height="16" rx="2" fill="#8be3a6" transform="skewX(-12)" />
          <rect x="19" y="3" width="6" height="22" rx="2" fill="#7fb7f5" transform="skewX(-12)" />
        </svg>
      </span>
      <span className="text-[1.05rem] font-semibold tracking-tight">Onerundred</span>
    </span>
  );
}

function WorkIndicator() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/work", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setRunning(Boolean(data.running));
      } catch {
        /* ignora */
      }
    };
    load();
    const id = setInterval(load, 20000);
    const onChange = () => load();
    window.addEventListener("work-changed", onChange);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("work-changed", onChange);
    };
  }, []);

  if (!running) return null;
  return (
    <span className="pill pill-green">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-green" />
      Trabalhando
    </span>
  );
}

function LogoutButton() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/login", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(Boolean(d?.enabled)))
      .catch(() => {});
  }, []);

  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/login", { method: "DELETE" });
        router.replace("/login");
        router.refresh();
      }}
      className="btn btn-ghost h-8 w-8 p-0"
      aria-label="Sair"
      title="Sair"
    >
      <LogOut size={15} />
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-line bg-bg/70 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/[0.03] p-1 md:flex">
          {tabs.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                  active
                    ? "bg-white/[0.08] text-ink"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <WorkIndicator />
          <span className="hidden text-sm text-ink-2 sm:inline">{formatDayLong(todayKey())}</span>
          <LogoutButton />
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto pb-2 md:hidden">
        {tabs.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3 py-1 text-sm ${active ? "bg-white/[0.08] text-ink" : "text-ink-2"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
