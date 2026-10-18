"use client";

import { Archive, Bell, Gamepad2, LayoutDashboard, LogOut, Moon, Settings, ShieldCheck, SquareKanban, Target, UserRound } from "lucide-react";
import { Avatar } from "@/components/profile/ProfilePage";
import { InviteBell } from "@/components/InviteBell";
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
  { href: "/lembretes", label: "Lembretes", short: "Lembretes", icon: Bell },
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

/** Data e hora atuais, atualizadas a cada 30 s (só após montar, para não divergir do servidor). */
function Clock() {
  const [full, setFull] = useState<string>("");
  const [short, setShort] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hhmm = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setFull(`${formatDayLong(todayKey())} · ${hhmm}`);
      setShort(`${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${hhmm}`);
    };
    // Sincroniza o relógio com a hora do navegador ao montar e a cada 30 s.
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  // Notebook: só dia/mês e hora; telas largas: data por extenso.
  return (
    <>
      <span className="hidden whitespace-nowrap text-sm text-ink-2 tabular-nums lg:inline 2xl:hidden">{short}</span>
      <span className="hidden whitespace-nowrap text-sm text-ink-2 tabular-nums 2xl:inline">{full || formatDayLong(todayKey())}</span>
    </>
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
        <Avatar me={me} size={28} />
        <span className="hidden max-w-[140px] truncate 2xl:inline">{me.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-line-2 bg-surface-3 p-1 text-sm shadow-2xl">
          <div className="px-2 py-1.5">
            <div className="truncate font-medium">{me.name}</div>
            <div className="truncate text-xs text-ink-3">@{me.username} · {me.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link href="/perfil" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06]">
            <UserRound size={14} className="text-ink-3" /> Meu perfil
          </Link>
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

/** Barra inferior do celular, estilo app: só as abas principais. */
const MOBILE_TABS = ["/", "/quadros", "/metas", "/sono", "/lazer", "/lembretes"];

function BottomNav({
  tabs: items,
  isActive,
}: {
  tabs: { href: string; label: string; short: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[];
  isActive: (href: string) => boolean;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 px-2 pt-1.5 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}
      aria-label="Navegação principal"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between">
        {items.map((t) => {
          const Icon = t.icon;
          const active = isActive(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 text-[11px] transition ${
                  active ? "text-ink" : "text-ink-3"
                }`}
              >
                <span className={`flex h-8 w-11 items-center justify-center rounded-full ${active ? "bg-white/[0.1]" : ""}`}>
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {t.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Cache do usuário logado entre navegações (evita uma chamada por página). */
let meCache: MeDTO | null | undefined;

export function Nav() {
  const pathname = usePathname();
  const [me, setMe] = useState<MeDTO | null>(meCache ?? null);

  useEffect(() => {
    if (pathname === "/login") return;
    const load = () =>
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
        .then((d) => {
          const next: MeDTO | null = d?.user ?? null;
          // Só guarda no cache quando há usuário; erro ou sessão ausente tentam de novo na próxima página.
          meCache = next ?? undefined;
          setMe(next);
        })
        .catch(() => {});
    if (!meCache) load();
    window.addEventListener("me-changed", load);
    return () => window.removeEventListener("me-changed", load);
  }, [pathname]);

  if (pathname === "/login") return null;

  const allTabs = me?.role === "admin" ? [...tabs, { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck }] : tabs;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
    <BottomNav tabs={allTabs.filter((t) => MOBILE_TABS.includes(t.href))} isActive={isActive} />
    <header className="sticky z-30 mb-6 pt-3" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="card w-full bg-surface/90 px-4 py-2.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md sm:px-5">
        <div className="flex min-h-11 items-center gap-3 lg:gap-4 2xl:gap-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-white/[0.03] p-1 md:flex 2xl:gap-1">
          {allTabs.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] transition lg:px-2.5 2xl:px-3.5 2xl:text-sm ${
                  active ? "bg-white/[0.08] text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
          <WorkIndicator />
          <Clock />
          {me && <InviteBell />}
          {me && <UserMenu me={me} />}
        </div>
        </div>

      </div>
    </header>
    </>
  );
}
