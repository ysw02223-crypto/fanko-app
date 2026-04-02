import { OrderCreateForm } from "@/components/order-create-form";
import Link from "next/link";

export default function NewOrderPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/orders"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">새 주문</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          주문번호는 고유해야 합니다. 저장 후 상품 행을 추가할 수 있습니다.
        </p>
      </div>
      <OrderCreateForm />
    </div>
  );
}
