"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";

/*
 * Confirmações e avisos dentro do app (no lugar de window.confirm / alert).
 *
 *   const ok = await askConfirm({ title: "Excluir", message: "…", danger: true });
 *   notify("Salvo");
 *
 * O provider é montado uma vez no layout e registra as funções globais.
 */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let openConfirm: ((p: Pending) => void) | null = null;
let pushNotice: ((text: string, tone: "info" | "error") => void) | null = null;

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (!openConfirm) return Promise.resolve(window.confirm(opts.message));
  return new Promise((resolve) => openConfirm!({ ...opts, resolve }));
}

export function notify(text: string, tone: "info" | "error" = "info") {
  if (!pushNotice) {
    window.alert(text);
    return;
  }
  pushNotice(text, tone);
}

export function ConfirmProvider() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [notices, setNotices] = useState<{ id: number; text: string; tone: "info" | "error" }[]>([]);

  useEffect(() => {
    openConfirm = (p) => setPending(p);
    pushNotice = (text, tone) => {
      const id = Date.now() + Math.random();
      setNotices((n) => [...n, { id, text, tone }]);
      setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000);
    };
    return () => {
      openConfirm = null;
      pushNotice = null;
    };
  }, []);

  function answer(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  return (
    <>
      <Modal
        open={Boolean(pending)}
        onClose={() => answer(false)}
        title={
          pending ? (
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {pending.danger ? <AlertTriangle size={18} className="text-red" /> : <Info size={18} className="text-blue" />}
              {pending.title ?? "Confirmar"}
            </h2>
          ) : null
        }
      >
        {pending && (
          <div className="space-y-4">
            <p className="whitespace-pre-line text-sm text-ink-2">{pending.message}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => answer(false)} className="btn btn-ghost">
                {pending.cancelLabel ?? "Cancelar"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => answer(true)}
                className={`btn ${pending.danger ? "pill-red border-red/40" : "btn-primary"}`}
              >
                {pending.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {notices.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4">
          {notices.map((n) => (
            <div
              key={n.id}
              className={`pointer-events-auto rounded-xl border px-4 py-2 text-sm shadow-2xl backdrop-blur-md ${
                n.tone === "error" ? "border-red/40 bg-red/15 text-red" : "border-line-2 bg-surface-3 text-ink"
              }`}
            >
              {n.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
