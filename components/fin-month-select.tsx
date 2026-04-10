"use client";

import { useRouter } from "next/navigation";

interface FinMonthSelectProps {
  value: string;
  paramName?: string;
}

export function FinMonthSelect({ value, paramName = "ym" }: FinMonthSelectProps) {
  const router = useRouter();

  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => router.push(`?${paramName}=${e.target.value}`)}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {options.map((ym) => (
        <option key={ym} value={ym}>
          {ym.replace("-", "년 ").replace(/(\d+)$/, "$1월")}
        </option>
      ))}
    </select>
  );
}
