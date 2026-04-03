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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  | { kind: "order"; rowKey: string; orderNum: string; field: OrderEditableField }
  | { kind: "item"; rowKey: string; itemId: string; orderNum: string; field: ItemEditableField };

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
  if (!v || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ₽`;
}

function fmtKrw(n: string | number | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!v || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 0 })} ₩`;
}

function displayName(name: string, option: string | null | undefined): string {
  if (!option) return name;
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
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

const thClass =
  "whitespace-nowrap border-b-2 border-r border-zinc-300 bg-zinc-50 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-zinc-600 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
const tdBase = "border-b border-r border-zinc-200 px-2 py-1.5 align-middle text-center text-sm dark:border-zinc-700";
const cellBtn =
  "w-full cursor-pointer rounded px-1 py-0.5 text-center transition hover:bg-black/5 dark:hover:bg-white/10";
const cellBtnLeft =
  "w-full cursor-pointer rounded px-1 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10";
const editingBg = "bg-sky-100 dark:bg-sky-950/50";

function groupRowClass(groupIdx: number) {
  return groupIdx % 2 === 0
    ? "bg-white dark:bg-zinc-950"
    : "bg-zinc-100/90 dark:bg-zinc-900/70";
}

/** Fully opaque bg for sticky cells (prevents content bleed-through while scrolling) */
function groupStickyBg(groupIdx: number) {
  return groupIdx % 2 === 0
    ? "bg-white dark:bg-zinc-950"
    : "bg-zinc-100 dark:bg-zinc-900";
}

function getProgressStyle(progress: string): string {
  switch (progress) {
    case "PAY":           return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "BUY IN KOREA":  return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    case "ARRIVE KOR":    return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
    case "IN DELIVERY":   return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "ARRIVE RUS":    return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
    case "RU DELIVERY":   return "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300";
    case "DONE":          return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    case "WAIT CUSTOMER": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    case "PROBLEM":       return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "CANCEL":        return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    default:              return "bg-gray-100 text-gray-500";
  }
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

const ORDER_COLORS: Array<{ text: string; bg: string }> = [
  { text: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { text: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { text: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
  { text: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30" },
  { text: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { text: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/30" },
  { text: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/30" },
  { text: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
  { text: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
  { text: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
  { text: "text-lime-600", bg: "bg-lime-50 dark:bg-lime-950/30" },
  { text: "text-fuchsia-600", bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30" },
];

function getOrderColor(orderNum: string): (typeof ORDER_COLORS)[number] {
  const hash = orderNum.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ORDER_COLORS[hash % ORDER_COLORS.length];
}

const PROGRESS_ORDER = [
  "PAY",
  "BUY IN KOREA",
  "ARRIVE KOR",
  "IN DELIVERY",
  "ARRIVE RUS",
  "RU DELIVERY",
  "DONE",
  "WAIT CUSTOMER",
  "PROBLEM",
  "CANCEL",
];

const CLICK_SLOP_PX = 5;

export function OrdersLineItemsTable({ initialOrders }: { initialOrders: OrderWithNestedItems[] }) {
  const [flatRows, setFlatRows] = useState<FlatOrderItemRow[]>(() => flattenOrders(initialOrders));
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [editBaseline, setEditBaseline] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const savingRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");

  const displayRows = useMemo(() => {
    const rows = flatRows.filter((r): r is FlatOrderItemRow & { item: OrderItemRow } => r.item !== null);
    rows.sort((a, b) => {
      const pa = PROGRESS_ORDER.indexOf(a.order.progress);
      const pb = PROGRESS_ORDER.indexOf(b.order.progress);
      const progressDiff = (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
      if (progressDiff !== 0) return progressDiff;
      const dateA = a.order.date ?? "";
      const dateB = b.order.date ?? "";
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      return a.order.order_num.localeCompare(b.order.order_num);
    });
    return rows;
  }, [flatRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return displayRows;
    return displayRows.filter(
      (row) =>
        row.order.order_num.toLowerCase().includes(q) ||
        (row.item.product_name ?? "").toLowerCase().includes(q) ||
        (row.order.customer_name ?? "").toLowerCase().includes(q) ||
        (row.item.product_option ?? "").toLowerCase().includes(q),
    );
  }, [displayRows, searchQuery]);

  useEffect(() => {
    setFlatRows(flattenOrders(initialOrders));
  }, [initialOrders]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft0 = 0;
    let startMouseX = 0;
    let startMouseY = 0;

    let touchStartX = 0;
    let touchScrollLeft = 0;
    let touchOriginX = 0;
    let touchOriginY = 0;
    let touchSession = false;

    /** 드래그 스크롤 시작만 막음(포커스 입력). 버튼/링크 셀에서는 드래그로 스크롤 가능. */
    const blocksScrollDragStart = (target: EventTarget | null) => {
      const t = target as HTMLElement | null;
      if (!t) return false;
      return Boolean(t.closest("input, select, textarea"));
    };

    const onMouseDown = (e: MouseEvent) => {
      if (blocksScrollDragStart(e.target)) return;
      isDown = true;
      el.style.cursor = "grabbing";
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startX = e.pageX - el.offsetLeft;
      scrollLeft0 = el.scrollLeft;
    };
    const onMouseLeave = () => {
      isDown = false;
      el.style.cursor = "grab";
    };
    const finishMouse = (e: MouseEvent) => {
      if (isDown) {
        const d = Math.hypot(e.clientX - startMouseX, e.clientY - startMouseY);
        if (d >= CLICK_SLOP_PX) suppressNextClickRef.current = true;
      }
      isDown = false;
      el.style.cursor = "grab";
    };
    const onMouseUp = (e: MouseEvent) => finishMouse(e);
    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.scrollLeft = scrollLeft0 - walk;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (blocksScrollDragStart(e.target)) {
        touchSession = false;
        return;
      }
      touchSession = true;
      touchOriginX = e.touches[0].clientX;
      touchOriginY = e.touches[0].clientY;
      touchStartX = e.touches[0].pageX - el.offsetLeft;
      touchScrollLeft = el.scrollLeft;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touchSession) return;
      const x = e.touches[0].pageX - el.offsetLeft;
      const walk = (x - touchStartX) * 1.5;
      el.scrollLeft = touchScrollLeft - walk;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchSession) return;
      touchSession = false;
      const t = e.changedTouches[0];
      const d = Math.hypot(t.clientX - touchOriginX, t.clientY - touchOriginY);
      if (d >= CLICK_SLOP_PX) suppressNextClickRef.current = true;
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    const onDocMouseUp = (e: MouseEvent) => {
      if (!isDown) return;
      finishMouse(e);
    };
    document.addEventListener("mouseup", onDocMouseUp);

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      suppressNextClickRef.current = false;
    };
    el.addEventListener("click", onClickCapture, true);

    return () => {
      document.removeEventListener("mouseup", onDocMouseUp);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

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

  const saveOrderField = useCallback(
    async (orderNum: string, field: OrderEditableField, newRaw: string, oldRaw: string): Promise<boolean> => {
      if (newRaw === oldRaw) return true;
      if (savingRef.current) return false;
      const built = buildOrderPayload(field, newRaw);
      if ("error" in built) {
        showError(built.error);
        return false;
      }
      savingRef.current = true;
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
          return false;
        }
        setFlatRows((prev) => replaceOrderSegment(prev, orderNum, data as OrderWithNestedItems));
        const revertPayload = buildOrderRevertPayload(field, oldRaw);
        pushHistory({
          orderNum,
          columnLabel: ORDER_FIELD_LABELS[field],
          oldDisplay: displayOrderField(field, oldRaw),
          newDisplay: displayOrderField(field, newRaw),
          revert: async () => {
            await runOrderRevert(orderNum, revertPayload);
          },
        });
        return true;
      } finally {
        savingRef.current = false;
      }
    },
    [buildOrderPayload, buildOrderRevertPayload, pushHistory, runOrderRevert, showError],
  );

  const saveItemField = useCallback(
    async (
      itemId: string,
      orderNum: string,
      field: ItemEditableField,
      newRaw: string,
      oldRaw: string,
      itemBefore: OrderItemRow,
    ): Promise<boolean> => {
      if (newRaw === oldRaw) return true;
      if (savingRef.current) return false;
      const built = buildItemUpdates(field, newRaw, itemBefore);
      if ("error" in built) {
        showError(built.error);
        return false;
      }
      savingRef.current = true;
      try {
        const supabase = createClient();
        const { error } = await supabase.from("order_items").update(built.updates).eq("id", itemId);
        if (error) {
          showError(error.message);
          return false;
        }
        const { data: orderFresh, error: orderErr } = await supabase
          .from("orders")
          .select(ORDER_SELECT)
          .eq("order_num", orderNum)
          .single();
        if (orderErr || !orderFresh) {
          showError(orderErr?.message ?? "주문을 다시 불러오지 못했습니다.");
          return false;
        }
        setFlatRows((prev) => replaceOrderSegment(prev, orderNum, orderFresh as OrderWithNestedItems));
        const revertUpdates = buildItemRevertUpdates(field, itemBefore);
        pushHistory({
          orderNum,
          columnLabel: ITEM_FIELD_LABELS[field],
          oldDisplay: displayItemField(field, oldRaw),
          newDisplay: displayItemField(field, newRaw),
          revert: async () => {
            await runItemRevertThenRefresh(itemId, orderNum, revertUpdates);
          },
        });
        return true;
      } finally {
        savingRef.current = false;
      }
    },
    [buildItemUpdates, pushHistory, runItemRevertThenRefresh, showError],
  );

  const startEdit = (target: EditTarget, current: string) => {
    setEditing(target);
    setDraft(current);
    setEditBaseline(current);
  };

  const cancelEdit = () => setEditing(null);

  const finishOrderField = async (rowKey: string, orderNum: string, field: OrderEditableField) => {
    if (!editing || editing.kind !== "order" || editing.rowKey !== rowKey || editing.field !== field) return;
    const ok = await saveOrderField(orderNum, field, draft, editBaseline);
    if (ok) setEditing(null);
  };

  const finishItemField = async (itemId: string, field: ItemEditableField, item: OrderItemRow) => {
    if (!editing || editing.kind !== "item" || editing.itemId !== itemId || editing.field !== field) return;
    const ok = await saveItemField(itemId, editing.orderNum, field, draft, editBaseline, item);
    if (ok) setEditing(null);
  };

  const isEditingOrder = (rowKey: string, field: OrderEditableField) =>
    editing?.kind === "order" && editing.rowKey === rowKey && editing.field === field;

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

  const lineCount = filteredRows.length;
  const orderCount = new Set(filteredRows.map((r) => r.order.order_num)).size;

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

      <input
        type="text"
        placeholder="주문번호, 상품명, 고객명, 옵션으로 검색…"
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        주문 {orderCount}건 · 표시 행 {lineCount}줄 (품목이 있는 주문만) · 테이블을 드래그하면 좌우로 스크롤됩니다.
      </p>

      <div
        ref={tableRef}
        className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {/* sticky: # */}
              <th className={`${thClass} sticky left-0 top-0 z-30 w-[40px]`}>#</th>
              {/* sticky: 주문번호 */}
              <th className={`${thClass} sticky left-[40px] top-0 z-30 min-w-[120px]`}>주문번호</th>
              {/* sticky: 상품명 */}
              <th className={`${thClass} sticky left-[160px] top-0 z-30 min-w-[300px] text-left`}>상품명</th>
              <th className={`${thClass} min-w-[180px] text-left`}>옵션</th>
              <th className={`${thClass} min-w-[112px]`}>진행</th>
              <th className={`${thClass} min-w-[72px]`}>단품/세트</th>
              <th className={`${thClass} min-w-[52px]`}>선물</th>
              <th className={`${thClass} min-w-[88px]`}>사진</th>
              <th className={`${thClass} min-w-[100px]`}>일자</th>
              <th className={`${thClass} min-w-[72px]`}>플랫폼</th>
              <th className={`${thClass} min-w-[72px]`}>경로</th>
              <th className={`${thClass} min-w-[100px]`}>고객</th>
              <th className={`${thClass} min-w-[88px]`}>거래처</th>
              <th className={`${thClass} min-w-[88px]`}>카테고리</th>
              <th className={`${thClass} min-w-[48px]`}>수량</th>
              <th className={`${thClass} min-w-[88px]`}>판매가₽</th>
              <th className={`${thClass} min-w-[88px]`}>원화매입</th>
              <th className={`${thClass} min-w-[80px]`}>선결제₽</th>
              <th className={`${thClass} min-w-[72px] border-r-0`}>잔금₽</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={19} className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : null}
            {filteredRows.map((row, idx) => {
              const { order, item, groupColorIndex } = row;
              const g = groupRowClass(groupColorIndex);
              const stickyBg = groupStickyBg(groupColorIndex);
              const on = order.order_num;
              const id = item.id;
              const rowKey = `${on}-${id}`;
              const orderColor = getOrderColor(on);

              return (
                <tr key={rowKey} className={g}>
                  {/* # 줄 번호 */}
                  <td className={`${tdBase} sticky left-0 z-20 w-[40px] text-xs text-zinc-400 dark:text-zinc-500 ${stickyBg}`}>
                    {idx + 1}
                  </td>

                  {/* 주문번호 */}
                  <td className={`${tdBase} sticky left-[40px] z-20 font-mono font-medium ${orderColor.bg}`}>
                    <Link
                      href={`/orders/${encodeURIComponent(on)}`}
                      className={`${orderColor.text} hover:underline`}
                    >
                      {on}
                    </Link>
                  </td>

                  {/* 상품명 */}
                  <td
                    className={`${tdBase} sticky left-[160px] z-20 text-left ${isEditingItem(id, "product_name") ? editingBg : ""} ${stickyBg}`}
                    title={item.product_name}
                  >
                    {isEditingItem(id, "product_name") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishItemField(id, "product_name", item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtnLeft}
                        style={{ fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "product_name" }, item.product_name)}
                      >
                        {displayName(item.product_name, item.product_option)}
                      </button>
                    )}
                  </td>

                  {/* 옵션 */}
                  <td
                    className={`${tdBase} text-left ${isEditingItem(id, "product_option") ? editingBg : ""} ${g}`}
                    title={item.product_option ?? ""}
                  >
                    {isEditingItem(id, "product_option") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishItemField(id, "product_option", item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtnLeft}
                        style={{ fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}
                        onClick={() =>
                          startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "product_option" }, item.product_option ?? "")
                        }
                      >
                        {item.product_option ?? "—"}
                      </button>
                    )}
                  </td>

                  {/* 진행 */}
                  <td className={`${tdBase} p-1 ${isEditingOrder(rowKey, "progress") ? editingBg : ""} ${g}`}>
                    {isEditingOrder(rowKey, "progress") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[7rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          void saveOrderField(on, "progress", v, editBaseline).then((ok) => {
                            if (ok) cancelEdit();
                          });
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
                        className={`${getProgressStyle(order.progress)} w-full min-h-[28px] flex items-center justify-center rounded-lg text-xs font-medium transition hover:opacity-80`}
                        onClick={() => startEdit({ kind: "order", rowKey, orderNum: on, field: "progress" }, order.progress)}
                      >
                        {order.progress}
                      </button>
                    )}
                  </td>

                  {/* 단품/세트 */}
                  <td className={`${tdBase} ${isEditingItem(id, "product_set_type") ? editingBg : ""} ${g}`}>
                    {isEditingItem(id, "product_set_type") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          void saveItemField(id, on, "product_set_type", v, editBaseline, item).then((ok) => {
                            if (ok) cancelEdit();
                          });
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
                          startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "product_set_type" }, item.product_set_type)
                        }
                      >
                        {item.product_set_type}
                      </button>
                    )}
                  </td>

                  {/* 선물 */}
                  <td className={`${tdBase} ${isEditingOrder(rowKey, "gift") ? editingBg : ""} ${g}`}>
                    {isEditingOrder(rowKey, "gift") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          void saveOrderField(on, "gift", v, editBaseline).then((ok) => {
                            if (ok) cancelEdit();
                          });
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
                          startEdit({ kind: "order", rowKey, orderNum: on, field: "gift" }, order.gift === "ask" ? "ask" : "no")
                        }
                      >
                        {order.gift === "ask" ? "ask" : "no"}
                      </button>
                    )}
                  </td>

                  {/* 사진 */}
                  <td className={`${tdBase} ${isEditingOrder(rowKey, "photo_sent") ? editingBg : ""} ${g}`}>
                    {isEditingOrder(rowKey, "photo_sent") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[6rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          void saveOrderField(on, "photo_sent", v, editBaseline).then((ok) => {
                            if (ok) cancelEdit();
                          });
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
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "order", rowKey, orderNum: on, field: "photo_sent" }, order.photo_sent)}
                      >
                        {order.photo_sent}
                      </button>
                    )}
                  </td>

                  {/* 일자 */}
                  <td className={`${tdBase} whitespace-nowrap ${g}`}>{order.date?.slice(0, 10)}</td>

                  {/* 플랫폼 */}
                  <td className={`${tdBase} ${g}`}>{order.platform}</td>

                  {/* 경로 */}
                  <td className={`${tdBase} ${g}`}>{order.order_type}</td>

                  {/* 고객 */}
                  <td className={`${tdBase} ${isEditingOrder(rowKey, "customer_name") ? editingBg : ""} ${g}`}>
                    {isEditingOrder(rowKey, "customer_name") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishOrderField(rowKey, on, "customer_name")}
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
                          startEdit({ kind: "order", rowKey, orderNum: on, field: "customer_name" }, order.customer_name ?? "")
                        }
                      >
                        {order.customer_name ?? "—"}
                      </button>
                    )}
                  </td>

                  {/* 거래처 */}
                  <td className={`${tdBase} ${isEditingOrder(rowKey, "purchase_channel") ? editingBg : ""} ${g}`}>
                    {isEditingOrder(rowKey, "purchase_channel") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishOrderField(rowKey, on, "purchase_channel")}
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
                            { kind: "order", rowKey, orderNum: on, field: "purchase_channel" },
                            order.purchase_channel ?? "",
                          )
                        }
                      >
                        {order.purchase_channel ?? "—"}
                      </button>
                    )}
                  </td>

                  {/* 카테고리 */}
                  <td className={`${tdBase} ${isEditingItem(id, "product_type") ? editingBg : ""} ${g}`}>
                    {isEditingItem(id, "product_type") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[5rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft(v);
                          void saveItemField(id, on, "product_type", v, editBaseline, item).then((ok) => {
                            if (ok) cancelEdit();
                          });
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
                          startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "product_type" }, item.product_type ?? "")
                        }
                      >
                        {item.product_type ?? "—"}
                      </button>
                    )}
                  </td>

                  {/* 수량 */}
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "quantity") ? editingBg : ""} ${g}`}>
                    {isEditingItem(id, "quantity") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        min={1}
                        className="w-14 rounded border border-sky-400 bg-white px-1 py-0.5 text-center text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishItemField(id, "quantity", item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "quantity" }, String(item.quantity))}
                      >
                        {item.quantity}
                      </button>
                    )}
                  </td>

                  {/* 판매가₽ */}
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "price_rub") ? editingBg : ""} ${g}`}>
                    {isEditingItem(id, "price_rub") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step="0.01"
                        className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishItemField(id, "price_rub", item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "price_rub" }, String(item.price_rub))}
                      >
                        {fmtRub(item.price_rub)}
                      </button>
                    )}
                  </td>

                  {/* 원화매입 */}
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "krw") ? editingBg : ""} ${g}`}>
                    {isEditingItem(id, "krw") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step={1}
                        className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishItemField(id, "krw", item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "krw" }, item.krw != null ? String(item.krw) : "")}
                      >
                        {fmtKrw(item.krw)}
                      </button>
                    )}
                  </td>

                  {/* 선결제₽ */}
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "prepayment_rub") ? editingBg : ""} ${g}`}>
                    {isEditingItem(id, "prepayment_rub") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step="0.01"
                        className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void finishItemField(id, "prepayment_rub", item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() =>
                          startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "prepayment_rub" }, String(item.prepayment_rub))
                        }
                      >
                        {fmtRub(item.prepayment_rub)}
                      </button>
                    )}
                  </td>

                  {/* 잔금₽ */}
                  <td className={`${tdBase} border-r-0 tabular-nums text-zinc-700 dark:text-zinc-300 ${g}`}>
                    {fmtRub(computedExtra(item))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

