"use client";

import {
  upsertShippingInfoAction,
  type ActionState,
  type OrderForShipping,
} from "@/lib/actions/shipping";
import { useActionState, useTransition } from "react";

// ── 행별 저장 폼 ────────────────────────────────────────────────────────────────

type ShippingRowFormProps = {
  order: OrderForShipping;
};

function ShippingRowForm({ order }: ShippingRowFormProps) {
  const boundAction = upsertShippingInfoAction.bind(null, order.order_num);
  const [state, formAction] = useActionState<ActionState, FormData>(
    boundAction,
    null
  );
  const [isPending, startTransition] = useTransition();

  const s = order.shipping;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="contents">
      {/* 수취인명 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="recipient_name"
          defaultValue={s?.recipient_name ?? ""}
          placeholder="수취인명"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 연락처 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="recipient_phone"
          defaultValue={s?.recipient_phone ?? ""}
          placeholder="연락처"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 이메일 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="recipient_email"
          defaultValue={s?.recipient_email ?? ""}
          placeholder="이메일"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 우편번호 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="zip_code"
          defaultValue={s?.zip_code ?? ""}
          placeholder="우편번호"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 지역 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="region"
          defaultValue={s?.region ?? ""}
          placeholder="지역"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 도시 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="city"
          defaultValue={s?.city ?? ""}
          placeholder="도시"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 주소 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="address"
          defaultValue={s?.address ?? ""}
          placeholder="주소"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 통관번호 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <input
          name="customs_number"
          defaultValue={s?.customs_number ?? ""}
          placeholder="통관번호"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 min-w-[120px] w-full"
        />
      </td>
      {/* 저장 버튼 + 상태 메시지 */}
      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <div className="flex flex-col items-start gap-1">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          {state?.ok && (
            <span className="text-xs text-emerald-600">{state.ok}</span>
          )}
          {state?.error && (
            <span className="text-xs text-red-500">{state.error}</span>
          )}
        </div>
      </td>
    </form>
  );
}

// ── 메인 테이블 ─────────────────────────────────────────────────────────────────

type ShippingTableProps = {
  orders: OrderForShipping[];
};

export function ShippingTable({ orders }: ShippingTableProps) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        주문이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-zinc-50 text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            {/* 읽기전용 컬럼 */}
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              주문번호
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              주문일자
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              고객명
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              상품명
            </th>
            {/* 편집 컬럼 */}
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              수취인명
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              연락처
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              이메일
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              우편번호
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              지역
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              도시
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              주소
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              통관번호
            </th>
            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              저장
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.order_num} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
              {/* 읽기전용 셀 */}
              <td className="border-b border-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-nowrap">
                {order.order_num}
              </td>
              <td className="border-b border-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-nowrap">
                {order.date}
              </td>
              <td className="border-b border-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-nowrap">
                {order.customer_name ?? "-"}
              </td>
              <td className="border-b border-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                {order.product_names.split("\n").map((name, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {name}
                  </span>
                ))}
              </td>
              {/* 편집 폼 셀들 */}
              <ShippingRowForm order={order} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}