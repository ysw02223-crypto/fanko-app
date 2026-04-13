"use client";

import { OrderCreateForm } from "@/components/order-create-form";
import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function NewOrderPage() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <Link
          href="/orders"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {t.btn_back}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t.page_orders_new}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t.page_orders_new_subtitle}
        </p>
      </div>
      <OrderCreateForm />
    </div>
  );
}
