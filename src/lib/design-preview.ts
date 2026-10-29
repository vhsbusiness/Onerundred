import "server-only";

/** A prévia não é liberada para administradores promovidos nem por cookie. */
export function canPreviewDesign(user: { role: string; email: string } | null | undefined): boolean {
  return user?.role === "admin" && user.email.trim().toLowerCase() === "vitorhugotemjeito@gmail.com";
}
