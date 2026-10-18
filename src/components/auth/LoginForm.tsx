"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Nav";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível entrar");
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <form
        onSubmit={submit}
        className="card blob-surface w-full max-w-sm space-y-5 p-6"
        style={{ "--blob-a": "rgba(245,176,110,0.4)", "--blob-b": "rgba(127,183,245,0.4)" } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <LockKeyhole size={18} className="text-ink-3" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Entrar</h1>
          <p className="text-sm text-ink-2">Digite a senha do seu painel.</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          className="input"
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={busy || !password} className="btn btn-primary w-full">
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
