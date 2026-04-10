"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertKrTransaction,
  deleteKrTransaction,
} from "@/lib/actions/finance";
import {
  KR_EXPENSE_CATEGORIES,
  KR_INCOME_CATEGORIES,
  KR_PAYMENT_METHODS,
} from "@/lib/finance-categories";
import type { FinKrTransaction } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function todayKst(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Modal form state ─────────────────────────────────────────────────────────

type TabType = "income" | "expense";

type ModalState =
  | { mode: "closed" }
  | { mode: "add"; tab: TabType }
  | { mode: "edit"; row: FinKrTransaction };

type FormData = {
  date: string;
  type: TabType;
  category: string;
  subcategory: string;
  detail: string;
  description: string;
  amount: string;
  payment_method: string;
  selling_price: string;
  note: string;
};

function emptyForm(tab: TabType): FormData {
  return {
    date: todayKst(),
    type: tab,
    category: tab === "income" ? KR_INCOME_CATEGORIES[0] : "",
    subcategory: "",
    detail: "",
    description: "",
    amount: "",
    payment_method: "",
    selling_price: "",
    note: "",
  };
}

function rowToForm(row: FinKrTransaction): FormData {
  return {
    date: row.date,
    type: row.type,
    category: row.category,
    subcategory: row.subcategory ?? "",
    detail: row.detail ?? "",
    description: row.description,
    amount: String(row.amount),
    payment_method: row.payment_method ?? "",
    selling_price: row.selling_price != null ? String(row.selling_price) : "",
    note: row.note ?? "",
  };
}

// ── Modal component ──────────────────────────────────────────────────────────

function KrModal({
  modal,
  yearMonth,
  onClose,
}: {
  modal: Exclude<ModalState, { mode: "closed" }>;
  yearMonth: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormData>(
    modal.mode === "edit" ? rowToForm(modal.row) : emptyForm(modal.tab),
  );
  const [error, setError] = useState("");

  const isEdit = modal.mode === "edit";
  const tab = form.type;

  // Cascading category options
  const expTopKeys = Object.keys(KR_EXPENSE_CATEGORIES);
  const expSubKeys =
    tab === "expense" && form.category
      ? Object.keys(KR_EXPENSE_CATEGORIES[form.category] ?? {})
      : [];
  const expDetailKeys =
    tab === "expense" && form.category && form.subcategory
      ? (KR_EXPENSE_CATEGORIES[form.category]?.[form.subcategory] ?? [])
      : [];

  function set(field: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "category") {
        next.subcategory = "";
        next.detail = "";
      }
      if (field === "subcategory") {
        next.detail = "";
      }
      return next;
    });
  }

  function handleSubmit() {
    if (!form.date || !form.category || !form.description || !form.amount) {
      setError("날짜, 분류, 내역, 금액은 필수입니다.");
      return;
    }
    const amount = Number(form.amount.replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) {
      setError("금액은 양수여야 합니다.");
      return;
    }
    const sellingPrice =
      form.selling_price !== ""
        ? Number(form.selling_price.replace(/,/g, ""))
        : null;

    const payload = {
      date: form.date,
      type: form.type,
      category: form.category,
      subcategory: form.subcategory || null,
      detail: form.detail || null,
      description: form.description,
      amount,
      payment_method: form.payment_method || null,
      selling_price: sellingPrice,
      note: form.note || null,
    };

    startTransition(async () => {
      const res = await upsertKrTransaction(
        payload,
        isEdit ? modal.row.id : undefined,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-base font-semibold">
            {isEdit ? "한국 내역 수정" : tab === "income" ? "수입 추가" : "지출 추가"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Date */}
          <div>
            <label className={labelClass}>날짜</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className={inputClass + " mt-1"}
            />
          </div>

          {/* Category */}
          {tab === "income" ? (
            <div>
              <label className={labelClass}>분류</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={selectClass + " mt-1"}
              >
                {KR_INCOME_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>대분류</label>
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className={selectClass + " mt-1"}
                >
                  <option value="">선택</option>
                  {expTopKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>중분류</label>
                <select
                  value={form.subcategory}
                  onChange={(e) => set("subcategory", e.target.value)}
                  className={selectClass + " mt-1"}
                  disabled={expSubKeys.length === 0}
                >
                  <option value="">선택</option>
                  {expSubKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>소분류</label>
                <select
                  value={form.detail}
                  onChange={(e) => set("detail", e.target.value)}
                  className={selectClass + " mt-1"}
                  disabled={expDetailKeys.length === 0}
                >
                  <option value="">선택</option>
                  {expDetailKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className={labelClass}>내역</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={tab === "income" ? "예: 이목원 [13.56]" : "예: 올리브영 구매"}
              className={inputClass + " mt-1"}
            />
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>금액 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="1,000,000"
                className={inputClass + " mt-1"}
              />
            </div>
            {tab === "expense" && (
              <div>
                <label className={labelClass}>판매가격 (원, 선택)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.selling_price}
                  onChange={(e) => set("selling_price", e.target.value)}
                  placeholder="러시아 판매가"
                  className={inputClass + " mt-1"}
                />
              </div>
            )}
          </div>

          {/* Payment method (expense only) */}
          {tab === "expense" && (
            <div>
              <label className={labelClass}>결제수단</label>
              <select
                value={form.payment_method}
                onChange={(e) => set("payment_method", e.target.value)}
                className={selectClass + " mt-1"}
              >
                <option value="">선택 안함</option>
                {KR_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Note */}
          <div>
            <label className={labelClass}>참고사항</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              className={inputClass + " mt-1"}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? "저장 중…" : isEdit ? "수정" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main table component ─────────────────────────────────────────────────────

export function FinKrTable({
  initialRows,
  yearMonth,
}: {
  initialRows: FinKrTransaction[];
  yearMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<TabType>("income");
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rows = initialRows.filter((r) => r.type === tab);

  const incomeTotal = initialRows
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + r.amount, 0);
  const expenseTotal = initialRows
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s + r.amount, 0);

  function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteKrTransaction(id);
      router.refresh();
      setDeletingId(null);
    });
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          총 수입 {fmt(incomeTotal)}
        </span>
        <span className="rounded-lg bg-red-50 px-4 py-2 text-red-800 dark:bg-red-950 dark:text-red-300">
          총 지출 {fmt(expenseTotal)}
        </span>
        <span className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          순이익 {fmt(incomeTotal - expenseTotal)}
        </span>
      </div>

      {/* Tabs + Add button */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["income", "expense"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === t
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              }`}
            >
              {t === "income" ? "수입" : "지출"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setModal({ mode: "add", tab })}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + 추가
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">날짜</th>
              {tab === "income" ? (
                <th className="px-3 py-2 text-left">분류</th>
              ) : (
                <>
                  <th className="px-3 py-2 text-left">대분류</th>
                  <th className="px-3 py-2 text-left">중분류</th>
                  <th className="px-3 py-2 text-left">소분류</th>
                </>
              )}
              <th className="px-3 py-2 text-left">내역</th>
              <th className="px-3 py-2 text-right">금액</th>
              {tab === "expense" && (
                <th className="px-3 py-2 text-right">판매가</th>
              )}
              {tab === "expense" && (
                <th className="px-3 py-2 text-left">결제</th>
              )}
              <th className="px-3 py-2 text-left">참고</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={tab === "income" ? 6 : 9}
                  className="px-4 py-8 text-center text-zinc-400"
                >
                  내역 없음
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                onClick={() => setModal({ mode: "edit", row })}
              >
                <td className="px-3 py-2 text-zinc-500">{row.date}</td>
                {tab === "income" ? (
                  <td className="px-3 py-2">{row.category}</td>
                ) : (
                  <>
                    <td className="px-3 py-2">{row.category}</td>
                    <td className="px-3 py-2 text-zinc-500">{row.subcategory ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-500">{row.detail ?? "—"}</td>
                  </>
                )}
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {tab === "income" ? (
                    <span className="text-emerald-600">{fmt(row.amount)}</span>
                  ) : (
                    <span className="text-red-600">{fmt(row.amount)}</span>
                  )}
                </td>
                {tab === "expense" && (
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {row.selling_price != null ? fmt(row.selling_price) : "—"}
                  </td>
                )}
                {tab === "expense" && (
                  <td className="px-3 py-2 text-zinc-500">{row.payment_method ?? "—"}</td>
                )}
                <td className="max-w-[120px] truncate px-3 py-2 text-zinc-400">{row.note ?? ""}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(row.id);
                    }}
                    disabled={deletingId === row.id || isPending}
                    className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
              <tr>
                <td
                  colSpan={tab === "income" ? 4 : 7}
                  className="px-3 py-2 text-right text-zinc-500"
                >
                  합계
                </td>
                <td className="px-3 py-2 text-right">
                  {tab === "income" ? (
                    <span className="text-emerald-600">
                      {fmt(rows.reduce((s, r) => s + r.amount, 0))}
                    </span>
                  ) : (
                    <span className="text-red-600">
                      {fmt(rows.reduce((s, r) => s + r.amount, 0))}
                    </span>
                  )}
                </td>
                {tab === "expense" && <td colSpan={3} />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      {modal.mode !== "closed" && (
        <KrModal
          modal={modal}
          yearMonth={yearMonth}
          onClose={() => setModal({ mode: "closed" })}
        />
      )}
    </div>
  );
}
