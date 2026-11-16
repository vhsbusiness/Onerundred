"use client";
import { KeyRound, Plus, Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { areaKeys, apiAreas, readOnlyArea, type Grants } from "@/lib/api-permissions";
import { http } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";

export function ApiKeys({ keys }: { keys: { id: string; name: string; suffix: string; grants: Grants }[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false),
    [grants, setGrants] = useState<Grants>({}),
    [secret, setSecret] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const resp = await http.post<{ secret: string }>("/api/chaves", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        grants,
      });
      setCreating(false);
      setSecret(resp.secret);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar chave.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mt-5 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound size={17} /> Chaves de API
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setCreating(true);
            setError("");
            setGrants({});
          }}
        >
          <Plus size={14} /> Criar chave de API
        </button>
      </div>
      {keys.length === 0 && <p className="text-sm text-ink-2">Nenhuma chave criada.</p>}
      {keys.map((k) => (
        <div key={k.id} className="flex items-start justify-between gap-2 border-t border-line pt-3">
          <div>
            <strong className="break-words text-sm">
              {k.name} · …{k.suffix}
            </strong>
            <p className="text-xs text-ink-2">
              {areaKeys
                .filter((a) => k.grants[a])
                .map((a) => apiAreas[a].label + " (" + (k.grants[a] === "write" ? "edição" : "leitura") + ")")
                .join(" · ")}
            </p>
          </div>
          <button
            className="btn btn-ghost text-red"
            aria-label={"Revogar " + k.name}
            onClick={async () => {
              if (
                await askConfirm({
                  message: "Revogar a chave " + k.name + "?",
                  danger: true,
                  confirmLabel: "Revogar",
                })
              ) {
                try {
                  await http.del("/api/chaves", { id: k.id });
                  router.refresh();
                } catch (e) {
                  notify(e instanceof Error ? e.message : "Falha ao revogar.", "error");
                }
              }
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-sm">Como usar a API</summary>
        <p className="my-2 text-sm">
          Envie a chave no cabeçalho <code>Authorization: Bearer SUA_CHAVE</code>. A consulta usa GET. A
          edição também permite criar, alterar e excluir registros nas áreas selecionadas.
        </p>
        <ul className="space-y-1 text-xs text-ink-2">
          {areaKeys.map((a) => (
            <li key={a}>
              {apiAreas[a].label} · <code>GET /api/{apiAreas[a].path}</code>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-2">
          Para criar um quadro com permissão de edição, envie POST para <code>/api/boards</code> com{" "}
          <code>{'{"name":"Meu quadro","type":"tasks"}'}</code> e <code>Content-Type: application/json</code>.
          Para consultar uma data, use <code>/api/work?dia=AAAA-MM-DD</code> ou{" "}
          <code>/api/financeiro/personal?mes=AAAA-MM</code>.
        </p>
      </details>
      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title={<h2 className="text-lg font-semibold">Criar chave de API</h2>}
        >
          <form onSubmit={create} className="space-y-4 text-sm">
            <label className="block">
              Nome da chave
              <input
                name="name"
                required
                maxLength={80}
                placeholder="Ex.: Meu relatório"
                className="input mt-1"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="font-semibold">Permissões por área</legend>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setGrants(Object.fromEntries(areaKeys.map((k) => [k, "read"])))}
              >
                Ler todas as áreas
              </button>
              {areaKeys.map((a) => (
                <label key={a} className="flex items-center justify-between gap-3">
                  {apiAreas[a].label}
                  <select
                    aria-label={"Acesso a " + apiAreas[a].label}
                    className="input max-w-40"
                    value={grants[a] ?? ""}
                    onChange={(e) => {
                      const next = { ...grants };
                      if (e.target.value) next[a] = e.target.value as "read" | "write";
                      else delete next[a];
                      setGrants(next);
                    }}
                  >
                    <option value="">Sem acesso</option>
                    <option value="read">Só leitura</option>
                    {!readOnlyArea(a) && <option value="write">Leitura e edição</option>}
                  </select>
                </label>
              ))}
            </fieldset>
            <label className="block">
              Senha atual
              <input
                className="input mt-1"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p role="alert" className="text-red">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy || !Object.keys(grants).length}>
              Gerar chave
            </button>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal open onClose={() => setSecret("")} title={<h2 className="font-semibold">Chave criada</h2>}>
          <p className="mb-3 text-sm">Copie agora. A chave completa aparece uma única vez.</p>
          <input
            readOnly
            aria-label="Chave gerada"
            className="input font-mono"
            value={secret}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="btn mt-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                notify("Chave copiada.");
              } catch {
                notify("Selecione e copie a chave no campo acima.");
              }
            }}
          >
            <Copy size={14} /> Copiar chave
          </button>
        </Modal>
      )}
    </section>
  );
}
