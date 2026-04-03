"use client";

import { createClient } from "@/lib/supabase/client";
import {
  flattenOrders,
  replaceOrderSegment,
  type FlatOrderItemRow,
  type OrderWithNestedItems,
} from "@/lib/orders-line-items-flatten";
import {
  ORDER_PROGRESS,
  PHOTO_STATUS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderItemRow,
} from "@/lib/schema";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const ORDER_SELECT = `
  *,
  order_items (
    id,
    product_type,
    product_name,
    product_option,
    product_set_type,
    quantity,
    price_rub,
    prepayment_rub,
    extra_payment_rub,
    krw
  )
`;

/** Sticky column offsets: 주문번호 120 + 플랫폼 80 + 경로 80 + 일자 100 */
const W_ORDER_NUM = 120;
const W_PLATFORM = 80;
const W_PATH = 80;
const W_DATE = 100;
const W_PROGRESS = 160;
const STICKY_PROGRESS_LEFT = W_ORDER_NUM + W_PLATFORM + W_PATH + W_DATE;

type OrderEditableField = "progress" | "customer_name" | "gift" | "photo_sent" | "purchase_channel";
type ItemEditableField =
  | "product_type"
  | "product_name"
  | "product_option"
  | "product_set_type"
  | "quantity"
  | "price_rub"
  | "prepayment_rub"
  | "krw";

type EditTarget =
  | { kind: "order"; orderNum: string; field: OrderEditableField }
  | { kind: "item"; itemId: string; orderNum: string; field: ItemEditableField };

const ORDER_FIELD_LABELS: Record<OrderEditableField, string> = {
  progress: "진행",
  customer_name: "고객명",
  gift: "선물",
  photo_sent: "사진",
  purchase_channel: "거래처",
};

const ITEM_FIELD_LABELS: Record<ItemEditableField, string> = {
  product_type: "카테고리",
  product_name: "상품명",
  product_option: "옵션",
  product_set_type: "단품/세트",
  quantity: "수량",
  price_rub: "판매가₽",
  prepayment_rub: "선결제₽",
  krw: "원화매입",
};

type HistoryEntry = {
  id: string;
  at: number;
  orderNum: string;
  columnLabel: string;
  oldDisplay: string;
  newDisplay: string;
  revert: () => Promise<void>;
};

function progressBadgeClass(p: string) {
  const map: Record<string, string> = {
    PAY: "bg-slate-200 text-slate-900 dark:bg-slate-600 dark:text-slate-50",
    "BUY IN KOREA": "bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50",
    "ARRIVE KOR": "bg-orange-200 text-orange-950 dark:bg-orange-900/50 dark:text-orange-50",
    "IN DELIVERY": "bg-sky-200 text-sky-950 dark:bg-sky-900/50 dark:text-sky-50",
    "ARRIVE RUS": "bg-cyan-200 text-cyan-950 dark:bg-cyan-900/50 dark:text-cyan-50",
    "RU DELIVERY": "bg-blue-200 text-blue-950 dark:bg-blue-900/50 dark:text-blue-50",
    DONE: "bg-emerald-200 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50",
    "WAIT CUSTOMER": "bg-violet-200 text-violet-950 dark:bg-violet-900/50 dark:text-violet-50",
    PROBLEM: "bg-red-200 text-red-950 dark:bg-red-900/50 dark:text-red-50",
    CANCEL: "bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100",
  };
  return map[p] ?? "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
}

function fmtRub(n: string | number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function fmtKrw(n: string | number | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function computedExtra(item: OrderItemRow | null) {
  if (!item) return 0;
  return Number(item.price_rub) - Number(item.prepayment_rub);
}

function displayOrderField(field: OrderEditableField, raw: string): string {
  if (field === "customer_name" || field === "purchase_channel") return raw.trim() === "" ? "—" : raw;
  return raw;
}

function displayItemField(field: ItemEditableField, raw: string): string {
  if (field === "product_type" && raw === "") return "—";
  if (field === "quantity" || field === "price_rub" || field === "prepayment_rub" || field === "krw") {
    if (raw.trim() === "") return "—";
    if (field === "quantity") return raw;
    if (field === "krw") return fmtKrw(raw);
    return fmtRub(raw);
  }
  return raw.trim() === "" ? "—" : raw;
}

const thBase =
  "whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
const thStickyTop = "sticky top-0 z-20";
const thOrderHead = `${thBase} ${thStickyTop} sticky left-0 z-30 box-border shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)]`;
const thProgressHead = `${thBase} ${thStickyTop} sticky z-30 box-border shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)]`;

const tdBase = "border-b border-zinc-200/80 px-2 py-1.5 align-middle text-sm dark:border-zinc-700/80";
const cellBtn =
  "w-full cursor-pointer rounded px-1 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10";
const editingBg = "bg-sky-100 dark:bg-sky-950/50";

function groupRowClass(groupIdx: number) {
  return groupIdx % 2 === 0
    ? "bg-white dark:bg-zinc-950"
    : "bg-zinc-100/90 dark:bg-zinc-900/70";
}

function tdOrderSticky(g: string) {
  return `${tdBase} sticky left-0 z-20 box-border font-mono font-medium shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)] ${g}`;
}

function tdProgressSticky(g: string) {
  return `${tdBase} sticky z-20 box-border shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)] ${g}`;
}

function buildItemRevertUpdates(field: ItemEditableField, before: OrderItemRow): Record<string, unknown> {
  switch (field) {
    case "product_type":
      return { product_type: before.product_type };
    case "product_name":
      return { product_name: before.product_name };
    case "product_option":
      return { product_option: before.product_option };
    case "product_set_type":
      return { product_set_type: before.product_set_type };
    case "quantity":
      return { quantity: before.quantity };
    case "price_rub":
      return { price_rub: before.price_rub, extra_payment_rub: before.extra_payment_rub };
    case "prepayment_rub":
      return { prepayment_rub: before.prepayment_rub, extra_payment_rub: before.extra_payment_rub };
    case "krw":
      return { krw: before.krw };
    default:
      return {};
  }
}

type PendingConfirm = {
  columnLabel: string;
  oldDisplay: string;
  newDisplay: string;
  execute: () => Promise<void>;
};

export function OrdersLineItemsTable({ initialOrders }: { initialOrders: OrderWithNestedItems[] }) {
  const [flatRows, setFlatRows] = useState<FlatOrderItemRow[]>(() => flattenOrders(initialOrders));
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [editBaseline, setEditBaseline] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setFlatRows(flattenOrders(initialOrders));
  }, [initialOrders]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      const f = editing.field;
      if (
        f === "customer_name" ||
        f === "purchase_channel" ||
        f === "product_name" ||
        f === "product_option" ||
        f === "quantity" ||
        f === "price_rub" ||
        f === "prepayment_rub" ||
        f === "krw"
      ) {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      } else {
        selectRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const showError = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const pushHistory = useCallback((entry: Omit<HistoryEntry, "id" | "at">) => {
    setHistory((h) =>
      [{ id: crypto.randomUUID(), at: Date.now(), ...entry }, ...h].slice(0, 10),
    );
  }, []);

  const runOrderRevert = useCallback(
    async (orderNum: string, payload: Record<string, unknown>) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .update(payload)
        .eq("order_num", orderNum)
        .select(ORDER_SELECT)
        .single();
      if (error) {
        showError(error.message);
        return;
      }
      setFlatRows((prev) => replaceOrderSegment(prev, orderNum, data as OrderWithNestedItems));
    },
    [showError],
  );

  const runItemRevertThenRefresh = useCallback(
    async (itemId: string, orderNum: string, updates: Record<string, unknown>) => {
      const supabase = createClient();
      const { error } = await supabase.from("order_items").update(updates).eq("id", itemId);
      if (error) {
        showError(error.message);
        return;
      }
      const { data: orderFresh, error: orderErr } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("order_num", orderNum)
        .single();
      if (orderErr || !orderFresh) {
        showError(orderErr?.message ?? "주문을 다시 불러오지 못했습니다.");
        return;
      }
      setFlatRows((prev) => replaceOrderSegment(prev, orderNum, orderFresh as OrderWithNestedItems));
    },
    [showError],
  );

  const buildOrderPayload = useCallback(
    (field: OrderEditableField, raw: string): { payload: Record<string, unknown> } | { error: string } => {
      if (field === "progress") {
        if (!(ORDER_PROGRESS as readonly string[]).includes(raw)) return { error: "진행 상태가 올바르지 않습니다." };
        return { payload: { progress: raw } };
      }
      if (field === "customer_name") {
        return { payload: { customer_name: raw.trim() === "" ? null : raw.trim() } };
      }
      if (field === "gift") {
        return { payload: { gift: raw === "ask" ? "ask" : "no" } };
      }
      if (field === "photo_sent") {
        if (!(PHOTO_STATUS as readonly string[]).includes(raw)) return { error: "사진 발송 상태가 올바르지 않습니다." };
        return { payload: { photo_sent: raw } };
      }
      if (field === "purchase_channel") {
        return { payload: { purchase_channel: raw.trim() === "" ? null : raw.trim() } };
      }
      return { error: "알 수 없는 필드입니다." };
    },
    [],
  );

  const buildOrderRevertPayload = useCallback((field: OrderEditableField, oldRaw: string): Record<string, unknown> => {
    if (field === "progress") return { progress: oldRaw };
    if (field === "customer_name") return { customer_name: oldRaw.trim() === "" ? null : oldRaw.trim() };
    if (field === "gift") return { gift: oldRaw === "ask" ? "ask" : "no" };
    if (field === "photo_sent") return { photo_sent: oldRaw };
    if (field === "purchase_channel") return { purchase_channel: oldRaw.trim() === "" ? null : oldRaw.trim() };
    return {};
  }, []);

  const buildItemUpdates = useCallback(
    (
      field: ItemEditableField,
      raw: string,
      current: OrderItemRow,
    ): { updates: Record<string, unknown> } | { error: string } => {
      const price = Number(current.price_rub);
      const prep = Number(current.prepayment_rub);
      if (field === "product_type") {
        if (raw !== "" && !(PRODUCT_CATEGORIES as readonly string[]).includes(raw)) {
          return { error: "카테고리가 올바르지 않습니다." };
        }
        return { updates: { product_type: raw === "" ? null : raw } };
      }
      if (field === "product_name") {
        const name = raw.trim();
        if (!name) return { error: "상품명은 비울 수 없습니다." };
        return { updates: { product_name: name } };
      }
      if (field === "product_option") {
        return { updates: { product_option: raw.trim() === "" ? null : raw.trim() } };
      }
      if (field === "product_set_type") {
        if (!(SET_TYPES as readonly string[]).includes(raw)) return { error: "단품/세트 값이 올바르지 않습니다." };
        return { updates: { product_set_type: raw } };
      }
      if (field === "quantity") {
        const q = Math.floor(Number(raw));
        if (!Number.isFinite(q) || q < 1) return { error: "수량은 1 이상이어야 합니다." };
        return { updates: { quantity: q } };
      }
      if (field === "price_rub") {
        const pr = Number(raw);
        if (!Number.isFinite(pr)) return { error: "판매가를 확인하세요." };
        return { updates: { price_rub: pr, extra_payment_rub: pr - prep } };
      }
      if (field === "prepayment_rub") {
        const p = Number(raw);
        if (!Number.isFinite(p)) return { error: "선결제를 확인하세요." };
        return { updates: { prepayment_rub: p, extra_payment_rub: price - p } };
      }
      if (field === "krw") {
        const t = raw.trim();
        const k = t === "" ? null : Math.round(Number(t));
        if (k !== null && !Number.isFinite(k)) return { error: "원화매입을 확인하세요." };
        return { updates: { krw: k } };
      }
      return { error: "알 수 없는 필드입니다." };
    },
    [],
  );

  const proposeOrderSave = useCallback(
    (orderNum: string, field: OrderEditableField, newRaw: string, oldRaw: string) => {
      if (pendingConfirm) return;
      if (newRaw === oldRaw) {
        setEditing(null);
        return;
      }
      const columnLabel = ORDER_FIELD_LABELS[field];
      const oldDisplay = displayOrderField(field, oldRaw);
      const newDisplay = displayOrderField(field, newRaw);
      const built = buildOrderPayload(field, newRaw);
      if ("error" in built) {
        showError(built.error);
        setEditing(null);
        return;
      }
      const revertPayload = buildOrderRevertPayload(field, oldRaw);
      setPendingConfirm({
        columnLabel,
        oldDisplay,
        newDisplay,
        execute: async () => {
          if (savingRef.current) return;
          savingRef.current = true;
          setConfirmSaving(true);
          try {
            const supabase = createClient();
            const { data, error } = await supabase
              .from("orders")
              .update(built.payload)
              .eq("order_num", orderNum)
              .select(ORDER_SELECT)
              .single();
            if (error) {
              showError(error.message);
              return;
            }
            setFlatRows((prev) => replaceOrderSegment(prev, orderNum, data as OrderWithNestedItems));
            pushHistory({
              orderNum,
              columnLabel,
              oldDisplay,
              newDisplay,
              revert: async () => {
                await runOrderRevert(orderNum, revertPayload);
              },
            });
            setPendingConfirm(null);
          } finally {
            savingRef.current = false;
            setConfirmSaving(false);
          }
        },
      });
      setEditing(null);
    },
    [buildOrderPayload, buildOrderRevertPayload, pendingConfirm, pushHistory, runOrderRevert, showError],
  );

  const proposeItemSave = useCallback(
    (itemId: string, orderNum: string, field: ItemEditableField, newRaw: string, oldRaw: string, itemBefore: OrderItemRow) => {
      if (pendingConfirm) return;
      if (newRaw === oldRaw) {
        setEditing(null);
        return;
      }
      const columnLabel = ITEM_FIELD_LABELS[field];
      const oldDisplay = displayItemField(field, oldRaw);
      const newDisplay = displayItemField(field, newRaw);
      const built = buildItemUpdates(field, newRaw, itemBefore);
      if ("error" in built) {
        showError(built.error);
        setEditing(null);
        return;
      }
      const revertUpdates = buildItemRevertUpdates(field, itemBefore);
      setPendingConfirm({
        columnLabel,
        oldDisplay,
        newDisplay,
        execute: async () => {
          if (savingRef.current) return;
          savingRef.current = true;
          setConfirmSaving(true);
          try {
            const supabase = createClient();
            const { error } = await supabase.from("order_items").update(built.updates).eq("id", itemId);
            if (error) {
              showError(error.message);
              return;
            }
            const { data: orderFresh, error: orderErr } = await supabase
              .from("orders")
              .select(ORDER_SELECT)
              .eq("order_num", orderNum)
              .single();
            if (orderErr || !orderFresh) {
              showError(orderErr?.message ?? "주문을 다시 불러오지 못했습니다.");
              return;
            }
            setFlatRows((prev) => replaceOrderSegment(prev, orderNum, orderFresh as OrderWithNestedItems));
            pushHistory({
              orderNum,
              columnLabel,
              oldDisplay,
              newDisplay,
              revert: async () => {
                await runItemRevertThenRefresh(itemId, orderNum, revertUpdates);
              },
            });
            setPendingConfirm(null);
          } finally {
            savingRef.current = false;
            setConfirmSaving(false);
          }
        },
      });
      setEditing(null);
    },
    [buildItemUpdates, pendingConfirm, pushHistory, runItemRevertThenRefresh, showError],
  );

  const startEdit = (target: EditTarget, current: string) => {
    setEditing(target);
    setDraft(current);
    setEditBaseline(current);
  };

  const cancelEdit = () => setEditing(null);

  const finishOrderField = (orderNum: string, field: OrderEditableField) => {
    if (!editing || editing.kind !== "order" || editing.orderNum !== orderNum || editing.field !== field) return;
    proposeOrderSave(orderNum, field, draft, editBaseline);
  };

  const finishItemField = (itemId: string, field: ItemEditableField, item: OrderItemRow) => {
    if (!editing || editing.kind !== "item" || editing.itemId !== itemId || editing.field !== field) return;
    proposeItemSave(itemId, editing.orderNum, field, draft, editBaseline, item);
  };

  const isEditingOrder = (orderNum: string, field: OrderEditableField) =>
    editing?.kind === "order" && editing.orderNum === orderNum && editing.field === field;

  const isEditingItem = (itemId: string, field: ItemEditableField) =>
    editing?.kind === "item" && editing.itemId === itemId && editing.field === field;

  const onHistoryUndo = async (entry: HistoryEntry) => {
    if (undoingId) return;
    setUndoingId(entry.id);
    try {
      await entry.revert();
      setHistory((h) => h.filter((x) => x.id !== entry.id));
    } finally {
      setUndoingId(null);
    }
  };

  const lineCount = flatRows.length;
  const orderCount = new Set(flatRows.map((r) => r.order.order_num)).size;

  const progressHeadStyle = { left: STICKY_PROGRESS_LEFT, width: W_PROGRESS, minWidth: W_PROGRESS, maxWidth: W_PROGRESS };
  const progressCellStyle = { left: STICKY_PROGRESS_LEFT, width: W_PROGRESS, minWidth: W_PROGRESS, maxWidth: W_PROGRESS };

  return (
    <>
      {toast ? (
        <div
          className="fixed bottom-4 right-4 z-[100] max-w-md rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
          role="alert"
        >
          {toast}
        </div>
      ) : null}

      {pendingConfirm ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">변경 확인</p>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{pendingConfirm.columnLabel}</span>을{" "}
              <span className="font-mono text-zinc-500">&apos;{pendingConfirm.oldDisplay}&apos;</span> →{" "}
              <span className="font-mono text-emerald-700 dark:text-emerald-400">&apos;{pendingConfirm.newDisplay}&apos;</span>
              으로 변경할까요?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                disabled={confirmSaving}
                onClick={() => setPendingConfirm(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                disabled={confirmSaving}
                onClick={() => void pendingConfirm.execute()}
              >
                {confirmSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-[105] flex justify-end bg-black/30" role="presentation">
          <button type="button" className="h-full flex-1 cursor-default" aria-label="닫기" onClick={() => setHistoryOpen(false)} />
          <div className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">변경 이력 (최근 10개)</p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setHistoryOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {history.length === 0 ? (
                <p className="text-sm text-zinc-500">아직 기록된 변경이 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {history.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/60"
                    >
                      <p className="text-zinc-500">
                        {new Date(e.at).toLocaleString("ko-KR", {
                          dateStyle: "medium",
                          timeStyle: "medium",
                        })}
                      </p>
                      <p className="mt-1 text-zinc-800 dark:text-zinc-200">
                        주문 {e.orderNum} · {e.columnLabel} · {e.oldDisplay} → {e.newDisplay}
                      </p>
                      <button
                        type="button"
                        className="mt-2 rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
                        disabled={undoingId !== null}
                        onClick={() => void onHistoryUndo(e)}
                      >
                        {undoingId === e.id ? "되돌리는 중…" : "되돌리기"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="fixed bottom-20 right-4 z-[90] rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        onClick={() => setHistoryOpen(true)}
      >
        변경 이력 {history.length > 0 ? `(${history.length})` : ""}
      </button>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        주문 {orderCount}건 · 표시 행 {lineCount}줄 (상품 단위)
      </p>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <thead className="text-left">
            <tr>
              <th
                className={`${thOrderHead} min-w-[120px] max-w-[120px]`}
                style={{ width: W_ORDER_NUM, minWidth: W_ORDER_NUM, maxWidth: W_ORDER_NUM }}
              >
                주문번호
              </th>
              <th
                className={`${thBase} ${thStickyTop} min-w-[80px] max-w-[80px]`}
                style={{ width: W_PLATFORM, minWidth: W_PLATFORM, maxWidth: W_PLATFORM }}
              >
                플랫폼
              </th>
              <th
                className={`${thBase} ${thStickyTop} min-w-[80px] max-w-[80px]`}
                style={{ width: W_PATH, minWidth: W_PATH, maxWidth: W_PATH }}
              >
                경로
              </th>
              <th
                className={`${thBase} ${thStickyTop} min-w-[100px] max-w-[100px]`}
                style={{ width: W_DATE, minWidth: W_DATE, maxWidth: W_DATE }}
              >
                일자
              </th>
              <th className={`${thProgressHead}`} style={progressHeadStyle}>
                진행
              </th>
              <th className={`${thBase} ${thStickyTop} min-w-[120px]`}>고객</th>
              <th className={`${thBase} ${thStickyTop} min-w-[52px]`}>선물</th>
              <th className={`${thBase} ${thStickyTop} min-w-[80px]`}>사진</th>
              <th className={`${thBase} ${thStickyTop} min-w-[88px]`}>거래처</th>
              <th className={`${thBase} ${thStickyTop} min-w-[88px]`}>카테고리</th>
              <th className={`${thBase} ${thStickyTop} min-w-[160px]`}>상품명</th>
              <th className={`${thBase} ${thStickyTop} min-w-[120px]`}>옵션</th>
              <th className={`${thBase} ${thStickyTop} min-w-[72px]`}>단품/세트</th>
              <th className={`${thBase} ${thStickyTop} min-w-[48px] text-right`}>수량</th>
              <th className={`${thBase} ${thStickyTop} min-w-[80px] text-right`}>판매가₽</th>
              <th className={`${thBase} ${thStickyTop} min-w-[72px] text-right`}>선결제₽</th>
              <th className={`${thBase} ${thStickyTop} min-w-[72px] text-right`}>잔금₽</th>
              <th className={`${thBase} ${thStickyTop} min-w-[72px] text-right`}>원화매입</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row, idx) => {
              const { order, item, groupColorIndex } = row;
              const g = groupRowClass(groupColorIndex);
              const on = order.order_num;

              return (
                <tr key={item ? `${on}-${item.id}` : `${on}-empty-${idx}`} className={g}>
                  <td
                    className={tdOrderSticky(g)}
                    style={{ width: W_ORDER_NUM, minWidth: W_ORDER_NUM, maxWidth: W_ORDER_NUM }}
                  >
                    <Link
                      href={`/orders/${encodeURIComponent(on)}`}
                      className="text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {on}
                    </Link>
                  </td>
                  <td
                    className={tdBase}
                    style={{ width: W_PLATFORM, minWidth: W_PLATFORM, maxWidth: W_PLATFORM }}
                  >
                    {order.platform}
                  </td>
                  <td className={tdBase} style={{ width: W_PATH, minWidth: W_PATH, maxWidth: W_PATH }}>
                    {order.order_type}
                  </td>
                  <td
                    className={`${tdBase} whitespace-nowrap`}
                    style={{ width: W_DATE, minWidth: W_DATE, maxWidth: W_DATE }}
                  >
                    {order.date?.slice(0, 10)}
                  </td>

                  <td
                    className={`${tdProgressSticky(g)} ${isEditingOrder(on, "progress") ? editingBg : ""}`}
                    style={progressCellStyle}
                  >
                    {isEditingOrder(on, "progress") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[7rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          proposeOrderSave(on, "progress", v, editBaseline);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        {ORDER_PROGRESS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "order", orderNum: on, field: "progress" }, order.progress)}
                      >
                        <span
                          className={`inline-flex max-w-[140px] truncate rounded-full px-2 py-0.5 text-xs font-medium ${progressBadgeClass(order.progress)}`}
                        >
                          {order.progress}
                        </span>
                      </button>
                    )}
                  </td>

                  <td className={`${tdBase} max-w-[140px] ${isEditingOrder(on, "customer_name") ? editingBg : ""}`}>
                    {isEditingOrder(on, "customer_name") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => !pendingConfirm && finishOrderField(on, "customer_name")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`${cellBtn} truncate`}
                        title={order.customer_name ?? ""}
                        onClick={() =>
                          startEdit({ kind: "order", orderNum: on, field: "customer_name" }, order.customer_name ?? "")
                        }
                      >
                        {order.customer_name ?? "—"}
                      </button>
                    )}
                  </td>

                  <td className={`${tdBase} ${isEditingOrder(on, "gift") ? editingBg : ""}`}>
                    {isEditingOrder(on, "gift") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          proposeOrderSave(on, "gift", v, editBaseline);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        <option value="no">no</option>
                        <option value="ask">ask</option>
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() =>
                          startEdit({ kind: "order", orderNum: on, field: "gift" }, order.gift === "ask" ? "ask" : "no")
                        }
                      >
                        {order.gift === "ask" ? "ask" : "no"}
                      </button>
                    )}
                  </td>

                  <td className={`${tdBase} ${isEditingOrder(on, "photo_sent") ? editingBg : ""}`}>
                    {isEditingOrder(on, "photo_sent") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[6rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          proposeOrderSave(on, "photo_sent", v, editBaseline);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        {PHOTO_STATUS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={`${cellBtn} truncate`}
                        onClick={() => startEdit({ kind: "order", orderNum: on, field: "photo_sent" }, order.photo_sent)}
                      >
                        {order.photo_sent}
                      </button>
                    )}
                  </td>

                  <td className={`${tdBase} max-w-[100px] ${isEditingOrder(on, "purchase_channel") ? editingBg : ""}`}>
                    {isEditingOrder(on, "purchase_channel") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => !pendingConfirm && finishOrderField(on, "purchase_channel")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`${cellBtn} truncate`}
                        title={order.purchase_channel ?? ""}
                        onClick={() =>
                          startEdit(
                            { kind: "order", orderNum: on, field: "purchase_channel" },
                            order.purchase_channel ?? "",
                          )
                        }
                      >
                        {order.purchase_channel ?? "—"}
                      </button>
                    )}
                  </td>

                  {!item ? (
                    <>
                      <td colSpan={9} className={`${tdBase} text-zinc-400`}>
                        등록된 상품이 없습니다.
                      </td>
                    </>
                  ) : (
                    <>
                      <ItemCells
                        item={item}
                        orderNum={on}
                        groupClass={g}
                        editing={editing}
                        draft={draft}
                        editBaseline={editBaseline}
                        setDraft={setDraft}
                        startEdit={startEdit}
                        cancelEdit={cancelEdit}
                        proposeItemSave={proposeItemSave}
                        finishItemField={finishItemField}
                        isEditingItem={isEditingItem}
                        inputRef={inputRef}
                        selectRef={selectRef}
                        pendingConfirm={pendingConfirm}
                      />
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemCells({
  item,
  orderNum,
  groupClass,
  editing,
  draft,
  editBaseline,
  setDraft,
  startEdit,
  cancelEdit,
  proposeItemSave,
  finishItemField,
  isEditingItem,
  inputRef,
  selectRef,
  pendingConfirm,
}: {
  item: OrderItemRow;
  orderNum: string;
  groupClass: string;
  editing: EditTarget | null;
  draft: string;
  editBaseline: string;
  setDraft: (s: string) => void;
  startEdit: (t: EditTarget, cur: string) => void;
  cancelEdit: () => void;
  proposeItemSave: (
    id: string,
    on: string,
    f: ItemEditableField,
    newRaw: string,
    oldRaw: string,
    cur: OrderItemRow,
  ) => void;
  finishItemField: (itemId: string, field: ItemEditableField, item: OrderItemRow) => void;
  isEditingItem: (id: string, f: ItemEditableField) => boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  selectRef: React.RefObject<HTMLSelectElement | null>;
  pendingConfirm: PendingConfirm | null;
}) {
  const id = item.id;
  const td = `${tdBase} ${groupClass}`;

  return (
    <>
      <td className={`${td} ${isEditingItem(id, "product_type") ? editingBg : ""}`}>
        {isEditingItem(id, "product_type") ? (
          <select
            ref={selectRef}
            className="w-full min-w-[5rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              proposeItemSave(id, orderNum, "product_type", v, editBaseline, item);
            }}
            onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
          >
            <option value="">—</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className={cellBtn}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "product_type" }, item.product_type ?? "")
            }
          >
            {item.product_type ?? "—"}
          </button>
        )}
      </td>

      <td className={`${td} max-w-[200px] ${isEditingItem(id, "product_name") ? editingBg : ""}`}>
        {isEditingItem(id, "product_name") ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !pendingConfirm && finishItemField(id, "product_name", item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} line-clamp-2`}
            onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "product_name" }, item.product_name)}
          >
            {item.product_name}
          </button>
        )}
      </td>

      <td className={`${td} max-w-[140px] ${isEditingItem(id, "product_option") ? editingBg : ""}`}>
        {isEditingItem(id, "product_option") ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !pendingConfirm && finishItemField(id, "product_option", item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} truncate`}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "product_option" }, item.product_option ?? "")
            }
          >
            {item.product_option ?? "—"}
          </button>
        )}
      </td>

      <td className={`${td} ${isEditingItem(id, "product_set_type") ? editingBg : ""}`}>
        {isEditingItem(id, "product_set_type") ? (
          <select
            ref={selectRef}
            className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              proposeItemSave(id, orderNum, "product_set_type", v, editBaseline, item);
            }}
            onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
          >
            {SET_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className={cellBtn}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "product_set_type" }, item.product_set_type)
            }
          >
            {item.product_set_type}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "quantity") ? editingBg : ""}`}>
        {isEditingItem(id, "quantity") ? (
          <input
            ref={inputRef}
            type="number"
            min={1}
            className="w-14 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !pendingConfirm && finishItemField(id, "quantity", item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} text-right`}
            onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "quantity" }, String(item.quantity))}
          >
            {item.quantity}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "price_rub") ? editingBg : ""}`}>
        {isEditingItem(id, "price_rub") ? (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !pendingConfirm && finishItemField(id, "price_rub", item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} text-right`}
            onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "price_rub" }, String(item.price_rub))}
          >
            {fmtRub(item.price_rub)}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "prepayment_rub") ? editingBg : ""}`}>
        {isEditingItem(id, "prepayment_rub") ? (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !pendingConfirm && finishItemField(id, "prepayment_rub", item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} text-right`}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "prepayment_rub" }, String(item.prepayment_rub))
            }
          >
            {fmtRub(item.prepayment_rub)}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums text-zinc-700 dark:text-zinc-300`}>{fmtRub(computedExtra(item))}</td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "krw") ? editingBg : ""}`}>
        {isEditingItem(id, "krw") ? (
          <input
            ref={inputRef}
            type="number"
            step={1}
            className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !pendingConfirm && finishItemField(id, "krw", item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} text-right`}
            onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "krw" }, item.krw != null ? String(item.krw) : "")}
          >
            {fmtKrw(item.krw)}
          </button>
        )}
      </td>
    </>
  );
}
