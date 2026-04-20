"use client";

import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type ValueFormatterParams,
  type ICellRendererParams,
  type CellValueChangedEvent,
  type GetRowIdParams,
  type RowClassParams,
  type RowStyle,
} from "ag-grid-community";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { insertOrderHistoryAction } from "@/lib/actions/order-history";
import { flattenOrders } from "@/lib/orders-line-items-flatten";
import { toGridRow, type OrderGridRow } from "@/lib/orders-ag-grid-types";
import { DeliveryImportButton } from "@/components/delivery-import-button";
import { ORDER_PROGRESS, PLATFORMS, ORDER_ROUTES, PRODUCT_CATEGORIES, SET_TYPES, PHOTO_STATUS } from "@/lib/schema";
import type { OrderWithNestedItems } from "@/lib/orders-line-items-flatten";

// ── AG Grid 모듈 등록 (앱 전체에서 한 번만) ─────────────────────────────
ModuleRegistry.registerModules([AllCommunityModule]);

// ── 테마 설정 ─────────────────────────────────────────────────────────────
const fankoTheme = themeQuartz.withParams({
  accentColor: "#059669",
  rowHeight: 32,
  headerHeight: 38,
  fontFamily: "inherit",
  fontSize: "13px",
  borderColor: "#e4e4e7",
  headerBackgroundColor: "#fafafa",
  rowHoverColor: "rgba(0,0,0,0.03)",
  selectedRowBackgroundColor: "rgba(5, 150, 105, 0.08)",
  cellHorizontalPaddingScale: 0.6,
});

// ── 진행상태 색상 맵 (기존 getProgressStyle 이식) ─────────────────────────
const PROGRESS_STYLE: Record<string, string> = {
  PAY:           "bg-blue-100 text-blue-700",
  "BUY IN KOREA":"bg-violet-100 text-violet-700",
  "ARRIVE KOR":  "bg-cyan-100 text-cyan-700",
  "IN DELIVERY": "bg-amber-100 text-amber-700",
  "ARRIVE RUS":  "bg-orange-100 text-orange-700",
  "RU DELIVERY": "bg-pink-100 text-pink-700",
  DONE:          "bg-green-100 text-green-700",
  "WAIT CUSTOMER":"bg-yellow-100 text-yellow-700",
  PROBLEM:       "bg-red-100 text-red-700",
  CANCEL:        "bg-gray-100 text-gray-500",
};

// ── TOP_GROUP (진행중인 주문: DONE·CANCEL 위에 정렬) ───────────────────────
const TOP_GROUP = new Set(["PAY", "BUY IN KOREA", "ARRIVE KOR", "IN DELIVERY"]);

// ── 행 배경색 (groupColorIndex 기반) ─────────────────────────────────────
const ROW_BG_COLORS = [
  "#e2e8f0", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#fde68a",
  "#99f6e4", "#fecaca", "#c7d2fe", "#a5f3fc", "#fed7aa",
  "#d9f99d", "#f5d0fe",
];

// ── order 필드 집합 ──────────────────────────────────────────────────────
const ORDER_FIELDS = new Set<keyof OrderGridRow>([
  "date", "platform", "order_type", "customer_name",
  "order_gift", "order_photo_sent", "purchase_channel",
]);

// GridRow 필드명 → DB 컬럼명 매핑
const ORDER_DB_COL: Partial<Record<keyof OrderGridRow, string>> = {
  order_gift: "gift",
  order_photo_sent: "photo_sent",
};
const ITEM_DB_COL: Partial<Record<keyof OrderGridRow, string>> = {
  item_progress: "progress",
  item_gift: "gift",
  item_photo_sent: "photo_sent",
};

// ── 셀 렌더러: 진행상태 배지 ────────────────────────────────────────────
function ProgressCellRenderer({ value }: ICellRendererParams<OrderGridRow, string>) {
  if (!value) return <span className="text-zinc-400">—</span>;
  const cls = PROGRESS_STYLE[value] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

// ── 포맷터: RUB ──────────────────────────────────────────────────────────
function rubFormatter({ value }: ValueFormatterParams<OrderGridRow, number | null>) {
  const v = Number(value ?? 0);
  if (!v || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ₽`;
}

// ── 포맷터: KRW ──────────────────────────────────────────────────────────
function krwFormatter({ value }: ValueFormatterParams<OrderGridRow, number | null>) {
  if (value === null || value === undefined) return "—";
  const v = Number(value);
  if (!v || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 0 })} ₩`;
}

// ── 포맷터: kg ───────────────────────────────────────────────────────────
function kgFormatter({ value }: ValueFormatterParams<OrderGridRow, number | null>) {
  if (value === null || value === undefined) return "—";
  return `${value} kg`;
}

// ── 컬럼 정의 (22열) ──────────────────────────────────────────────────────
function buildColDefs(): ColDef<OrderGridRow>[] {
  const selectOpts = (values: readonly string[]) => ({
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: [...values] },
  });

  return [
    // ── 고정 컬럼 (pinned left) ──────────────────────────────────────────
    {
      field: "order_num",
      headerName: "주문번호",
      width: 120,
      pinned: "left" as const,
      editable: false,
      cellStyle: { fontWeight: 600 },
    },
    {
      field: "date",
      headerName: "일자",
      width: 110,
      pinned: "left" as const,
      editable: true,
      cellEditor: "agDateStringCellEditor",
    },
    // ── 상품 정보 ─────────────────────────────────────────────────────────
    {
      field: "product_name",
      headerName: "상품명",
      width: 200,
      editable: true,
      cellEditor: "agTextCellEditor",
    },
    {
      field: "product_option",
      headerName: "옵션",
      width: 150,
      editable: true,
      cellEditor: "agTextCellEditor",
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 진행 ────────────────────────────────────────────────────────────
    {
      field: "item_progress",
      headerName: "진행",
      width: 135,
      editable: true,
      cellRenderer: ProgressCellRenderer,
      ...selectOpts(ORDER_PROGRESS),
    },
    // ── 단품/세트 ─────────────────────────────────────────────────────────
    {
      field: "product_set_type",
      headerName: "단품/세트",
      width: 90,
      editable: true,
      ...selectOpts(SET_TYPES),
      cellStyle: (params) =>
        params.value === "SET" ? { backgroundColor: "#fee2e2" } : null,
    },
    // ── 선물 ─────────────────────────────────────────────────────────────
    {
      field: "item_gift",
      headerName: "선물",
      width: 75,
      editable: true,
      ...selectOpts(["no", "ask"] as const),
      cellStyle: (params) =>
        params.value === "ask" ? { backgroundColor: "#fee2e2" } : null,
    },
    // ── 사진 ─────────────────────────────────────────────────────────────
    {
      field: "item_photo_sent",
      headerName: "사진",
      width: 95,
      editable: true,
      ...selectOpts(PHOTO_STATUS),
    },
    // ── 플랫폼 ───────────────────────────────────────────────────────────
    {
      field: "platform",
      headerName: "플랫폼",
      width: 90,
      editable: true,
      ...selectOpts(PLATFORMS),
    },
    // ── 경로 ─────────────────────────────────────────────────────────────
    {
      field: "order_type",
      headerName: "경로",
      width: 85,
      editable: true,
      ...selectOpts(ORDER_ROUTES),
    },
    // ── 고객명 ───────────────────────────────────────────────────────────
    {
      field: "customer_name",
      headerName: "고객명",
      width: 130,
      editable: true,
      cellEditor: "agTextCellEditor",
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 거래처 ───────────────────────────────────────────────────────────
    {
      field: "purchase_channel",
      headerName: "거래처",
      width: 100,
      editable: true,
      cellEditor: "agTextCellEditor",
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 카테고리 ─────────────────────────────────────────────────────────
    {
      field: "product_type",
      headerName: "카테고리",
      width: 105,
      editable: true,
      ...selectOpts(["", ...PRODUCT_CATEGORIES] as const),
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 수량 ─────────────────────────────────────────────────────────────
    {
      field: "quantity",
      headerName: "수량",
      width: 65,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 1, precision: 0 },
    },
    // ── 판매가₽ ───────────────────────────────────────────────────────────
    {
      field: "price_rub",
      headerName: "판매가₽",
      width: 105,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0 },
      valueFormatter: rubFormatter,
    },
    // ── 원화매입₩ ─────────────────────────────────────────────────────────
    {
      field: "krw",
      headerName: "원화매입₩",
      width: 115,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0 },
      valueFormatter: krwFormatter,
    },
    // ── 선결제₽ ───────────────────────────────────────────────────────────
    {
      field: "prepayment_rub",
      headerName: "선결제₽",
      width: 105,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0 },
      valueFormatter: rubFormatter,
    },
    // ── 잔금₽ (computed, 읽기 전용) ───────────────────────────────────────
    {
      field: "extra_payment_rub",
      headerName: "잔금₽",
      width: 105,
      editable: false,
      valueFormatter: rubFormatter,
      cellStyle: (params) =>
        Number(params.value) > 0 ? { backgroundColor: "#fee2e2" } : null,
    },
    // ── 배송비₩ (읽기 전용) ───────────────────────────────────────────────
    {
      field: "shipping_fee",
      headerName: "배송비₩",
      width: 95,
      editable: false,
      valueFormatter: krwFormatter,
    },
    // ── 적용무게 (읽기 전용) ──────────────────────────────────────────────
    {
      field: "applied_weight",
      headerName: "적용무게",
      width: 90,
      editable: false,
      valueFormatter: kgFormatter,
    },
    // ── 운송장 (읽기 전용) ────────────────────────────────────────────────
    {
      field: "tracking_number",
      headerName: "운송장",
      width: 130,
      editable: false,
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
  ];
}

// ── 변경 이력 타입 ────────────────────────────────────────────────────────
type HistoryEntry = {
  id: string;
  at: number;
  orderNum: string;
  field: string;
  oldDisplay: string;
  newDisplay: string;
};

// ── 필터 상태 타입 ────────────────────────────────────────────────────────
type FilterState = {
  platform: string;
  progress: string;
  setType: string;
  gift: string;
  photoSent: string;
  hasBalance: string;
};

const INITIAL_FILTERS: FilterState = {
  platform: "", progress: "", setType: "",
  gift: "", photoSent: "", hasBalance: "",
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export function OrdersAgGrid({ initialOrders }: { initialOrders: OrderWithNestedItems[] }) {
  const [allRows, setAllRows]   = useState<OrderGridRow[]>(() =>
    flattenOrders(initialOrders)
      .filter((r) => r.item !== null)
      .map(toGridRow),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters]         = useState<FilterState>(INITIAL_FILTERS);
  const [portalEl, setPortalEl]       = useState<HTMLElement | null>(null);
  const [openFilter, setOpenFilter]   = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [toast, setToast]             = useState<string | null>(null);
  const [toastType, setToastType]     = useState<"error" | "success">("error");

  const colDefs = useMemo(() => buildColDefs(), []);

  const defaultColDef = useMemo<ColDef<OrderGridRow>>(
    () => ({ resizable: true, sortable: false, minWidth: 60 }),
    [],
  );

  // ── portal mount ────────────────────────────────────────────────────────
  useEffect(() => {
    setPortalEl(document.getElementById("crm-subheader-portal"));
  }, []);

  // ── 외부 클릭 시 필터 드롭다운 닫기 ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-filter-dropdown]")) {
        setOpenFilter(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── toast 자동 닫기 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── initialOrders 변경 시 rowData 동기화 ─────────────────────────────────
  useEffect(() => {
    setAllRows(
      flattenOrders(initialOrders)
        .filter((r) => r.item !== null)
        .map(toGridRow),
    );
  }, [initialOrders]);

  // ── 필터링된 rowData ─────────────────────────────────────────────────────
  const rowData = useMemo<OrderGridRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasFilter = q !== "" || Object.values(filters).some(Boolean);

    // 진행중 주문 먼저 (TOP_GROUP), 그 다음 날짜·주문번호 오름차순
    const sorted = [...allRows].sort((a, b) => {
      const aP = a.item_progress ?? "";
      const bP = b.item_progress ?? "";
      const aTop = TOP_GROUP.has(aP);
      const bTop = TOP_GROUP.has(bP);
      if (aTop && !bTop) return -1;
      if (!aTop && bTop) return 1;
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      if (dA !== dB) return dA - dB;
      return a.order_num.localeCompare(b.order_num);
    });

    return sorted.filter((row) => {
      if (!hasFilter) {
        const p = row.item_progress ?? "";
        if (p === "DONE" || p === "CANCEL") return false;
      }
      if (filters.platform && row.platform !== filters.platform) return false;
      const prog = row.item_progress ?? "";
      if (filters.progress && prog !== filters.progress) return false;
      if (filters.setType && row.product_set_type !== filters.setType) return false;
      const gift = row.item_gift ?? "no";
      if (filters.gift && gift !== filters.gift) return false;
      const photo = row.item_photo_sent ?? "Not sent";
      if (filters.photoSent && photo !== filters.photoSent) return false;
      const extra = row.extra_payment_rub;
      if (filters.hasBalance === "yes" && !(extra > 0)) return false;
      if (filters.hasBalance === "no" && extra > 0) return false;
      if (q) {
        const match =
          row.order_num.toLowerCase().includes(q) ||
          row.product_name.toLowerCase().includes(q) ||
          (row.customer_name ?? "").toLowerCase().includes(q) ||
          (row.product_option ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allRows, searchQuery, filters]);

  // ── Supabase 클라이언트 (싱글턴) ────────────────────────────────────────
  const supabase = useMemo(() => createClient(), []);

  // ── onCellValueChanged: 저장 + 이력 기록 ─────────────────────────────────
  const handleCellValueChanged = useCallback(
    async (event: CellValueChangedEvent<OrderGridRow>) => {
      const fieldRaw = event.colDef.field;
      if (!fieldRaw) return;
      const field = fieldRaw as keyof OrderGridRow;
      const row = event.data;

      const oldVal = String(event.oldValue ?? "");
      const newVal = String(event.newValue ?? "");
      if (oldVal === newVal) return;

      try {
        if (ORDER_FIELDS.has(field)) {
          // ── orders 테이블 업데이트 ─────────────────────────────────────
          const dbCol = ORDER_DB_COL[field] ?? (field as string);
          const { error } = await supabase
            .from("orders")
            .update({ [dbCol]: newVal || null })
            .eq("order_num", row.order_num);
          if (error) throw new Error(error.message);

          // 같은 주문번호의 다른 행도 동기화 (order 필드는 주문 전체에 영향)
          setAllRows((prev) =>
            prev.map((r) =>
              r.order_num === row.order_num ? { ...r, [field]: newVal || null } : r,
            ),
          );
        } else if (row.item_id) {
          // ── order_items 테이블 업데이트 ───────────────────────────────
          const dbCol = ITEM_DB_COL[field] ?? (field as string);
          const basePayload: Record<string, string | number | null> = {
            [dbCol]: newVal || null,
          };

          // price_rub 또는 prepayment_rub 변경 시 extra_payment_rub 재계산
          if (field === "price_rub" || field === "prepayment_rub") {
            const newNum = Number(newVal);
            const price   = field === "price_rub"    ? newNum : row.price_rub;
            const prepay  = field === "prepayment_rub" ? newNum : row.prepayment_rub;
            basePayload["extra_payment_rub"] = price - prepay;
          }
          // 숫자 필드 변환
          if (["quantity", "price_rub", "prepayment_rub", "krw"].includes(field as string)) {
            basePayload[dbCol] = newVal === "" ? null : Number(newVal);
          }

          const { error } = await supabase
            .from("order_items")
            .update(basePayload)
            .eq("id", row.item_id)
            .eq("order_num", row.order_num);
          if (error) throw new Error(error.message);

          // 로컬 상태 동기화
          setAllRows((prev) =>
            prev.map((r) => {
              if (r.item_id !== row.item_id) return r;
              const updated = { ...r, [field]: event.newValue };
              if ("extra_payment_rub" in basePayload) {
                updated.extra_payment_rub = basePayload["extra_payment_rub"] as number;
              }
              return updated;
            }),
          );
        }

        // ── 이력 기록 ────────────────────────────────────────────────────
        await insertOrderHistoryAction({
          order_num: row.order_num,
          field: field as string,
          old_value: oldVal,
          new_value: newVal,
          changed_by: "수동변경",
        });

        setHistory((prev) => [
          {
            id: `${Date.now()}-${Math.random()}`,
            at: Date.now(),
            orderNum: row.order_num,
            field: field as string,
            oldDisplay: oldVal || "（비어 있음）",
            newDisplay: newVal || "（비어 있음）",
          },
          ...prev.slice(0, 29),
        ]);

        setToastType("success");
        setToast("저장했습니다.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "저장 실패";
        // 실패 시 셀 값 롤백
        event.node.setDataValue(field as string, event.oldValue);
        setToastType("error");
        setToast(msg);
      }
    },
    [supabase],
  );

  // ── 데이터 새로고침 (배송 import 후 호출) ─────────────────────────────────
  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select(`*, order_items (id, product_type, product_name, product_option, product_set_type, quantity, price_rub, prepayment_rub, extra_payment_rub, krw, progress, gift, photo_sent)`)
      .order("date", { ascending: false })
      .order("order_num", { ascending: false });
    if (data) {
      setAllRows(
        flattenOrders(data as OrderWithNestedItems[])
          .filter((r) => r.item !== null)
          .map(toGridRow),
      );
    }
  }, [supabase]);

  // ── row 스타일 (groupColorIndex 기반 배경색) ──────────────────────────────
  const getRowStyle = useCallback((params: RowClassParams<OrderGridRow>): RowStyle | undefined => {
    const idx = (params.data?.groupColorIndex ?? 0) % ROW_BG_COLORS.length;
    return { backgroundColor: ROW_BG_COLORS[idx] + "33" }; // 20% opacity
  }, []);

  // ── row ID ────────────────────────────────────────────────────────────────
  const getRowId = useCallback(
    (params: GetRowIdParams<OrderGridRow>) => params.data.rowKey,
    [],
  );

  // ── 통계 카드 데이터 (allRows 기준 – 필터와 무관한 전체 현황) ─────────────
  const stats = useMemo(() => {
    const activeOrderNums = new Set(
      allRows.filter((r) => TOP_GROUP.has(r.item_progress ?? "")).map((r) => r.order_num),
    );
    return {
      activeOrders: activeOrderNums.size,
      totalLines:   allRows.length,
      inDelivery:   allRows.filter((r) => r.item_progress === "IN DELIVERY").length,
      withBalance:  allRows.filter((r) => r.extra_payment_rub > 0).length,
    };
  }, [allRows]);

  const hasActiveFilter = Object.values(filters).some(Boolean);
  const orderCount = new Set(rowData.map((r) => r.order_num)).size;

  return (
    <>
      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-[200] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toastType === "error"
              ? "bg-red-600 text-white"
              : "bg-emerald-600 text-white"
          }`}
        >
          {toast}
        </div>
      )}

      {/* ── 이력 패널 ────────────────────────────────────────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-[105] flex justify-end bg-black/30">
          <button
            type="button"
            className="h-full flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">변경 이력</p>
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
                <p className="text-sm text-zinc-500">변경 내역이 없습니다.</p>
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
                        주문 {e.orderNum} · {e.field} · {e.oldDisplay} → {e.newDisplay}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 이력 버튼 (우하단 고정) ──────────────────────────────────────── */}
      <button
        type="button"
        className="fixed bottom-20 right-4 z-[90] rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        onClick={() => setHistoryOpen(true)}
      >
        변경 이력 {history.length > 0 ? `(${history.length})` : ""}
      </button>

      {/* ── 통계 카드 + 필터바 (crm-subheader-portal로 portal) ──────────── */}
      {portalEl &&
        createPortal(
          <>
            {/* 통계 카드 (필터바 위) */}
            <div className="flex gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <StatCard label="진행 주문" value={stats.activeOrders} color="bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" />
              <StatCard label="전체 라인" value={stats.totalLines}   color="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />
              <StatCard label="배송 중"   value={stats.inDelivery}   color="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" />
              <StatCard label="잔금 있음" value={stats.withBalance}  color="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" />
            </div>
          {/* 필터바 */}
          <div className="w-full border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown
                label="진행"
                field="progress"
                value={filters.progress}
                options={[
                  { label: "전체", value: "" },
                  ...ORDER_PROGRESS.map((p) => ({ label: p, value: p })),
                ]}
                openFilter={openFilter}
                setOpenFilter={setOpenFilter}
                onChange={(v) => setFilters((f) => ({ ...f, progress: v }))}
              />
              <FilterDropdown
                label="플랫폼"
                field="platform"
                value={filters.platform}
                options={[
                  { label: "전체", value: "" },
                  ...PLATFORMS.map((p) => ({ label: p, value: p })),
                ]}
                openFilter={openFilter}
                setOpenFilter={setOpenFilter}
                onChange={(v) => setFilters((f) => ({ ...f, platform: v }))}
              />
              <FilterDropdown
                label="단품/세트"
                field="setType"
                value={filters.setType}
                options={[
                  { label: "전체", value: "" },
                  { label: "Single", value: "Single" },
                  { label: "SET", value: "SET" },
                ]}
                openFilter={openFilter}
                setOpenFilter={setOpenFilter}
                onChange={(v) => setFilters((f) => ({ ...f, setType: v }))}
              />
              <FilterDropdown
                label="선물"
                field="gift"
                value={filters.gift}
                options={[
                  { label: "전체", value: "" },
                  { label: "no", value: "no" },
                  { label: "ask", value: "ask" },
                ]}
                openFilter={openFilter}
                setOpenFilter={setOpenFilter}
                onChange={(v) => setFilters((f) => ({ ...f, gift: v }))}
              />
              <FilterDropdown
                label="사진"
                field="photoSent"
                value={filters.photoSent}
                options={[
                  { label: "전체", value: "" },
                  ...PHOTO_STATUS.map((s) => ({ label: s, value: s })),
                ]}
                openFilter={openFilter}
                setOpenFilter={setOpenFilter}
                onChange={(v) => setFilters((f) => ({ ...f, photoSent: v }))}
              />
              <FilterDropdown
                label="잔금"
                field="hasBalance"
                value={filters.hasBalance}
                options={[
                  { label: "전체", value: "" },
                  { label: "잔금 있음", value: "yes" },
                  { label: "잔금 없음", value: "no" },
                ]}
                openFilter={openFilter}
                setOpenFilter={setOpenFilter}
                onChange={(v) => setFilters((f) => ({ ...f, hasBalance: v }))}
              />
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => setFilters(INITIAL_FILTERS)}
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
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              주문 {orderCount}건 · 표시 {rowData.length}줄
            </p>
          </div>
          </>,
          portalEl,
        )}

      {/* ── AG Grid (h-full = fills <main flex-1 min-h-0>) ─────────────── */}
      <div style={{ height: "100%", width: "100%" }}>
        <AgGridReact<OrderGridRow>
          theme={fankoTheme}
          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          getRowStyle={getRowStyle}
          onCellValueChanged={(e) => { void handleCellValueChanged(e); }}
          undoRedoCellEditing={true}
          undoRedoCellEditingLimit={30}
          enableCellTextSelection={true}
          stopEditingWhenCellsLoseFocus={true}
          suppressMovableColumns={false}
          rowBuffer={20}
        />
      </div>
    </>
  );
}

// ── 통계 카드 컴포넌트 ───────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex min-w-[80px] flex-col gap-0.5 rounded-lg px-3 py-2 ${color}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</span>
      <span className="text-xl font-bold leading-tight">{value}</span>
    </div>
  );
}

// ── 필터 드롭다운 컴포넌트 ────────────────────────────────────────────────
type FilterOption = { label: string; value: string };
type FilterDropdownProps = {
  label: string;
  field: string;
  value: string;
  options: FilterOption[];
  openFilter: string | null;
  setOpenFilter: (f: string | null) => void;
  onChange: (v: string) => void;
};

function FilterDropdown({
  label, field, value, options, openFilter, setOpenFilter, onChange,
}: FilterDropdownProps) {
  const isOpen = openFilter === field;
  const active = options.find((o) => o.value === value);

  return (
    <div className="relative" data-filter-dropdown>
      <button
        type="button"
        onClick={() => setOpenFilter(isOpen ? null : field)}
        className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition ${
          value
            ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        }`}
      >
        <span>{label}</span>
        {value && <span className="font-semibold">: {active?.label}</span>}
        <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpenFilter(null); }}
              className={`w-full px-3 py-1.5 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                value === opt.value ? "font-semibold text-emerald-600" : "text-zinc-700 dark:text-zinc-300"
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
