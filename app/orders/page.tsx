import { createClient } from "@/lib/supabase/server";
import type { OrderProgress, OrderRoute, Platform } from "@/lib/schema";
import { ORDER_PROGRESS, PLATFORMS } from "@/lib/schema";
import Link from "next/link";

type ListRow = {
  order_num: string;
  platform: Platform;
  order_type: OrderRoute;
  date: string;
  progress: OrderProgress;
  customer_name: string | null;
};

type SearchParams = { platform?: string; progress?: string };

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
    .select("order_num, platform, order_type, date, progress, customer_name")
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

  const orders = (rows ?? []) as ListRow[];

  const itemCountByOrder = new Map<string, number>();
  const { data: itemRows, error: itemsError } = await supabase
    .from("order_items")
    .select("order_num");
  if (!itemsError && itemRows) {
    for (const r of itemRows) {
      const k = r.order_num as string;
      itemCountByOrder.set(k, (itemCountByOrder.get(k) ?? 0) + 1);
    }
  }

  const base = "/orders";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">주문 목록</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            총 {orders.length}건 · Supabase orders / order_items
            {itemsError ? (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                (상품 수는 불러오지 못함: {itemsError.message})
              </span>
            ) : null}
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

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">주문번호</th>
                <th className="px-4 py-3">플랫폼</th>
                <th className="px-4 py-3">경로</th>
                <th className="px-4 py-3">일자</th>
                <th className="px-4 py-3">진행</th>
                <th className="px-4 py-3">고객</th>
                <th className="px-4 py-3 text-right">상품 수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                    표시할 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const n = itemCountByOrder.get(o.order_num) ?? 0;
                  return (
                    <tr key={o.order_num} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                      <td className="px-4 py-3 font-mono font-medium">
                        <Link
                          href={`/orders/${encodeURIComponent(o.order_num)}`}
                          className="text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          {o.order_num}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{o.platform}</td>
                      <td className="px-4 py-3">{o.order_type}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{o.date?.slice(0, 10) ?? "—"}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={o.progress}>
                        {o.progress}
                      </td>
                      <td className="px-4 py-3 max-w-[220px] truncate" title={o.customer_name ?? ""}>
                        {o.customer_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{n}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
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
