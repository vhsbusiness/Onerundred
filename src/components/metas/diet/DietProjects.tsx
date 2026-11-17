"use client";

import { Plus, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { http } from "@/lib/client";
import { FavoriteProjectButton } from "../FavoriteProjects";
import { CoverImage, CoverPicker } from "../ProjectCover";

export function DietProjects({
  diets,
}: {
  diets: { id: string; name: string; cover?: { id: string } | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loadingImage, setLoadingImage] = useState(false);
  const [image, setImage] = useState(""),
    [error, setError] = useState("");
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || loadingImage) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await http.post<{ id: string }>("/api/dietas", {
        name: new FormData(e.currentTarget).get("name"),
        image,
      });
      setOpen(false);
      router.push("/metas/dietas/" + id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar o projeto.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Utensils size={18} className="text-orange" /> Minhas dietas
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setImage("");
            setError("");
            setOpen(true);
          }}
        >
          <Plus size={15} /> Novo projeto de dieta
        </button>
      </div>
      {diets.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {diets.map((p) => (
            <div key={p.id} className="relative">
            <div className="absolute right-3 top-3 z-10"><FavoriteProjectButton id={p.id} kind="diet" /></div>
            <Link className="card block h-full space-y-3 p-5" href={"/metas/dietas/" + p.id}>
              {p.cover && <CoverImage preview url={"/api/dietas/" + p.id + "/imagem?v=" + p.cover.id} />}
              <div className="flex justify-between gap-2 pr-9">
                <h3 className="break-words text-lg font-semibold">{p.name}</h3>
              </div>
              <span className="text-sm text-ink-2">Cardápio diário</span>
            </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="card p-5 text-sm text-ink-2">Nenhum projeto de dieta ainda.</p>
      )}
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={<h2 className="text-lg font-semibold">Novo projeto de dieta</h2>}
        >
          <form onSubmit={create} className="space-y-4">
            <label className="block text-sm">
              Nome do projeto
              <input required name="name" maxLength={80} defaultValue="Dieta" className="input mt-1" />
            </label>
            <div className="space-y-2">
              <p className="text-sm">Imagem do projeto (opcional)</p>
              {image && <CoverImage preview url={image} />}
              <CoverPicker onChange={setImage} onBusy={setLoadingImage} />
            </div>
            {error && (
              <p className="text-sm text-red" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy || loadingImage}>
              Criar projeto
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
