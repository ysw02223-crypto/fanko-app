"use client";

import { createClient } from "@/lib/supabase/client";
import { syncOrderProgressFromItemsAction } from "@/lib/actions/shipping";
import {
  flattenOrders,
  replaceOrderSegment,
  type FlatOrderItemRow,
  type OrderWithNestedItems,
} from "@/lib/orders-line-items-flatten";
import {
  ORDER_PROGRESS,
  ORDER_ROUTES,
  PHOTO_STATUS,
  PLATFORMS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderItemRow,
} from "@/lib/schema";
import { DeliveryImportButton } from "@/components/delivery-import-button";
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

type OrderEditableField = "customer_name" | "purchase_channel" | "date" | "platform" | "order_type";
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
  date: "일자",
  platform: "플랫폼",
  order_type: "경로",
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

type FillDragState = {
  startRowIdx: number;
  field: ItemEditableField | OrderEditableField;
  kind: "item" | "order";
  value: string;
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
  const [focusedCell, setFocusedCell] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [editBaseline, setEditBaseline] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"error" | "success">("error");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headerWrapRef = useRef<HTMLDivElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  const suppressNextClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barInputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const savingRef = useRef(false);

  // Blur-safe 저장을 위한 ref (stale closure 방지)
  const editingRef = useRef<EditTarget | null>(null);
  const draftRef = useRef<string>("");
  const editBaselineRef = useRef<string>("");

  // Fill drag state
  const [fillDrag, setFillDrag] = useState<FillDragState | null>(null);
  const [fillPreview, setFillPreview] = useState<{ startIdx: number; endIdx: number } | null>(null);
  const fillDragRef = useRef<FillDragState | null>(null);
  const fillPreviewRef = useRef<{ startIdx: number; endIdx: number } | null>(null);

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
    const isFiltered = q !== "" || Object.values(filters).some(Boolean);
    return displayRows.filter((row) => {
      // 검색어/필터가 없을 때 DONE·CANCEL 기본 숨김
      if (!isFiltered) {
        const rowProgressRaw = row.item.progress ?? row.order.progress ?? "";
        if (rowProgressRaw === "DONE" || rowProgressRaw === "CANCEL") return false;
      }
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

  // filteredRowsRef — flushCurrentEdit에서 최신 row 접근용
  const filteredRowsRef = useRef<Array<FlatOrderItemRow & { item: OrderItemRow }>>([]);
  filteredRowsRef.current = filteredRows;

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

  // 테이블 외부 클릭 시 focusedCell 닫힘 + 미저장 편집 flush
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        const outgoing = editingRef.current;
        if (outgoing !== null && draftRef.current !== editBaselineRef.current) {
          void flushCurrentEditRef.current(outgoing, draftRef.current, editBaselineRef.current);
        }
        editingRef.current = null;
        setFocusedCell(null);
        setEditing(null);
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
      return Boolean(t.closest("input, select, textarea, [data-fill-handle]"));
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
    const bodyEl = tableRef.current;
    const headerWrap = headerWrapRef.current;
    if (!bodyEl || !headerWrap) return;
    const onScroll = () => {
      headerWrap.scrollLeft = bodyEl.scrollLeft;
    };
    onScroll();
    bodyEl.addEventListener("scroll", onScroll);
    return () => bodyEl.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      const f = editing.field;
      if (
        f === "customer_name" ||
        f === "purchase_channel" ||
        f === "date" ||
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
    setToastType("error");
    setToast(msg);
  }, []);

  // 드래그 채우기 중 커서/선택 잠금
  useEffect(() => {
    if (fillDrag) {
      document.body.style.cursor = "crosshair";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [fillDrag]);

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
      // progress가 IN DELIVERY로 변경되면 orders.progress 동기화
      if (field === "progress" && value === "IN DELIVERY") {
        await syncOrderProgressFromItemsAction(orderNum);
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
      if (field === "date") {
        if (!raw.trim()) return { error: "일자를 입력하세요." };
        return { payload: { date: raw.trim() } };
      }
      if (field === "platform") {
        if (!(PLATFORMS as readonly string[]).includes(raw)) return { error: "플랫폼 값이 올바르지 않습니다." };
        return { payload: { platform: raw } };
      }
      if (field === "order_type") {
        if (!(ORDER_ROUTES as readonly string[]).includes(raw)) return { error: "경로 값이 올바르지 않습니다." };
        return { payload: { order_type: raw } };
      }
      return { error: "알 수 없는 필드입니다." };
    },
    [],
  );

  const buildOrderRevertPayload = useCallback((field: OrderEditableField, oldRaw: string): Record<string, unknown> => {
    if (field === "customer_name") return { customer_name: oldRaw.trim() === "" ? null : oldRaw.trim() };
    if (field === "purchase_channel") return { purchase_channel: oldRaw.trim() === "" ? null : oldRaw.trim() };
    if (field === "date") return { date: oldRaw.trim() };
    if (field === "platform") return { platform: oldRaw };
    if (field === "order_type") return { order_type: oldRaw };
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

  const quickSaveOrder = useCallback(
    async (orderNum: string, field: OrderEditableField, value: string, prevValue: string) => {
      const ok = await saveOrderField(orderNum, field, value, prevValue);
      if (ok) setEditing(null);
    },
    [saveOrderField],
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

        // krw 저장 성공 후 PAY → BUY IN KOREA 자동 트리거 (해당 아이템만)
        if (field === "krw" && newRaw.trim() !== "") {
          const itemBefore2 = itemBefore;
          if (itemBefore2.progress === "PAY" || itemBefore2.progress === null) {
            // 해당 아이템만 BUY IN KOREA로 변경
            await supabase
              .from("order_items")
              .update({ progress: "BUY IN KOREA" })
              .eq("id", itemId);

            await supabase.from("order_history").insert({
              order_num: orderNum,
              field: "items_progress",
              old_value: itemBefore2.progress ?? null,
              new_value: "BUY IN KOREA",
              changed_by: "자동변경",
            });

            // 전체 아이템이 모두 BUY IN KOREA면 orders.progress도 동기화
            const { data: allItems } = await supabase
              .from("order_items")
              .select("progress")
              .eq("order_num", orderNum);

            const allBuyInKorea = allItems?.every((i) => i.progress === "BUY IN KOREA") ?? false;
            if (allBuyInKorea) {
              const { data: orderData } = await supabase
                .from("orders")
                .select("progress")
                .eq("order_num", orderNum)
                .maybeSingle();

              const oldOrderProgress = orderData?.progress ?? null;
              if (oldOrderProgress !== "BUY IN KOREA") {
                await supabase
                  .from("orders")
                  .update({ progress: "BUY IN KOREA" })
                  .eq("order_num", orderNum);

                await supabase.from("order_history").insert({
                  order_num: orderNum,
                  field: "progress",
                  old_value: oldOrderProgress,
                  new_value: "BUY IN KOREA",
                  changed_by: "자동변경",
                });
              }
            }

            // 상태 변경 반영을 위해 목록 재조회
            await fetchOrders();
          }
        }

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

  // ── Blur-safe flush (stale closure 방지) ────────────────────────────────────

  const flushCurrentEdit = useCallback(
    async (target: EditTarget, draftVal: string, baselineVal: string) => {
      if (draftVal === baselineVal) return;
      if (target.kind === "item") {
        const row = filteredRowsRef.current.find((r) => r.item?.id === target.itemId);
        if (!row?.item) return;
        await saveItemField(target.itemId, target.orderNum, target.field, draftVal, baselineVal, row.item);
      } else {
        await saveOrderField(target.orderNum, target.field, draftVal, baselineVal);
      }
    },
    [saveItemField, saveOrderField],
  );
  const flushCurrentEditRef = useRef(flushCurrentEdit);
  useEffect(() => { flushCurrentEditRef.current = flushCurrentEdit; }, [flushCurrentEdit]);

  // ── 드래그 채우기 핸들 ────────────────────────────────────────────────────────

  const onFillHandleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      rowIdx: number,
      field: ItemEditableField | OrderEditableField,
      kind: "item" | "order",
      rawValue: string,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      // 현재 편집 중인 셀이 fill 소스 셀이라면 draft 값을 사용
      const cur = editingRef.current;
      const effectiveValue =
        cur !== null &&
        cur.field === field &&
        ((kind === "item" && cur.kind === "item") || (kind === "order" && cur.kind === "order"))
          ? draftRef.current
          : rawValue;
      const state: FillDragState = { startRowIdx: rowIdx, field, kind, value: effectiveValue };
      fillDragRef.current = state;
      fillPreviewRef.current = { startIdx: rowIdx, endIdx: rowIdx };
      setFillDrag(state);
      setFillPreview({ startIdx: rowIdx, endIdx: rowIdx });
    },
    [],
  );

  const batchFill = useCallback(
    async (drag: FillDragState, startIdx: number, endIdx: number) => {
      const supabase = createClient();
      const rowsToFill = filteredRows.slice(startIdx, endIdx + 1);
      // 드래그 시작 셀은 이미 해당 값 → 제외
      const targets = rowsToFill.filter((_, i) => startIdx + i !== drag.startRowIdx);
      if (targets.length === 0) return;

      let successCount = 0;

      for (const row of targets) {
        if (drag.kind === "item") {
          const field = drag.field as ItemEditableField;
          const built = buildItemUpdates(field, drag.value, row.item);
          if ("error" in built) continue;
          const { error } = await supabase
            .from("order_items")
            .update(built.updates)
            .eq("id", row.item.id);
          if (!error) {
            successCount++;
            if (field === "progress" && drag.value === "IN DELIVERY") {
              await syncOrderProgressFromItemsAction(row.order.order_num);
            }
          }
        } else {
          const field = drag.field as OrderEditableField;
          const built = buildOrderPayload(field, drag.value);
          if ("error" in built) continue;
          const { error } = await supabase
            .from("orders")
            .update(built.payload)
            .eq("order_num", row.order.order_num);
          if (!error) successCount++;
        }
      }

      await fetchOrders();
      setToastType("success");
      setToast(`${successCount}개 행에 값이 채워졌습니다.`);
    },
    [filteredRows, buildItemUpdates, buildOrderPayload, fetchOrders],
  );

  // 드래그 채우기 글로벌 이벤트
  useEffect(() => {
    if (!fillDrag) return;

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tr = el?.closest("[data-row-idx]") as HTMLElement | null;
      if (!tr) return;
      const idx = Number(tr.dataset.rowIdx);
      if (!Number.isFinite(idx)) return;
      const start = Math.min(fillDragRef.current!.startRowIdx, idx);
      const end = Math.max(fillDragRef.current!.startRowIdx, idx);
      fillPreviewRef.current = { startIdx: start, endIdx: end };
      setFillPreview({ startIdx: start, endIdx: end });
    };

    const onMouseUp = () => {
      const drag = fillDragRef.current;
      const preview = fillPreviewRef.current;
      fillDragRef.current = null;
      fillPreviewRef.current = null;
      setFillDrag(null);
      setFillPreview(null);
      if (!drag || !preview || preview.startIdx === preview.endIdx) return;
      void batchFill(drag, preview.startIdx, preview.endIdx);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fillDragRef.current = null;
        fillPreviewRef.current = null;
        setFillDrag(null);
        setFillPreview(null);
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fillDrag, batchFill]);

  const startEdit = (target: EditTarget, current: string) => {
    // 이전 편집이 아직 저장 안 됐으면 flush (다른 셀 클릭 시 stale closure 문제 해결)
    const outgoing = editingRef.current;
    if (outgoing !== null && draftRef.current !== editBaselineRef.current) {
      void flushCurrentEditRef.current(outgoing, draftRef.current, editBaselineRef.current);
    }
    editingRef.current = target;
    editBaselineRef.current = current;
    draftRef.current = current;
    setEditing(target);
    setFocusedCell(target);
    setDraft(current);
    setEditBaseline(current);
  };

  const cancelEdit = () => {
    editingRef.current = null;
    setEditing(null);
  }; // focusedCell 유지

  const finishOrderField = async (rowKey: string, orderNum: string, field: OrderEditableField) => {
    if (!editing || editing.kind !== "order" || editing.rowKey !== rowKey || editing.field !== field) return;
    const ok = await saveOrderField(orderNum, field, draft, editBaseline);
    if (ok) {
      editingRef.current = null;
      setEditing(null); // focusedCell 유지
    }
  };

  const finishItemField = async (itemId: string, field: ItemEditableField, item: OrderItemRow) => {
    if (!editing || editing.kind !== "item" || editing.itemId !== itemId || editing.field !== field) return;
    const ok = await saveItemField(itemId, editing.orderNum, field, draft, editBaseline, item);
    if (ok) {
      editingRef.current = null;
      setEditing(null); // focusedCell 유지
    }
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

  /** 드래그 채우기 하이라이트 여부 */
  const isFillHighlight = (rowIdx: number, field: ItemEditableField | OrderEditableField, kind: "item" | "order") =>
    fillPreview !== null &&
    fillDrag?.field === field &&
    fillDrag?.kind === kind &&
    rowIdx >= fillPreview.startIdx &&
    rowIdx <= fillPreview.endIdx;

  /** fill handle span */
  const FillHandle = ({
    rowIdx,
    field,
    kind,
    rawValue,
  }: {
    rowIdx: number;
    field: ItemEditableField | OrderEditableField;
    kind: "item" | "order";
    rawValue: string;
  }) => (
    <span
      data-fill-handle="true"
      onMouseDown={(e) => onFillHandleMouseDown(e, rowIdx, field, kind, rawValue)}
      className="absolute bottom-0 right-0 z-20 h-2.5 w-2.5 cursor-crosshair border border-white bg-blue-500 dark:border-zinc-900 dark:bg-blue-400"
    />
  );

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
          className={`fixed bottom-4 right-4 z-[100] max-w-md rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toastType === "success" ? "bg-emerald-600" : "bg-red-600"}`}
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
            <DeliveryImportButton onImportDone={fetchOrders} />
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

      <div ref={wrapperRef} className="w-full rounded-2xl bg-white shadow-sm outline outline-1 outline-zinc-200 dark:bg-zinc-950 dark:outline-zinc-800">
        <div
          ref={headerWrapRef}
          className="sticky z-20 bg-white dark:bg-zinc-950"
          style={{ top: 108, overflowX: "hidden" }}
        >
          <table
            ref={headerTableRef}
            className="min-w-full border-collapse text-left text-sm"
            style={{ tableLayout: "fixed", width: "100%", minWidth: 2208 }}
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
              <col style={{ width: "80px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className={`${thClass} sticky left-0 z-30`}>#</th>
                <th className={`${thClass} sticky left-[32px] z-30`}>날짜</th>
                <th className={`${thClass} sticky left-[78px] z-30`}>주문번호</th>
                <th className={`${thClass} sticky left-[168px] z-30 text-left`}>상품명</th>
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
                <th className={thClass}>잔금₽</th>
                <th className={thClass}>배송비</th>
                <th className={thClass}>적용무게</th>
                <th className={`${thClass} border-r-0`}>배송번호</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* 편집 중 텍스트 전문 미리보기 바 */}
        {focusedCell && (() => {
          const isActiveEdit = editing !== null &&
            editing.kind === focusedCell.kind &&
            editing.field === focusedCell.field &&
            (focusedCell.kind === "order"
              ? editing.kind === "order" && editing.rowKey === focusedCell.rowKey
              : editing.kind === "item" && editing.itemId === (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId);

          const fieldLabel = focusedCell.kind === "order"
            ? (ORDER_FIELD_LABELS as Record<string, string>)[focusedCell.field] ?? focusedCell.field
            : (ITEM_FIELD_LABELS as Record<string, string>)[focusedCell.field] ?? focusedCell.field;

          // 저장된 값 가져오기
          const savedVal = (() => {
            if (focusedCell.kind === "item") {
              const itemId = (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId;
              const row = flatRows.find((r) => r.item?.id === itemId);
              return String((row?.item as Record<string, unknown> | null)?.[focusedCell.field] ?? "");
            }
            // order: orderNum으로 찾기
            const row = flatRows.find((r) => r.order.order_num === focusedCell.orderNum);
            return String((row?.order as Record<string, unknown> | undefined)?.[focusedCell.field] ?? "");
          })();

          // 바에서 편집 시작
          const startBarEdit = () => {
            if (isActiveEdit) return;
            startEdit(focusedCell, savedVal);
            requestAnimationFrame(() => barInputRef.current?.focus());
          };

          // 바에서 finishEdit 호출
          const finishBar = () => {
            if (!isActiveEdit) return;
            if (focusedCell.kind === "order") {
              void finishOrderField(
                (focusedCell as Extract<EditTarget, { kind: "order" }>).rowKey,
                focusedCell.orderNum,
                focusedCell.field as OrderEditableField,
              );
            } else {
              const row = flatRows.find((r) => r.item?.id === (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId);
              if (row?.item) void finishItemField((focusedCell as Extract<EditTarget, { kind: "item" }>).itemId, focusedCell.field as ItemEditableField, row.item);
            }
          };

          // select 타입 필드는 바 편집 미지원
          const isTextInput = ["customer_name", "purchase_channel", "date", "product_name", "product_option", "quantity", "price_rub", "prepayment_rub", "krw"].includes(focusedCell.field);

          return (
            <div className="sticky z-20 flex items-center gap-2 border-b border-sky-200 bg-sky-50 px-3 py-1.5 dark:border-sky-800 dark:bg-sky-950/40" style={{ top: 108 }}>
              <span className="shrink-0 text-xs font-semibold text-sky-600 dark:text-sky-400">
                {fieldLabel}
              </span>
              {isTextInput ? (
                isActiveEdit ? (
                  <input
                    ref={barInputRef}
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                    onBlur={(e) => {
                      if (e.relatedTarget === inputRef.current) return;
                      const cur = editingRef.current;
                      if (!cur) return;
                      const d = draftRef.current;
                      const b = editBaselineRef.current;
                      editingRef.current = null;
                      if (cur.kind === "order") {
                        void saveOrderField(cur.orderNum, cur.field, d, b);
                      } else {
                        const row = flatRows.find((r) => r.item?.id === cur.itemId);
                        if (row?.item) void saveItemField(cur.itemId, cur.orderNum, cur.field, d, b, row.item);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); finishBar(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                    }}
                    className="flex-1 rounded border border-emerald-400 bg-white px-2 py-0.5 text-sm text-zinc-900 outline-none focus:ring-1 focus:ring-emerald-400 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder={fieldLabel}
                  />
                ) : (
                  <span
                    className="flex-1 cursor-pointer rounded px-2 py-0.5 text-sm text-zinc-700 hover:bg-sky-100 dark:text-zinc-300 dark:hover:bg-sky-900/30 break-all"
                    onClick={startBarEdit}
                  >
                    {savedVal.trim() || <span className="text-zinc-400 dark:text-zinc-600">（비어 있음）</span>}
                  </span>
                )
              ) : (
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 break-all">
                  {savedVal.trim() || <span className="text-zinc-400 dark:text-zinc-600">（비어 있음）</span>}
                </span>
              )}
            </div>
          );
        })()}

        <div ref={tableRef} style={{ overflowX: "auto", overflowY: "visible" }}>
          <table
            className="min-w-full border-collapse text-left text-sm"
            style={{ tableLayout: "fixed", width: "100%", minWidth: 2208 }}
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
              <col style={{ width: "80px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead className="sr-only">
              <tr>
                <th className={`${thClass} sticky left-0 z-30`}>#</th>
                <th className={`${thClass} sticky left-[32px] z-30`}>날짜</th>
                <th className={`${thClass} sticky left-[78px] z-30`}>주문번호</th>
                <th className={`${thClass} sticky left-[168px] z-30 text-left`}>상품명</th>
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
                <th className={thClass}>잔금₽</th>
                <th className={thClass}>배송비</th>
                <th className={thClass}>적용무게</th>
                <th className={`${thClass} border-r-0`}>배송번호</th>
              </tr>
            </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={22} className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
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
                <tr key={rowKey} data-row-idx={idx}>
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
                    className={`${tdBase} relative sticky z-10 text-left border-r-gray-300 ${isEditingItem(id, "product_name") ? editingBg : isFillHighlight(idx, "product_name", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : getProgressBgColor(itemProgress)}`}
                    style={{ left: "168px", width: "320px", minWidth: "320px" }}
                    title={item.product_name}
                  >
                    {isEditingItem(id, "product_name") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "item" || cur.itemId !== id || cur.field !== "product_name") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveItemField(id, on, "product_name", d, b, item);
                        }}
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "product_name" && (
                      <FillHandle rowIdx={idx} field="product_name" kind="item" rawValue={item.product_name} />
                    )}
                  </td>

                  {/* 옵션 */}
                  <td
                    className={`${tdBase} relative text-left ${isEditingItem(id, "product_option") ? editingBg : isFillHighlight(idx, "product_option", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : getProgressBgColor(itemProgress)}`}
                    title={item.product_option ?? ""}
                  >
                    {isEditingItem(id, "product_option") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "item" || cur.itemId !== id || cur.field !== "product_option") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveItemField(id, on, "product_option", d, b, item);
                        }}
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "product_option" && (
                      <FillHandle rowIdx={idx} field="product_option" kind="item" rawValue={item.product_option ?? ""} />
                    )}
                  </td>

                  {/* 진행 */}
                  <td className={`${tdBase} relative p-1 ${isEditingItem(id, "progress") ? editingBg : isFillHighlight(idx, "progress", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : getProgressBgColor(itemProgress)}`}>
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "progress" && (
                      <FillHandle rowIdx={idx} field="progress" kind="item" rawValue={itemProgress} />
                    )}
                  </td>

                  {/* 단품/세트 */}
                  <td className={`${tdBase} relative ${isEditingItem(id, "product_set_type") ? editingBg : isFillHighlight(idx, "product_set_type", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : getSetTypeBg(item.product_set_type)}`}>
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "product_set_type" && (
                      <FillHandle rowIdx={idx} field="product_set_type" kind="item" rawValue={item.product_set_type} />
                    )}
                  </td>

                  {/* 선물 */}
                  <td className={`${tdBase} relative ${isEditingItem(id, "gift") ? editingBg : isFillHighlight(idx, "gift", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : getGiftBg(itemGift)}`}>
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "gift" && (
                      <FillHandle rowIdx={idx} field="gift" kind="item" rawValue={itemGift === "ask" ? "ask" : "no"} />
                    )}
                  </td>

                  {/* 사진 */}
                  <td className={`${tdBase} relative ${isEditingItem(id, "photo_sent") ? editingBg : isFillHighlight(idx, "photo_sent", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : getPhotoSentBg(itemPhotoSent)}`}>
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "photo_sent" && (
                      <FillHandle rowIdx={idx} field="photo_sent" kind="item" rawValue={itemPhotoSent} />
                    )}
                  </td>

                  {/* 일자 */}
                  <td className={`${tdBase} whitespace-nowrap ${isEditingOrder(rowKey, "date") ? editingBg : whiteBg}`}>
                    {isEditingOrder(rowKey, "date") ? (
                      <input
                        ref={inputRef}
                        type="date"
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "order" || cur.rowKey !== rowKey || cur.field !== "date") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveOrderField(on, "date", d, b);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "order", rowKey, orderNum: on, field: "date" }, order.date?.slice(0, 10) ?? "")}
                      >
                        {order.date?.slice(0, 10) ?? "—"}
                      </button>
                    )}
                  </td>

                  {/* 플랫폼 */}
                  <td className={`${tdBase} relative ${isEditingOrder(rowKey, "platform") ? editingBg : isFillHighlight(idx, "platform", "order") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingOrder(rowKey, "platform") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveOrder(on, "platform", e.target.value, order.platform);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "order", rowKey, orderNum: on, field: "platform" }, order.platform)}
                      >
                        {order.platform}
                      </button>
                    )}
                    {focusedCell?.kind === "order" && focusedCell.orderNum === on && focusedCell.field === "platform" && (
                      <FillHandle rowIdx={idx} field="platform" kind="order" rawValue={order.platform} />
                    )}
                  </td>

                  {/* 경로 */}
                  <td className={`${tdBase} relative ${isEditingOrder(rowKey, "order_type") ? editingBg : isFillHighlight(idx, "order_type", "order") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingOrder(rowKey, "order_type") ? (
                      <select
                        ref={selectRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          void quickSaveOrder(on, "order_type", e.target.value, order.order_type);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                      >
                        {ORDER_ROUTES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        className={cellBtn}
                        onClick={() => startEdit({ kind: "order", rowKey, orderNum: on, field: "order_type" }, order.order_type)}
                      >
                        {order.order_type}
                      </button>
                    )}
                    {focusedCell?.kind === "order" && focusedCell.orderNum === on && focusedCell.field === "order_type" && (
                      <FillHandle rowIdx={idx} field="order_type" kind="order" rawValue={order.order_type} />
                    )}
                  </td>

                  {/* 고객 */}
                  <td className={`${tdBase} relative ${isEditingOrder(rowKey, "customer_name") ? editingBg : isFillHighlight(idx, "customer_name", "order") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingOrder(rowKey, "customer_name") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "order" || cur.rowKey !== rowKey || cur.field !== "customer_name") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveOrderField(on, "customer_name", d, b);
                        }}
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
                    {focusedCell?.kind === "order" && focusedCell.orderNum === on && focusedCell.field === "customer_name" && (
                      <FillHandle rowIdx={idx} field="customer_name" kind="order" rawValue={order.customer_name ?? ""} />
                    )}
                  </td>

                  {/* 거래처 */}
                  <td className={`${tdBase} relative ${isEditingOrder(rowKey, "purchase_channel") ? editingBg : isFillHighlight(idx, "purchase_channel", "order") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingOrder(rowKey, "purchase_channel") ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "order" || cur.rowKey !== rowKey || cur.field !== "purchase_channel") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveOrderField(on, "purchase_channel", d, b);
                        }}
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
                    {focusedCell?.kind === "order" && focusedCell.orderNum === on && focusedCell.field === "purchase_channel" && (
                      <FillHandle rowIdx={idx} field="purchase_channel" kind="order" rawValue={order.purchase_channel ?? ""} />
                    )}
                  </td>

                  {/* 카테고리 */}
                  <td className={`${tdBase} relative ${isEditingItem(id, "product_type") ? editingBg : isFillHighlight(idx, "product_type", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "product_type" && (
                      <FillHandle rowIdx={idx} field="product_type" kind="item" rawValue={item.product_type ?? ""} />
                    )}
                  </td>

                  {/* 수량 */}
                  <td className={`${tdBase} relative tabular-nums ${isEditingItem(id, "quantity") ? editingBg : isFillHighlight(idx, "quantity", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingItem(id, "quantity") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        min={1}
                        className="w-14 rounded border border-sky-400 bg-white px-1 py-0.5 text-center text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "item" || cur.itemId !== id || cur.field !== "quantity") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveItemField(id, on, "quantity", d, b, item);
                        }}
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "quantity" && (
                      <FillHandle rowIdx={idx} field="quantity" kind="item" rawValue={String(item.quantity)} />
                    )}
                  </td>

                  {/* 판매가₽ */}
                  <td className={`${tdBase} relative tabular-nums ${isEditingItem(id, "price_rub") ? editingBg : isFillHighlight(idx, "price_rub", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingItem(id, "price_rub") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step="0.01"
                        className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "item" || cur.itemId !== id || cur.field !== "price_rub") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveItemField(id, on, "price_rub", d, b, item);
                        }}
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "price_rub" && (
                      <FillHandle rowIdx={idx} field="price_rub" kind="item" rawValue={String(item.price_rub)} />
                    )}
                  </td>

                  {/* 원화매입 */}
                  <td className={`${tdBase} relative tabular-nums ${isEditingItem(id, "krw") ? editingBg : isFillHighlight(idx, "krw", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingItem(id, "krw") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step={1}
                        className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "item" || cur.itemId !== id || cur.field !== "krw") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveItemField(id, on, "krw", d, b, item);
                        }}
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "krw" && (
                      <FillHandle rowIdx={idx} field="krw" kind="item" rawValue={item.krw != null ? String(item.krw) : ""} />
                    )}
                  </td>

                  {/* 선결제₽ */}
                  <td className={`${tdBase} relative tabular-nums ${isEditingItem(id, "prepayment_rub") ? editingBg : isFillHighlight(idx, "prepayment_rub", "item") ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : whiteBg}`}>
                    {isEditingItem(id, "prepayment_rub") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step="0.01"
                        className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                        onBlur={(e) => {
                          if (e.relatedTarget === barInputRef.current) return;
                          const cur = editingRef.current;
                          if (!cur || cur.kind !== "item" || cur.itemId !== id || cur.field !== "prepayment_rub") return;
                          const d = draftRef.current; const b = editBaselineRef.current;
                          editingRef.current = null;
                          void saveItemField(id, on, "prepayment_rub", d, b, item);
                        }}
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
                    {focusedCell?.kind === "item" && (focusedCell as Extract<EditTarget, { kind: "item" }>).itemId === id && focusedCell.field === "prepayment_rub" && (
                      <FillHandle rowIdx={idx} field="prepayment_rub" kind="item" rawValue={String(item.prepayment_rub)} />
                    )}
                  </td>

                  {/* 잔금₽ */}
                  <td className={`${tdBase} tabular-nums text-zinc-700 dark:text-zinc-300 ${whiteBg}`}>
                    {fmtRub(computedExtra(item))}
                  </td>
                  <td className={`${tdBase} tabular-nums`}>
                    {row.order.shipping_fee != null
                      ? `${Number(row.order.shipping_fee).toLocaleString("ko-KR")} ₽`
                      : "—"}
                  </td>
                  <td className={`${tdBase} tabular-nums`}>
                    {row.order.applied_weight != null
                      ? `${row.order.applied_weight} kg`
                      : "—"}
                  </td>
                  <td className={`${tdBase} border-r-0 text-left`}>
                    {row.order.tracking_number ?? "—"}
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

