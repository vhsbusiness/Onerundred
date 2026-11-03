"use client";
import { useRouter, usePathname } from "next/navigation";
import { CalendarPopover } from "@/components/ui/CalendarPopover";

export function ReportDate({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const path = usePathname();
  return <section aria-label="Calendário do relatório" className="card min-w-0 p-4">
    <h2 className="mb-2 text-sm font-semibold">Escolher dia do relatório</h2>
    <CalendarPopover key={value} value={value} max={max} className="max-w-full" onPick={day => router.push(`${path}?dia=${day}`, { scroll: false })} />
  </section>;
}
