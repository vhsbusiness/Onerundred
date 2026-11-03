"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { http } from "@/lib/client";
import { notify } from "@/components/ui/ConfirmProvider";

export function BoardEditButton({ collaborationId, boardId, pending }: { collaborationId: string; boardId: string; pending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function request() {
    setBusy(true);
    try {
      const result = await http.post<{ editable: boolean }>("/api/colaboradores/edicao", { collaborationId, boardId });
      if (result.editable) router.push(`/quadros/${boardId}`);
      else { notify("Pedido enviado ao dono do quadro."); router.refresh(); }
    } catch (error) { notify(error instanceof Error ? error.message : "Erro ao solicitar edição.", "error"); }
    finally { setBusy(false); }
  }
  return <button type="button" className="btn" disabled={pending || busy} onClick={request}>{pending ? "Edição solicitada" : "Solicitar edição"}</button>;
}
