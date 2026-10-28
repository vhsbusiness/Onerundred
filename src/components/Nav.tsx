"use client";

import { Archive, Bell, ChevronsLeft, ChevronsRight, Gamepad2, LayoutDashboard, LogOut, Moon, Settings, ShieldCheck, SquareKanban, Sun, Target, UserRound } from "lucide-react";
import { Avatar } from "@/components/profile/ProfilePage";
import { InviteBell } from "@/components/InviteBell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDayLong, todayKey } from "@/lib/time";
import { isTheme, type Theme, isDesign } from "@/lib/theme";
import { applyDesign, applyTheme, currentDesign, currentTheme } from "@/lib/theme-client";
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


export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 28 28" className="h-7 w-7" fill="currentColor">
          <rect x="3" y="15" width="6" height="10" rx="1.5" />
          <rect x="11" y="9" width="6" height="16" rx="1.5" />
          <rect x="19" y="3" width="6" height="22" rx="1.5" />
        </svg>
      </span>
      {/* compact: até o tablet só o ícone, para sobrar espaço no cabeçalho. */}
      <span className={`logo-word text-[1.05rem] font-semibold tracking-tight ${compact ? "hidden xl:inline" : ""}`}>Onerundred</span>
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
  // Até ~1800px só dia/mês e hora (o cabeçalho tem abas, sininho e avatar); acima, data por extenso.
  return (
    <>
      <span className="hidden whitespace-nowrap text-sm text-ink-2 tabular-nums xl:max-3xl:inline">{short}</span>
      <span className="hidden whitespace-nowrap text-sm text-ink-2 tabular-nums 3xl:inline">{full || formatDayLong(todayKey())}</span>
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
      <span className="hidden 2xl:inline">Trabalhando</span>
    </span>
  );
}

function UserMenu({ me, placement = "down" }: { me: MeDTO; placement?: "down" | "up" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Lê o tema já aplicado no <html> e acompanha trocas feitas em outra parte do app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(currentTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("theme-changed", onChange);
    return () => window.removeEventListener("theme-changed", onChange);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: next }) }).catch(() => {});
  }

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
        className="flex items-center gap-2 rounded-full border border-line bg-fill py-1 pl-1 pr-3 text-sm transition hover:bg-fill-2"
        aria-label="Menu do usuário"
      >
        <Avatar me={me} size={28} />
        {/* O nome fica no menu: no cabeçalho só a foto, para sobrar espaço para as abas. */}
      </button>
      {open && (
        <div className={`absolute z-40 w-56 rounded-xl border border-line-2 bg-surface-3 p-1 text-sm shadow-2xl ${placement === "up" ? "bottom-12 left-0" : "right-0 top-10"}`}>
          <div className="px-2 py-1.5">
            <div className="truncate font-medium">{me.name}</div>
            <div className="truncate text-xs text-ink-3">@{me.username} · {me.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link href="/perfil" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-fill-2">
            <UserRound size={14} className="text-ink-3" /> Meu perfil
          </Link>
          <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-fill-2">
            {theme === "dark" ? <Sun size={14} className="text-orange" /> : <Moon size={14} className="text-blue" />}
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </button>
          <Link href="/arquivadas" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-fill-2 md:hidden">
            <Archive size={14} className="text-ink-3" /> Arquivadas
          </Link>
          <Link href="/configuracoes" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-fill-2 md:hidden">
            <Settings size={14} className="text-ink-3" /> Configurações
          </Link>
          {me.role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              style={adminLinkStyle}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-fill-2"
            >
              <ShieldCheck size={14} /> Painel admin
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-fill-2"
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
                <span className={`flex h-8 w-11 items-center justify-center rounded-full ${active ? "bg-fill-3" : ""}`}>
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

/** Relógio do Design 2.0: data por extenso em display e a hora ao lado (hora só após montar). */
function ClockV2() {
  const [hhmm, setHhmm] = useState("");
  useEffect(() => {
    const tick = () => setHhmm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    // Sincroniza com a hora do navegador ao montar e a cada 30 s.
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-w-0">
      <div className="v2-eyebrow">Onerundred · hoje</div>
      <div className="truncate font-display text-[1.45rem] font-semibold leading-tight tracking-tight sm:text-[1.7rem]">
        {formatDayLong(todayKey())}
        {hhmm && <span className="ml-2 text-ink-3 tabular-nums">{hhmm}</span>}
      </div>
    </div>
  );
}

type Tab = { href: string; label: string; short: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> };

const RAIL_KEY = "onerundred_rail";

const adminLinkStyle = {
  color: "var(--color-orange)",
  backgroundColor: "color-mix(in srgb, var(--color-orange) 14%, transparent)",
};

/**
 * Design 2.0: trilho lateral fixo no PC, recolhível. Sem escolha salva, fica só com
 * ícones até xl e com nomes a partir de xl; o botão no rodapé fixa "expanded" ou
 * "collapsed" em <html data-rail> (CSS cuida da largura) e guarda no aparelho.
 */
function Rail({ tabs: items, isActive, me }: { tabs: Tab[]; isActive: (href: string) => boolean; me: MeDTO | null }) {
  function toggle() {
    const html = document.documentElement;
    const rail = document.querySelector<HTMLElement>(".v2-rail");
    const expandedNow = rail ? rail.offsetWidth > 100 : html.dataset.rail === "expanded";
    const next = expandedNow ? "collapsed" : "expanded";
    html.dataset.rail = next;
    try {
      localStorage.setItem(RAIL_KEY, next);
    } catch {
      /* sem armazenamento: vale só nesta página */
    }
  }
  return (
    <aside className="design-v2-only v2-rail fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface md:flex" aria-label="Navegação principal">
      <Link href="/" className="v2-rail-head flex h-16 shrink-0 items-center border-b border-line">
        <Logo />
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
        <ul className="space-y-1">
          {items.map((t) => {
            const active = isActive(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} title={t.label} aria-current={active ? "page" : undefined} style={me?.role === "admin" && t.href === "/admin" ? adminLinkStyle : undefined} className={`v2-rail-item ${active ? "is-active" : ""}`}>
                  <t.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="v2-rail-label">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="v2-rail-foot flex shrink-0 flex-col items-center gap-2 border-t border-line p-3">
        {me && <UserMenu me={me} placement="up" />}
        <span className="flex items-center gap-1">
          {me && <InviteBell />}
          <button type="button" onClick={toggle} className="btn btn-ghost h-8 w-8 p-0" aria-label="Recolher ou expandir a barra lateral" title="Recolher / expandir">
            <ChevronsLeft size={16} className="v2-when-expanded" />
            <ChevronsRight size={16} className="v2-when-collapsed" />
          </button>
        </span>
      </div>
    </aside>
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
          // Preferência da conta (vale em qualquer aparelho): aplica se diferir do que está na tela.
          if (next && isTheme(d.theme) && d.theme !== currentTheme()) applyTheme(d.theme);
          if (next && isDesign(d.design) && d.design !== currentDesign()) applyDesign(d.design);
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

    {/* Design 2.0 "Atelier": trilho lateral no PC + faixa superior com a data em destaque. */}
    <Rail tabs={allTabs} isActive={isActive} me={me} />
    <header className="design-v2-only mb-6 pt-4">
      <div className="flex items-end justify-between gap-3">
        <ClockV2 />
        <div className="flex shrink-0 items-center gap-2">
          <WorkIndicator />
          <span className="md:hidden">{me && <InviteBell />}</span>
          <span className="md:hidden">{me && <UserMenu me={me} />}</span>
        </div>
      </div>
    </header>

    <header className="design-v1-only sticky z-30 mb-6 pt-3" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="card w-full bg-surface/90 px-4 py-2.5 shadow-[var(--shadow-float)] backdrop-blur-md sm:px-5">
        <div className="flex min-h-11 items-center gap-3 lg:gap-4 2xl:gap-6">
        <Link href="/" className="shrink-0">
          <Logo compact />
        </Link>

        <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-fill p-1 no-scrollbar md:flex">
          {allTabs.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                title={t.label}
                style={me?.role === "admin" && t.href === "/admin" ? adminLinkStyle : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] transition lg:px-2 xl:px-2.5 ${
                  active ? "bg-fill-3 text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                <t.icon size={15} className={t.href === "/admin" && me?.role === "admin" ? "text-orange" : active ? "text-orange" : "text-ink-3"} strokeWidth={active ? 2.2 : 1.9} />
                {/* Tablet: só o ícone (nome no tooltip); a partir de lg: ícone + nome curto. */}
                <span className="hidden lg:inline">{t.short}</span>
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
