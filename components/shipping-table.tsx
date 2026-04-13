"use client";

import { createClient } from "@/lib/supabase/client";
import type { OrderForShipping } from "@/lib/actions/shipping";
import { toggleDownloadedAction } from "@/lib/actions/shipping";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";

// ── 타입 ────────────────────────────────────────────────────────────────────────

type ShippingEditableField =
  | "recipient_name"
  | "recipient_phone"
  | "recipient_email"
  | "zip_code"
  | "region"
  | "city"
  | "address"
  | "customs_number";

type EditTarget = {
  orderNum: string;
  field: ShippingEditableField;
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
  field: ShippingEditableField;
  value: string;
};

type ShippingOrder = OrderForShipping;

export type ShippingTableProps = {
  initialOrders: ShippingOrder[];
};

// ── 상수 ────────────────────────────────────────────────────────────────────────


const EDITABLE_FIELDS: ShippingEditableField[] = [
  "recipient_name",
  "recipient_phone",
  "recipient_email",
  "zip_code",
  "region",
  "city",
  "address",
  "customs_number",
];

const CLICK_SLOP_PX = 5;

// 컬럼 너비 (px)
const W = {
  num: 24,
  order_num: 80,
  date: 64,
  product_names: 280,
  downloaded: 48,
  recipient_name: 180,
  recipient_phone: 90,
  recipient_email: 180,
  zip_code: 80,
  region: 130,
  city: 130,
  address: 200,
  customs_number: 110,
} as const;

const TOTAL_MIN_WIDTH =
  W.num + W.order_num + W.date + W.product_names + W.downloaded +
  W.recipient_name + W.recipient_phone + W.recipient_email + W.zip_code +
  W.region + W.city + W.address + W.customs_number;

// ── CSS 클래스 ──────────────────────────────────────────────────────────────────

const thClass =
  "whitespace-nowrap border-b-2 border-r border-zinc-300 bg-zinc-50 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-zinc-600 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
const tdBase =
  "border-b border-r border-zinc-200 px-2 py-1 align-middle text-sm dark:border-zinc-700 overflow-hidden";
const cellBtn =
  "w-full cursor-pointer rounded px-1 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10 min-h-[28px] flex items-center truncate";
const editingBg = "bg-sky-100 dark:bg-sky-950/50";

// ── 헬퍼 ────────────────────────────────────────────────────────────────────────

const SHIPPING_SELECT =
  "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number, downloaded";

async function fetchShippingOrders(): Promise<ShippingOrder[]> {
  const supabase = createClient();
  const [ordersRes, itemsRes, shippingRes] = await Promise.all([
    supabase
      .from("orders")
      .select("order_num, date, customer_name, progress")
      .order("date", { ascending: false }),
    supabase.from("order_items").select("order_num, product_name"),
    supabase.from("shipping_info").select(SHIPPING_SELECT),
  ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (shippingRes.error) throw new Error(shippingRes.error.message);

  const itemsByOrder = new Map<string, string[]>();
  for (const item of itemsRes.data ?? []) {
    const arr = itemsByOrder.get(item.order_num) ?? [];
    arr.push(item.product_name);
    itemsByOrder.set(item.order_num, arr);
  }

  const shippingByOrder = new Map<string, OrderForShipping["shipping"]>();
  for (const row of shippingRes.data ?? []) {
    shippingByOrder.set(row.order_num, row as OrderForShipping["shipping"]);
  }

  return (ordersRes.data ?? []).map((o) => ({
    order_num: o.order_num,
    date: o.date,
    customer_name: o.customer_name,
    progress: o.progress,
    product_names: (itemsByOrder.get(o.order_num) ?? []).join("\n"),
    shipping: shippingByOrder.get(o.order_num) ?? null,
  }));
}

const REQUIRED_SHIPPING_FIELDS: ShippingEditableField[] = [
  "recipient_name", "recipient_phone", "recipient_email",
  "zip_code", "region", "city", "address", "customs_number",
];

function isComplete(order: ShippingOrder): boolean {
  const s = order.shipping;
  if (!s) return false;
  return REQUIRED_SHIPPING_FIELDS.every((f) => !!s[f]?.trim());
}

function hasAnyData(shipping: ShippingOrder["shipping"]): boolean {
  if (!shipping) return false;
  return REQUIRED_SHIPPING_FIELDS.some((f) => !!shipping[f]?.trim());
}

function isMissingField(shipping: ShippingOrder["shipping"], field: ShippingEditableField): boolean {
  if (!shipping) return false;
  return hasAnyData(shipping) && !shipping[field]?.trim();
}

function displayVal(val: string | null | undefined): string {
  return val?.trim() ? val.trim() : "—";
}

// "2026-04-03" → "04/03"
function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return dateStr;
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────────

export function ShippingTable({ initialOrders }: ShippingTableProps) {
  const t = useT();
  const fieldLabels: Record<ShippingEditableField, string> = {
    recipient_name: t.ship_col_recipient,
    recipient_phone: t.ship_col_phone,
    recipient_email: t.ship_col_email,
    zip_code: t.ship_col_zip,
    region: t.ship_col_region,
    city: t.ship_col_city,
    address: t.ship_col_address,
    customs_number: t.ship_col_customs,
  };
  const [orders, setOrders] = useState<ShippingOrder[]>(initialOrders);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [focusedCell, setFocusedCell] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [editBaseline, setEditBaseline] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"error" | "success">("error");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "done" | "todo">("");
  const [openFilter, setOpenFilter] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const togglingRef = useRef(false);

  // Blur-safe 저장을 위한 ref (stale closure 방지)
  const editingRef = useRef<EditTarget | null>(null);
  const draftRef = useRef<string>("");
  const editBaselineRef = useRef<string>("");

  // Fill drag state
  const [fillDrag, setFillDrag] = useState<FillDragState | null>(null);
  const [fillPreview, setFillPreview] = useState<{ startIdx: number; endIdx: number } | null>(null);
  const fillDragRef = useRef<FillDragState | null>(null);
  const fillPreviewRef = useRef<{ startIdx: number; endIdx: number } | null>(null);
  // filteredOrders를 ref로 유지 (batchFillShipping 클로저에서 최신값 참조)
  const filteredOrdersRef = useRef<ShippingOrder[]>([]);

  // ── 초기화 effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    setPortalEl(document.getElementById("crm-subheader-portal"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-filter-dropdown]")) {
        setOpenFilter(false);
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
          void saveFieldRef.current(outgoing.orderNum, outgoing.field, draftRef.current, editBaselineRef.current);
        }
        editingRef.current = null;
        setFocusedCell(null);
        setEditing(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── 드래그/터치 스크롤 ──────────────────────────────────────────────────────

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
    const onMouseLeave = () => { isDown = false; el.style.cursor = "grab"; };
    const finishMouse = (e: MouseEvent) => {
      if (isDown) {
        const d = Math.hypot(e.clientX - startMouseX, e.clientY - startMouseY);
        if (d >= CLICK_SLOP_PX) suppressNextClickRef.current = true;
      }
      isDown = false;
      el.style.cursor = "grab";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = scrollLeft0 - (x - startX) * 1.5;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (blocksScrollDragStart(e.target)) { touchSession = false; return; }
      touchSession = true;
      touchOriginX = e.touches[0].clientX;
      touchOriginY = e.touches[0].clientY;
      touchStartX = e.touches[0].pageX - el.offsetLeft;
      touchScrollLeft = el.scrollLeft;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touchSession) return;
      el.scrollLeft = touchScrollLeft - (e.touches[0].pageX - el.offsetLeft - touchStartX) * 1.5;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchSession) return;
      touchSession = false;
      const t = e.changedTouches[0];
      if (Math.hypot(t.clientX - touchOriginX, t.clientY - touchOriginY) >= CLICK_SLOP_PX) {
        suppressNextClickRef.current = true;
      }
    };

    const onDocMouseUp = (e: MouseEvent) => { if (isDown) finishMouse(e); };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      e.preventDefault(); e.stopPropagation();
      suppressNextClickRef.current = false;
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("mouseup", finishMouse);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("click", onClickCapture, true);
    document.addEventListener("mouseup", onDocMouseUp);

    return () => {
      document.removeEventListener("mouseup", onDocMouseUp);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("mouseup", finishMouse);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  // ── 헤더-바디 수평 스크롤 동기화 ────────────────────────────────────────────

  useEffect(() => {
    const bodyEl = tableRef.current;
    const headerTbl = headerTableRef.current;
    if (!bodyEl || !headerTbl) return;
    const onScroll = () => {
      headerTbl.style.transform = `translateX(-${bodyEl.scrollLeft}px)`;
    };
    onScroll();
    bodyEl.addEventListener("scroll", onScroll);
    return () => bodyEl.removeEventListener("scroll", onScroll);
  }, []);

  // ── 편집 포커스 ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  // ── 데이터 헬퍼 ─────────────────────────────────────────────────────────────

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

  const refetchOrders = useCallback(async () => {
    try {
      const fresh = await fetchShippingOrders();
      setOrders(fresh);
    } catch {
      showError("목록 새로고침 실패");
    }
  }, [showError]);

  const pushHistory = useCallback((entry: Omit<HistoryEntry, "id" | "at">) => {
    setHistory((h) => {
      const newEntry = { id: crypto.randomUUID(), at: Date.now(), ...entry };
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

  // ── 저장 ────────────────────────────────────────────────────────────────────

  const saveField = useCallback(
    async (
      orderNum: string,
      field: ShippingEditableField,
      newRaw: string,
      oldRaw: string,
    ): Promise<boolean> => {
      if (newRaw === oldRaw) return true;
      if (savingRef.current) return false;

      const currentOrder = orders.find((o) => o.order_num === orderNum);
      const currentShipping = currentOrder?.shipping;

      const newVal = newRaw.trim() === "" ? null : newRaw.trim();
      const oldVal = oldRaw.trim() === "" ? null : oldRaw.trim();

      // 전체 row를 upsert (다른 필드 보존)
      const payload = {
        order_num: orderNum,
        recipient_name: currentShipping?.recipient_name ?? null,
        recipient_phone: currentShipping?.recipient_phone ?? null,
        recipient_email: currentShipping?.recipient_email ?? null,
        zip_code: currentShipping?.zip_code ?? null,
        region: currentShipping?.region ?? null,
        city: currentShipping?.city ?? null,
        address: currentShipping?.address ?? null,
        customs_number: currentShipping?.customs_number ?? null,
        [field]: newVal,
        updated_at: new Date().toISOString(),
      };

      savingRef.current = true;
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("shipping_info")
          .upsert(payload, { onConflict: "order_num" });

        if (error) {
          showError(error.message);
          return false;
        }

        await refetchOrders();

        // 되돌리기: 저장 시점의 snapshot 사용
        const snapshotShipping = { ...currentShipping };
        pushHistory({
          orderNum,
          field,
          columnLabel: fieldLabels[field],
          oldDisplay: displayVal(oldVal),
          newDisplay: displayVal(newVal),
          revert: async () => {
            const supa = createClient();
            const revertPayload = {
              order_num: orderNum,
              recipient_name: snapshotShipping?.recipient_name ?? null,
              recipient_phone: snapshotShipping?.recipient_phone ?? null,
              recipient_email: snapshotShipping?.recipient_email ?? null,
              zip_code: snapshotShipping?.zip_code ?? null,
              region: snapshotShipping?.region ?? null,
              city: snapshotShipping?.city ?? null,
              address: snapshotShipping?.address ?? null,
              customs_number: snapshotShipping?.customs_number ?? null,
              [field]: oldVal,
              updated_at: new Date().toISOString(),
            };
            const { error: revertErr } = await supa
              .from("shipping_info")
              .upsert(revertPayload, { onConflict: "order_num" });
            if (revertErr) showError(`되돌리기 실패: ${revertErr.message}`);
            else await refetchOrders();
          },
        });

        return true;
      } finally {
        savingRef.current = false;
      }
    },
    [orders, showError, refetchOrders, pushHistory],
  );

  // outside-click useEffect의 [] dep 때문에 saveField 최신값을 ref로 유지
  const saveFieldRef = useRef(saveField);
  useEffect(() => { saveFieldRef.current = saveField; }, [saveField]);

  // ── 다운로드 토글 ────────────────────────────────────────────────────────────

  const handleDownloadToggle = useCallback(async (orderNum: string, checked: boolean) => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    // 낙관적 업데이트: progress 반영
    const newProgress = checked ? "IN DELIVERY" : "PROBLEM";
    setOrders((prev) =>
      prev.map((o) => o.order_num === orderNum ? { ...o, progress: newProgress } : o)
    );
    try {
      const result = await toggleDownloadedAction(orderNum, checked);
      if (result?.error) {
        setToast(result.error);
        // 롤백: 낙관적 업데이트 되돌리기
        setOrders((prev) =>
          prev.map((o) => o.order_num === orderNum ? { ...o, progress: checked ? "PROBLEM" : "IN DELIVERY" } : o)
        );
      } else {
        if (result?.ok) setToast(result.ok);
        // refetchOrders() 대신 서버에서 확정된 값으로 상태 업데이트
        const confirmed = result?.confirmedProgress ?? newProgress;
        setOrders((prev) =>
          prev.map((o) => o.order_num === orderNum ? { ...o, progress: confirmed } : o)
        );
      }
    } finally {
      togglingRef.current = false;
    }
  }, []);

  // ── 엑셀 다운로드 ────────────────────────────────────────────────────────────

  const handleExcelDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch("/shipping/export");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setToast(json.error ?? "다운로드 실패");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = disposition.split("filename=")[1]?.replace(/"/g, "") ?? "shipping.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      await refetchOrders();
    } catch {
      setToast("다운로드 중 오류가 발생했습니다.");
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, refetchOrders]);

  // ── 드래그 채우기 ────────────────────────────────────────────────────────────

  const onFillHandleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      rowIdx: number,
      field: ShippingEditableField,
      rawValue: string,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      // 현재 편집 중인 셀이 fill 소스 셀이라면 draft 값을 사용
      const cur = editingRef.current;
      const effectiveValue =
        cur !== null && cur.field === field ? draftRef.current : rawValue;
      const state: FillDragState = { startRowIdx: rowIdx, field, value: effectiveValue };
      fillDragRef.current = state;
      fillPreviewRef.current = { startIdx: rowIdx, endIdx: rowIdx };
      setFillDrag(state);
      setFillPreview({ startIdx: rowIdx, endIdx: rowIdx });
    },
    [],
  );

  const batchFillShipping = useCallback(
    async (drag: FillDragState, startIdx: number, endIdx: number) => {
      const supabase = createClient();
      const rowsToFill = filteredOrdersRef.current.slice(startIdx, endIdx + 1);
      const targets = rowsToFill.filter((_, i) => startIdx + i !== drag.startRowIdx);
      if (targets.length === 0) return;

      let successCount = 0;
      const newVal = drag.value.trim() === "" ? null : drag.value.trim();

      for (const order of targets) {
        const currentShipping = order.shipping;
        const payload = {
          order_num: order.order_num,
          recipient_name: currentShipping?.recipient_name ?? null,
          recipient_phone: currentShipping?.recipient_phone ?? null,
          recipient_email: currentShipping?.recipient_email ?? null,
          zip_code: currentShipping?.zip_code ?? null,
          region: currentShipping?.region ?? null,
          city: currentShipping?.city ?? null,
          address: currentShipping?.address ?? null,
          customs_number: currentShipping?.customs_number ?? null,
          [drag.field]: newVal,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("shipping_info")
          .upsert(payload, { onConflict: "order_num" });
        if (!error) successCount++;
      }

      const fresh = await fetchShippingOrders();
      setOrders(fresh);
      setToastType("success");
      setToast(`${successCount}개 행에 값이 채워졌습니다.`);
    },
    [],
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
      void batchFillShipping(drag, preview.startIdx, preview.endIdx);
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
  }, [fillDrag, batchFillShipping]);

  // ── 편집 헬퍼 ───────────────────────────────────────────────────────────────

  const startEdit = (orderNum: string, field: ShippingEditableField, current: string) => {
    // 이전 편집이 아직 저장 안 됐으면 flush
    const outgoing = editingRef.current;
    if (outgoing !== null && draftRef.current !== editBaselineRef.current) {
      void saveFieldRef.current(outgoing.orderNum, outgoing.field, draftRef.current, editBaselineRef.current);
    }
    editingRef.current = { orderNum, field };
    editBaselineRef.current = current;
    draftRef.current = current;
    setEditing({ orderNum, field });
    setFocusedCell({ orderNum, field });
    setDraft(current);
    setEditBaseline(current);
  };

  const cancelEdit = () => {
    editingRef.current = null;
    setEditing(null);
  }; // focusedCell 유지

  const finishEdit = async (orderNum: string, field: ShippingEditableField) => {
    if (editing?.orderNum !== orderNum || editing?.field !== field) return;
    const ok = await saveField(orderNum, field, draft, editBaseline);
    if (ok) {
      editingRef.current = null;
      setEditing(null); // focusedCell 유지
    }
  };

  const isEditing = (orderNum: string, field: ShippingEditableField) =>
    editing?.orderNum === orderNum && editing?.field === field;

  // ── Ctrl+Z ──────────────────────────────────────────────────────────────────

  const onHistoryUndo = useCallback(
    async (entry: HistoryEntry) => {
      if (undoingId) return;
      setUndoingId(entry.id);
      try {
        await entry.revert();
        setHistory((h) => h.filter((x) => x.id !== entry.id));
      } finally {
        setUndoingId(null);
      }
    },
    [undoingId],
  );

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

  // ── 필터링 ──────────────────────────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isSearching = q.length > 0;
    return orders.filter((o) => {
      // 검색 중이 아닐 때만 DONE 숨김
      if (!isSearching && o.progress === "DONE") return false;
      if (statusFilter === "done" && !isComplete(o)) return false;
      if (statusFilter === "todo" && isComplete(o)) return false;
      if (q) {
        if (!o.order_num.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const shippingDoneCount = useMemo(() => orders.filter(isComplete).length, [orders]);
  const shippingTodoCount = orders.length - shippingDoneCount;
  const ordersDoneCount = useMemo(
    () => orders.filter((o) => o.progress === "DONE").length,
    [orders],
  );

  // filteredOrdersRef 동기화
  filteredOrdersRef.current = filteredOrders;

  /** 드래그 채우기 하이라이트 여부 */
  const isFillHighlight = (rowIdx: number, field: ShippingEditableField) =>
    fillPreview !== null &&
    fillDrag?.field === field &&
    rowIdx >= fillPreview.startIdx &&
    rowIdx <= fillPreview.endIdx;

  /** fill handle span */
  const FillHandle = ({
    rowIdx,
    field,
    rawValue,
  }: {
    rowIdx: number;
    field: ShippingEditableField;
    rawValue: string;
  }) => (
    <span
      data-fill-handle="true"
      onMouseDown={(e) => onFillHandleMouseDown(e, rowIdx, field, rawValue)}
      className="absolute bottom-0 right-0 z-20 h-2.5 w-2.5 cursor-crosshair border border-white bg-blue-500 dark:border-zinc-900 dark:bg-blue-400"
    />
  );

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[100] max-w-md rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toastType === "success" ? "bg-emerald-600" : "bg-red-600"}`}
          role="alert"
        >
          {toast}
        </div>
      )}

      {/* 변경 이력 패널 */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-[105] flex justify-end bg-black/30"
          role="presentation"
        >
          <button
            type="button"
            className="h-full flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t.history_panel_title}
              </p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setHistoryOpen(false)}
              >
                {t.btn_close}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-xs text-gray-400">
                {t.history_panel_hint}
              </p>
              {history.length === 0 ? (
                <p className="text-sm text-zinc-500">{t.state_no_changes}</p>
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
                        {t.col_order_num} {e.orderNum} · {e.columnLabel} · {e.oldDisplay} →{" "}
                        {e.newDisplay}
                      </p>
                      <button
                        type="button"
                        className="mt-2 rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
                        disabled={undoingId !== null}
                        onClick={() => void onHistoryUndo(e)}
                      >
                        {undoingId === e.id ? t.btn_reverting : t.btn_revert}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 변경 이력 버튼 */}
      <button
        type="button"
        className="fixed bottom-20 right-4 z-[90] rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        onClick={() => setHistoryOpen(true)}
      >
        {t.btn_history}{history.length > 0 ? ` (${history.length})` : ""}
      </button>

      {/* 필터 바 — crm-subheader-portal */}
      {portalEl &&
        createPortal(
          <div className="w-full border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center gap-2">
              {/* 작성 상태 필터 드롭다운 */}
              <div className="relative" data-filter-dropdown>
                <button
                  type="button"
                  onClick={() => setOpenFilter((v) => !v)}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition ${
                    statusFilter
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  {t.ship_filter_status}
                  {statusFilter === "done" ? ` · ${t.ship_filter_done}` : statusFilter === "todo" ? ` · ${t.ship_filter_todo}` : ""}
                  <span className="text-xs opacity-50">▾</span>
                </button>
                {openFilter && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {(
                      [
                        { label: t.filter_all, value: "" },
                        { label: t.ship_filter_done, value: "done" },
                        { label: t.ship_filter_todo, value: "todo" },
                      ] as { label: string; value: "" | "done" | "todo" }[]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(opt.value);
                          setOpenFilter(false);
                        }}
                        className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 ${
                          statusFilter === opt.value
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

              {/* 필터 초기화 */}
              {statusFilter && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("")}
                  className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {t.ship_filter_reset}
                </button>
              )}

              {/* 엑셀 다운로드 */}
              <button
                type="button"
                onClick={handleExcelDownload}
                disabled={isDownloading}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
              >
                {isDownloading ? t.ship_excel_downloading : t.ship_excel_download}
              </button>

              {/* 검색 */}
              <input
                type="text"
                placeholder={t.ship_search_placeholder}
                className="ml-auto rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                style={{ minWidth: "200px" }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>,
          portalEl,
        )}

      {/* 통계 + 안내 */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t.page_shipping}</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t.ship_stats_shown} {filteredOrders.length} · {t.ship_stats_done}{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {shippingDoneCount}
          </span>
          {" · "}{t.ship_stats_todo}{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {shippingTodoCount}
          </span>
          {!searchQuery && ordersDoneCount > 0 && (
            <span className="ml-2 text-zinc-400 dark:text-zinc-500">
              · DONE {ordersDoneCount}{t.ship_stats_hidden}
            </span>
          )}
          {" · "}{t.ship_drag_hint}
        </p>
      </div>

      <div ref={wrapperRef} className="w-full rounded-2xl bg-white shadow-sm outline outline-1 outline-zinc-200 dark:bg-zinc-950 dark:outline-zinc-800">
        {/* sticky 헤더 */}
        <div
          className="sticky z-20 bg-white dark:bg-zinc-950"
          style={{ top: 108, overflowX: "hidden" }}
        >
          <table
            ref={headerTableRef}
            className="min-w-full border-collapse text-left text-sm"
            style={{ tableLayout: "fixed", width: "100%", minWidth: TOTAL_MIN_WIDTH }}
          >
            <colgroup>
              <col style={{ width: W.num }} />
              <col style={{ width: W.order_num }} />
              <col style={{ width: W.date }} />
              <col style={{ width: W.product_names }} />
              <col style={{ width: W.downloaded, minWidth: W.downloaded }} />
              <col style={{ width: W.recipient_name }} />
              <col style={{ width: W.recipient_phone }} />
              <col style={{ width: W.recipient_email }} />
              <col style={{ width: W.zip_code }} />
              <col style={{ width: W.region }} />
              <col style={{ width: W.city }} />
              <col style={{ width: W.address }} />
              <col style={{ width: W.customs_number }} />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>{t.col_num}</th>
                <th className={thClass}>{t.col_order_num}</th>
                <th className={thClass}>{t.col_date}</th>
                <th className={`${thClass} text-left`}>{t.col_product_name}</th>
                <th style={{ width: W.downloaded, minWidth: W.downloaded }} className={thClass}>
                  {t.ship_col_down}
                </th>
                <th className={thClass}>{t.ship_col_recipient}</th>
                <th className={thClass}>{t.ship_col_phone}</th>
                <th className={thClass}>{t.ship_col_email}</th>
                <th className={thClass}>{t.ship_col_zip}</th>
                <th className={thClass}>{t.ship_col_region}</th>
                <th className={thClass}>{t.ship_col_city}</th>
                <th className={`${thClass} text-left`}>{t.ship_col_address}</th>
                <th className={`${thClass} border-r-0`}>{t.ship_col_customs}</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* 편집 중 텍스트 전문 미리보기 바 */}
        {focusedCell && (() => {
          const isActiveEdit = editing?.orderNum === focusedCell.orderNum && editing?.field === focusedCell.field;
          const focusedOrder = orders.find((o) => o.order_num === focusedCell.orderNum);
          const savedVal = focusedOrder?.shipping?.[focusedCell.field] ?? "";
          return (
            <div className="sticky z-20 flex items-center gap-2 border-b border-sky-200 bg-sky-50 px-3 py-1.5 dark:border-sky-800 dark:bg-sky-950/40" style={{ top: 108 }}>
              <span className="shrink-0 text-xs font-semibold text-sky-600 dark:text-sky-400">
                {fieldLabels[focusedCell.field]}
              </span>
              {isActiveEdit ? (
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
                    void saveField(cur.orderNum, cur.field, d, b);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void finishEdit(focusedCell.orderNum, focusedCell.field); }
                    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                  }}
                  className="flex-1 rounded border border-emerald-400 bg-white px-2 py-0.5 text-sm text-zinc-900 outline-none focus:ring-1 focus:ring-emerald-400 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder={fieldLabels[focusedCell.field]}
                />
              ) : (
                <span
                  className="flex-1 cursor-pointer rounded px-2 py-0.5 text-sm text-zinc-700 hover:bg-sky-100 dark:text-zinc-300 dark:hover:bg-sky-900/30 break-all"
                  onClick={() => startEdit(focusedCell.orderNum, focusedCell.field, savedVal)}
                >
                  {savedVal.trim() || <span className="text-zinc-400 dark:text-zinc-600">{t.ship_empty_cell}</span>}
                </span>
              )}
            </div>
          );
        })()}

        {/* 스크롤 바디 */}
        <div ref={tableRef} className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500 dark:text-zinc-400">
              {searchQuery || statusFilter ? t.state_no_results : t.ship_no_orders}
            </p>
          ) : (
            <table
              className="min-w-full border-collapse text-left text-sm"
              style={{ tableLayout: "fixed", width: "100%", minWidth: TOTAL_MIN_WIDTH }}
            >
              <colgroup>
                <col style={{ width: W.num }} />
                <col style={{ width: W.order_num }} />
                <col style={{ width: W.date }} />
                <col style={{ width: W.product_names }} />
                <col style={{ width: W.downloaded, minWidth: W.downloaded }} />
                <col style={{ width: W.recipient_name }} />
                <col style={{ width: W.recipient_phone }} />
                <col style={{ width: W.recipient_email }} />
                <col style={{ width: W.zip_code }} />
                <col style={{ width: W.region }} />
                <col style={{ width: W.city }} />
                <col style={{ width: W.address }} />
                <col style={{ width: W.customs_number }} />
              </colgroup>
              <tbody>
                {filteredOrders.map((order, idx) => {
                  const done = isComplete(order);
                  const isOrderDone = order.progress === "DONE";
                  const downloaded = order.shipping?.downloaded ?? false;
                  const rowBg = downloaded
                    ? "bg-blue-50 dark:bg-blue-950/20"
                    : done
                    ? "bg-emerald-50 dark:bg-emerald-950/20"
                    : "bg-white dark:bg-zinc-950";
                  const s = order.shipping;

                  return (
                    <tr
                      key={order.order_num}
                      data-row-idx={idx}
                      className={`${rowBg} hover:brightness-95 ${isOrderDone ? "opacity-50" : ""}`}
                    >
                      {/* # */}
                      <td className={`${tdBase} text-center text-xs text-zinc-400`}>
                        {idx + 1}
                      </td>

                      {/* 주문번호 */}
                      <td className={`${tdBase} whitespace-nowrap font-mono text-xs`}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{order.order_num}</span>
                          {isOrderDone && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                              DONE
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 주문일자 */}
                      <td className={`${tdBase} whitespace-nowrap text-center text-xs text-zinc-500 dark:text-zinc-400`}>
                        {formatDate(order.date)}
                      </td>

                      {/* 상품명 */}
                      <td className={`${tdBase} text-xs text-zinc-600 dark:text-zinc-400`}>
                        <div className="overflow-hidden">
                          {order.product_names.split("\n").map((name, i) => (
                            <div key={i} className="truncate">{name}</div>
                          ))}
                        </div>
                      </td>

                      {/* 다운 체크박스 */}
                      <td className={`${tdBase} text-center`} style={{ width: W.downloaded }}>
                        <input
                          type="checkbox"
                          checked={order.progress === "IN DELIVERY"}
                          onChange={(e) => handleDownloadToggle(order.order_num, e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                        />
                      </td>

                      {/* 편집 가능 셀들 */}
                      {EDITABLE_FIELDS.map((field, fi) => {
                        const raw = s?.[field] ?? "";
                        const active = isEditing(order.order_num, field);
                        const isLast = fi === EDITABLE_FIELDS.length - 1;
                        const isSmall =
                          field === "recipient_name" || field === "recipient_email";
                        const missing = !active && isMissingField(order.shipping, field);
                        const isFocused = focusedCell?.orderNum === order.order_num && focusedCell?.field === field;
                        const highlight = isFillHighlight(idx, field);

                        return (
                          <td
                            key={field}
                            className={`${tdBase} relative ${active ? editingBg : highlight ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : missing ? "bg-amber-50 dark:bg-amber-950/30" : ""} ${isLast ? "border-r-0" : ""} ${missing && !highlight ? "border-amber-300 dark:border-amber-700" : ""}`}
                            onClick={() => {
                              if (!active) startEdit(order.order_num, field, raw);
                            }}
                          >
                            {active ? (
                              <input
                                ref={inputRef}
                                value={draft}
                                onChange={(e) => { setDraft(e.target.value); draftRef.current = e.target.value; }}
                                onBlur={(e) => {
                                  if (e.relatedTarget === barInputRef.current) return;
                                  const cur = editingRef.current;
                                  if (!cur || cur.orderNum !== order.order_num || cur.field !== field) return;
                                  const d = draftRef.current;
                                  const b = editBaselineRef.current;
                                  editingRef.current = null;
                                  void saveField(cur.orderNum, cur.field, d, b);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void finishEdit(order.order_num, field);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                className={`w-full rounded border border-emerald-400 bg-white px-1 py-0.5 text-zinc-900 outline-none focus:ring-1 focus:ring-emerald-400 dark:bg-zinc-900 dark:text-zinc-100 ${isSmall ? "text-xs" : "text-sm"}`}
                                placeholder={fieldLabels[field]}
                              />
                            ) : (
                              <button type="button" className={cellBtn}>
                                <span
                                  className={`${isSmall ? "text-xs" : ""} ${raw.trim() ? "" : "text-zinc-400 dark:text-zinc-600"}`}
                                >
                                  {raw.trim() ? raw : fieldLabels[field]}
                                </span>
                              </button>
                            )}
                            {isFocused && (
                              <FillHandle rowIdx={idx} field={field} rawValue={raw} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
