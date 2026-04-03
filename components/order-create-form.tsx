"use client";

import { createOrderWithItemsAction, type NewOrderLinePayload } from "@/lib/actions/orders";
import { ORDER_ROUTES, PLATFORMS, PRODUCT_CATEGORIES, SET_TYPES } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import { useMemo, useState, useTransition, type FormEvent } from "react";

function moscowTodayYmd(): string {
  const moscowDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const yyyy = moscowDate.getFullYear();
  const mm = String(moscowDate.getMonth() + 1).padStart(2, "0");
  const dd = String(moscowDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type LineRow = {
  id: string;
  product_type: string;
  product_name: string;
  product_option: string;
  product_set_type: string;
  quantity: string;
  price_rub: string;
  prepayment_rub: string;
};

function emptyLine(): LineRow {
  return {
    id: crypto.randomUUID(),
    product_type: "",
    product_name: "",
    product_option: "",
    product_set_type: "Single",
    quantity: "1",
    price_rub: "",
    prepayment_rub: "0",
  };
}

function lineExtraRub(line: LineRow): string {
  const p = Number(line.price_rub);
  const pre = Number(line.prepayment_rub);
  if (!Number.isFinite(p) || !Number.isFinite(pre)) return "—";
  return (p - pre).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function OrderCreateForm() {
  const today = useMemo(() => moscowTodayYmd(), []);
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const updateLine = (id: string, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const order_num = String(fd.get("order_num") ?? "").trim();
    const platform = String(fd.get("platform") ?? "");
    const order_type = String(fd.get("order_type") ?? "");
    const date = String(fd.get("date") ?? "").trim();
    const customer_name = String(fd.get("customer_name") ?? "").trim();
    const gift = String(fd.get("gift") ?? "no");

    if (!order_num) {
      setFormError("주문번호를 입력하세요.");
      return;
    }

    const payloadLines: NewOrderLinePayload[] = [];

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!L.product_name.trim()) {
        setFormError(`상품 ${i + 1}행: 상품명을 입력하세요.`);
        return;
      }
      const priceRaw = L.price_rub.trim();
      if (!priceRaw) {
        setFormError(`상품 ${i + 1}행: 판매가(₽)를 입력하세요.`);
        return;
      }
      const price_rub = Number(priceRaw);
      if (!Number.isFinite(price_rub)) {
        setFormError(`상품 ${i + 1}행: 판매가(₽)를 입력하세요.`);
        return;
      }
      const q = Math.floor(Number(L.quantity));
      if (!Number.isFinite(q) || q < 1) {
        setFormError(`상품 ${i + 1}행: 수량을 확인하세요.`);
        return;
      }
      const prepRaw = L.prepayment_rub.trim();
      const prepayment_rub = prepRaw === "" ? 0 : Number(prepRaw);
      if (!Number.isFinite(prepayment_rub) || prepayment_rub < 0) {
        setFormError(`상품 ${i + 1}행: 선결제(₽)를 확인하세요.`);
        return;
      }

      payloadLines.push({
        product_type: L.product_type,
        product_name: L.product_name.trim(),
        product_option: L.product_option,
        product_set_type: L.product_set_type,
        quantity: q,
        price_rub,
        prepayment_rub,
      });
    }

    if (payloadLines.length < 1) {
      setFormError("상품을 최소 1개 이상 추가하세요.");
      return;
    }

    startTransition(async () => {
      const res = await createOrderWithItemsAction({
        order_num,
        platform,
        order_type,
        date,
        customer_name,
        gift,
        lines: payloadLines,
      });
      if (res?.error) setFormError(res.error);
    });
  };

  const th =
    "whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
  const td = "border-b border-zinc-200/80 px-2 py-1.5 align-middle dark:border-zinc-700/80";
  const cellInput = `${inputClass} !py-1.5 text-sm`;
  const cellSelect = `${selectClass} !py-1.5 text-sm`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <input type="hidden" name="progress" value="PAY" />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>주문번호 *</span>
          <input name="order_num" required className={inputClass} placeholder="예: 1080800" autoComplete="off" />
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
          <span className={labelClass}>고객명</span>
          <input name="customer_name" className={inputClass} autoComplete="off" />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>주문일 *</span>
          <input name="date" type="date" required className={inputClass} defaultValue={today} />
          <span className="text-xs text-zinc-500">기본값: 모스크바 기준 오늘 날짜 (필요 시 변경 가능)</span>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>선물 여부</span>
          <select name="gift" className={selectClass} defaultValue="no">
            <option value="no">no</option>
            <option value="ask">ask</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">상품</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={th}>카테고리</th>
                <th className={th}>상품명 *</th>
                <th className={th}>옵션</th>
                <th className={th}>단품/세트</th>
                <th className={`${th} text-right`}>수량</th>
                <th className={`${th} text-right`}>판매가₽ *</th>
                <th className={`${th} text-right`}>선결제₽</th>
                <th className={`${th} text-right`}>잔금₽</th>
                <th className={`${th} w-12 text-center`}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={td}>
                    <select
                      className={cellSelect}
                      value={line.product_type}
                      onChange={(e) => updateLine(line.id, { product_type: e.target.value })}
                    >
                      <option value="">—</option>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <input
                      className={cellInput}
                      value={line.product_name}
                      onChange={(e) => updateLine(line.id, { product_name: e.target.value })}
                      placeholder="필수"
                    />
                  </td>
                  <td className={td}>
                    <input
                      className={cellInput}
                      value={line.product_option}
                      onChange={(e) => updateLine(line.id, { product_option: e.target.value })}
                    />
                  </td>
                  <td className={td}>
                    <select
                      className={cellSelect}
                      value={line.product_set_type}
                      onChange={(e) => updateLine(line.id, { product_set_type: e.target.value })}
                    >
                      {SET_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      min={1}
                      className={`${cellInput} text-right tabular-nums`}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                    />
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      step="0.01"
                      className={`${cellInput} text-right tabular-nums`}
                      value={line.price_rub}
                      onChange={(e) => updateLine(line.id, { price_rub: e.target.value })}
                      placeholder="필수"
                    />
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      step="0.01"
                      className={`${cellInput} text-right tabular-nums`}
                      value={line.prepayment_rub}
                      onChange={(e) => updateLine(line.id, { prepayment_rub: e.target.value })}
                    />
                  </td>
                  <td className={`${td} text-right tabular-nums text-zinc-700 dark:text-zinc-300`}>
                    {lineExtraRub(line)}
                  </td>
                  <td className={`${td} text-center`}>
                    <button
                      type="button"
                      disabled={lines.length <= 1}
                      className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40"
                      aria-label="행 삭제"
                      onClick={() => removeLine(line.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addLine}
          className="w-fit rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          + 상품 추가
        </button>
      </div>

      {formError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "주문 저장"}
      </button>
    </form>
  );
}
