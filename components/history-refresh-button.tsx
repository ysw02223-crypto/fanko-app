"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/lib/i18n";

export function HistoryRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const t = useT();

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {isPending ? t.btn_refreshing : t.btn_refresh}
    </button>
  );
}
