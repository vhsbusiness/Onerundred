"use client";

import { Bell, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/client";
import { notify } from "@/components/ui/ConfirmProvider";
import { Avatar } from "@/components/profile/ProfilePage";
import type { BoardInviteDTO } from "@/lib/types";

/** Sininho ao lado do avatar: convites de quadro pendentes. */
export function InviteBell() {
  const router = useRouter();
  const [invites, setInvites] = useState<BoardInviteDTO[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await http.get<BoardInviteDTO[]>("/api/convites"));
    } catch {
      /* sem sessão */
    }
  }, []);

  useEffect(() => {
    // Busca inicial e a cada minuto (setState após o await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function respond(inv: BoardInviteDTO, accept: boolean) {
    try {
      const r = await http.post<{ boardId: string }>("/api/convites", { id: inv.id, accept });
      setInvites((list) => list.filter((i) => i.id !== inv.id));
      if (accept) {
        notify(`Você entrou no quadro "${inv.boardName}"`);
        setOpen(false);
        router.push(`/quadros/${r.boardId}`);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erro ao responder", "error");
    }
  }

  const count = invites.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost relative h-9 w-9 p-0"
        aria-label={count ? `${count} convite(s) pendente(s)` : "Notificações"}
        title="Convites"
      >
        <Bell size={17} className={count ? "text-orange" : "text-ink-2"} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[10px] font-semibold text-bg">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 max-w-[90vw] rounded-xl border border-line-2 bg-surface-3 p-2 text-sm shadow-2xl">
          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-ink-3">Convites</div>
          {count === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-3">Nenhum convite pendente.</p>
          ) : (
            <ul className="space-y-1">
              {invites.map((inv) => (
                <li key={inv.id} className="rounded-lg border border-line bg-black/20 p-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar me={inv.from} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        <span className="font-medium">{inv.from.name}</span> <span className="text-ink-3">@{inv.from.username}</span>
                      </div>
                      <div className="truncate text-xs text-ink-2">
                        te convidou para o quadro <span className="text-ink">“{inv.boardName}”</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => respond(inv, true)} className="btn btn-primary h-8 flex-1 text-xs">
                      <Check size={13} /> Aceitar
                    </button>
                    <button type="button" onClick={() => respond(inv, false)} className="btn btn-ghost h-8 text-xs">
                      <X size={13} /> Recusar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
