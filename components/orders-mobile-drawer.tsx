"use client";

import {
  ORDER_PROGRESS,
  ORDER_ROUTES,
  PHOTO_STATUS,
  PLATFORMS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderItemRow,
  type OrderRow,
} from "@/lib/schema";
import { useState } from "react";

type ItemEditableField =
  | "product_type"
  | "product_name"
  | "product_option"
  | "product_set_type"
  | "quantity"
  | "price_rub"
  | "prepayment_rub"
  | "krw"
  | "progress"
  | "gift"
  | "photo_sent";

type OrderEditableField =
  | "customer_name"
  | "purchase_channel"
  | "date"
  | "platform"
  | "order_type";

type SaveItemField = (
  itemId: string,
  orderNum: string,
  field: ItemEditableField,
  newRaw: string,
  oldRaw: string,
  itemBefore: OrderItemRow,
) => Promise<boolean>;

type SaveOrderField = (
  orderNum: string,
  field: OrderEditableField,
  newRaw: string,
  oldRaw: string,
) => Promise<boolean>;

type Props = {
  item: OrderItemRow;
  order: OrderRow;
  onClose: () => void;
  saveItemField: SaveItemField;
  saveOrderField: SaveOrderField;
};

type DraftState = {
  product_type: string;
  product_name: string;
  product_option: string;
  product_set_type: string;
  quantity: string;
  price_rub: string;
  prepayment_rub: string;
  krw: string;
  progress: string;
  gift: string;
  photo_sent: string;
  customer_name: string;
  purchase_channel: string;
  date: string;
  platform: string;
  order_type: string;
};

function getOriginalItemValue(item: OrderItemRow, field: ItemEditableField): string {
  switch (field) {
    case "product_type":     return item.product_type ?? "";
    case "product_name":     return item.product_name;
    case "product_option":   return item.product_option ?? "";
    case "product_set_type": return item.product_set_type;
    case "quantity":         return String(item.quantity);
    case "price_rub":        return String(item.price_rub);
    case "prepayment_rub":   return String(item.prepayment_rub);
    case "krw":              return item.krw ?? "";
    case "progress":         return item.progress ?? "";
    case "gift":             return item.gift ?? "no";
    case "photo_sent":       return item.photo_sent ?? "Not sent";
  }
}

function getOriginalOrderValue(order: OrderRow, field: OrderEditableField): string {
  switch (field) {
    case "customer_name":    return order.customer_name ?? "";
    case "purchase_channel": return order.purchase_channel ?? "";
    case "date":             return order.date;
    case "platform":         return order.platform;
    case "order_type":       return order.order_type;
  }
}

function initDraft(item: OrderItemRow, order: OrderRow): DraftState {
  return {
    product_type:     getOriginalItemValue(item, "product_type"),
    product_name:     getOriginalItemValue(item, "product_name"),
    product_option:   getOriginalItemValue(item, "product_option"),
    product_set_type: getOriginalItemValue(item, "product_set_type"),
    quantity:         getOriginalItemValue(item, "quantity"),
    price_rub:        getOriginalItemValue(item, "price_rub"),
    prepayment_rub:   getOriginalItemValue(item, "prepayment_rub"),
    krw:              getOriginalItemValue(item, "krw"),
    progress:         getOriginalItemValue(item, "progress"),
    gift:             getOriginalItemValue(item, "gift"),
    photo_sent:       getOriginalItemValue(item, "photo_sent"),
    customer_name:    getOriginalOrderValue(order, "customer_name"),
    purchase_channel: getOriginalOrderValue(order, "purchase_channel"),
    date:             getOriginalOrderValue(order, "date"),
    platform:         getOriginalOrderValue(order, "platform"),
    order_type:       getOriginalOrderValue(order, "order_type"),
  };
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
const selectCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
const labelCls = "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function OrdersMobileDrawer({ item, order, onClose, saveItemField, saveOrderField }: Props) {
  const [draft, setDraft] = useState<DraftState>(() => initDraft(item, order));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function set(field: keyof DraftState, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);

    const itemFields: ItemEditableField[] = [
      "product_type",
      "product_name",
      "product_option",
      "product_set_type",
      "quantity",
      "price_rub",
      "prepayment_rub",
      "krw",
      "progress",
      "gift",
      "photo_sent",
    ];

    // Use a running snapshot so price_rub/prepayment_rub interact correctly
    let runningItem: OrderItemRow = { ...item };

    for (const field of itemFields) {
      const newRaw = draft[field];
      const oldRaw = getOriginalItemValue(runningItem, field);
      if (newRaw === oldRaw) continue;
      const ok = await saveItemField(item.id, order.order_num, field, newRaw, oldRaw, runningItem);
      if (!ok) {
        setErrorMsg("저장 중 오류가 발생했습니다.");
        setSaving(false);
        return;
      }
      // Keep running snapshot current so subsequent fields compute correctly
      (runningItem as Record<string, unknown>)[field] = newRaw;
    }

    const orderFields: OrderEditableField[] = [
      "customer_name",
      "purchase_channel",
      "date",
      "platform",
      "order_type",
    ];

    for (const field of orderFields) {
      const newRaw = draft[field];
      const oldRaw = getOriginalOrderValue(order, field);
      if (newRaw === oldRaw) continue;
      const ok = await saveOrderField(order.order_num, field, newRaw, oldRaw);
      if (!ok) {
        setErrorMsg("저장 중 오류가 발생했습니다.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onClose();
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            상품 수정
          </span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Error */}
          {errorMsg && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* 상품 정보 section */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            상품 정보
          </p>

          <FieldRow label="카테고리">
            <select className={selectCls} value={draft.product_type} onChange={(e) => set("product_type", e.target.value)}>
              <option value="">—</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="상품명">
            <input
              type="text"
              className={inputCls}
              value={draft.product_name}
              onChange={(e) => set("product_name", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="옵션">
            <input
              type="text"
              className={inputCls}
              value={draft.product_option}
              onChange={(e) => set("product_option", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="단품/세트">
            <select className={selectCls} value={draft.product_set_type} onChange={(e) => set("product_set_type", e.target.value)}>
              {SET_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="진행">
            <select className={selectCls} value={draft.progress} onChange={(e) => set("progress", e.target.value)}>
              <option value="">—</option>
              {ORDER_PROGRESS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="수량">
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={draft.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="판매가 ₽">
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={draft.price_rub}
              onChange={(e) => set("price_rub", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="선결제 ₽">
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={draft.prepayment_rub}
              onChange={(e) => set("prepayment_rub", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="원화매입 ₩">
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={draft.krw}
              onChange={(e) => set("krw", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="사진 발송">
            <select className={selectCls} value={draft.photo_sent} onChange={(e) => set("photo_sent", e.target.value)}>
              {PHOTO_STATUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="선물">
            <select className={selectCls} value={draft.gift} onChange={(e) => set("gift", e.target.value)}>
              <option value="no">no</option>
              <option value="ask">ask</option>
            </select>
          </FieldRow>

          {/* 주문 공통 section */}
          <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            주문 공통
          </p>

          <FieldRow label="일자">
            <input
              type="date"
              className={inputCls}
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="플랫폼">
            <select className={selectCls} value={draft.platform} onChange={(e) => set("platform", e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="경로">
            <select className={selectCls} value={draft.order_type} onChange={(e) => set("order_type", e.target.value)}>
              {ORDER_ROUTES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="고객명">
            <input
              type="text"
              className={inputCls}
              value={draft.customer_name}
              onChange={(e) => set("customer_name", e.target.value)}
            />
          </FieldRow>

          <FieldRow label="거래처">
            <input
              type="text"
              className={inputCls}
              value={draft.purchase_channel}
              onChange={(e) => set("purchase_channel", e.target.value)}
            />
          </FieldRow>

          {/* Bottom padding for safe area */}
          <div className="h-4" />
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </>
  );
}
