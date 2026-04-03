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
  PLATFORMS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderItemRow,
} from "@/lib/schema";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    krw,
    progress,
    gift,
    photo_sent
  )
`;

type OrderEditableField = "customer_name" | "purchase_channel";
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

type EditTarget =
  | { kind: "order"; rowKey: string; orderNum: string; field: OrderEditableField }
  | { kind: "item"; rowKey: string; itemId: string; orderNum: string; field: ItemEditableField };

const ORDER_FIELD_LABELS: Record<OrderEditableField, string> = {
  customer_name: "고객명",
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
  progress: "진행",
  gift: "선물",
  photo_sent: "사진",
};

type HistoryEntry = {
  id: string;
  at: number;
  orderNum: string;
  field: string;
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
  return raw.trim() === "" ? "—" : raw;
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
const tdBase = "border-b border-r border-zinc-200 px-2 py-px align-middle text-center text-sm dark:border-zinc-700";
const cellBtn =
  "w-full cursor-pointer rounded px-1 py-0.5 text-center transition hover:bg-black/5 dark:hover:bg-white/10";
const cellBtnLeft =
  "w-full cursor-pointer rounded px-1 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10";
const editingBg = "bg-sky-100 dark:bg-sky-950/50";


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
    case "product_type":      return { product_type: before.product_type };
    case "product_name":      return { product_name: before.product_name };
    case "product_option":    return { product_option: before.product_option };
    case "product_set_type":  return { product_set_type: before.product_set_type };
    case "quantity":          return { quantity: before.quantity };
    case "price_rub":         return { price_rub: before.price_rub, extra_payment_rub: before.extra_payment_rub };
    case "prepayment_rub":    return { prepayment_rub: before.prepayment_rub, extra_payment_rub: before.extra_payment_rub };
    case "krw":               return { krw: before.krw };
    case "progress":          return { progress: before.progress };
    case "gift":              return { gift: before.gift };
    case "photo_sent":        return { photo_sent: before.photo_sent };
    default:                  return {};
  }
}

const ORDER_BG_COLORS = [
  "bg-slate-200 dark:bg-slate-700",
  "bg-blue-200 dark:bg-blue-800",
  "bg-violet-200 dark:bg-violet-800",
  "bg-pink-200 dark:bg-pink-800",
  "bg-amber-200 dark:bg-amber-800",
  "bg-teal-200 dark:bg-teal-800",
  "bg-rose-200 dark:bg-rose-800",
  "bg-indigo-200 dark:bg-indigo-800",
  "bg-cyan-200 dark:bg-cyan-800",
  "bg-orange-200 dark:bg-orange-800",
  "bg-lime-200 dark:bg-lime-800",
  "bg-fuchsia-200 dark:bg-fuchsia-800",
];

function getOrderBgColor(orderNum: string): string {
  const hash = orderNum.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ORDER_BG_COLORS[hash % ORDER_BG_COLORS.length];
}

function dateBgClass(extraPayment: number): string {
  return extraPayment > 0
    ? "bg-red-100 dark:bg-red-950/30"
    : "bg-white dark:bg-zinc-950";
}

function getSetTypeBg(setType: string): string {
  return setType === "SET" ? "bg-red-100 dark:bg-red-950/30" : "bg-white dark:bg-zinc-950";
}

function getGiftBg(gift: string): string {
  return gift === "ask" ? "bg-red-100 dark:bg-red-950/30" : "bg-white dark:bg-zinc-950";
}

function getPhotoSentBg(photoSent: string): string {
  switch (photoSent) {
    case "Not sent": return "bg-green-600 text-white dark:bg-green-700";
    case "Sent 1":   return "bg-green-200 dark:bg-green-800";
    case "Sent 2":   return "bg-white dark:bg-zinc-950";
    default:         return "bg-white dark:bg-zinc-950";
  }
}

function getProgressBgColor(progress: string): string {
  switch (progress) {
    case "PAY":           return "bg-blue-50 dark:bg-blue-950/20";
    case "BUY IN KOREA":  return "bg-violet-50 dark:bg-violet-950/20";
    case "ARRIVE KOR":    return "bg-cyan-50 dark:bg-cyan-950/20";
    case "IN DELIVERY":   return "bg-amber-50 dark:bg-amber-950/20";
    case "ARRIVE RUS":    return "bg-orange-50 dark:bg-orange-950/20";
    case "RU DELIVERY":   return "bg-pink-50 dark:bg-pink-950/20";
    case "DONE":          return "bg-green-50 dark:bg-green-950/20";
    case "WAIT CUSTOMER": return "bg-yellow-50 dark:bg-yellow-950/20";
    case "PROBLEM":       return "bg-red-50 dark:bg-red-950/20";
    case "CANCEL":        return "bg-gray-50 dark:bg-gray-800/20";
    default:              return "bg-white dark:bg-zinc-950";
  }
}

const whiteBg = "bg-white dark:bg-zinc-950";

const TOP_GROUP = ["PAY", "BUY IN KOREA", "ARRIVE KOR", "IN DELIVERY"];

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
  const headerRef = useRef<HTMLDivElement>(null);
  const headerScrollInnerRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const savingRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    platform: "",
    progress: "",
    setType: "",
    gift: "",
    photoSent: "",
    hasBalance: "",
  });

  const displayRows = useMemo(() => {
    const rows = flatRows.filter((r): r is FlatOrderItemRow & { item: OrderItemRow } => r.item !== null);
    rows.sort((a, b) => {
      const aProgress = a.item.progress ?? a.order.progress ?? "";
      const bProgress = b.item.progress ?? b.order.progress ?? "";
      const aIsTop = TOP_GROUP.includes(aProgress);
      const bIsTop = TOP_GROUP.includes(bProgress);
      if (aIsTop && !bIsTop) return -1;
      if (!aIsTop && bIsTop) return 1;
      const dateA = new Date(a.order.date ?? "").getTime();
      const dateB = new Date(b.order.date ?? "").getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.order.order_num.localeCompare(b.order.order_num);
    });
    return rows;
  }, [flatRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return displayRows.filter((row) => {
      if (filters.platform && row.order.platform !== filters.platform) return false;
      const rowProgress = row.item.progress ?? row.order.progress ?? "";
      if (filters.progress && rowProgress !== filters.progress) return false;
      if (filters.setType && row.item.product_set_type !== filters.setType) return false;
      const rowGift = row.item.gift ?? "no";
      if (filters.gift && rowGift !== filters.gift) return false;
      const rowPhoto = row.item.photo_sent ?? "Not sent";
      if (filters.photoSent && rowPhoto !== filters.photoSent) return false;
      const extra = computedExtra(row.item);
      if (filters.hasBalance === "yes" && !(extra > 0)) return false;
      if (filters.hasBalance === "no" && extra > 0) return false;
      if (q) {
        if (
          !row.order.order_num.toLowerCase().includes(q) &&
          !(row.item.product_name ?? "").toLowerCase().includes(q) &&
          !(row.order.customer_name ?? "").toLowerCase().includes(q) &&
          !(row.item.product_option ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [displayRows, searchQuery, filters]);

  useEffect(() => {
    setFlatRows(flattenOrders(initialOrders));
  }, [initialOrders]);

  useEffect(() => {
    setPortalEl(document.getElementById("crm-subheader-portal"));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-filter-dropdown]")) {
        setOpenFilter(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const tableEl = tableRef.current;
    const innerEl = headerScrollInnerRef.current;
    if (!tableEl || !innerEl) return;
    const onScroll = () => {
      innerEl.style.transform = `translateX(-${tableEl.scrollLeft}px)`;
    };
    tableEl.addEventListener("scroll", onScroll);
    return () => tableEl.removeEventListener("scroll", onScroll);
  }, []);

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

  /** 저장 후 전체 목록 재조회 — UI 업데이트(bug1) + 자연스러운 재정렬(bug2) */
  const fetchOrders = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("orders").select(ORDER_SELECT);
    if (error || !data) {
      showError("목록 새로고침 실패");
      return;
    }
    setFlatRows(flattenOrders(data as OrderWithNestedItems[]));
  }, [showError]);

  const pushHistory = useCallback((entry: Omit<HistoryEntry, "id" | "at">) => {
    setHistory((h) => {
      const newEntry = { id: crypto.randomUUID(), at: Date.now(), ...entry };
      // A→B→A: 새 값이 직전 이력의 원래 값과 같으면 직전 이력 제거 (원상복구로 간주)
      if (
        h.length > 0 &&
        h[0].field === entry.field &&
        h[0].orderNum === entry.orderNum &&
        entry.newDisplay === h[0].oldDisplay
      ) {
        return h.slice(1);
      }
      return [newEntry, ...h].slice(0, 30);
    });
  }, []);

  /**
   * select 필드 즉시 저장 — savingRef 없이 직접 DB 업데이트 후 전체 목록 재조회.
   * progress / gift / photo_sent / product_set_type / product_type 에 사용.
   */
  const quickSaveItem = useCallback(
    async (itemId: string, orderNum: string, field: string, value: unknown, prevValue: unknown) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("order_items")
        .update({ [field]: value })
        .eq("id", itemId);
      if (error) {
        showError(`저장 실패: ${error.message}`);
        setEditing(null);
        return;
      }
      await fetchOrders();
      pushHistory({
        field,
        orderNum,
        columnLabel: (ITEM_FIELD_LABELS as Record<string, string>)[field] ?? field,
        oldDisplay: String(prevValue ?? "—"),
        newDisplay: String(value ?? "—"),
        revert: async () => {
          const supa = createClient();
          const { error: revertErr } = await supa
            .from("order_items")
            .update({ [field]: prevValue })
            .eq("id", itemId);
          if (revertErr) showError(`되돌리기 실패: ${revertErr.message}`);
          else await fetchOrders();
        },
      });
      setEditing(null);
    },
    [showError, fetchOrders, pushHistory],
  );

  const runOrderRevert = useCallback(
    async (orderNum: string, payload: Record<string, unknown>) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("orders")
        .update(payload)
        .eq("order_num", orderNum);
      if (error) {
        showError(error.message);
        return;
      }
      const { data, error: fetchErr } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("order_num", orderNum)
        .single();
      if (fetchErr || !data) {
        showError(fetchErr?.message ?? "주문을 다시 불러오지 못했습니다.");
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
      if (field === "customer_name") {
        return { payload: { customer_name: raw.trim() === "" ? null : raw.trim() } };
      }
      if (field === "purchase_channel") {
        return { payload: { purchase_channel: raw.trim() === "" ? null : raw.trim() } };
      }
      return { error: "알 수 없는 필드입니다." };
    },
    [],
  );

  const buildOrderRevertPayload = useCallback((field: OrderEditableField, oldRaw: string): Record<string, unknown> => {
    if (field === "customer_name") return { customer_name: oldRaw.trim() === "" ? null : oldRaw.trim() };
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
      if (field === "progress") {
        if (!(ORDER_PROGRESS as readonly string[]).includes(raw)) return { error: "진행 상태가 올바르지 않습니다." };
        return { updates: { progress: raw } };
      }
      if (field === "gift") {
        return { updates: { gift: raw === "ask" ? "ask" : "no" } };
      }
      if (field === "photo_sent") {
        if (!(PHOTO_STATUS as readonly string[]).includes(raw)) return { error: "사진 발송 상태가 올바르지 않습니다." };
        return { updates: { photo_sent: raw } };
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
        const { error } = await supabase
          .from("orders")
          .update(built.payload)
          .eq("order_num", orderNum);
        if (error) {
          showError(error.message);
          return false;
        }
        await fetchOrders();
        const revertPayload = buildOrderRevertPayload(field, oldRaw);
        pushHistory({
          field,
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
    [buildOrderPayload, buildOrderRevertPayload, fetchOrders, pushHistory, runOrderRevert, showError],
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
        await fetchOrders();
        const revertUpdates = buildItemRevertUpdates(field, itemBefore);
        pushHistory({
          field,
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
    [buildItemUpdates, fetchOrders, pushHistory, runItemRevertThenRefresh, showError],
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

  // Ctrl+Z: 가장 최근 변경 되돌리기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (history.length > 0 && !undoingId) void onHistoryUndo(history[0]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, undoingId]);

  const lineCount = filteredRows.length;
  const orderCount = new Set(filteredRows.map((r) => r.order.order_num)).size;
  const hasActiveFilter = Object.values(filters).some(Boolean);

  type FilterKey = keyof typeof filters;
  function FilterDropdown({
    label,
    field,
    options,
  }: {
    label: string;
    field: FilterKey;
    options: { label: string; value: string }[];
  }) {
    const active = Boolean(filters[field]);
    return (
      <div className="relative" data-filter-dropdown>
        <button
          type="button"
          onClick={() => setOpenFilter(openFilter === field ? null : field)}
          className={`flex items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition ${
            active
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          {label}
          {active ? ` · ${filters[field]}` : ""}
          <span className="opacity-50 text-xs">▾</span>
        </button>
        {openFilter === field && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setFilters((f) => ({ ...f, [field]: opt.value }));
                  setOpenFilter(null);
                }}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 ${
                  filters[field] === opt.value
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : "text-gray-700 dark:text-zinc-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

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
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">변경 이력 (최근 30개)</p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setHistoryOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-xs text-gray-400">Ctrl+Z로 마지막 변경을 되돌릴 수 있습니다</p>
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

      {/* 필터 바 — crm-subheader-portal (main 바깥 sticky 슬롯)으로 portal 렌더링 */}
      {portalEl && createPortal(
        <div className="w-full border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              label="진행"
              field="progress"
              options={[{ label: "전체", value: "" }, ...ORDER_PROGRESS.map((p) => ({ label: p, value: p }))]}
            />
            <FilterDropdown
              label="플랫폼"
              field="platform"
              options={[{ label: "전체", value: "" }, ...PLATFORMS.map((p) => ({ label: p, value: p }))]}
            />
            <FilterDropdown
              label="단품/세트"
              field="setType"
              options={[
                { label: "전체", value: "" },
                { label: "Single", value: "Single" },
                { label: "SET", value: "SET" },
              ]}
            />
            <FilterDropdown
              label="선물"
              field="gift"
              options={[
                { label: "전체", value: "" },
                { label: "no", value: "no" },
                { label: "ask", value: "ask" },
              ]}
            />
            <FilterDropdown
              label="사진"
              field="photoSent"
              options={[{ label: "전체", value: "" }, ...PHOTO_STATUS.map((s) => ({ label: s, value: s }))]}
            />
            <FilterDropdown
              label="잔금"
              field="hasBalance"
              options={[
                { label: "전체", value: "" },
                { label: "잔금 있음", value: "yes" },
                { label: "잔금 없음", value: "no" },
              ]}
            />
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() =>
                  setFilters({ platform: "", progress: "", setType: "", gift: "", photoSent: "", hasBalance: "" })
                }
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                초기화
              </button>
            )}
            <input
              type="text"
              placeholder="주문번호·상품명·고객·옵션 검색…"
              className="ml-auto rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              style={{ minWidth: "220px" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>,
        portalEl,
      )}

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        주문 {orderCount}건 · 표시 행 {lineCount}줄 · 테이블을 드래그하면 좌우로 스크롤됩니다.
      </p>

      <div className="w-full rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div
          ref={headerRef}
          className="sticky top-[108px] z-20 overflow-x-clip bg-white dark:bg-zinc-950"
        >
          <div ref={headerScrollInnerRef}>
          <table
            className="min-w-full border-collapse text-left text-sm"
            style={{ tableLayout: "fixed", width: "100%", minWidth: 1928 }}
          >
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "46px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "320px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "112px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "52px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "48px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "72px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className={`${thClass} sticky left-0 z-10`}>#</th>
                <th className={`${thClass} sticky left-[32px] z-10`}>날짜</th>
                <th className={`${thClass} sticky left-[78px] z-10`}>주문번호</th>
                <th className={`${thClass} sticky left-[168px] z-10 text-left`}>상품명</th>
                <th className={`${thClass} text-left`}>옵션</th>
                <th className={thClass}>진행</th>
                <th className={thClass}>단품/세트</th>
                <th className={thClass}>선물</th>
                <th className={thClass}>사진</th>
                <th className={thClass}>일자</th>
                <th className={thClass}>플랫폼</th>
                <th className={thClass}>경로</th>
                <th className={thClass}>고객</th>
                <th className={thClass}>거래처</th>
                <th className={thClass}>카테고리</th>
                <th className={thClass}>수량</th>
                <th className={thClass}>판매가₽</th>
                <th className={thClass}>원화매입</th>
                <th className={thClass}>선결제₽</th>
                <th className={`${thClass} border-r-0`}>잔금₽</th>
              </tr>
            </thead>
          </table>
          </div>
        </div>
        <div ref={tableRef} style={{ overflowX: "auto", overflowY: "visible" }}>
          <table
            className="min-w-full border-collapse text-left text-sm"
            style={{ tableLayout: "fixed", width: "100%", minWidth: 1928 }}
          >
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "46px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "320px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "112px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "52px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "48px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "72px" }} />
            </colgroup>
            <thead className="sr-only">
              <tr>
                <th scope="col">#</th>
                <th scope="col">날짜</th>
                <th scope="col">주문번호</th>
                <th scope="col">상품명</th>
                <th scope="col">옵션</th>
                <th scope="col">진행</th>
                <th scope="col">단품/세트</th>
                <th scope="col">선물</th>
                <th scope="col">사진</th>
                <th scope="col">일자</th>
                <th scope="col">플랫폼</th>
                <th scope="col">경로</th>
                <th scope="col">고객</th>
                <th scope="col">거래처</th>
                <th scope="col">카테고리</th>
                <th scope="col">수량</th>
                <th scope="col">판매가₽</th>
                <th scope="col">원화매입</th>
                <th scope="col">선결제₽</th>
                <th scope="col">잔금₽</th>
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
              const { order, item } = row;
              const on = order.order_num;
              const id = item.id;
              const rowKey = `${on}-${id}`;
              const orderBg = getOrderBgColor(on);
              const itemProgress = item.progress ?? order.progress;
              const itemGift = item.gift ?? order.gift;
              const itemPhotoSent = item.photo_sent ?? order.photo_sent;

              return (
                <tr key={rowKey}>
                  {/* # 줄 번호 */}
                  <td
                    className={`${tdBase} sticky z-10 border-r-gray-300 text-xs text-zinc-400 dark:text-zinc-500 ${whiteBg}`}
                    style={{ left: 0, width: "32px", minWidth: "32px" }}
                  >
                    {idx + 1}
                  </td>

                  {/* 날짜 */}
                  <td
                    className={`${tdBase} sticky z-10 whitespace-nowrap border-r-gray-300 text-xs text-gray-500 ${dateBgClass(computedExtra(item))}`}
                    style={{ left: "32px", width: "46px", minWidth: "46px" }}
                  >
                    {order.date ? (() => {
                      const d = new Date(order.date);
                      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
                    })() : "—"}
                  </td>

                  {/* 주문번호 */}
                  <td
                    className={`${tdBase} sticky z-10 border-r-gray-300 font-semibold ${orderBg}`}
                    style={{ left: "78px", width: "90px", minWidth: "90px" }}
                  >
                    <Link
                      href={`/orders/${encodeURIComponent(on)}`}
                      className="text-gray-900 hover:underline dark:text-gray-100"
                    >
                      {on}
                    </Link>
                  </td>

                  {/* 상품명 */}
                  <td
                    className={`${tdBase} sticky z-10 text-left border-r-gray-300 ${isEditingItem(id, "product_name") ? editingBg : getProgressBgColor(itemProgress)}`}
                    style={{ left: "168px", width: "320px", minWidth: "320px" }}
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
                    className={`${tdBase} text-left ${isEditingItem(id, "product_option") ? editingBg : getProgressBgColor(itemProgress)}`}
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
                  <td className={`${tdBase} p-1 ${isEditingItem(id, "progress") ? editingBg : getProgressBgColor(itemProgress)}`}>
                    {isEditingItem(id, "progress") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[7rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveItem(id, on, "progress", e.target.value, itemProgress);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        {ORDER_PROGRESS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={`${getProgressStyle(itemProgress)} w-full min-h-[28px] flex items-center justify-center rounded-lg text-xs font-medium transition hover:opacity-80`}
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "progress" }, itemProgress)}
                      >
                        {itemProgress}
                      </button>
                    )}
                  </td>

                  {/* 단품/세트 */}
                  <td className={`${tdBase} ${isEditingItem(id, "product_set_type") ? editingBg : getSetTypeBg(item.product_set_type)}`}>
                    {isEditingItem(id, "product_set_type") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveItem(id, on, "product_set_type", e.target.value, item.product_set_type);
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
                  <td className={`${tdBase} ${isEditingItem(id, "gift") ? editingBg : getGiftBg(itemGift)}`}>
                    {isEditingItem(id, "gift") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveItem(id, on, "gift", e.target.value, itemGift === "ask" ? "ask" : "no");
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
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "gift" }, itemGift === "ask" ? "ask" : "no")}
                      >
                        {itemGift === "ask" ? "ask" : "no"}
                      </button>
                    )}
                  </td>

                  {/* 사진 */}
                  <td className={`${tdBase} ${isEditingItem(id, "photo_sent") ? editingBg : getPhotoSentBg(itemPhotoSent)}`}>
                    {isEditingItem(id, "photo_sent") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[6rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveItem(id, on, "photo_sent", e.target.value, itemPhotoSent);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        {PHOTO_STATUS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "item", rowKey, itemId: id, orderNum: on, field: "photo_sent" }, itemPhotoSent)}
                      >
                        {itemPhotoSent}
                      </button>
                    )}
                  </td>

                  {/* 일자 */}
                  <td className={`${tdBase} whitespace-nowrap ${whiteBg}`}>{order.date?.slice(0, 10)}</td>

                  {/* 플랫폼 */}
                  <td className={`${tdBase} ${whiteBg}`}>{order.platform}</td>

                  {/* 경로 */}
                  <td className={`${tdBase} ${whiteBg}`}>{order.order_type}</td>

                  {/* 고객 */}
                  <td className={`${tdBase} ${isEditingOrder(rowKey, "customer_name") ? editingBg : whiteBg}`}>
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
                  <td className={`${tdBase} ${isEditingOrder(rowKey, "purchase_channel") ? editingBg : whiteBg}`}>
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
                  <td className={`${tdBase} ${isEditingItem(id, "product_type") ? editingBg : whiteBg}`}>
                    {isEditingItem(id, "product_type") ? (
                      <select
                        ref={selectRef}
                        className="w-full min-w-[5rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveItem(id, on, "product_type", e.target.value === "" ? null : e.target.value, item.product_type ?? "");
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
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "quantity") ? editingBg : whiteBg}`}>
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
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "price_rub") ? editingBg : whiteBg}`}>
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
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "krw") ? editingBg : whiteBg}`}>
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
                  <td className={`${tdBase} tabular-nums ${isEditingItem(id, "prepayment_rub") ? editingBg : whiteBg}`}>
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
                  <td className={`${tdBase} border-r-0 tabular-nums text-zinc-700 dark:text-zinc-300 ${whiteBg}`}>
                    {fmtRub(computedExtra(item))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}

