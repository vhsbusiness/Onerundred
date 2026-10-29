import "server-only";

/** Capacidade de comparar versões na própria conta; v3 já é o padrão global. */
export function canPreviewDesign(user: { role: string } | null | undefined): boolean {
  return user?.role === "admin";
}
