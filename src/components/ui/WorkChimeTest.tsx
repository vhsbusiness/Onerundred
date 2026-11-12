"use client";

import { Volume2 } from "lucide-react";
import { useState } from "react";
import { testWorkTone } from "@/lib/work-chime-audio";

export function WorkChimeTest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function test() {
    setBusy(true);
    try {
      if (!await testWorkTone()) throw new Error();
      setMessage("Se não ouviu, confira o volume do computador ou celular e se a aba está no mudo.");
    } catch {
      setMessage("O navegador não liberou o áudio. Permita som para este site e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <button type="button" onClick={test} disabled={busy} className="btn btn-ghost text-xs">
      <Volume2 size={14} /> Testar som
    </button>
    {message && <span role="status" className="text-xs text-ink-2">{message}</span>}
  </div>;
}
