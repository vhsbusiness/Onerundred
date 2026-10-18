"use client";

import { Archive, Gamepad2, LayoutDashboard, LogOut, Menu, Moon, Settings, ShieldCheck, SquareKanban, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDayLong, todayKey } from "@/lib/time";
import type { MeDTO } from "@/lib/types";

const tabs = [
  { href: "/", label: "Dashboard", short: "Início", icon: LayoutDashboard },
  { href: "/quadros", label: "Quadros", short: "Quadros", icon: SquareKanban },
  { href: "/metas", label: "Metas", short: "Metas", icon: Target },
  { href: "/sono", label: "Sono", short: "Sono", icon: Moon },
  { href: "/lazer", label: "Lazer", short: "Lazer", icon: Gamepad2 },
  { href: "/arquivadas", label: "Arquivadas", short: "Arquivo", icon: Archive },
  { href: "/configuracoes", label: "Configurações", short: "Config.", icon: Settings },
];


export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 28 28" className="h-7 w-7" fill="currentColor">
          <rect x="3" y="15" width="6" height="10" rx="1.5" />
          <rect x="11" y="9" width="6" height="16" rx="1.5" />
          <rect x="19" y="3" width="6" height="22" rx="1.5" />
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
          <Link href="/arquivadas" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06] md:hidden">
            <Archive size={14} className="text-ink-3" /> Arquivadas
          </Link>
          <Link href="/configuracoes" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06] md:hidden">
            <Settings size={14} className="text-ink-3" /> Configurações
          </Link>
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

function MobileMenu({
  tabs: items,
  isActive,
  me,
}: {
  tabs: { href: string; label: string; short: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[];
  isActive: (href: string) => boolean;
  me: MeDTO | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha ao navegar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary fixed right-4 z-40 h-14 w-14 rounded-full p-0 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="card absolute inset-x-3 bg-surface-2 p-3"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Menu"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-9 w-9 p-0" aria-label="Fechar menu">
                <X size={18} />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {items.map((t) => {
                const Icon = t.icon;
                const active = isActive(t.href);
                return (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                        active ? "border-line-2 bg-white/[0.08] text-ink" : "border-line bg-black/20 text-ink-2"
                      }`}
                    >
                      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                      {t.label}
                    </Link>
                  </li>
                );
              })}
              {me && (
                <li>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-3 text-left text-sm text-ink-2"
                  >
                    <LogOut size={18} strokeWidth={1.8} /> Sair
                  </button>
                </li>
              )}
            </ul>
          </div>
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

  const allTabs = me?.role === "admin" ? [...tabs, { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck }] : tabs;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
    <MobileMenu tabs={allTabs} isActive={isActive} me={me} />
    <header className="sticky top-0 z-30 mb-6 pt-3">
      <div className="card w-full bg-surface/80 px-4 py-2.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:px-5">
        <div className="flex min-h-11 items-center gap-4 sm:gap-6">
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

      </div>
    </header>
    </>
  );
}
