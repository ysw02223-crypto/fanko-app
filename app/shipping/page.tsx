import { ShippingTable } from "@/components/shipping-table";
import { getOrdersForShipping } from "@/lib/actions/shipping";

export default async function ShippingPage() {
  let initialOrders;
  try {
    initialOrders = await getOrdersForShipping();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        배송 정보를 불러오지 못했습니다: {message}
      </div>
    );
  }

  return <ShippingTable initialOrders={initialOrders} />;
}
