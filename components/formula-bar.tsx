"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import {
  ORDER_PROGRESS, PLATFORMS, ORDER_ROUTES,
  PRODUCT_CATEGORIES, SET_TYPES, PHOTO_STATUS,
} from "@/lib/schema";
import type { OrderGridRow } from "@/lib/orders-ag-grid-types";

export type FocusedCell = {
  field: keyof OrderGridRow;
  fieldLabel: string;
  currentValue: string | number | null;
  rowData: OrderGridRow;
};

type Props = {
  cell: FocusedCell | null;
  isMobile: boolean;
  onSave: (field: keyof OrderGridRow, rowData: OrderGridRow, newValue: string | number | null) => void;
  onCancel: () => void;
};

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
  "quantity", "price_rub", "krw", "prepayment_rub",
]);

export function FormulaBar({ cell, isMobile, onSave, onCancel }: Props) {
  const keyboardHeight = useKeyboardHeight();
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(cell?.currentValue != null ? String(cell.currentValue) : "");
    setDirty(false);
  }, [cell]);

  if (!cell) {
    const emptyBar = (
      <div className="flex h-11 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="select-none font-mono text-xs font-bold text-zinc-400">fx</span>
        <span className="text-sm text-zinc-400">셀을 선택하세요</span>
      </div>
    );
    if (isMobile) return null;
    return emptyBar;
  }

  const options  = SELECT_OPTIONS[cell.field];
  const isNumber = NUMBER_FIELDS.has(cell.field);

  const handleConfirm = () => {
    if (!dirty) { onCancel(); return; }
    const parsed: string | number | null = isNumber
      ? (value === "" ? null : Number(value))
      : (value || null);
    onSave(cell.field, cell.rowData, parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter")  handleConfirm();
    if (e.key === "Escape") { setValue(String(cell.currentValue ?? "")); setDirty(false); onCancel(); }
  };

  const bar = (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
      <span className="select-none font-mono text-xs font-bold text-emerald-500">fx</span>
      <span className="min-w-[60px] shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {cell.fieldLabel}
      </span>

      <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

      {options ? (
        <select
          value={value}
          onChange={(e) => { setValue(e.target.value); setDirty(true); }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-100"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt || "（없음）"}</option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef}
          type={isNumber ? "number" : "text"}
          inputMode={isNumber ? "numeric" : "text"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setDirty(true); }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-100"
        />
      )}

      <button
        type="button"
        onClick={() => { setValue(String(cell.currentValue ?? "")); setDirty(false); onCancel(); }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
      >
        ✕
      </button>

      <button
        type="button"
        onClick={handleConfirm}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg transition ${
          dirty
            ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            : "text-zinc-300 dark:text-zinc-600"
        }`}
      >
        ✓
      </button>
    </div>
  );

  if (isMobile && typeof document !== "undefined") {
    return createPortal(
      <div
        className="z-[300] border-t border-zinc-300 shadow-lg dark:border-zinc-700"
        style={{ position: "fixed", bottom: keyboardHeight, left: 0, right: 0, background: "white" }}
      >
        {bar}
      </div>,
      document.body,
    );
  }

  return bar;
}
