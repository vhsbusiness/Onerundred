"use client";

import { Camera, KeyRound, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/client";
import type { MeDTO } from "@/lib/types";
import { NotificationsSection } from "./NotificationsSection";

/** Redimensiona a imagem no navegador para um JPEG quadrado de 256px (cabe no banco). */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem");
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  let quality = 0.85;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > 200 * 1024 && quality > 0.4) {
    quality -= 0.1;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}

export function Avatar({ me, size = 40 }: { me: Pick<MeDTO, "name" | "avatar">; size?: number }) {
  if (me.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={me.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange to-blue font-semibold uppercase text-bg"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {me.name.slice(0, 2)}
    </span>
  );
}

export function ProfilePage() {
  const [me, setMe] = useState<MeDTO | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await http.get<{ user: MeDTO | null }>("/api/auth/me");
    if (d.user) {
      setMe(d.user);
      setName(d.user.name);
      setUsername(d.user.username);
      setEmail(d.user.email);
    }
  }, []);

  useEffect(() => {
    // Busca inicial: o setState ocorre após o await, não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function notifyNav() {
    window.dispatchEvent(new Event("me-changed"));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProfileMsg(null);
    try {
      const updated = await http.patch<MeDTO>("/api/auth/me", { name, username, email });
      setMe(updated);
      setProfileMsg({ ok: true, text: "Dados salvos" });
      notifyNav();
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : "Não foi possível salvar" });
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMsg({ ok: false, text: "Escolha um arquivo de imagem" });
      return;
    }
    setBusy(true);
    setProfileMsg(null);
    try {
      const avatar = await toAvatarDataUrl(file);
      const updated = await http.patch<MeDTO>("/api/auth/me", { avatar });
      setMe(updated);
      setProfileMsg({ ok: true, text: "Foto atualizada" });
      notifyNav();
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : "Não foi possível enviar a foto" });
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!me?.avatar) return;
    setBusy(true);
    try {
      const updated = await http.patch<MeDTO>("/api/auth/me", { avatar: null });
      setMe(updated);
      setProfileMsg({ ok: true, text: "Foto removida" });
      notifyNav();
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirm) {
      setPwMsg({ ok: false, text: "A confirmação não bate com a nova senha" });
      return;
    }
    setBusy(true);
    try {
      await http.post("/api/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setPwMsg({ ok: true, text: "Senha alterada. Outros dispositivos foram desconectados." });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Não foi possível alterar a senha" });
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <div className="card h-64 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserRound size={22} className="text-blue" /> Meu perfil
        </h1>
        <p className="text-sm text-ink-2">Foto, dados da conta e senha.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar me={me} size={80} />
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn">
                  <Camera size={14} /> {me.avatar ? "Trocar foto" : "Adicionar foto"}
                </button>
                {me.avatar && (
                  <button type="button" onClick={removePhoto} disabled={busy} className="btn btn-ghost text-ink-3 hover:text-red">
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-3">JPG, PNG ou WebP. A foto é cortada em quadrado e reduzida automaticamente.</p>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Nome de usuário</span>
              <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} className="input" autoComplete="username" autoCapitalize="none" />
              <span className="mt-1 block text-xs text-ink-3">Letras, números, ponto ou _. Maiúsculas e minúsculas contam como iguais.</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
            </label>
            {profileMsg && <p className={`text-sm ${profileMsg.ok ? "text-green" : "text-red"}`}>{profileMsg.text}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full sm:w-auto">
              Salvar dados
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <KeyRound size={15} /> Alterar senha
          </h2>
          <form onSubmit={savePassword} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Senha atual</span>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input" autoComplete="current-password" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Nova senha (mínimo 8 caracteres)</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" autoComplete="new-password" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-ink-3">Confirmar nova senha</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" autoComplete="new-password" />
            </label>
            {pwMsg && <p className={`text-sm ${pwMsg.ok ? "text-green" : "text-red"}`}>{pwMsg.text}</p>}
            <button type="submit" disabled={busy || !currentPassword || !newPassword} className="btn btn-primary w-full sm:w-auto">
              Alterar senha
            </button>
          </form>
        </section>

        <NotificationsSection />
      </div>
    </div>
  );
}
