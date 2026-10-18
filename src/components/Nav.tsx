"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDayLong, todayKey } from "@/lib/time";
import type { MeDTO } from "@/lib/types";

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

function UserMenu({ me }: { me: MeDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-3 text-sm transition hover:bg-white/[0.06]"
        aria-label="Menu do usuário"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange to-blue text-[11px] font-semibold uppercase text-bg">
          {me.name.slice(0, 2)}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{me.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-line-2 bg-surface-3 p-1 text-sm shadow-2xl">
          <div className="px-2 py-1.5">
            <div className="truncate font-medium">{me.name}</div>
            <div className="truncate text-xs text-ink-3">@{me.username} · {me.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          {me.role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06]"
            >
              <ShieldCheck size={14} className="text-green" /> Painel admin
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"
          >
            <LogOut size={14} className="text-ink-3" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [me, setMe] = useState<MeDTO | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => {});
  }, [pathname]);

  if (pathname === "/login") return null;

  const allTabs = me?.role === "admin" ? [...tabs, { href: "/admin", label: "Admin" }] : tabs;

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-line bg-bg/70 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/[0.03] p-1 md:flex">
          {allTabs.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
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

        <div className="ml-auto flex items-center gap-3">
          <WorkIndicator />
          <span className="hidden text-sm text-ink-2 lg:inline">{formatDayLong(todayKey())}</span>
          {me && <UserMenu me={me} />}
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto pb-2 md:hidden">
        {allTabs.map((t) => {
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
