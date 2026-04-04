"use client";

import {
  upsertShippingInfoAction,
  type ActionState,
  type OrderForShipping,
} from "@/lib/actions/shipping";
import { useActionState, useRef, useTransition } from "react";

// ── 행별 저장 셀 ────────────────────────────────────────────────────────────────

type ShippingRowCellsProps = {
  order: OrderForShipping;
};

function ShippingRowCells({ order }: ShippingRowCellsProps) {
  const boundAction = upsertShippingInfoAction.bind(null, order.order_num);
  const [state, formAction] = useActionState<ActionState, FormData>(
    boundAction,
    null
  );
  const [isPending, startTransition] = useTransition();

  const s = order.shipping;

  const refs = {
    recipient_name: useRef<HTMLInputElement>(null),
    recipient_phone: useRef<HTMLInputElement>(null),
    recipient_email: useRef<HTMLInputElement>(null),
    zip_code: useRef<HTMLInputElement>(null),
    region: useRef<HTMLInputElement>(null),
    city: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
    customs_number: useRef<HTMLInputElement>(null),
  };

  function handleSave() {
    const formData = new FormData();
    for (const [key, ref] of Object.entries(refs)) {
      formData.set(key, ref.current?.value ?? "");
    }
    startTransition(() => {
      formAction(formData);
    });
  }

  const inputCls =
    "rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 min-w-[120px] w-full";
  const tdCls = "border-b border-zinc-100 px-3 py-2 dark:border-zinc-800";

  return (
    <>
      {/* 수취인명 */}
      <td className={tdCls}>
        <input
          ref={refs.recipient_name}
          name="recipient_name"
          defaultValue={s?.recipient_name ?? ""}
          placeholder="수취인명"
          className={inputCls}
        />
      </td>
      {/* 연락처 */}
      <td className={tdCls}>
        <input
          ref={refs.recipient_phone}
          name="recipient_phone"
          defaultValue={s?.recipient_phone ?? ""}
          placeholder="연락처"
          className={inputCls}
        />
      </td>
      {/* 이메일 */}
      <td className={tdCls}>
        <input
          ref={refs.recipient_email}
          name="recipient_email"
          defaultValue={s?.recipient_email ?? ""}
          placeholder="이메일"
          className={inputCls}
        />
      </td>
      {/* 우편번호 */}
      <td className={tdCls}>
        <input
          ref={refs.zip_code}
          name="zip_code"
          defaultValue={s?.zip_code ?? ""}
          placeholder="우편번호"
          className={inputCls}
        />
      </td>
      {/* 지역 */}
      <td className={tdCls}>
        <input
          ref={refs.region}
          name="region"
          defaultValue={s?.region ?? ""}
          placeholder="지역"
          className={inputCls}
        />
      </td>
      {/* 도시 */}
      <td className={tdCls}>
        <input
          ref={refs.city}
          name="city"
          defaultValue={s?.city ?? ""}
          placeholder="도시"
          className={inputCls}
        />
      </td>
      {/* 주소 */}
      <td className={tdCls}>
        <input
          ref={refs.address}
          name="address"
          defaultValue={s?.address ?? ""}
          placeholder="주소"
          className={inputCls}
        />
      </td>
      {/* 통관번호 */}
      <td className={tdCls}>
        <input
          ref={refs.customs_number}
          name="customs_number"
          defaultValue={s?.customs_number ?? ""}
          placeholder="통관번호"
          className={inputCls}
        />
      </td>
      {/* 저장 버튼 + 상태 메시지 */}
      <td className={tdCls}>
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          {state?.ok && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              {state.ok}
            </span>
          )}
          {state?.error && (
            <span className="text-xs text-red-500 dark:text-red-400">
              {state.error}
            </span>
          )}
        </div>
      </td>
    </>
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

  const thCls =
    "border-b border-zinc-200 px-3 py-2 dark:border-zinc-700 whitespace-nowrap";

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-zinc-50 text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <th className={thCls}>주문번호</th>
            <th className={thCls}>주문일자</th>
            <th className={thCls}>고객명</th>
            <th className={thCls}>상품명</th>
            <th className={thCls}>수취인명</th>
            <th className={thCls}>연락처</th>
            <th className={thCls}>이메일</th>
            <th className={thCls}>우편번호</th>
            <th className={thCls}>지역</th>
            <th className={thCls}>도시</th>
            <th className={thCls}>주소</th>
            <th className={thCls}>통관번호</th>
            <th className={thCls}>저장</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.order_num}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
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
              {/* 편집 셀들 */}
              <ShippingRowCells order={order} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
