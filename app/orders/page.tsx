import { OrdersLineItemsTable } from "@/components/orders-line-items-table";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithNestedItems } from "@/lib/orders-line-items-flatten";
import { ORDER_PROGRESS, PLATFORMS } from "@/lib/schema";
import Link from "next/link";

type SearchParams = { platform?: string; progress?: string };

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
    krw
  )
`;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const platformFilter =
    typeof sp.platform === "string" && (PLATFORMS as readonly string[]).includes(sp.platform)
      ? sp.platform
      : undefined;
  const progressFilter =
    typeof sp.progress === "string" &&
    (ORDER_PROGRESS as readonly string[]).includes(sp.progress)
      ? sp.progress
      : undefined;

  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .order("date", { ascending: false })
    .order("order_num", { ascending: false });

  if (platformFilter) query = query.eq("platform", platformFilter);
  if (progressFilter) query = query.eq("progress", progressFilter);

  const { data: rows, error } = await query;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        목록을 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  const orders = (rows ?? []) as OrderWithNestedItems[];
  const lineCount = orders.reduce(
    (acc, o) => acc + Math.max(1, (o.order_items ?? []).length),
    0,
  );
  const base = "/orders";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">주문 목록</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lineCount}행 표시 · 주문 {orders.length}건 · 같은 주문번호는 배경으로 묶여 있으며, 품목마다 행이
            나뉩니다. 셀 클릭으로 수정 후 Enter 또는 포커스 해제 시 저장됩니다.
          </p>
        </div>
        <Link
          href="/orders/new"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          새 주문
        </Link>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">필터</p>
        <div className="flex flex-wrap gap-2">
          <FilterLink href={base} active={!platformFilter && !progressFilter}>
            전체
          </FilterLink>
          {PLATFORMS.map((p) => (
            <FilterLink
              key={p}
              href={
                progressFilter
                  ? `${base}?platform=${encodeURIComponent(p)}&progress=${encodeURIComponent(progressFilter)}`
                  : `${base}?platform=${encodeURIComponent(p)}`
              }
              active={platformFilter === p}
            >
              {p}
            </FilterLink>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ORDER_PROGRESS.map((p) => (
            <FilterLink
              key={p}
              href={
                platformFilter
                  ? `${base}?platform=${encodeURIComponent(platformFilter)}&progress=${encodeURIComponent(p)}`
                  : `${base}?progress=${encodeURIComponent(p)}`
              }
              active={progressFilter === p}
            >
              {p}
            </FilterLink>
          ))}
        </div>
      </div>

      <OrdersLineItemsTable initialOrders={orders} />
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-emerald-600 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      }`}
    >
      {children}
    </Link>
  );
}
