"use client";

import { Bell, Check, X } from "lucide-react";
import Link from "next/link";
import type { pendingBoardRequests } from "@/lib/collaboration-boards";
import type { pendingCollaborations } from "@/lib/collaborators";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/client";
import { notify } from "@/components/ui/ConfirmProvider";
import { Avatar } from "@/components/profile/ProfilePage";
import type { BoardInviteDTO } from "@/lib/types";

/** Sininho ao lado do avatar: convites de quadro pendentes. */
export function InviteBell({ inRail = false }: { inRail?: boolean }) {
  const router = useRouter();
  const [invites, setInvites] = useState<BoardInviteDTO[]>([]);
  const [collaborations, setCollaborations] = useState<Awaited<ReturnType<typeof pendingCollaborations>>>([]);
  const [edits, setEdits] = useState<Awaited<ReturnType<typeof pendingBoardRequests>>>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [boards, requests, editRequests] = await Promise.all([
        http.get<BoardInviteDTO[]>("/api/convites"),
        http.get<Awaited<ReturnType<typeof pendingCollaborations>>>("/api/colaboradores"),
        http.get<Awaited<ReturnType<typeof pendingBoardRequests>>>("/api/colaboradores/edicao"),
      ]);
      setEdits(editRequests);
      setInvites(boards);
      setCollaborations(requests);
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
    window.addEventListener("collaborations-changed", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("collaborations-changed", onFocus);
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

  const count = invites.length + collaborations.length + edits.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { if (!open) void load(); setOpen(!open); }}
        className="btn btn-ghost relative h-9 w-9 p-0"
        aria-label={count ? `${count} convite(s) pendente(s)` : "Notificações"}
        aria-expanded={open}
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
        <div className={`absolute z-40 max-h-[60vh] w-80 max-w-[calc(100vw_-_6rem)] sm:max-w-[90vw] overflow-y-auto rounded-xl border border-line-2 bg-surface-3 p-2 text-sm shadow-2xl ${inRail ? "bottom-11 left-0" : "right-0 top-11"}`}>
          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-ink-3">Convites</div>
          {count === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-3">Nenhum convite pendente.</p>
          ) : (
            <ul className="space-y-1">
              {edits.map(request => <li key={request.id} className="rounded-lg border border-line bg-well p-2">
                <p>@{request.collaboration.manager.username} quer editar {request.board.name}.</p>
                <Link href="/configuracoes/colaboradores" className="btn mt-2" onClick={() => setOpen(false)}>Revisar pedido de edição</Link>
              </li>)}
              {collaborations.map(inv => <li key={inv.id} className="rounded-lg border border-line bg-well p-2.5">
                <p>@{inv.manager.username} convidou você para colaborar e compartilhar seus resultados.</p>
                <Link href="/configuracoes/colaboradores" className="btn mt-2" onClick={() => setOpen(false)}>Revisar convite</Link>
              </li>)}
              {invites.map((inv) => (
                <li key={inv.id} className="rounded-lg border border-line bg-well p-2.5">
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
