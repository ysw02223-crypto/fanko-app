"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertIncomeRecord,
  deleteIncomeRecord,
  type IncomeRecordPayload,
} from "@/lib/actions/finance-income";
import type { FinIncomeRecord } from "@/lib/schema";
import { DEFAULT_RUB_RATE } from "@/lib/finance-categories";
import { INCOME_CATEGORIES_CONST } from "@/lib/schema";
import { inputClass, labelClass } from "@/lib/form-classes";

// ── 포맷 헬퍼 ─────────────────────────────────────────────────────────────────

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtRub(n: number) {
  return "₽" + n.toLocaleString("ru-RU");
}
function fmtAmount(amount: number, currency: "KRW" | "RUB") {
  return currency === "KRW" ? fmtKrw(amount) : fmtRub(amount);
}
function todayKst(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── 모달 타입 ─────────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; row: FinIncomeRecord };

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

function emptyForm(): FormState {
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

function rowToForm(row: FinIncomeRecord): FormState {
  return {
    date: row.date,
    category: row.category,
    sub_category: row.sub_category ?? "",
    product_name: row.product_name,
    product_type: row.product_type ?? "",
    sale_currency: row.sale_currency,
    sale_amount: String(row.sale_amount),
    sale_rate: String(row.sale_rate ?? DEFAULT_RUB_RATE),
    purchase_currency: row.purchase_currency,
    purchase_amount: String(row.purchase_amount),
    purchase_rate: String(row.purchase_rate ?? DEFAULT_RUB_RATE),
    note: row.note ?? "",
  };
}

// 실시간 차익 계산
function calcProfit(form: FormState): number | null {
  const sa = Number(form.sale_amount);
  const pa = Number(form.purchase_amount);
  if (!sa || !pa) return null;
  const saleKrw = form.sale_currency === "KRW" ? sa : sa * Number(form.sale_rate || DEFAULT_RUB_RATE);
  const buyKrw  = form.purchase_currency === "KRW" ? pa : pa * Number(form.purchase_rate || DEFAULT_RUB_RATE);
  return Math.round(saleKrw - buyKrw);
}

// ── 수입 모달 ─────────────────────────────────────────────────────────────────

function IncomeModal({
  modal,
  onClose,
}: {
  modal: Exclude<ModalState, { mode: "closed" }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(
    modal.mode === "edit" ? rowToForm(modal.row) : emptyForm(),
  );
  const [error, setError] = useState("");
  const isEdit = modal.mode === "edit";

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
      const res = await upsertIncomeRecord(payload, isEdit ? modal.row.id : undefined);
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  const profit = calcProfit(form);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-base font-semibold">{isEdit ? "수입 수정" : "수입 추가"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* 분류 + 날짜 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>분류</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value as FormState["category"])} className={inputClass + " mt-1"}>
                {INCOME_CATEGORIES_CONST.filter((c) => c !== "러시아판매").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>날짜</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass + " mt-1"} />
            </div>
          </div>

          {/* 상품명 + 소분류 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>상품명</label>
              <input type="text" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} placeholder="상품명을 입력하세요" className={inputClass + " mt-1"} />
            </div>
            <div>
              <label className={labelClass}>세부 분류 (선택)</label>
              <input type="text" value={form.sub_category} onChange={(e) => set("sub_category", e.target.value)} placeholder="올리브영, 도매처명 등" className={inputClass + " mt-1"} />
            </div>
          </div>

          {/* 판매가 */}
          <div>
            <label className={labelClass}>판매가</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-sm">
                <button type="button" onClick={() => set("sale_currency", "KRW")}
                  className={`px-3 py-1.5 ${form.sale_currency === "KRW" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  원화
                </button>
                <button type="button" onClick={() => set("sale_currency", "RUB")}
                  className={`px-3 py-1.5 ${form.sale_currency === "RUB" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  루블
                </button>
              </div>
              <input type="text" inputMode="numeric" value={form.sale_amount}
                onChange={(e) => set("sale_amount", e.target.value)}
                placeholder={form.sale_currency === "KRW" ? "원화 금액" : "루블 금액"}
                className={inputClass + " flex-1"} />
              {form.sale_currency === "RUB" && (
                <div className="flex items-center gap-1 text-sm text-zinc-500">
                  <span>×</span>
                  <input type="text" inputMode="decimal" value={form.sale_rate}
                    onChange={(e) => set("sale_rate", e.target.value)}
                    className="w-16 rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                  <span>= {form.sale_amount && form.sale_rate ? fmtKrw(Math.round(Number(form.sale_amount) * Number(form.sale_rate))) : "—"}</span>
                </div>
              )}
            </div>
          </div>

          {/* 매입가 */}
          <div>
            <label className={labelClass}>매입가</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-sm">
                <button type="button" onClick={() => set("purchase_currency", "KRW")}
                  className={`px-3 py-1.5 ${form.purchase_currency === "KRW" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  원화
                </button>
                <button type="button" onClick={() => set("purchase_currency", "RUB")}
                  className={`px-3 py-1.5 ${form.purchase_currency === "RUB" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}>
                  루블
                </button>
              </div>
              <input type="text" inputMode="numeric" value={form.purchase_amount}
                onChange={(e) => set("purchase_amount", e.target.value)}
                placeholder={form.purchase_currency === "KRW" ? "원화 금액" : "루블 금액"}
                className={inputClass + " flex-1"} />
              {form.purchase_currency === "RUB" && (
                <div className="flex items-center gap-1 text-sm text-zinc-500">
                  <span>×</span>
                  <input type="text" inputMode="decimal" value={form.purchase_rate}
                    onChange={(e) => set("purchase_rate", e.target.value)}
                    className="w-16 rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                  <span>= {form.purchase_amount && form.purchase_rate ? fmtKrw(Math.round(Number(form.purchase_amount) * Number(form.purchase_rate))) : "—"}</span>
                </div>
              )}
            </div>
          </div>

          {/* 차익 표시 */}
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
            <span className="text-sm text-zinc-500">차익 (원화)</span>
            <span className={`text-sm font-semibold ${profit == null ? "text-zinc-400" : profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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
          <button onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">취소</button>
          <button onClick={handleSubmit} disabled={isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {isPending ? "저장 중…" : isEdit ? "수정" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 테이블 ───────────────────────────────────────────────────────────────

export function IncomeTable({
  initialRows,
}: {
  initialRows: FinIncomeRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [filterCategory, setFilterCategory] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = initialRows.filter((r) => {
    const catOk = filterCategory === "전체" || r.category === filterCategory;
    const searchOk = !search || r.product_name.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  const totalSaleKrw  = filtered.reduce((s, r) => s + (r.sale_krw ?? 0), 0);
  const totalBuyKrw   = filtered.reduce((s, r) => s + (r.purchase_krw ?? 0), 0);
  const totalProfitKrw = filtered.reduce((s, r) => s + (r.profit_krw ?? 0), 0);

  function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteIncomeRecord(id);
      if (res.error) alert(res.error);
      else router.refresh();
      setDeletingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["전체", ...INCOME_CATEGORIES_CONST].map((c) => (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${filterCategory === c ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}>
              {c}
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="상품명 검색…"
          className="ml-auto w-48 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
        <button onClick={() => setModal({ mode: "add" })}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + 수입 추가
        </button>
      </div>

      {/* 요약 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">매출 {fmtKrw(totalSaleKrw)}</span>
        <span className="rounded-lg bg-red-50 px-4 py-2 text-red-800 dark:bg-red-950 dark:text-red-300">매입 {fmtKrw(totalBuyKrw)}</span>
        <span className={`rounded-lg px-4 py-2 ${totalProfitKrw >= 0 ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
          차익 {fmtKrw(totalProfitKrw)}
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-left">분류</th>
              <th className="px-3 py-2 text-left">상품명</th>
              <th className="px-3 py-2 text-right">판매가</th>
              <th className="px-3 py-2 text-right">환율</th>
              <th className="px-3 py-2 text-right">매입가</th>
              <th className="px-3 py-2 text-right">환율</th>
              <th className="px-3 py-2 text-right">차익 (원)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400">내역 없음</td></tr>
            )}
            {filtered.map((row) => {
              const isOrder = row.source === "order";
              return (
                <tr key={row.id}
                  className={`cursor-pointer ${isOrder ? "bg-blue-50/40 dark:bg-blue-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                  onClick={() => !isOrder && setModal({ mode: "edit", row })}>
                  <td className="px-3 py-2 text-zinc-500">{row.date}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.category === "러시아판매" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      : row.category === "도매" ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                      : row.category === "국내판매" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"}`}>
                      {row.category}
                    </span>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 font-medium">{row.product_name}</td>
                  <td className="px-3 py-2 text-right">{fmtAmount(row.sale_amount, row.sale_currency)}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{row.sale_currency === "RUB" ? row.sale_rate : "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtAmount(row.purchase_amount, row.purchase_currency)}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{row.purchase_currency === "RUB" ? row.purchase_rate : "—"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${(row.profit_krw ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.profit_krw != null ? fmtKrw(row.profit_krw) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {isOrder ? (
                      <span className="text-xs text-blue-400">주문</span>
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
                <td colSpan={3} className="px-3 py-2 text-right text-zinc-500">합계</td>
                <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(totalSaleKrw)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right text-red-600">{fmtKrw(totalBuyKrw)}</td>
                <td className="px-3 py-2" />
                <td className={`px-3 py-2 text-right ${totalProfitKrw >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtKrw(totalProfitKrw)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal.mode !== "closed" && (
        <IncomeModal modal={modal} onClose={() => setModal({ mode: "closed" })} />
      )}
    </div>
  );
}
