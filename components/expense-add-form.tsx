"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertExpenseRecord, type ExpenseRecordPayload } from "@/lib/actions/finance-expense";
import { EXPENSE_CATEGORIES, DEFAULT_RUB_RATE } from "@/lib/finance-categories";
import { inputClass, labelClass } from "@/lib/form-classes";

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function todayKst(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MAJOR_KEYS = Object.keys(EXPENSE_CATEGORIES);

type FormState = {
  date: string;
  major_category: string;
  mid_category: string;
  minor_category: string;
  description: string;
  currency: "KRW" | "RUB";
  amount: string;
  rate: string;
  memo: string;
};

function initialForm(): FormState {
  const firstMajor = MAJOR_KEYS[0] ?? "";
  const mids = firstMajor ? Object.keys(EXPENSE_CATEGORIES[firstMajor] ?? {}) : [];
  const firstMid = mids[0] ?? "";
  return {
    date: todayKst(),
    major_category: firstMajor,
    mid_category: firstMid,
    minor_category: "",
    description: "",
    currency: "KRW",
    amount: "",
    rate: String(DEFAULT_RUB_RATE),
    memo: "",
  };
}

export function ExpenseAddForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setFormState] = useState<FormState>(initialForm);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setFormState((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "major_category") {
        const mids = Object.keys(EXPENSE_CATEGORIES[value as string] ?? {});
        next.mid_category = mids[0] ?? "";
        next.minor_category = "";
      }
      if (field === "mid_category") {
        next.minor_category = "";
      }
      return next;
    });
  }

  const midOptions = Object.keys(EXPENSE_CATEGORIES[form.major_category] ?? {});
  const minorOptions = EXPENSE_CATEGORIES[form.major_category]?.[form.mid_category] ?? [];

  const amountKrw = form.currency === "KRW"
    ? Number(form.amount)
    : Math.round(Number(form.amount) * Number(form.rate || DEFAULT_RUB_RATE));

  function handleSubmit() {
    if (!form.date || !form.description || !form.amount || !form.major_category) {
      setError("날짜, 대분류, 내용, 금액은 필수입니다.");
      return;
    }
    const payload: ExpenseRecordPayload = {
      date: form.date,
      major_category: form.major_category,
      mid_category: form.mid_category || null,
      minor_category: form.minor_category || null,
      description: form.description,
      currency: form.currency,
      amount: Number(form.amount),
      rate: form.currency === "RUB" ? Number(form.rate) : null,
      memo: form.memo || null,
    };
    startTransition(async () => {
      const res = await upsertExpenseRecord(payload);
      if (res.error) { setError(res.error); return; }
      router.push("/finance/expense");
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="space-y-5 px-6 py-6">

        {/* 날짜 */}
        <div>
          <label className={labelClass}>날짜 *</label>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass + " mt-1 max-w-xs"} />
        </div>

        {/* 3단 분류 */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>대분류 *</label>
            <select value={form.major_category} onChange={(e) => set("major_category", e.target.value)} className={inputClass + " mt-1"}>
              {MAJOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>중분류</label>
            <select value={form.mid_category} onChange={(e) => set("mid_category", e.target.value)} className={inputClass + " mt-1"}>
              {midOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>소분류</label>
            <select value={form.minor_category} onChange={(e) => set("minor_category", e.target.value)} className={inputClass + " mt-1"}>
              <option value="">—</option>
              {minorOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        {/* 내용 */}
        <div>
          <label className={labelClass}>내용 *</label>
          <input type="text" value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="지출 내용을 입력하세요"
            className={inputClass + " mt-1"} />
        </div>

        {/* 비용 */}
        <div>
          <label className={labelClass}>비용 *</label>
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-sm dark:border-zinc-700">
                <button type="button" onClick={() => set("currency", "KRW")}
                  className={`px-3 py-1.5 transition ${form.currency === "KRW" ? "bg-rose-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  원화 (₩)
                </button>
                <button type="button" onClick={() => set("currency", "RUB")}
                  className={`px-3 py-1.5 transition ${form.currency === "RUB" ? "bg-rose-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  루블 (₽)
                </button>
              </div>
              <input type="text" inputMode="numeric" value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder={form.currency === "KRW" ? "원화 금액" : "루블 금액"}
                className={inputClass + " flex-1"} />
            </div>
            {form.currency === "RUB" && (
              <div className="flex items-center gap-2 pl-2 text-sm text-zinc-500">
                <span>환율</span>
                <input type="text" inputMode="decimal" value={form.rate}
                  onChange={(e) => set("rate", e.target.value)}
                  className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                <span>₽/원 →</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {form.amount && form.rate ? fmtKrw(Math.round(Number(form.amount) * Number(form.rate))) : "—"}
                </span>
              </div>
            )}
            {form.amount && (
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 dark:bg-red-950/30">
                <span className="text-sm text-zinc-500">원화 환산 금액</span>
                <span className="text-sm font-bold text-red-600">{fmtKrw(amountKrw)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 메모 */}
        <div>
          <label className={labelClass}>메모</label>
          <input type="text" value={form.memo} onChange={(e) => set("memo", e.target.value)} className={inputClass + " mt-1"} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
        <button onClick={() => router.push("/finance/expense")}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
          취소
        </button>
        <button onClick={handleSubmit} disabled={isPending}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          {isPending ? "저장 중…" : "지출 추가"}
        </button>
      </div>
    </div>
  );
}
