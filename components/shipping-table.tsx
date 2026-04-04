"use client";

import { createClient } from "@/lib/supabase/client";
import type { OrderForShipping } from "@/lib/actions/shipping";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

export type ShippingTableProps = {
  initialOrders: OrderForShipping[];
};

// ── 상수 ────────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<ShippingEditableField, string> = {
  recipient_name: "수취인명",
  recipient_phone: "연락처",
  recipient_email: "이메일",
  zip_code: "우편번호",
  region: "지역",
  city: "도시",
  address: "주소",
  customs_number: "통관번호",
};

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
  num: 32,
  order_num: 100,
  date: 80,
  customer_name: 100,
  product_names: 200,
  recipient_name: 130,
  recipient_phone: 130,
  recipient_email: 180,
  zip_code: 100,
  region: 130,
  city: 130,
  address: 200,
  customs_number: 130,
} as const;

const TOTAL_MIN_WIDTH =
  W.num + W.order_num + W.date + W.customer_name + W.product_names +
  W.recipient_name + W.recipient_phone + W.recipient_email + W.zip_code +
  W.region + W.city + W.address + W.customs_number;

// sticky left 누적 위치
const L = {
  num: 0,
  order_num: W.num,
  date: W.num + W.order_num,
  customer_name: W.num + W.order_num + W.date,
} as const;

// ── CSS 클래스 ──────────────────────────────────────────────────────────────────

const thClass =
  "whitespace-nowrap border-b-2 border-r border-zinc-300 bg-zinc-50 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-zinc-600 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
const tdBase =
  "border-b border-r border-zinc-200 px-2 py-1 align-middle text-sm dark:border-zinc-700";
const cellBtn =
  "w-full cursor-pointer rounded px-1 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10 min-h-[28px] flex items-center";
const editingBg = "bg-sky-100 dark:bg-sky-950/50";

// ── 헬퍼 ────────────────────────────────────────────────────────────────────────

const SHIPPING_SELECT =
  "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number";

async function fetchShippingOrders(): Promise<OrderForShipping[]> {
  const supabase = createClient();
  const [ordersRes, itemsRes, shippingRes] = await Promise.all([
    supabase
      .from("orders")
      .select("order_num, date, customer_name")
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
    product_names: (itemsByOrder.get(o.order_num) ?? []).join("\n"),
    shipping: shippingByOrder.get(o.order_num) ?? null,
  }));
}

function isComplete(order: OrderForShipping): boolean {
  return Boolean(order.shipping?.recipient_name?.trim());
}

function displayVal(val: string | null | undefined): string {
  return val?.trim() ? val.trim() : "—";
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────────

export function ShippingTable({ initialOrders }: ShippingTableProps) {
  const [orders, setOrders] = useState<OrderForShipping[]>(initialOrders);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [editBaseline, setEditBaseline] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "done" | "todo">("");
  const [openFilter, setOpenFilter] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  const suppressNextClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

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
      return Boolean(t?.closest("input, select, textarea"));
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

  const showError = useCallback((msg: string) => setToast(msg), []);

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
          columnLabel: FIELD_LABELS[field],
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

  // ── 편집 헬퍼 ───────────────────────────────────────────────────────────────

  const startEdit = (orderNum: string, field: ShippingEditableField, current: string) => {
    setEditing({ orderNum, field });
    setDraft(current);
    setEditBaseline(current);
  };

  const cancelEdit = () => setEditing(null);

  const finishEdit = async (orderNum: string, field: ShippingEditableField) => {
    if (editing?.orderNum !== orderNum || editing?.field !== field) return;
    const ok = await saveField(orderNum, field, draft, editBaseline);
    if (ok) setEditing(null);
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
    return orders.filter((o) => {
      if (statusFilter === "done" && !isComplete(o)) return false;
      if (statusFilter === "todo" && isComplete(o)) return false;
      if (q) {
        if (
          !o.order_num.toLowerCase().includes(q) &&
          !(o.customer_name ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const doneCount = useMemo(() => orders.filter(isComplete).length, [orders]);
  const todoCount = orders.length - doneCount;

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[100] max-w-md rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
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
                변경 이력 (최근 30개)
              </p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setHistoryOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-xs text-gray-400">
                Ctrl+Z로 마지막 변경을 되돌릴 수 있습니다
              </p>
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
                        주문 {e.orderNum} · {e.columnLabel} · {e.oldDisplay} →{" "}
                        {e.newDisplay}
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
      )}

      {/* 변경 이력 버튼 */}
      <button
        type="button"
        className="fixed bottom-20 right-4 z-[90] rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        onClick={() => setHistoryOpen(true)}
      >
        변경 이력{history.length > 0 ? ` (${history.length})` : ""}
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
                  작성 상태
                  {statusFilter === "done" ? " · 완료" : statusFilter === "todo" ? " · 미작성" : ""}
                  <span className="text-xs opacity-50">▾</span>
                </button>
                {openFilter && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {(
                      [
                        { label: "전체", value: "" },
                        { label: "작성 완료", value: "done" },
                        { label: "미작성", value: "todo" },
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
                  초기화
                </button>
              )}

              {/* 엑셀 다운로드 */}
              <a
                href="/shipping/export"
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
              >
                엑셀 다운로드
              </a>

              {/* 검색 */}
              <input
                type="text"
                placeholder="주문번호·고객명 검색…"
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
          <h1 className="text-2xl font-semibold tracking-tight">배송 관리</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          총 {orders.length}건 · 작성완료{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {doneCount}
          </span>
          건 · 미작성{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {todoCount}
          </span>
          건 · 표시 {filteredOrders.length}건 · 테이블을 드래그하면 좌우로 스크롤됩니다.
        </p>
      </div>

      <div className="w-full rounded-2xl bg-white shadow-sm outline outline-1 outline-zinc-200 dark:bg-zinc-950 dark:outline-zinc-800">
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
              <col style={{ width: W.customer_name }} />
              <col style={{ width: W.product_names }} />
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
                <th className={`${thClass} sticky z-30`} style={{ left: L.num }}>#</th>
                <th className={`${thClass} sticky z-30`} style={{ left: L.order_num }}>주문번호</th>
                <th className={`${thClass} sticky z-30`} style={{ left: L.date }}>주문일자</th>
                <th className={`${thClass} sticky z-30`} style={{ left: L.customer_name }}>고객명</th>
                <th className={`${thClass} text-left`}>상품명</th>
                <th className={thClass}>수취인명</th>
                <th className={thClass}>연락처</th>
                <th className={thClass}>이메일</th>
                <th className={thClass}>우편번호</th>
                <th className={thClass}>지역</th>
                <th className={thClass}>도시</th>
                <th className={`${thClass} text-left`}>주소</th>
                <th className={`${thClass} border-r-0`}>통관번호</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* 스크롤 바디 */}
        <div ref={tableRef} className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500 dark:text-zinc-400">
              {searchQuery || statusFilter ? "검색 결과가 없습니다." : "주문이 없습니다."}
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
                <col style={{ width: W.customer_name }} />
                <col style={{ width: W.product_names }} />
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
                  const rowBg = done
                    ? "bg-emerald-50 dark:bg-emerald-950/20"
                    : "bg-white dark:bg-zinc-950";
                  const s = order.shipping;

                  return (
                    <tr key={order.order_num} className={`${rowBg} hover:brightness-95`}>
                      {/* # */}
                      <td
                        className={`${tdBase} sticky z-10 text-center text-xs text-zinc-400 ${rowBg}`}
                        style={{ left: L.num }}
                      >
                        {idx + 1}
                      </td>

                      {/* 주문번호 */}
                      <td
                        className={`${tdBase} sticky z-10 whitespace-nowrap font-mono text-xs ${rowBg}`}
                        style={{ left: L.order_num }}
                      >
                        {order.order_num}
                      </td>

                      {/* 주문일자 */}
                      <td
                        className={`${tdBase} sticky z-10 whitespace-nowrap text-center text-xs text-zinc-500 dark:text-zinc-400 ${rowBg}`}
                        style={{ left: L.date }}
                      >
                        {order.date}
                      </td>

                      {/* 고객명 */}
                      <td
                        className={`${tdBase} sticky z-10 whitespace-nowrap ${rowBg}`}
                        style={{ left: L.customer_name }}
                      >
                        {order.customer_name ?? "—"}
                      </td>

                      {/* 상품명 */}
                      <td className={`${tdBase} text-xs text-zinc-600 dark:text-zinc-400`}>
                        {order.product_names.split("\n").map((name, i) => (
                          <span key={i}>
                            {i > 0 && <br />}
                            {name}
                          </span>
                        ))}
                      </td>

                      {/* 편집 가능 셀들 */}
                      {EDITABLE_FIELDS.map((field, fi) => {
                        const raw = s?.[field] ?? "";
                        const active = isEditing(order.order_num, field);
                        const isLast = fi === EDITABLE_FIELDS.length - 1;

                        return (
                          <td
                            key={field}
                            className={`${tdBase} ${active ? editingBg : ""} ${isLast ? "border-r-0" : ""}`}
                            onClick={() => {
                              if (!active) startEdit(order.order_num, field, raw);
                            }}
                          >
                            {active ? (
                              <input
                                ref={inputRef}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => void finishEdit(order.order_num, field)}
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
                                className="w-full rounded border border-emerald-400 bg-white px-1 py-0.5 text-sm text-zinc-900 outline-none focus:ring-1 focus:ring-emerald-400 dark:bg-zinc-900 dark:text-zinc-100"
                                placeholder={FIELD_LABELS[field]}
                              />
                            ) : (
                              <button type="button" className={cellBtn}>
                                <span
                                  className={raw.trim() ? "" : "text-zinc-400 dark:text-zinc-600"}
                                >
                                  {raw.trim() ? raw : FIELD_LABELS[field]}
                                </span>
                              </button>
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
