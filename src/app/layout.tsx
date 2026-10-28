import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { DEFAULT_DESIGN, DEFAULT_THEME, DESIGN_COOKIE, isDesign, isTheme, THEME_COOKIE, themeColorFor, type Design, type Theme } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fonte do Design 2.0 (só entra em uso com <html data-design="v2">).
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Onerundred",
  description: "Dashboard de produtividade: quadros, tarefas e tempo de trabalho.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Onerundred" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

/** Tema salvo no cookie (o servidor já renderiza com ele, sem piscar). */
async function themeFromCookie(): Promise<Theme> {
  const t = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(t) ? t : DEFAULT_THEME;
}

/** Design salvo no cookie (v2 = Design 2.0 experimental, ligado pelo admin). */
async function designFromCookie(): Promise<Design> {
  const d = (await cookies()).get(DESIGN_COOKIE)?.value;
  return isDesign(d) ? d : DEFAULT_DESIGN;
}

export async function generateViewport(): Promise<Viewport> {
  const [theme, design] = await Promise.all([themeFromCookie(), designFromCookie()]);
  return { ...viewportBase, themeColor: themeColorFor(theme, design) };
}

const viewportBase: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sem zoom por pinça/foco: comportamento de app. Os campos têm 16px no celular,
  // que é o que evita o zoom automático do Safari ao tocar num input.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, design] = await Promise.all([themeFromCookie(), designFromCookie()]);
  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      data-design={design === "v2" ? "v2" : undefined}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div id="app" className="mx-auto flex min-h-dvh w-full max-w-[1480px] flex-col px-4 pb-24 sm:px-6 md:pb-10"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <Nav />
          <main className="flex-1">{children}</main>
        </div>
        <ConfirmProvider />
      </body>
    </html>
  );
}
