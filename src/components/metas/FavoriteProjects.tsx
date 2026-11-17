"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Star, Utensils } from "lucide-react";
import { http } from "@/lib/client";
import { notify } from "@/components/ui/ConfirmProvider";
import type { FavoriteProject, ProjectKind } from "@/lib/favorite-projects";

const Context = createContext<{
  projects: FavoriteProject[]; ready: boolean; busy: boolean; toggle: (id: string, kind: ProjectKind) => Promise<void>;
}>({ projects: [], ready: false, busy: false, toggle: async () => {} });
export const useFavoriteProjects = () => useContext(Context);

export function FavoriteProjectsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<FavoriteProject[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    if (!enabled || pathname === "/login") return;
    let active = true;
    function load() {
      if (saving.current) return;
      const current = ++revision.current;
      http.get<FavoriteProject[]>("/api/projetos/favoritos").then(value => {
        if (active && current === revision.current) { setProjects(value); setReady(true); }
      }).catch(() => {});
    }
    load();
    window.addEventListener("focus", load);
    window.addEventListener("project-changed", load);
    return () => { active = false; window.removeEventListener("focus", load); window.removeEventListener("project-changed", load); };
  }, [enabled, pathname]);

  async function toggle(id: string, kind: ProjectKind) {
    if (!ready || saving.current) return;
    const selected = projects.some(p => p.id === id && p.kind === kind);
    saving.current = true; setBusy(true); revision.current++;
    try { setProjects(await http.patch<FavoriteProject[]>("/api/projetos/favoritos", { id, kind, favorite: !selected })); }
    catch (err) { notify(err instanceof Error ? err.message : "Não foi possível atualizar os favoritos.", "error"); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Context.Provider value={{ projects, ready, busy, toggle }}>{children}</Context.Provider>;
}

export function FavoriteProjectButton({ id, kind }: { id: string; kind: ProjectKind }) {
  const { projects, ready, busy, toggle } = useFavoriteProjects();
  const selected = projects.some(p => p.id === id && p.kind === kind);
  const label = selected ? "Remover projeto dos favoritos" : "Favoritar projeto";
  return <button type="button" className={"btn btn-ghost size-9 shrink-0 p-0 " + (selected ? "text-orange" : "text-ink-3")}
    aria-label={label} title={label} aria-pressed={selected} disabled={!ready || busy} onClick={() => void toggle(id, kind)}>
    <Star size={17} fill={selected ? "currentColor" : "none"} />
  </button>;
}

export function FavoriteProjectLinks() {
  const { projects } = useFavoriteProjects();
  if (!projects.length) return null;
  return <nav aria-label="Projetos favoritos" className="flex flex-wrap gap-2">
    {projects.map(p => <Link key={p.href} className="btn min-w-0 max-w-full" href={p.href}>
      {p.kind === "training" ? <Dumbbell size={14} className="shrink-0 text-orange" /> : <Utensils size={14} className="shrink-0 text-orange" />}
      <span className="truncate">{p.name}</span>
    </Link>)}
  </nav>;
}
