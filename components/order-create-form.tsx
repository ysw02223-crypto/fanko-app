"use client";

import { createOrder, type ActionState } from "@/lib/actions/orders";
import {
  ORDER_PROGRESS,
  ORDER_ROUTES,
  PHOTO_STATUS,
  PLATFORMS,
} from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import { useActionState } from "react";

const initial: ActionState = null;

export function OrderCreateForm() {
  const [state, formAction, pending] = useActionState(createOrder, initial);

  return (
    <form action={formAction} className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>주문번호 *</span>
          <input name="order_num" required className={inputClass} placeholder="예: 1080800" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>플랫폼 *</span>
          <select name="platform" required className={selectClass} defaultValue="avito">
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>주문 경로 *</span>
          <select name="order_type" required className={selectClass} defaultValue="KOREA">
            {ORDER_ROUTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>주문일 *</span>
          <input name="date" type="date" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>진행 상태 *</span>
          <select name="progress" required className={selectClass} defaultValue="PAY">
            {ORDER_PROGRESS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>고객명</span>
          <input name="customer_name" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>선물 여부</span>
          <select name="gift" className={selectClass} defaultValue="no">
            <option value="no">no</option>
            <option value="ask">ask</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>사진 발송</span>
          <select name="photo_sent" className={selectClass} defaultValue="Not sent">
            {PHOTO_STATUS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>거래처 / 매입처</span>
          <input name="purchase_channel" className={inputClass} placeholder="예: 올리브영" />
        </label>
      </div>

      {state?.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "주문 만들기"}
      </button>
    </form>
  );
}
