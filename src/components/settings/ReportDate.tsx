"use client";
import { useRouter, usePathname } from "next/navigation";
import { DateField } from "@/components/ui/DateField";

export function ReportDate({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const path = usePathname();
  return <DateField value={value} max={max} ariaLabel="Dia do relatório" onChange={day => router.push(`${path}?dia=${day}`)} />;
}
