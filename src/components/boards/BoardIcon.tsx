import { Columns3, Folders, Network, Star, Rocket, Briefcase, Book, Target, Heart } from "lucide-react";

import { isBoardSymbol } from "@/lib/board-icons";

const symbols = { star: Star, rocket: Rocket, briefcase: Briefcase, book: Book, target: Target, heart: Heart };
export function BoardIcon({ type, symbol, size = 16 }: { type: string; symbol?: string | null; size?: number }) {
  const Icon = isBoardSymbol(symbol) ? symbols[symbol] : type === "mindmap" ? Network : type === "organization" ? Folders : Columns3;
  return <Icon size={size} aria-hidden="true" className={`shrink-0 ${type === "mindmap" ? "text-green" : type === "organization" ? "text-blue" : "text-orange"}`} />;
}
