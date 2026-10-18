"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Nav";

type Mode = "login" | "register";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("modo") === "cadastro" ? "register" : "login");
  const [allowRegistration, setAllowRegistration] = useState(true);

  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.allowRegistration === false) setAllowRegistration(false);
      })
      .catch(() => {});
  }, []);

  function goNext() {
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  function validate(): string | null {
    if (mode === "login") {
      if (!identifier.trim()) return "Informe seu e-mail ou nome de usuário";
      if (!password) return "Informe sua senha";
      return null;
    }
    if (name.trim().length < 2) return "Informe seu nome";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Informe um e-mail válido";
    if (!/^[a-z0-9_.]{3,24}$/.test(username)) return "Usuário deve ter de 3 a 24 caracteres (letras, números, ponto ou _)";
    if (password.length < 8) return `A senha precisa ter pelo menos 8 caracteres (tem ${password.length})`;
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ identifier, password }),
            })
          : await fetch("/api/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email, username, password }),
            });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível continuar");
        return;
      }
      goNext();
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

        {allowRegistration ? (
          <div className="flex rounded-full border border-line bg-black/20 p-1 text-sm">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded-full py-1.5 transition ${
                  mode === m ? "bg-white/[0.1] text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "login" ? (
          <>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Bem-vindo de volta</h1>
              <p className="text-sm text-ink-2">Entre com seu e-mail ou nome de usuário.</p>
            </div>
            <input
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="E-mail ou usuário"
              className="input"
              autoComplete="username"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="input"
              autoComplete="current-password"
            />
          </>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Criar conta</h1>
              <p className="text-sm text-ink-2">Leva menos de um minuto.</p>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="input"
              autoComplete="name"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="input"
              autoComplete="email"
            />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
              placeholder="Nome de usuário (ex.: vitor.hugo)"
              className="input"
              autoComplete="username"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha (mínimo 8 caracteres)"
              className="input"
              autoComplete="new-password"
            />
            {password.length > 0 && password.length < 8 && (
              <p className="-mt-3 text-xs text-ink-3">{8 - password.length} caracteres faltando</p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red">{error}</p>}

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>
    </div>
  );
}
