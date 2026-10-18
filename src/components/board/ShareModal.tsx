"use client";

import { Clock, Send, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { http } from "@/lib/client";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/profile/ProfilePage";
import type { BoardDTO, UserBrief } from "@/lib/types";

export function ShareModal({
  board,
  open,
  onClose,
  onChanged,
}: {
  board: BoardDTO;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserBrief[]>([]);
  const [busy, setBusy] = useState(false);

  // Busca enquanto digita (com pequeno atraso).
  useEffect(() => {
    const term = query.trim().replace(/^@/, "");
    const id = setTimeout(() => {
      if (term.length < 2) {
        setResults([]);
        return;
      }
      http
        .get<UserBrief[]>(`/api/usuarios/busca?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  async function invite(username: string) {
    setBusy(true);
    try {
      const u = await http.post<UserBrief>(`/api/boards/${board.id}/compartilhar`, { username });
      notify(`Convite enviado para @${u.username}`);
      setQuery("");
      setResults([]);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível convidar", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(u: UserBrief) {
    if (!(await askConfirm({ title: "Remover do quadro", message: `Remover @${u.username} do quadro "${board.name}"?`, confirmLabel: "Remover", danger: true }))) return;
    await http.del(`/api/boards/${board.id}/compartilhar`, { userId: u.id });
    onChanged();
  }

  async function cancelInvite(u: UserBrief) {
    await http.del(`/api/boards/${board.id}/compartilhar`, { inviteUserId: u.id });
    onChanged();
  }

  const alreadyIn = new Set([board.owner.id, ...board.members.map((m) => m.id), ...board.pendingInvites.map((m) => m.id)]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users size={18} className="text-blue" /> Compartilhar “{board.name}”
        </h2>
      }
    >
      <div className="space-y-5">
        {board.isOwner ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) invite(query);
            }}
            className="space-y-2"
          >
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-3">Convidar pelo @</label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="@usuario"
                className="input"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button type="submit" disabled={busy || query.trim().length < 2} className="btn btn-primary shrink-0">
                <Send size={14} /> Convidar
              </button>
            </div>
            {results.length > 0 && (
              <ul className="overflow-hidden rounded-xl border border-line bg-black/20">
                {results.map((u) => {
                  const taken = alreadyIn.has(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={taken || busy}
                        onClick={() => invite(u.username)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        <Avatar me={u} size={26} />
                        <span className="font-medium">{u.name}</span>
                        <span className="text-ink-3">@{u.username}</span>
                        <span className="ml-auto text-xs text-ink-3">{taken ? "já está no quadro" : "convidar"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-ink-3">A pessoa recebe o convite no sininho (e no aparelho, se tiver notificações) e precisa aceitar.</p>
          </form>
        ) : (
          <p className="text-sm text-ink-2">
            Quadro de <span className="font-medium text-ink">{board.owner.name}</span> (@{board.owner.username}). Só o dono convida pessoas.
          </p>
        )}

        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Quem participa</div>
          <ul className="space-y-1">
            <li className="flex items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-2 text-sm">
              <Avatar me={board.owner} size={26} />
              <span className="font-medium">{board.owner.name}</span>
              <span className="text-ink-3">@{board.owner.username}</span>
              <span className="pill ml-auto px-1.5 py-0 text-[10px]">dono</span>
            </li>
            {board.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-2 text-sm">
                <Avatar me={m} size={26} />
                <span className="font-medium">{m.name}</span>
                <span className="text-ink-3">@{m.username}</span>
                {board.isOwner && (
                  <button type="button" onClick={() => removeMember(m)} className="ml-auto text-ink-3 hover:text-red" aria-label="Remover">
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
            {board.pendingInvites.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm opacity-80">
                <Avatar me={m} size={26} />
                <span>{m.name}</span>
                <span className="text-ink-3">@{m.username}</span>
                <span className="pill ml-auto px-1.5 py-0 text-[10px]">
                  <Clock size={9} /> convite pendente
                </span>
                {board.isOwner && (
                  <button type="button" onClick={() => cancelInvite(m)} className="text-ink-3 hover:text-red" aria-label="Cancelar convite">
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {board.members.length === 0 && board.pendingInvites.length === 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
              <UserPlus size={12} /> Ninguém além de você ainda.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
