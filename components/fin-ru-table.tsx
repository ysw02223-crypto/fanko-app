"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertRuTransaction,
  deleteRuTransaction,
} from "@/lib/actions/finance";
import {
  RU_INCOME_CATEGORIES,
  RU_EXPENSE_CATEGORIES,
} from "@/lib/finance-categories";
import type { FinRuTransaction } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtRub(n: number) {
  return n.toLocaleString("ru-RU") + "₽";
}

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function todayKst(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TabType = "income" | "expense";

type ModalState =
  | { mode: "closed" }
  | { mode: "add"; tab: TabType }
  | { mode: "edit"; row: FinRuTransaction };

type FormData = {
  date: string;
  type: TabType;
  category: string;
  subcategory: string;
  description: string;
  amount_rub: string;
  exchange_rate: string;
  amount_krw: string;
  note: string;
};

function emptyForm(tab: TabType): FormData {
  const firstCat =
    tab === "income"
      ? Object.keys(RU_INCOME_CATEGORIES)[0]
      : Object.keys(RU_EXPENSE_CATEGORIES)[0];
  return {
    date: todayKst(),
    type: tab,
    category: firstCat ?? "",
    subcategory: "",
    description: "",
    amount_rub: "",
    exchange_rate: "",
    amount_krw: "",
    note: "",
  };
}

function rowToForm(row: FinRuTransaction): FormData {
  return {
    date: row.date,
    type: row.type,
    category: row.category,
    subcategory: row.subcategory ?? "",
    description: row.description,
    amount_rub: String(row.amount_rub),
    exchange_rate: row.exchange_rate != null ? String(row.exchange_rate) : "",
    amount_krw: row.amount_krw != null ? String(row.amount_krw) : "",
    note: row.note ?? "",
  };
}

// ── Modal ────────────────────────────────────────────────────────────────────

function RuModal({
  modal,
  onClose,
}: {
  modal: Exclude<ModalState, { mode: "closed" }>;
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

  const catKeys =
    tab === "income"
      ? Object.keys(RU_INCOME_CATEGORIES)
      : Object.keys(RU_EXPENSE_CATEGORIES);

  const subKeys =
    tab === "income"
      ? (RU_INCOME_CATEGORIES[form.category] ?? [])
      : (RU_EXPENSE_CATEGORIES[form.category] ?? []);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "category") next.subcategory = "";
      // Auto-calculate KRW when RUB or rate changes
      if (field === "amount_rub" || field === "exchange_rate") {
        const rub = field === "amount_rub" ? Number(value) : Number(prev.amount_rub);
        const rate = field === "exchange_rate" ? Number(value) : Number(prev.exchange_rate);
        if (!isNaN(rub) && !isNaN(rate) && rate > 0) {
          next.amount_krw = String(Math.round(rub * rate));
        }
      }
      return next;
    });
  }

  function handleSubmit() {
    if (!form.date || !form.category || !form.description || !form.amount_rub) {
      setError("날짜, 분류, 내역, 루블금액은 필수입니다.");
      return;
    }
    const amount_rub = Number(form.amount_rub.replace(/,/g, ""));
    if (isNaN(amount_rub) || amount_rub < 0) {
      setError("루블 금액이 올바르지 않습니다.");
      return;
    }
    const exchange_rate =
      form.exchange_rate !== "" ? Number(form.exchange_rate) : null;
    const amount_krw =
      form.amount_krw !== "" ? Number(form.amount_krw.replace(/,/g, "")) : null;

    const payload = {
      date: form.date,
      type: form.type,
      category: form.category,
      subcategory: form.subcategory || null,
      description: form.description,
      amount_rub,
      exchange_rate,
      amount_krw,
      note: form.note || null,
    };

    startTransition(async () => {
      const res = await upsertRuTransaction(
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
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-base font-semibold">
            {isEdit
              ? "러시아 내역 수정"
              : tab === "income"
              ? "매출 추가"
              : "지출 추가"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={labelClass}>날짜</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className={inputClass + " mt-1"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>분류</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={selectClass + " mt-1"}
              >
                <option value="">선택</option>
                {catKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>채널 / 소분류</label>
              <select
                value={form.subcategory}
                onChange={(e) => set("subcategory", e.target.value)}
                className={selectClass + " mt-1"}
                disabled={subKeys.length === 0}
              >
                <option value="">선택 안함</option>
                {subKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>내역 (상품명 등)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="예: 이목원 [13.56] / 월급"
              className={inputClass + " mt-1"}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>금액 (₽)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.amount_rub}
                onChange={(e) => set("amount_rub", e.target.value)}
                placeholder="73,746"
                className={inputClass + " mt-1"}
              />
            </div>
            <div>
              <label className={labelClass}>적용환율 (₽/원)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.exchange_rate}
                onChange={(e) => set("exchange_rate", e.target.value)}
                placeholder="13.56"
                className={inputClass + " mt-1"}
              />
            </div>
            <div>
              <label className={labelClass}>원화 금액</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.amount_krw}
                onChange={(e) => set("amount_krw", e.target.value)}
                placeholder="자동 계산"
                className={inputClass + " mt-1"}
              />
            </div>
          </div>

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

// ── Main table ────────────────────────────────────────────────────────────────

export function FinRuTable({
  initialRows,
  yearMonth,
}: {
  initialRows: FinRuTransaction[];
  yearMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<TabType>("income");
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rows = initialRows.filter((r) => r.type === tab);

  const incomeRub = initialRows
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + r.amount_rub, 0);
  const incomeKrw = initialRows
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + (r.amount_krw ?? 0), 0);
  const expenseRub = initialRows
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s + r.amount_rub, 0);

  function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteRuTransaction(id);
      router.refresh();
      setDeletingId(null);
    });
  }

  return (
    <div>
      {/* Summary */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          총 매출 {fmtRub(incomeRub)}
        </span>
        {incomeKrw > 0 && (
          <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            ≈ {fmtKrw(incomeKrw)}
          </span>
        )}
        <span className="rounded-lg bg-red-50 px-4 py-2 text-red-800 dark:bg-red-950 dark:text-red-300">
          총 지출 {fmtRub(expenseRub)}
        </span>
        <span className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          순이익 {fmtRub(incomeRub - expenseRub)}
        </span>
      </div>

      {/* Tabs + Add */}
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
              {t === "income" ? "매출" : "지출"}
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
              <th className="px-3 py-2 text-left">분류</th>
              <th className="px-3 py-2 text-left">채널</th>
              <th className="px-3 py-2 text-left">내역</th>
              <th className="px-3 py-2 text-right">루블</th>
              {tab === "income" && (
                <th className="px-3 py-2 text-right">환율</th>
              )}
              {tab === "income" && (
                <th className="px-3 py-2 text-right">원화</th>
              )}
              <th className="px-3 py-2 text-left">참고</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={tab === "income" ? 9 : 7}
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
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2 text-zinc-500">{row.subcategory ?? "—"}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {tab === "income" ? (
                    <span className="text-emerald-600">{fmtRub(row.amount_rub)}</span>
                  ) : (
                    <span className="text-red-600">{fmtRub(row.amount_rub)}</span>
                  )}
                </td>
                {tab === "income" && (
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {row.exchange_rate != null ? row.exchange_rate : "—"}
                  </td>
                )}
                {tab === "income" && (
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {row.amount_krw != null ? fmtKrw(row.amount_krw) : "—"}
                  </td>
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
                <td colSpan={4} className="px-3 py-2 text-right text-zinc-500">합계</td>
                <td className="px-3 py-2 text-right">
                  {tab === "income" ? (
                    <span className="text-emerald-600">
                      {fmtRub(rows.reduce((s, r) => s + r.amount_rub, 0))}
                    </span>
                  ) : (
                    <span className="text-red-600">
                      {fmtRub(rows.reduce((s, r) => s + r.amount_rub, 0))}
                    </span>
                  )}
                </td>
                {tab === "income" && (
                  <>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {fmtKrw(rows.reduce((s, r) => s + (r.amount_krw ?? 0), 0))}
                    </td>
                  </>
                )}
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal.mode !== "closed" && (
        <RuModal modal={modal} onClose={() => setModal({ mode: "closed" })} />
      )}
    </div>
  );
}
