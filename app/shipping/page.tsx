import { ShippingTable } from "@/components/shipping-table";
import { getOrdersForShipping } from "@/lib/actions/shipping";

export default async function ShippingPage() {
  let orders;
  try {
    orders = await getOrdersForShipping();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        배송 정보를 불러오지 못했습니다: {message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">배송 관리</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            수취인 정보를 입력하고 엑셀로 내보낼 수 있습니다.
          </p>
        </div>
        <a
          href="/shipping/export"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          엑셀 다운로드
        </a>
      </div>
      <ShippingTable orders={orders} />
    </div>
  );
}