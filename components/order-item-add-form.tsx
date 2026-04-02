"use client";

import { createOrderItem } from "@/lib/actions/order-items";
import type { ActionState } from "@/lib/actions/orders";
import { PRODUCT_CATEGORIES, SET_TYPES } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import { useActionState, useEffect, useRef } from "react";

const initial: ActionState = null;

export function OrderItemAddForm({ orderNum }: { orderNum: string }) {
  const bound = createOrderItem.bind(null, orderNum);
  const [state, formAction, pending] = useActionState(bound, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
    >
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">상품 추가</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>카테고리</span>
          <select name="product_type" className={selectClass} defaultValue="">
            <option value="">—</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>상품명 *</span>
          <input name="product_name" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className={labelClass}>옵션</span>
          <input name="product_option" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>단품/세트</span>
          <select name="product_set_type" className={selectClass} defaultValue="Single">
            {SET_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>수량 *</span>
          <input name="quantity" type="number" min={1} step={1} defaultValue={1} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>판매가 ₽ *</span>
          <input name="price_rub" type="number" step="0.01" min={0} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>선결제 ₽</span>
          <input name="prepayment_rub" type="number" step="0.01" min={0} defaultValue={0} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>잔금 ₽</span>
          <input name="extra_payment_rub" type="number" step="0.01" min={0} defaultValue={0} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>원화 매입</span>
          <input name="krw" type="number" step={1} min={0} className={inputClass} placeholder="비워두면 NULL" />
        </label>
      </div>

      {state?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{state.ok}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "추가 중…" : "상품 행 추가"}
      </button>
    </form>
  );
}
