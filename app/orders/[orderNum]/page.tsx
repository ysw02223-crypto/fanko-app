import { DeleteOrderButton } from "@/components/delete-order-button";
import { OrderEditForm } from "@/components/order-edit-form";
import { createClient } from "@/lib/supabase/server";
import type { OrderItemRow, OrderRow } from "@/lib/schema";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNum: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { orderNum: raw } = await params;
  const orderNum = decodeURIComponent(raw);
  const { e: errMsg } = await searchParams;

  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("order_num", orderNum)
    .maybeSingle();

  if (orderError || !order) notFound();

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_num", orderNum)
    .order("id", { ascending: true });

  if (itemsError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        상품 목록을 불러오지 못했습니다: {itemsError.message}
      </div>
    );
  }

  const typedOrder = order as OrderRow;
  const typedItems = (items ?? []) as OrderItemRow[];

  return (
    <div className="h-full overflow-y-auto">
    <div className="flex flex-col gap-8 px-6 py-6">
      {errMsg ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {errMsg}
        </div>
      ) : null}
      <div>
        <Link
          href="/orders"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← 목록으로
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">주문 {orderNum}</h1>
          <DeleteOrderButton orderNum={orderNum} />
        </div>
      </div>

      <OrderEditForm order={typedOrder} items={typedItems} />
    </div>
    </div>
  );
}
