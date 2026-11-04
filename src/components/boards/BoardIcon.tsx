import { BookOpen, BriefcaseBusiness, Folder, GitFork, Heart, ListChecks, Rocket, Star, Target, type LucideIcon } from "lucide-react";
import { isBoardSymbol, type BoardSymbol } from "@/lib/board-icons";
import type { BoardType } from "@/lib/types";

const icons: Record<BoardType | BoardSymbol, LucideIcon> = {
  tasks: ListChecks,
  organization: Folder,
  mindmap: GitFork,
  star: Star,
  rocket: Rocket,
  briefcase: BriefcaseBusiness,
  book: BookOpen,
  target: Target,
  heart: Heart,
};

export function BoardIcon({ type, symbol, size = 18 }: { type: string; symbol?: string | null; size?: number }) {
  const defaultIcon = type === "organization" || type === "mindmap" ? type : "tasks";
  const key = isBoardSymbol(symbol) ? symbol : defaultIcon;
  const Icon = icons[key];
  return <Icon data-board-icon={key} aria-hidden="true" size={size} strokeWidth={1.5} className="shrink-0" />;
}
