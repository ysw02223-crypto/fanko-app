"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export function OrdersPageHeader() {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.page_orders}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          셀 클릭으로 수정 후 Enter 또는 포커스 해제 시 저장됩니다.
        </p>
      </div>
      <Link
        href="/orders/new"
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        {t.btn_new_order}
      </Link>
    </div>
  );
}
