"use client";

import { Check, ImagePlus, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { http, priorityUi } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import type { ImportPlan } from "@/lib/types";

/** Reduz a imagem para no máximo 1600px de largura (JPEG) antes de enviar. */
async function toUploadDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxW = 1600;
  const scale = Math.min(1, maxW / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export function ImportModal({
  boardId,
  open,
  onClose,
  onImported,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [includeDone, setIncludeDone] = useState(false);
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ lists: number; cards: number } | null>(null);

  function reset() {
    setImage(null);
    setPlan(null);
    setError(null);
    setResult(null);
    setBusy(null);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha uma imagem (print do Trello)");
      return;
    }
    setError(null);
    setPlan(null);
    setResult(null);
    try {
      setImage(await toUploadDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler a imagem");
    }
  }

  async function analyze() {
    if (!image) return;
    setBusy("read");
    setError(null);
    try {
      setPlan(await http.post<ImportPlan>(`/api/boards/${boardId}/importar`, { image }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "A IA não conseguiu ler o print");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy("apply");
    setError(null);
    try {
      const r = await http.put<{ lists: number; cards: number }>(`/api/boards/${boardId}/importar`, { plan, includeDone });
      setResult(r);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar as tarefas");
    } finally {
      setBusy(null);
    }
  }

  const totalNew = plan ? plan.newCards + (includeDone ? plan.doneCards : 0) : 0;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles size={18} className="text-blue" /> Trazer dados do Trello
        </h2>
      }
      wide
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-sm text-green">
            <Check size={14} className="mr-1 inline" /> Pronto: {result.lists} lista(s) e {result.cards} tarefa(s) criadas.
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="btn">
              Importar outro print
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className="btn btn-primary"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Tire um print do seu quadro no Trello (ou de qualquer lista de tarefas) e envie aqui. A IA lê a imagem, mostra o que encontrou e cria as listas e tarefas que ainda não existem neste quadro.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null} className="btn">
              <ImagePlus size={14} /> {image ? "Trocar print" : "Escolher print"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
            {image && !plan && (
              <button type="button" onClick={analyze} disabled={busy !== null} className="btn btn-primary">
                <Sparkles size={14} /> {busy === "read" ? "Lendo o print…" : "Ler com a IA"}
              </button>
            )}
          </div>

          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Print enviado" className="max-h-56 w-auto rounded-xl border border-line" />
          )}

          {error && <p className="text-sm text-red">{error}</p>}

          {plan && (
            <div className="space-y-3">
              {plan.lists.length === 0 ? (
                <p className="text-sm text-ink-3">A IA não encontrou listas nem tarefas nessa imagem.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="pill pill-blue">{plan.newLists} lista(s) nova(s)</span>
                    <span className="pill pill-green">{plan.newCards} tarefa(s) nova(s)</span>
                    {plan.doneCards > 0 && (
                      <label className="pill cursor-pointer gap-2">
                        <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
                        incluir {plan.doneCards} já concluída(s)
                      </label>
                    )}
                  </div>
                  <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                    {plan.lists.map((l, i) => (
                      <div key={i} className="rounded-xl border border-line bg-black/20 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{l.name}</span>
                          <span className={priorityUi(l.priority).pill}>{priorityUi(l.priority).label}</span>
                          {l.kind !== "normal" && <span className="pill">{l.kind === "done" ? "Feitas" : "Amanhã"}</span>}
                          <span className="text-xs text-ink-3">{l.existingListId ? "lista já existe" : "lista nova"}</span>
                        </div>
                        <ul className="space-y-1 text-sm">
                          {l.cards.map((c, j) => {
                            const skip = c.exists || (c.done && !includeDone);
                            return (
                              <li key={j} className={`flex items-center gap-2 ${skip ? "text-ink-3 line-through" : ""}`}>
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityUi(c.priority).dot}`} />
                                <span className="truncate">{c.title}</span>
                                {c.estimatedMinutes ? <span className="text-xs text-ink-3">{c.estimatedMinutes} min</span> : null}
                                {c.exists && <span className="pill px-1.5 py-0 text-[10px] no-underline">já existe</span>}
                                {c.done && !c.exists && <span className="pill px-1.5 py-0 text-[10px]">concluída</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={apply} disabled={busy !== null || totalNew + plan.newLists === 0} className="btn btn-primary">
                      <Check size={14} /> {busy === "apply" ? "Criando…" : `Criar ${totalNew} tarefa(s)`}
                    </button>
                    <button type="button" onClick={reset} className="btn btn-ghost">
                      Recomeçar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
