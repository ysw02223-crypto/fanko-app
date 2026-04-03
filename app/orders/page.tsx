import { OrdersLineItemsTable } from "@/components/orders-line-items-table";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithNestedItems } from "@/lib/orders-line-items-flatten";
import Link from "next/link";

const ORDER_LIST_SELECT = `
  *,
  order_items (
    id,
    product_type,
    product_name,
    product_option,
    product_set_type,
    quantity,
    price_rub,
    prepayment_rub,
    extra_payment_rub,
    krw,
    progress,
    gift,
    photo_sent
  )
`;

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .order("date", { ascending: false })
    .order("order_num", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        목록을 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  const orders = (rows ?? []) as OrderWithNestedItems[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">주문 목록</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            셀 클릭으로 수정 후 Enter 또는 포커스 해제 시 저장됩니다.
          </p>
        </div>
        <Link
          href="/orders/new"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          새 주문
        </Link>
      </div>

      <OrdersLineItemsTable initialOrders={orders} />
    </div>
  );
}
