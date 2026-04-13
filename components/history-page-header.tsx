"use client";

import { useT } from "@/lib/i18n";

export function HistoryPageHeader({ count }: { count: number }) {
  const t = useT();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t.page_history}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {t.state_total.replace("{count}", String(count))}
      </p>
    </div>
  );
}
