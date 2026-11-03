"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { http } from "@/lib/client";
import type { myCollaborations } from "@/lib/collaborators";

export function CollaboratorSettings({ data }: { data: Awaited<ReturnType<typeof myCollaborations>> }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await operation();
      setMessage(success);
      router.refresh();
      window.dispatchEvent(new Event("collaborations-changed"));
    } catch (e) { setMessage(e instanceof Error ? e.message : "Tente novamente."); }
    finally { setBusy(false); }
  }
  function change(id: string, action: string, success: string) {
    return submit(() => http.patch("/api/colaboradores", { id, action }), success);
  }
  return <main className="mx-auto max-w-3xl space-y-4">
    <Link href="/configuracoes" className="text-sm text-blue">← Configurações</Link>
    <section className="card space-y-3 p-5">
      <h1 className="text-xl font-semibold">Colaboradores</h1>
      <p className="text-sm text-ink-2">Convide alguém pelo @ para acompanhar seus resultados. A pessoa escolhe se quer compartilhar.</p>
      <form className="flex flex-wrap gap-2" onSubmit={e => {
        e.preventDefault();
        void submit(async () => { await http.post("/api/colaboradores", { username }); setUsername(""); }, "Convite enviado.");
      }}>
        <input className="input min-w-0 flex-1" aria-label="Usuário do colaborador" placeholder="@usuario" required value={username} onChange={e => setUsername(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !username.trim()}>Enviar convite</button>
      </form>
      <p role="status" className="text-sm text-ink-2">{message}</p>
    </section>
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">Meus colaboradores</h2>
      {!data.sent.length && <p className="text-sm text-ink-3">Seus convites aparecerão aqui.</p>}
      {data.sent.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
        <span className="min-w-0 flex-1 break-words">{row.employee.name} · @{row.employee.username}</span>
        {row.accepted ? <Link className="btn" href={`/configuracoes/colaboradores/${row.id}`} prefetch={false}>Ver relatório</Link> : <span className="pill">Aguardando aceite</span>}
        <button className="btn" disabled={busy} onClick={() => change(row.id,"remove","Vínculo removido.")}>{row.accepted ? "Encerrar" : "Cancelar convite"}</button>
      </div>)}
    </section>
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">Quem pode acompanhar meus dados</h2>
      {!data.received.length && <p className="text-sm text-ink-3">Nenhum convite recebido ou acesso ativo.</p>}
      {data.edits.map(r => <div key={r.id} className="space-y-2 border-t border-line py-3 text-sm">
        <p>@{r.collaboration.manager.username} solicita edição de <strong>{r.board.name}</strong>. Ao aprovar, ele entra como membro do quadro.</p>
        <div className="flex flex-wrap gap-2">{[true, false].map(approve => <button key={String(approve)} disabled={busy} className="btn" onClick={() => submit(() => http.patch("/api/colaboradores/edicao", { id: r.id, approve }), approve ? "Edição autorizada." : "Pedido recusado.")}>{approve ? "Autorizar edição" : "Recusar edição"}</button>)}</div>
      </div>)}
      {data.received.map(row => <div key={row.id} className="space-y-2 border-t border-line pt-3 text-sm">
        <strong>{row.manager.name} · @{row.manager.username}</strong>
        <p className="text-ink-2">{row.accepted ? "Você compartilha" : "Ao aceitar, você compartilha"} seu histórico e seus próximos registros de tarefas dos seus quadros de trabalho, notas dessas tarefas e horários das sessões de trabalho. {(!row.accepted || row.shareBoards) && "Também permite consultar as listas, cartões e anexos dos seus quadros."} O acesso é somente para consulta e você pode encerrá-lo aqui.</p>
        <div className="flex flex-wrap gap-2">
          {row.accepted && !row.shareBoards && <button disabled={busy} className="btn" onClick={() => change(row.id, "shareBoards", "Leitura dos quadros autorizada.")}>Permitir leitura dos meus quadros e anexos</button>}
          {!row.accepted && <button disabled={busy} className="btn btn-primary" onClick={() => change(row.id,"accept","Acesso autorizado.")}>Aceitar e compartilhar</button>}
          <button disabled={busy} className="btn" onClick={() => change(row.id,"remove",row.accepted ? "Acesso encerrado." : "Convite recusado.")}>{row.accepted ? "Encerrar acesso" : "Recusar"}</button>
        </div>
      </div>)}
    </section>
  </main>;
}
