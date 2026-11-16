"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareMindImage } from "@/lib/mind-image-client";
import { http } from "@/lib/client";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";

export function CoverPicker({
  onChange,
  onBusy,
}: {
  onChange: (image: string) => void | Promise<void>;
  onBusy?: (busy: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        className="hidden"
        ref={ref}
        type="file"
        aria-label="Escolher imagem do projeto"
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          onBusy?.(true);
          try {
            const { imageData } = await prepareMindImage(file);
            await onChange(imageData);
          } catch (error) {
            notify(error instanceof Error ? error.message : "Falha ao carregar a imagem.", "error");
          } finally {
            setBusy(false);
            onBusy?.(false);
          }
        }}
      />
      <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => ref.current?.click()}>
        <ImagePlus size={15} />
        {busy ? "Carregando…" : "Escolher imagem"}
      </button>
    </>
  );
}

export function CoverImage({ url, preview = false }: { url: string; preview?: boolean }) {
  return (
    // Private project images are fetched using the active session.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Imagem do projeto"
      loading="lazy"
      className={
        preview ? "h-32 w-full rounded-lg object-cover" : "max-h-96 w-full rounded-xl bg-well object-contain"
      }
    />
  );
}

export function ProjectCover({ path, coverId }: { path: string; coverId: string | null }) {
  const router = useRouter();
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Imagem do projeto</h2>
        <div className="flex gap-2">
          <CoverPicker
            onChange={async (image) => {
              await http.put(path, { image });
              router.refresh();
            }}
          />
          {coverId && (
            <button
              className="btn btn-ghost"
              aria-label="Remover imagem"
              onClick={async () => {
                if (
                  !(await askConfirm({ message: "Remover a imagem deste projeto?", confirmLabel: "Remover" }))
                )
                  return;
                try {
                  await http.del(path);
                  router.refresh();
                } catch (e) {
                  notify(e instanceof Error ? e.message : "Falha ao remover.", "error");
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      {coverId && <CoverImage url={path + "?v=" + coverId} />}
    </section>
  );
}
