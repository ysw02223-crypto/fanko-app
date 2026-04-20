"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import {
  ORDER_PROGRESS,
  PLATFORMS,
  ORDER_ROUTES,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  PHOTO_STATUS,
} from "@/lib/schema";
import type { OrderGridRow } from "@/lib/orders-ag-grid-types";

// ── 공개 타입 ────────────────────────────────────────────────────────────────
export type EditingCell = {
  field: keyof OrderGridRow;
  fieldLabel: string;
  currentValue: string | number | null;
  rowData: OrderGridRow;
};

type Props = {
  cell: EditingCell | null;
  onSave: (
    field: keyof OrderGridRow,
    rowData: OrderGridRow,
    newValue: string | number | null,
  ) => void;
  onClose: () => void;
};

// ── select 필드 → 선택지 매핑 ────────────────────────────────────────────────
const SELECT_OPTIONS: Partial<Record<keyof OrderGridRow, readonly string[]>> = {
  item_progress:    ORDER_PROGRESS,
  platform:         PLATFORMS,
  order_type:       ORDER_ROUTES,
  product_type:     ["", ...PRODUCT_CATEGORIES],
  product_set_type: SET_TYPES,
  item_gift:        ["no", "ask"],
  order_gift:       ["no", "ask"],
  item_photo_sent:  PHOTO_STATUS,
  order_photo_sent: PHOTO_STATUS,
};

const NUMBER_FIELDS = new Set<keyof OrderGridRow>([
  "quantity",
  "price_rub",
  "krw",
  "prepayment_rub",
]);

export function CellEditSheet({ cell, onSave, onClose }: Props) {
  const keyboardHeight = useKeyboardHeight();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cell) return;
    setValue(cell.currentValue != null ? String(cell.currentValue) : "");
    // select 필드는 키보드가 없으므로 focus 스킵
    if (!SELECT_OPTIONS[cell.field]) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [cell]);

  if (!cell || typeof document === "undefined") return null;

  const options  = SELECT_OPTIONS[cell.field];
  const isNumber = NUMBER_FIELDS.has(cell.field);

  const handleSave = () => {
    const parsed: string | number | null = isNumber
      ? value === "" ? null : Number(value)
      : value || null;
    onSave(cell.field, cell.rowData, parsed);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/30" />

      {/* 시트 본체 */}
      <div
        className="absolute left-0 right-0 rounded-t-2xl bg-white px-4 pb-6 pt-3 shadow-2xl dark:bg-zinc-900"
        style={{ bottom: keyboardHeight }}
      >
        {/* 드래그 핸들 */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />

        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {cell.fieldLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* 현재값 표시 */}
        <p className="mb-2 text-xs text-zinc-400">
          현재:{" "}
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            {cell.currentValue ?? "—"}
          </span>
        </p>

        {/* 입력 UI */}
        {options ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt || "（없음）"}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef}
            type={isNumber ? "number" : "text"}
            inputMode={isNumber ? "numeric" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  handleSave();
              if (e.key === "Escape") onClose();
            }}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        )}

        {/* 버튼 */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
