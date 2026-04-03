import { OrderCreateForm } from "@/components/order-create-form";
import Link from "next/link";

export default function NewOrderPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href="/orders"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">새 주문</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          주문번호는 고유해야 합니다. 주문 정보와 상품을 한 번에 입력한 뒤 저장하면 목록으로 이동합니다.
        </p>
      </div>
      <OrderCreateForm />
    </div>
  );
}
