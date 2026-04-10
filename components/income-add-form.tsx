"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertIncomeRecord, type IncomeRecordPayload } from "@/lib/actions/finance-income";
import { DEFAULT_RUB_RATE } from "@/lib/finance-categories";
import { INCOME_CATEGORIES_CONST } from "@/lib/schema";
import { inputClass, labelClass } from "@/lib/form-classes";

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function todayKst(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type FormState = {
  date: string;
  category: "러시아판매" | "도매" | "국내판매" | "기타";
  sub_category: string;
  product_name: string;
  product_type: string;
  sale_currency: "KRW" | "RUB";
  sale_amount: string;
  sale_rate: string;
  purchase_currency: "KRW" | "RUB";
  purchase_amount: string;
  purchase_rate: string;
  note: string;
};

function initialForm(): FormState {
  return {
    date: todayKst(),
    category: "도매",
    sub_category: "",
    product_name: "",
    product_type: "",
    sale_currency: "KRW",
    sale_amount: "",
    sale_rate: String(DEFAULT_RUB_RATE),
    purchase_currency: "KRW",
    purchase_amount: "",
    purchase_rate: String(DEFAULT_RUB_RATE),
    note: "",
  };
}

function calcProfit(form: FormState): number | null {
  const sa = Number(form.sale_amount);
  const pa = Number(form.purchase_amount);
  if (!sa || !pa) return null;
  const saleKrw = form.sale_currency === "KRW" ? sa : sa * Number(form.sale_rate || DEFAULT_RUB_RATE);
  const buyKrw  = form.purchase_currency === "KRW" ? pa : pa * Number(form.purchase_rate || DEFAULT_RUB_RATE);
  return Math.round(saleKrw - buyKrw);
}

export function IncomeAddForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.date || !form.product_name || !form.sale_amount || !form.purchase_amount) {
      setError("날짜, 상품명, 판매가, 매입가는 필수입니다.");
      return;
    }
    const payload: IncomeRecordPayload = {
      date: form.date,
      category: form.category,
      sub_category: form.sub_category || null,
      product_name: form.product_name,
      product_type: form.product_type || null,
      sale_currency: form.sale_currency,
      sale_amount: Number(form.sale_amount),
      sale_rate: form.sale_currency === "RUB" ? Number(form.sale_rate) : null,
      purchase_currency: form.purchase_currency,
      purchase_amount: Number(form.purchase_amount),
      purchase_rate: form.purchase_currency === "RUB" ? Number(form.purchase_rate) : null,
      note: form.note || null,
    };
    startTransition(async () => {
      const res = await upsertIncomeRecord(payload);
      if (res.error) { setError(res.error); return; }
      router.push("/finance/income");
    });
  }

  const profit = calcProfit(form);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="space-y-5 px-6 py-6">

        {/* 분류 + 날짜 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>분류 *</label>
            <select value={form.category}
              onChange={(e) => set("category", e.target.value as FormState["category"])}
              className={inputClass + " mt-1"}>
              {INCOME_CATEGORIES_CONST.filter((c) => c !== "러시아판매").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>날짜 *</label>
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass + " mt-1"} />
          </div>
        </div>

        {/* 상품명 + 세부분류 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>상품명 *</label>
            <input type="text" value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              placeholder="상품명을 입력하세요"
              className={inputClass + " mt-1"} />
          </div>
          <div>
            <label className={labelClass}>세부 분류 (선택)</label>
            <input type="text" value={form.sub_category}
              onChange={(e) => set("sub_category", e.target.value)}
              placeholder="올리브영, 도매처명 등"
              className={inputClass + " mt-1"} />
          </div>
        </div>

        {/* 판매가 */}
        <div>
          <label className={labelClass}>판매가 *</label>
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-sm dark:border-zinc-700">
                <button type="button" onClick={() => set("sale_currency", "KRW")}
                  className={`px-3 py-1.5 transition ${form.sale_currency === "KRW" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  원화 (₩)
                </button>
                <button type="button" onClick={() => set("sale_currency", "RUB")}
                  className={`px-3 py-1.5 transition ${form.sale_currency === "RUB" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  루블 (₽)
                </button>
              </div>
              <input type="text" inputMode="numeric" value={form.sale_amount}
                onChange={(e) => set("sale_amount", e.target.value)}
                placeholder={form.sale_currency === "KRW" ? "원화 금액" : "루블 금액"}
                className={inputClass + " flex-1"} />
            </div>
            {form.sale_currency === "RUB" && (
              <div className="flex items-center gap-2 pl-2 text-sm text-zinc-500">
                <span>환율</span>
                <input type="text" inputMode="decimal" value={form.sale_rate}
                  onChange={(e) => set("sale_rate", e.target.value)}
                  className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                <span>₽/원 →</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {form.sale_amount && form.sale_rate
                    ? fmtKrw(Math.round(Number(form.sale_amount) * Number(form.sale_rate)))
                    : "—"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 매입가 */}
        <div>
          <label className={labelClass}>매입가 *</label>
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-sm dark:border-zinc-700">
                <button type="button" onClick={() => set("purchase_currency", "KRW")}
                  className={`px-3 py-1.5 transition ${form.purchase_currency === "KRW" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  원화 (₩)
                </button>
                <button type="button" onClick={() => set("purchase_currency", "RUB")}
                  className={`px-3 py-1.5 transition ${form.purchase_currency === "RUB" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  루블 (₽)
                </button>
              </div>
              <input type="text" inputMode="numeric" value={form.purchase_amount}
                onChange={(e) => set("purchase_amount", e.target.value)}
                placeholder={form.purchase_currency === "KRW" ? "원화 금액" : "루블 금액"}
                className={inputClass + " flex-1"} />
            </div>
            {form.purchase_currency === "RUB" && (
              <div className="flex items-center gap-2 pl-2 text-sm text-zinc-500">
                <span>환율</span>
                <input type="text" inputMode="decimal" value={form.purchase_rate}
                  onChange={(e) => set("purchase_rate", e.target.value)}
                  className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                <span>₽/원 →</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {form.purchase_amount && form.purchase_rate
                    ? fmtKrw(Math.round(Number(form.purchase_amount) * Number(form.purchase_rate)))
                    : "—"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 차익 */}
        <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
          <span className="text-sm text-zinc-500">예상 차익 (원화)</span>
          <span className={`text-base font-bold ${profit == null ? "text-zinc-400" : profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {profit == null ? "—" : fmtKrw(profit)}
          </span>
        </div>

        {/* 메모 */}
        <div>
          <label className={labelClass}>메모</label>
          <input type="text" value={form.note} onChange={(e) => set("note", e.target.value)} className={inputClass + " mt-1"} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
        <button onClick={() => router.push("/finance/income")}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
          취소
        </button>
        <button onClick={handleSubmit} disabled={isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {isPending ? "저장 중…" : "수입 추가"}
        </button>
      </div>
    </div>
  );
}
