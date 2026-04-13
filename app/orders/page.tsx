import { OrdersLineItemsTable } from "@/components/orders-line-items-table";
import { OrdersPageHeader } from "@/components/orders-page-header";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithNestedItems } from "@/lib/orders-line-items-flatten";

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
      <OrdersPageHeader />
      <OrdersLineItemsTable initialOrders={orders} />
    </div>
  );
}
