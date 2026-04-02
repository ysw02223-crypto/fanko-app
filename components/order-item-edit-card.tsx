"use client";

import { deleteOrderItem, updateOrderItem } from "@/lib/actions/order-items";
import type { ActionState } from "@/lib/actions/orders";
import { PRODUCT_CATEGORIES, SET_TYPES } from "@/lib/schema";
import type { OrderItemRow } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import { useActionState, useState } from "react";

const initial: ActionState = null;

export function OrderItemEditCard({ item, orderNum }: { item: OrderItemRow; orderNum: string }) {
  const [open, setOpen] = useState(false);
  const boundUpdate = updateOrderItem.bind(null, item.id, orderNum);
  const [state, formAction, pending] = useActionState(boundUpdate, initial);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
      >
        <div className="min-w-0">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.product_name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
            {item.product_option || "옵션 없음"} · {item.product_set_type} · 수량 {item.quantity} · ₽
            {item.price_rub}
            {item.krw ? ` · ₩${item.krw}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">{open ? "닫기" : "편집"}</span>
      </button>

      {open ? (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <form action={formAction} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>카테고리</span>
                <select
                  name="product_type"
                  className={selectClass}
                  defaultValue={item.product_type ?? ""}
                >
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
                <input name="product_name" required className={inputClass} defaultValue={item.product_name} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                <span className={labelClass}>옵션</span>
                <input
                  name="product_option"
                  className={inputClass}
                  defaultValue={item.product_option ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>단품/세트</span>
                <select
                  name="product_set_type"
                  className={selectClass}
                  defaultValue={item.product_set_type}
                >
                  {SET_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>수량 *</span>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  required
                  className={inputClass}
                  defaultValue={item.quantity}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>판매가 ₽ *</span>
                <input
                  name="price_rub"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  className={inputClass}
                  defaultValue={item.price_rub}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>선결제 ₽</span>
                <input
                  name="prepayment_rub"
                  type="number"
                  step="0.01"
                  min={0}
                  className={inputClass}
                  defaultValue={item.prepayment_rub}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>잔금 ₽</span>
                <input
                  name="extra_payment_rub"
                  type="number"
                  step="0.01"
                  min={0}
                  className={inputClass}
                  defaultValue={item.extra_payment_rub}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>원화 매입</span>
                <input
                  name="krw"
                  type="number"
                  step={1}
                  min={0}
                  className={inputClass}
                  defaultValue={item.krw ?? ""}
                  placeholder="비우면 NULL"
                />
              </label>
            </div>

            {state?.error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
            ) : null}
            {state?.ok ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{state.ok}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {pending ? "저장 중…" : "이 상품 저장"}
              </button>
            </div>
          </form>

          <form
            className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
            action={deleteOrderItem.bind(null, item.id, orderNum)}
            onSubmit={(e) => {
              if (!confirm("이 상품 행을 삭제할까요?")) e.preventDefault();
            }}
          >
            <button
              type="submit"
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              상품 행 삭제
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
