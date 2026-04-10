"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertExpenseRecord,
  deleteExpenseRecord,
  type ExpenseRecordPayload,
} from "@/lib/actions/finance-expense";
import type { FinExpenseRecord } from "@/lib/schema";
import { EXPENSE_CATEGORIES, DEFAULT_RUB_RATE } from "@/lib/finance-categories";
import { inputClass, labelClass } from "@/lib/form-classes";

// ── 포맷 헬퍼 ─────────────────────────────────────────────────────────────────

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtRub(n: number) {
  return "₽" + n.toLocaleString("ru-RU");
}
function todayKst(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── 모달 타입 ─────────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; row: FinExpenseRecord };

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

const MAJOR_KEYS = Object.keys(EXPENSE_CATEGORIES);

function emptyForm(): FormState {
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

function rowToForm(row: FinExpenseRecord): FormState {
  return {
    date: row.date,
    major_category: row.major_category,
    mid_category: row.mid_category ?? "",
    minor_category: row.minor_category ?? "",
    description: row.description,
    currency: row.currency,
    amount: String(row.amount),
    rate: String(row.rate ?? DEFAULT_RUB_RATE),
    memo: row.memo ?? "",
  };
}

// ── 지출 모달 ─────────────────────────────────────────────────────────────────

function ExpenseModal({
  modal,
  onClose,
}: {
  modal: Exclude<ModalState, { mode: "closed" }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setFormState] = useState<FormState>(
    modal.mode === "edit" ? rowToForm(modal.row) : emptyForm(),
  );
  const [error, setError] = useState("");
  const isEdit = modal.mode === "edit";

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
      const res = await upsertExpenseRecord(payload, isEdit ? modal.row.id : undefined);
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-base font-semibold">{isEdit ? "지출 수정" : "지출 추가"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* 날짜 */}
          <div>
            <label className={labelClass}>날짜</label>
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass + " mt-1"} />
          </div>

          {/* 3단 분류 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>대분류</label>
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
            <label className={labelClass}>내용</label>
            <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="지출 내용을 입력하세요" className={inputClass + " mt-1"} />
          </div>

          {/* 비용 */}
          <div>
            <label className={labelClass}>비용</label>
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
                <p className="pl-2 text-xs text-zinc-400">원화 환산: {fmtKrw(amountKrw)}</p>
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
          <button onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">취소</button>
          <button onClick={handleSubmit} disabled={isPending} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            {isPending ? "저장 중…" : isEdit ? "수정" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 테이블 ───────────────────────────────────────────────────────────────

export function ExpenseTable({
  initialRows,
}: {
  initialRows: FinExpenseRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [filterMajor, setFilterMajor] = useState("전체");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = initialRows.filter((r) => {
    const catOk = filterMajor === "전체" || r.major_category === filterMajor;
    const searchOk = !search || r.description.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  const totalKrw = filtered.reduce((s, r) => s + (r.amount_krw ?? 0), 0);
  const totalRub = filtered.filter((r) => r.currency === "RUB").reduce((s, r) => s + r.amount, 0);

  function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteExpenseRecord(id);
      if (res.error) alert(res.error);
      else router.refresh();
      setDeletingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {["전체", ...MAJOR_KEYS].map((c) => (
            <button key={c} onClick={() => setFilterMajor(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${filterMajor === c ? "bg-rose-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}>
              {c}
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="내용 검색…"
          className="ml-auto w-48 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
        <button onClick={() => setModal({ mode: "add" })}
          className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700">
          + 지출 추가
        </button>
      </div>

      {/* 요약 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-red-50 px-4 py-2 text-red-800 dark:bg-red-950 dark:text-red-300">
          원화 합계 {fmtKrw(totalKrw)}
        </span>
        {totalRub > 0 && (
          <span className="rounded-lg bg-orange-50 px-4 py-2 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            루블 합계 {fmtRub(totalRub)}
          </span>
        )}
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-left">대분류</th>
              <th className="px-3 py-2 text-left">중분류</th>
              <th className="px-3 py-2 text-left">소분류</th>
              <th className="px-3 py-2 text-left">내용</th>
              <th className="px-3 py-2 text-right">금액</th>
              <th className="px-3 py-2 text-right">환율</th>
              <th className="px-3 py-2 text-right">원화환산</th>
              <th className="px-3 py-2 text-left">메모</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-zinc-400">내역 없음</td></tr>
            )}
            {filtered.map((row) => {
              const isOrder = row.source === "order";
              return (
                <tr key={row.id}
                  className={`cursor-pointer ${isOrder ? "bg-orange-50/40 dark:bg-orange-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                  onClick={() => !isOrder && setModal({ mode: "edit", row })}>
                  <td className="px-3 py-2 text-zinc-500">{row.date}</td>
                  <td className="px-3 py-2 text-xs">{row.major_category}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{row.mid_category ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{row.minor_category ?? "—"}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-medium">{row.description}</td>
                  <td className="px-3 py-2 text-right text-red-600">
                    {row.currency === "KRW" ? fmtKrw(row.amount) : fmtRub(row.amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-400">{row.currency === "RUB" && row.rate ? row.rate : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtKrw(row.amount_krw ?? 0)}</td>
                  <td className="max-w-[100px] truncate px-3 py-2 text-zinc-400">{row.memo ?? ""}</td>
                  <td className="px-3 py-2">
                    {isOrder ? (
                      <span className="text-xs text-orange-400">주문</span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                        disabled={deletingId === row.id || isPending}
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-zinc-500">원화 합계</td>
                <td className="px-3 py-2 text-right text-red-600">{fmtKrw(totalKrw)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal.mode !== "closed" && (
        <ExpenseModal modal={modal} onClose={() => setModal({ mode: "closed" })} />
      )}
    </div>
  );
}
