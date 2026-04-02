"use client";

import { deleteOrder } from "@/lib/actions/orders";

export function DeleteOrderButton({ orderNum }: { orderNum: string }) {
  return (
    <form
      action={deleteOrder.bind(null, orderNum)}
      onSubmit={(e) => {
        if (!confirm("이 주문과 연결된 상품 행까지 모두 삭제됩니다. 계속할까요?")) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        주문 삭제
      </button>
    </form>
  );
}
