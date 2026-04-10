"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertExchangeRecord,
  deleteExchangeRecord,
} from "@/lib/actions/finance";
import type { FinExchangeRecord } from "@/lib/schema";
import { inputClass, labelClass } from "@/lib/form-classes";

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── Modal types ───────────────────────────────────────────────────────────────

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; row: FinExchangeRecord };

type FormData = {
  date: string;
  description: string;
  rub_amount: string;
  exchange_rate: string;
  krw_amount: string;
  book_rate: string;
  fx_profit: string;
  note: string;
};

function emptyForm(): FormData {
  return {
    date: todayKst(),
    description: "",
    rub_amount: "",
    exchange_rate: "",
    krw_amount: "",
    book_rate: "",
    fx_profit: "",
    note: "",
  };
}

function rowToForm(row: FinExchangeRecord): FormData {
  return {
    date: row.date,
    description: row.description,
    rub_amount: String(row.rub_amount),
    exchange_rate: String(row.exchange_rate),
    krw_amount: String(row.krw_amount),
    book_rate: row.book_rate != null ? String(row.book_rate) : "",
    fx_profit: row.fx_profit != null ? String(row.fx_profit) : "",
    note: row.note ?? "",
  };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ExchangeModal({
  modal,
  onClose,
}: {
  modal: Exclude<ModalState, { mode: "closed" }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormData>(
    modal.mode === "edit" ? rowToForm(modal.row) : emptyForm(),
  );
  const [error, setError] = useState("");

  const isEdit = modal.mode === "edit";

  function set(field: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      // rub + krw → rate 자동계산 (실제 거래 방식: 루블·원화 입력 → 환율 도출)
      if (field === "rub_amount" || field === "krw_amount") {
        const rub = Number(field === "rub_amount" ? value : prev.rub_amount);
        const krw = Number(field === "krw_amount" ? value : prev.krw_amount);
        if (rub > 0 && krw > 0) {
          next.exchange_rate = (krw / rub).toFixed(4);
        }
      }

      // exchange_rate 직접 수정 시 → krw 갱신
      if (field === "exchange_rate") {
        const rub = Number(prev.rub_amount);
        const rate = Number(value);
        if (rub > 0 && rate > 0) {
          next.krw_amount = String(Math.round(rub * rate));
        }
      }

      // 환차익 자동계산
      const rubForCalc = Number(next.rub_amount);
      const actualRate = Number(next.exchange_rate);
      const bookRateNum = Number(next.book_rate);
      if (rubForCalc > 0 && actualRate > 0 && bookRateNum > 0) {
        next.fx_profit = String(Math.round((actualRate - bookRateNum) * rubForCalc));
      }

      return next;
    });
  }

  function handleSubmit() {
    if (
      !form.date ||
      !form.description ||
      !form.rub_amount ||
      !form.krw_amount
    ) {
      setError("날짜, 내용, 루블금액, 원화금액은 필수입니다.");
      return;
    }

    const rub_amount = Number(form.rub_amount.replace(/,/g, ""));
    const krw_amount = Number(form.krw_amount.replace(/,/g, ""));
    const exchange_rate = krw_amount > 0 && rub_amount > 0
      ? parseFloat((krw_amount / rub_amount).toFixed(4))
      : Number(form.exchange_rate);
    const book_rate = form.book_rate !== "" ? Number(form.book_rate) : null;
    const fx_profit = form.fx_profit !== "" ? Number(form.fx_profit.replace(/,/g, "")) : null;

    if (isNaN(rub_amount) || isNaN(krw_amount)) {
      setError("숫자 값이 올바르지 않습니다.");
      return;
    }

    const payload = {
      date: form.date,
      description: form.description,
      rub_amount,
      exchange_rate,
      krw_amount,
      book_rate,
      fx_profit,
      note: form.note || null,
    };

    startTransition(async () => {
      const res = await upsertExchangeRecord(
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
            {isEdit ? "환전 이력 수정" : "환전 이력 추가"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">✕</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>날짜</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className={inputClass + " mt-1"}
              />
            </div>
            <div>
              <label className={labelClass}>내용</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="이목원, 진실, 큰삼촌…"
                className={inputClass + " mt-1"}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>루블 금액 (₽)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.rub_amount}
                onChange={(e) => set("rub_amount", e.target.value)}
                placeholder="73,746"
                className={inputClass + " mt-1"}
              />
            </div>
            <div>
              <label className={labelClass}>원화 금액 (₩)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.krw_amount}
                onChange={(e) => set("krw_amount", e.target.value)}
                placeholder="1,200,000"
                className={inputClass + " mt-1"}
              />
            </div>
            <div>
              <label className={labelClass}>환전환율 (₽/원)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.exchange_rate}
                onChange={(e) => set("exchange_rate", e.target.value)}
                placeholder="자동 계산"
                className={inputClass + " mt-1 bg-zinc-50 dark:bg-zinc-800"}
                readOnly={
                  Number(form.rub_amount) > 0 && Number(form.krw_amount) > 0
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>장부환율 (₽/원)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.book_rate}
                onChange={(e) => set("book_rate", e.target.value)}
                placeholder="15.01"
                className={inputClass + " mt-1"}
              />
            </div>
            <div>
              <label className={labelClass}>환차익 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.fx_profit}
                onChange={(e) => set("fx_profit", e.target.value)}
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

export function FinExchangeTable({
  initialRows,
}: {
  initialRows: FinExchangeRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalRub = initialRows.reduce((s, r) => s + r.rub_amount, 0);
  const totalKrw = initialRows.reduce((s, r) => s + r.krw_amount, 0);
  const totalFxProfit = initialRows.reduce(
    (s, r) => s + (r.fx_profit ?? 0),
    0,
  );

  function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteExchangeRecord(id);
      router.refresh();
      setDeletingId(null);
    });
  }

  return (
    <div>
      {/* Summary */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <span className="rounded-lg bg-blue-50 px-4 py-2 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          환전 루블 합계 {fmtRub(totalRub)}
        </span>
        <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          환전 원화 합계 {fmtKrw(totalKrw)}
        </span>
        <span
          className={`rounded-lg px-4 py-2 ${
            totalFxProfit >= 0
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          환차익 합계 {fmtKrw(totalFxProfit)}
        </span>
      </div>

      {/* Add button */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setModal({ mode: "add" })}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + 추가
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-left">내용</th>
              <th className="px-3 py-2 text-right">루블</th>
              <th className="px-3 py-2 text-right">원화</th>
              <th className="px-3 py-2 text-right">환전환율</th>
              <th className="px-3 py-2 text-right">장부환율</th>
              <th className="px-3 py-2 text-right">환차익</th>
              <th className="px-3 py-2 text-left">참고</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {initialRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
                  내역 없음
                </td>
              </tr>
            )}
            {initialRows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                onClick={() => setModal({ mode: "edit", row })}
              >
                <td className="px-3 py-2 text-zinc-500">{row.date}</td>
                <td className="px-3 py-2 font-medium">{row.description}</td>
                <td className="px-3 py-2 text-right">{fmtRub(row.rub_amount)}</td>
                <td className="px-3 py-2 text-right font-medium text-emerald-600">
                  {fmtKrw(row.krw_amount)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-500">{row.exchange_rate}</td>
                <td className="px-3 py-2 text-right text-zinc-500">
                  {row.book_rate != null ? row.book_rate : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    (row.fx_profit ?? 0) >= 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600"
                  }`}
                >
                  {row.fx_profit != null ? fmtKrw(row.fx_profit) : "—"}
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 text-zinc-400">
                  {row.note ?? ""}
                </td>
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
          {initialRows.length > 0 && (
            <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
              <tr>
                <td colSpan={2} className="px-3 py-2 text-right text-zinc-500">합계</td>
                <td className="px-3 py-2 text-right">{fmtRub(totalRub)}</td>
                <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(totalKrw)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right text-amber-600">{fmtKrw(totalFxProfit)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal.mode !== "closed" && (
        <ExchangeModal
          modal={modal}
          onClose={() => setModal({ mode: "closed" })}
        />
      )}
    </div>
  );
}
