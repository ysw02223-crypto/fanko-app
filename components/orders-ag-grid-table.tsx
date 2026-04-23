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
  type CellKeyDownEvent,
  type CellFocusedEvent,
  type GetRowIdParams,
  type RowClassParams,
  type RowStyle,
} from "ag-grid-community";
import { FormulaBar, type FocusedCell } from "@/components/formula-bar";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { insertOrderHistoryAction } from "@/lib/actions/order-history";
import { flattenOrders } from "@/lib/orders-line-items-flatten";
import { toGridRow, type OrderGridRow } from "@/lib/orders-ag-grid-types";
import { DeliveryImportButton } from "@/components/delivery-import-button";
import { ORDER_PROGRESS, PLATFORMS, ORDER_ROUTES, PRODUCT_CATEGORIES, SET_TYPES, PHOTO_STATUS } from "@/lib/schema";
import type { OrderRow, OrderItemRow, OrderProgress } from "@/lib/schema";
import { insertDraftOrderAction, type InsertDraftOrderResult } from "@/lib/actions/orders";
import { OrderEditForm } from "@/components/order-edit-form";
import type { OrderWithNestedItems } from "@/lib/orders-line-items-flatten";
import { useT } from "@/lib/i18n";
import type { TranslationDict } from "@/lib/i18n";

// ── AG Grid 모듈 등록 (앱 전체에서 한 번만) ─────────────────────────────
ModuleRegistry.registerModules([AllCommunityModule]);

// ── 주문번호 prefix → 플랫폼 매핑 ─────────────────────────────────────────
const PREFIX_TO_PLATFORM: Readonly<Record<string, string>> = {
  "01": "avito",
  "02": "telegram",
  "03": "vk",
};

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
  columnBorder: true,
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

// ── Grid context 타입 ─────────────────────────────────────────────────────
type GridContext = { onOrderClick: (orderNum: string) => void };

// ── 셀 렌더러: 주문번호 (드로어 오픈) ────────────────────────────────────
function OrderNumRenderer({ value, data, context }: ICellRendererParams<OrderGridRow, string>) {
  if (!value) return null;
  // draft 행(item_id===null)은 편집 가능하므로 버튼 없이 텍스트만
  if (data?.item_id === null) {
    return <span className="font-semibold">{value}</span>;
  }
  const ctx = context as GridContext;
  return (
    <button
      type="button"
      className="font-semibold text-violet-700 hover:underline dark:text-violet-400"
      onClick={(e) => { e.stopPropagation(); ctx.onOrderClick(value); }}
    >
      {value}
    </button>
  );
}

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
function buildColDefs(t: TranslationDict): ColDef<OrderGridRow>[] {
  const selectOpts = (values: readonly string[]) => ({
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: [...values] },
  });

  return [
    // ── 행 번호 ──────────────────────────────────────────────────────────
    {
      headerName: "#",
      width: 55,
      minWidth: 55,
      pinned: "left" as const,
      editable: false,
      sortable: false,
      resizable: false,
      cellStyle: { textAlign: "center", color: "#a1a1aa" },
      valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
    },
    // ── 고정 컬럼 (pinned left) ──────────────────────────────────────────
    {
      field: "order_num",
      headerName: t.col_order_num,
      width: 100,
      pinned: "left" as const,
      editable: (params) => params.data?.item_id === null,
      cellRenderer: OrderNumRenderer,
      cellStyle: { textAlign: "center" },
    },
    {
      field: "date",
      headerName: t.col_date,
      width: 100,
      pinned: "left" as const,
      editable: true,
      cellEditor: "agDateStringCellEditor",
      cellStyle: { textAlign: "center" },
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string>) => {
        if (!value) return "—";
        const [y, m, d] = value.split("-");
        return `${y.slice(2)}/${m}/${d}`;
      },
    },
    // ── 상품 정보 ─────────────────────────────────────────────────────────
    {
      field: "product_name",
      headerName: t.col_product_name,
      width: 400,
      pinned: "left" as const,
      editable: true,
      cellEditor: "agTextCellEditor",
    },
    {
      field: "product_option",
      headerName: t.col_option,
      width: 180,
      editable: true,
      cellEditor: "agTextCellEditor",
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 진행 ────────────────────────────────────────────────────────────
    {
      field: "item_progress",
      headerName: t.col_progress,
      width: 135,
      editable: true,
      cellRenderer: ProgressCellRenderer,
      ...selectOpts(ORDER_PROGRESS),
    },
    // ── 단품/세트 ─────────────────────────────────────────────────────────
    {
      field: "product_set_type",
      headerName: t.col_set_type,
      width: 90,
      editable: true,
      ...selectOpts(SET_TYPES),
      cellStyle: (params) =>
        params.value === "SET" ? { backgroundColor: "#fee2e2" } : null,
    },
    // ── 선물 ─────────────────────────────────────────────────────────────
    {
      field: "item_gift",
      headerName: t.col_gift,
      width: 70,
      editable: true,
      ...selectOpts(["no", "ask"] as const),
      cellStyle: (params) =>
        params.value === "ask" ? { backgroundColor: "#fee2e2" } : null,
    },
    // ── 사진 ─────────────────────────────────────────────────────────────
    {
      field: "item_photo_sent",
      headerName: t.col_photo,
      width: 95,
      editable: true,
      ...selectOpts(PHOTO_STATUS),
    },
    // ── 플랫폼 ───────────────────────────────────────────────────────────
    {
      field: "platform",
      headerName: t.col_platform,
      width: 90,
      editable: true,
      ...selectOpts(PLATFORMS),
    },
    // ── 경로 ─────────────────────────────────────────────────────────────
    {
      field: "order_type",
      headerName: t.col_route,
      width: 85,
      editable: true,
      ...selectOpts(ORDER_ROUTES),
    },
    // ── 고객명 ───────────────────────────────────────────────────────────
    {
      field: "customer_name",
      headerName: t.col_customer,
      width: 130,
      editable: true,
      cellEditor: "agTextCellEditor",
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 거래처 ───────────────────────────────────────────────────────────
    {
      field: "purchase_channel",
      headerName: t.col_channel,
      width: 80,
      editable: true,
      cellEditor: "agTextCellEditor",
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 카테고리 ─────────────────────────────────────────────────────────
    {
      field: "product_type",
      headerName: t.col_category,
      width: 105,
      editable: true,
      ...selectOpts(["", ...PRODUCT_CATEGORIES] as const),
      valueFormatter: ({ value }: ValueFormatterParams<OrderGridRow, string | null>) =>
        value ?? "—",
    },
    // ── 수량 ─────────────────────────────────────────────────────────────
    {
      field: "quantity",
      headerName: t.col_quantity,
      width: 60,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 1, precision: 0 },
    },
    // ── 판매가₽ ───────────────────────────────────────────────────────────
    {
      field: "price_rub",
      headerName: t.col_price_rub,
      width: 90,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0 },
      valueFormatter: rubFormatter,
    },
    // ── 원화매입₩ ─────────────────────────────────────────────────────────
    {
      field: "krw",
      headerName: t.col_krw,
      width: 90,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0 },
      valueFormatter: krwFormatter,
    },
    // ── 선결제₽ ───────────────────────────────────────────────────────────
    {
      field: "prepayment_rub",
      headerName: t.col_prepay_rub,
      width: 90,
      editable: true,
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0 },
      valueFormatter: rubFormatter,
    },
    // ── 잔금₽ (computed, 읽기 전용) ───────────────────────────────────────
    {
      field: "extra_payment_rub",
      headerName: t.col_balance_rub,
      width: 90,
      editable: false,
      valueFormatter: rubFormatter,
      cellStyle: (params) =>
        Number(params.value) > 0 ? { backgroundColor: "#fee2e2" } : null,
    },
    // ── 배송비₩ (읽기 전용) ───────────────────────────────────────────────
    {
      field: "shipping_fee",
      headerName: t.col_shipping_fee,
      width: 90,
      editable: false,
      valueFormatter: krwFormatter,
    },
    // ── 적용무게 (읽기 전용) ──────────────────────────────────────────────
    {
      field: "applied_weight",
      headerName: t.col_weight,
      width: 80,
      editable: false,
      valueFormatter: kgFormatter,
    },
    // ── 운송장 (읽기 전용) ────────────────────────────────────────────────
    {
      field: "tracking_number",
      headerName: t.col_tracking,
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

// ── Undo/Redo 스택 엔트리 타입 ──────────────────────────────────────────────
type UndoEntry = {
  field: keyof OrderGridRow;
  row: OrderGridRow;
  oldValue: string | number | null;
  newValue: string | number | null;
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
  const [isMobile, setIsMobile]         = useState(false);
  const [focusedCell, setFocusedCell]   = useState<FocusedCell | null>(null);
  const [draftErrors, setDraftErrors]   = useState<ReadonlySet<string>>(new Set<string>());
  const [drawerOrderNum, setDrawerOrderNum] = useState<string | null>(null);
  const [drawerOrder, setDrawerOrder]       = useState<OrderRow | null>(null);
  const [drawerItems, setDrawerItems]       = useState<OrderItemRow[]>([]);
  const [drawerLoading, setDrawerLoading]   = useState(false);
  const gridRef                         = useRef<AgGridReact<OrderGridRow>>(null);
  const savingDrafts                    = useRef<Set<string>>(new Set());
  const lastScrollY                     = useRef<number>(0);
  const t                               = useT();

  const [statsVisible, setStatsVisible] = useState(true);

  // ── Undo / Redo 스택 ────────────────────────────────────────────────────
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  // ── 셀 클립보드 ─────────────────────────────────────────────────────────
  type ClipboardEntry = { field: keyof OrderGridRow; value: string | number | null };
  const clipboardRef = useRef<ClipboardEntry | null>(null);

  const colDefs = useMemo(() => buildColDefs(t), [t]);

  const defaultColDef = useMemo<ColDef<OrderGridRow>>(
    () => ({ resizable: true, sortable: false, minWidth: 60, headerClass: "ag-header-cell-center" }),
    [],
  );

  // ── isMobile 감지 (resize debounce 200ms) ───────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    let tid: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(tid); tid = setTimeout(check, 200); };
    window.addEventListener("resize", debounced);
    return () => { window.removeEventListener("resize", debounced); clearTimeout(tid); };
  }, []);

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

  // ── initialOrders 변경 시 rowData 동기화 (draft 행 보존) ─────────────────
  useEffect(() => {
    const real = flattenOrders(initialOrders)
      .filter((r) => r.item !== null)
      .map(toGridRow);
    setAllRows((prev) => {
      const drafts = prev.filter((r) => r.item_id === null);
      return [...real, ...drafts];
    });
  }, [initialOrders]);

  // ── 필터링된 rowData (draft 행 항상 최하단) ───────────────────────────────
  const rowData = useMemo<OrderGridRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasFilter = q !== "" || Object.values(filters).some(Boolean);

    // draft 행(item_id===null)과 실제 행 분리
    const drafts: OrderGridRow[] = [];
    const real: OrderGridRow[]   = [];
    for (const row of allRows) {
      if (row.item_id === null) drafts.push(row);
      else real.push(row);
    }

    // 날짜 오름차순 → 주문번호 오름차순
    const sorted = [...real].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      if (dA !== dB) return dA - dB;
      return a.order_num.localeCompare(b.order_num);
    });

    const filtered = sorted.filter((row) => {
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

    // draft 행은 항상 맨 아래 (필터/정렬 무관)
    return [...filtered, ...drafts];
  }, [allRows, searchQuery, filters]);

  // ── Supabase 클라이언트 (싱글턴) ────────────────────────────────────────
  const supabase = useMemo(() => createClient(), []);

  // ── 공통 저장 로직 (데스크탑·모바일 공유) ───────────────────────────────
  const saveFieldChange = useCallback(
    async (
      field: keyof OrderGridRow,
      row: OrderGridRow,
      oldValue: string | number | null,
      newValue: string | number | null,
      revertFn: () => void,
      pushMode: "normal" | "undo" | "redo" = "normal",
    ) => {
      const oldVal = String(oldValue ?? "");
      const newVal = String(newValue ?? "");
      if (oldVal === newVal) return;

      try {
        if (ORDER_FIELDS.has(field)) {
          const dbCol = ORDER_DB_COL[field] ?? (field as string);
          const { error } = await supabase
            .from("orders")
            .update({ [dbCol]: newVal || null })
            .eq("order_num", row.order_num);
          if (error) throw new Error(error.message);

          setAllRows((prev) =>
            prev.map((r) =>
              r.order_num === row.order_num
                ? ({ ...r, [field]: newVal || null } as OrderGridRow)
                : r,
            ),
          );
        } else if (row.item_id) {
          const dbCol = ITEM_DB_COL[field] ?? (field as string);
          const basePayload: Record<string, string | number | null> = {
            [dbCol]: newVal || null,
          };

          if (field === "price_rub" || field === "prepayment_rub") {
            const newNum = Number(newVal);
            const price  = field === "price_rub"      ? newNum : row.price_rub;
            const prepay = field === "prepayment_rub"  ? newNum : row.prepayment_rub;
            basePayload["extra_payment_rub"] = price - prepay;
          }
          if (["quantity", "price_rub", "prepayment_rub", "krw"].includes(field as string)) {
            basePayload[dbCol] = newVal === "" ? null : Number(newVal);
          }

          const { error } = await supabase
            .from("order_items")
            .update(basePayload)
            .eq("id", row.item_id)
            .eq("order_num", row.order_num);
          if (error) throw new Error(error.message);

          if (field === "item_progress" && newVal) {
            await supabase
              .from("orders")
              .update({ progress: newVal as OrderProgress })
              .eq("order_num", row.order_num);
          }

          setAllRows((prev) =>
            prev.map((r) => {
              if (r.item_id !== row.item_id) return r;
              const updated = { ...r, [field]: newValue } as OrderGridRow;
              if ("extra_payment_rub" in basePayload) {
                updated.extra_payment_rub = basePayload["extra_payment_rub"] as number;
              }
              return updated;
            }),
          );
        }

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

        if (pushMode === "normal") {
          undoStack.current.push({ field, row, oldValue, newValue });
          redoStack.current = [];
          if (undoStack.current.length > 50) undoStack.current.shift();
        } else if (pushMode === "undo") {
          // undo 완료 → redo 스택에 원래 방향(A→B)으로 push
          redoStack.current.push({ field, row, oldValue: newValue, newValue: oldValue });
          if (redoStack.current.length > 50) redoStack.current.shift();
        } else if (pushMode === "redo") {
          // redo 완료 → undo 스택에 다시 push
          undoStack.current.push({ field, row, oldValue, newValue });
          if (undoStack.current.length > 50) undoStack.current.shift();
        }

        setToastType("success");
        setToast(t.toast_saved);
      } catch (err) {
        revertFn();
        setToastType("error");
        setToast(err instanceof Error ? err.message : t.toast_save_fail);
      }
    },
    [supabase, t],
  );

  // ── Undo / Redo 실행 함수 (버튼 + 키보드 공유) ──────────────────────────
  const handleUndo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    void saveFieldChange(entry.field, entry.row, entry.newValue, entry.oldValue, () => {
      undoStack.current.push(entry);
    }, "undo");
  }, [saveFieldChange]);

  const handleRedo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    void saveFieldChange(entry.field, entry.row, entry.oldValue, entry.newValue, () => {
      redoStack.current.push(entry);
    }, "redo");
  }, [saveFieldChange]);

  // ── Ctrl+Z / Ctrl+Y 키 바인딩 ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "z") { e.preventDefault(); handleUndo(); }
      else if (e.key === "y") { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  // ── 데이터 새로고침 (배송 import / draft 저장 후 호출, draft 행 보존) ──────
  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select(`*, order_items (id, product_type, product_name, product_option, product_set_type, quantity, price_rub, prepayment_rub, extra_payment_rub, krw, progress, gift, photo_sent)`)
      .order("date", { ascending: true })
      .order("order_num", { ascending: true });
    if (data) {
      const real = flattenOrders(data as OrderWithNestedItems[])
        .filter((r) => r.item !== null)
        .map(toGridRow);
      setAllRows((prev) => {
        const drafts = prev.filter((r) => r.item_id === null);
        return [...real, ...drafts];
      });
    }
  }, [supabase]);

  // ── 주문 상세 드로어 열기 ─────────────────────────────────────────────────
  const openDrawer = useCallback(async (orderNum: string) => {
    setDrawerOrderNum(orderNum);
    setDrawerOrder(null);
    setDrawerItems([]);
    setDrawerLoading(true);
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("order_num", orderNum).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_num", orderNum).order("id", { ascending: true }),
    ]);
    setDrawerLoading(false);
    if (orderRes.data) setDrawerOrder(orderRes.data as OrderRow);
    if (itemsRes.data) setDrawerItems(itemsRes.data as OrderItemRow[]);
  }, [supabase]);

  const closeDrawer = useCallback(() => {
    setDrawerOrderNum(null);
    setDrawerOrder(null);
    setDrawerItems([]);
  }, []);

  const handleDrawerSave = useCallback(() => {
    closeDrawer();
    void fetchOrders();
  }, [closeDrawer, fetchOrders]);

  const handleDrawerDelete = useCallback(async () => {
    if (!drawerOrderNum) return;
    if (!confirm("이 주문과 연결된 상품 행까지 모두 삭제됩니다. 계속할까요?")) return;
    await supabase.from("orders").delete().eq("order_num", drawerOrderNum);
    closeDrawer();
    void fetchOrders();
  }, [drawerOrderNum, supabase, closeDrawer, fetchOrders]);

  // ── draft 행 추가 ────────────────────────────────────────────────────────
  const addDraftRow = useCallback(() => {
    const draft: OrderGridRow = {
      rowKey:           `__draft_${Date.now()}`,
      groupColorIndex:  0,
      order_num:        "",
      date:             new Date().toISOString().split("T")[0],
      platform:         "avito",
      order_type:       "KOREA",
      customer_name:    null,
      order_gift:       "no",
      order_photo_sent: "Not sent",
      purchase_channel: null,
      item_id:          null,
      product_type:     null,
      product_name:     "",
      product_option:   null,
      product_set_type: "Single",
      quantity:         1,
      price_rub:        0,
      prepayment_rub:   0,
      extra_payment_rub: 0,
      krw:              null,
      item_progress:    "PAY",
      item_gift:        "no",
      item_photo_sent:  "Not sent",
      shipping_fee:     null,
      applied_weight:   null,
      tracking_number:  null,
    };
    setAllRows((prev) => [...prev, draft]);
    setTimeout(() => {
      const api = gridRef.current?.api;
      if (!api) return;
      api.ensureIndexVisible(api.getDisplayedRowCount() - 1, "bottom");
    }, 50);
  }, []);

  // ── draft 행 셀 변경 처리 (INSERT 경로) ─────────────────────────────────
  const handleDraftCellChange = useCallback(
    async (
      field: keyof OrderGridRow,
      row: OrderGridRow,
      newValue: string | number | null,
    ) => {
      const updated: OrderGridRow = { ...row, [field]: newValue };

      if (field === "order_num") {
        const prefix  = String(newValue ?? "").substring(0, 2);
        const derived = PREFIX_TO_PLATFORM[prefix];
        if (derived) updated.platform = derived;
      }
      if (field === "product_name") {
        const matches = String(newValue ?? "").match(/\(([^)]+)\)/g);
        if (matches) {
          const last = matches[matches.length - 1];
          updated.product_option = last.slice(1, -1);
        }
      }

      setAllRows((prev) =>
        prev.map((r) => (r.rowKey === row.rowKey ? updated : r)),
      );

      const ready =
        updated.order_num.trim() !== "" &&
        updated.date.trim() !== "" &&
        updated.product_name.trim() !== "";

      if (!ready) {
        // 미완성 상태에선 에러 표시 없이 조용히 대기
        return;
      }

      // 이미 저장 중인 행이면 중복 INSERT 차단 (race condition 방지)
      if (savingDrafts.current.has(row.rowKey)) return;
      savingDrafts.current.add(row.rowKey);

      const result: InsertDraftOrderResult = await insertDraftOrderAction({
        order_num:     updated.order_num.trim(),
        platform:      updated.platform,
        order_type:    updated.order_type,
        date:          updated.date.trim(),
        customer_name: updated.customer_name ?? "",
        gift:          updated.order_gift,
        lines: [{
          product_type:     updated.product_type ?? "",
          product_name:     updated.product_name.trim(),
          product_option:   updated.product_option ?? "",
          product_set_type: updated.product_set_type,
          quantity:         updated.quantity || 1,
          price_rub:        updated.price_rub || 0,
          prepayment_rub:   updated.prepayment_rub || 0,
        }],
      });

      if ("error" in result) {
        savingDrafts.current.delete(row.rowKey);
        setDraftErrors((prev) => new Set<string>([...prev, row.rowKey]));
        setToastType("error");
        setToast(result.error);
        return;
      }

      setDraftErrors((prev) => {
        const s = new Set<string>(prev);
        s.delete(row.rowKey);
        return s;
      });
      // 저장 완료된 draft 행 제거 + FormulaBar 초기화 (stale rowData 차단)
      setAllRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey));
      setFocusedCell(null);
      setToastType("success");
      setToast(t.toast_order_saved);
      await fetchOrders();
      // fetchOrders 완료 후 잠금 해제 (그 전까지 중복 INSERT 차단)
      savingDrafts.current.delete(row.rowKey);
    },
    [fetchOrders, t],
  );

  // ── AG Grid onCellValueChanged 래퍼 ────────────────────────────────────
  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<OrderGridRow>) => {
      const fieldRaw = event.colDef.field;
      if (!fieldRaw) return;
      const field = fieldRaw as keyof OrderGridRow;

      // draft 행(item_id===null): INSERT 경로
      if (event.data.item_id === null) {
        void handleDraftCellChange(field, event.data, event.newValue as string | number | null);
        return;
      }

      // 실제 행: 기존 UPDATE 경로
      void saveFieldChange(
        field,
        event.data,
        event.oldValue as string | number | null,
        event.newValue as string | number | null,
        () => event.node.setDataValue(field as string, event.oldValue),
      );
    },
    [saveFieldChange, handleDraftCellChange],
  );

  // ── FormulaBar 저장 래퍼 (draft / 실제 행 분기) ─────────────────────────
  const handleFormulaSave = useCallback(
    (
      field: keyof OrderGridRow,
      rowData: OrderGridRow,
      newValue: string | number | null,
    ) => {
      if (rowData.item_id === null) {
        void handleDraftCellChange(field, rowData, newValue);
      } else {
        void saveFieldChange(
          field,
          rowData,
          rowData[field] as string | number | null,
          newValue,
          () => {},
        );
      }
      setFocusedCell(null);
    },
    [saveFieldChange, handleDraftCellChange],
  );

  // ── 셀 Ctrl+C / Ctrl+V ──────────────────────────────────────────────────
  const handleCellKeyDown = useCallback(
    (params: CellKeyDownEvent<OrderGridRow>) => {
      const e = params.event;
      if (!(e instanceof KeyboardEvent)) return;
      if (!e.ctrlKey && !e.metaKey) return;

      const field = params.column.getColId() as keyof OrderGridRow;
      const rowData = params.data;
      if (!rowData) return;

      if (e.key === "c") {
        const raw = params.value;
        const value = raw === null || raw === undefined
          ? null
          : (typeof raw === "number" ? raw : String(raw));
        clipboardRef.current = { field, value };
        setToastType("success");
        setToast("복사됨");
        // AG Grid 기본 시스템 클립보드 복사도 함께 동작 (preventDefault 안 함)
      } else if (e.key === "v") {
        const clip = clipboardRef.current;
        if (!clip) return;
        if (clip.field !== field) return;
        e.preventDefault();
        handleFormulaSave(field, rowData, clip.value);
      }
    },
    [handleFormulaSave, setToast, setToastType],
  );

  // ── 모바일 스크롤 시 헤더 자동 숨김/표시 (touch events) ────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    lastScrollY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile) return;
      const y = e.touches[0].clientY;
      const dy = lastScrollY.current - y; // 양수 = 아래로 스크롤
      if (Math.abs(dy) < 5) return;
      setStatsVisible(dy < 0); // 위로 스크롤이면 통계 표시
      lastScrollY.current = y;
    },
    [isMobile],
  );

  // ── 셀 포커스 → FormulaBar 업데이트 ─────────────────────────────────────
  const handleCellFocused = useCallback(
    (event: CellFocusedEvent) => {
      // rowIndex === null = 그리드 외부 클릭(FormulaBar 포함) → 유지
      if (event.rowIndex === null || event.rowIndex === undefined) return;
      const col = event.column;
      if (!col || typeof col === "string") {
        setFocusedCell(null);
        return;
      }
      const api = gridRef.current?.api;
      if (!api) return;

      const colId  = col.getColId();
      const colDef = api.getColumnDef(colId);
      const node   = api.getDisplayedRowAtIndex(event.rowIndex);

      const rawEditable = colDef?.editable;
      const isEditable =
        rawEditable === true ||
        (typeof rawEditable === "function" && node?.data?.item_id === null);
      if (!colDef || !isEditable || !node?.data) {
        setFocusedCell(null);
        return;
      }

      const field = colId as keyof OrderGridRow;
      setFocusedCell({
        field,
        fieldLabel: colDef.headerName ?? colId,
        currentValue: node.data[field] as string | number | null,
        rowData: node.data,
      });
    },
    [],
  );

  // ── row 스타일 (draft 행 색상 + 기존 groupColorIndex) ────────────────────
  const getRowStyle = useCallback(
    (params: RowClassParams<OrderGridRow>): RowStyle | undefined => {
      if (params.data?.item_id === null) {
        if (draftErrors.has(params.data.rowKey)) {
          return { backgroundColor: "#fee2e2", borderLeft: "3px solid #ef4444" };
        }
        return { backgroundColor: "#f0fdf4" }; // 연두색: 입력 대기
      }
      const idx = (params.data?.groupColorIndex ?? 0) % ROW_BG_COLORS.length;
      return { backgroundColor: ROW_BG_COLORS[idx] + "33" };
    },
    [draftErrors],
  );

  // ── row ID ────────────────────────────────────────────────────────────────
  const getRowId = useCallback(
    (params: GetRowIdParams<OrderGridRow>) => params.data.rowKey,
    [],
  );

  // ── 통계 카드 데이터 (draft 행 제외, 실제 DB 행만) ───────────────────────
  const stats = useMemo(() => {
    const realRows = allRows.filter((r) => r.item_id !== null);
    const activeOrderNums = new Set(
      realRows.filter((r) => TOP_GROUP.has(r.item_progress ?? "")).map((r) => r.order_num),
    );
    return {
      activeOrders: activeOrderNums.size,
      totalLines:   realRows.length,
      inDelivery:   realRows.filter((r) => r.item_progress === "IN DELIVERY").length,
      withBalance:  realRows.filter((r) => r.extra_payment_rub > 0).length,
    };
  }, [allRows]);

  const hasActiveFilter = Object.values(filters).some(Boolean);
  const orderCount = new Set(rowData.filter((r) => r.item_id !== null).map((r) => r.order_num)).size;

  return (
    <>
      {/* ── 주문 상세 드로어 ──────────────────────────────────────────────── */}
      {drawerOrderNum && (
        <div className="fixed inset-0 z-[150] flex justify-end">
          {/* 배경 오버레이 */}
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="닫기"
            onClick={closeDrawer}
          />
          {/* 드로어 패널 */}
          <div className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-zinc-900">
            {/* 헤더 */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                주문 {drawerOrderNum}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDrawerDelete}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  주문 삭제
                </button>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                  aria-label="닫기"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            {/* 콘텐츠 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {drawerLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
                  불러오는 중…
                </div>
              ) : drawerOrder ? (
                <OrderEditForm
                  order={drawerOrder}
                  items={drawerItems}
                  onSaveSuccess={handleDrawerSave}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-red-500">
                  주문을 불러오지 못했습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
            aria-label={t.btn_close}
            onClick={() => setHistoryOpen(false)}
          />
          <div className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.btn_history}</p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setHistoryOpen(false)}
              >
                {t.btn_close}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {history.length === 0 ? (
                <p className="text-sm text-zinc-500">{t.state_empty_history}</p>
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
        {t.btn_history}{history.length > 0 ? ` (${history.length})` : ""}
      </button>

      {/* ── 통계 카드 + 필터바 (crm-subheader-portal로 portal) ──────────── */}
      {portalEl &&
        createPortal(
          <>
            {/* 통계 카드 — 모바일 스크롤 시 접힘 */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: statsVisible ? "1fr" : "0fr",
                transition: "grid-template-rows 0.3s ease",
              }}
            >
              <div style={{ overflow: "hidden" }}>
                <div className="flex gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
                  <StatCard label={t.stat_active_orders} value={stats.activeOrders} color="bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" />
                  <StatCard label={t.stat_total_lines}   value={stats.totalLines}   color="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />
                  <StatCard label={t.stat_in_delivery}   value={stats.inDelivery}   color="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" />
                  <StatCard label={t.stat_with_balance}  value={stats.withBalance}  color="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" />
                </div>
              </div>
            </div>

            {/* 필터바 — 항상 노출 */}
            <div className="w-full border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center gap-2">
                <FilterDropdown
                  label={t.filter_progress}
                  field="progress"
                  value={filters.progress}
                  options={[
                    { label: t.filter_all, value: "" },
                    ...ORDER_PROGRESS.map((p) => ({ label: p, value: p })),
                  ]}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                  onChange={(v) => setFilters((f) => ({ ...f, progress: v }))}
                />
                <FilterDropdown
                  label={t.filter_platform}
                  field="platform"
                  value={filters.platform}
                  options={[
                    { label: t.filter_all, value: "" },
                    ...PLATFORMS.map((p) => ({ label: p, value: p })),
                  ]}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                  onChange={(v) => setFilters((f) => ({ ...f, platform: v }))}
                />
                <FilterDropdown
                  label={t.filter_set_type}
                  field="setType"
                  value={filters.setType}
                  options={[
                    { label: t.filter_all, value: "" },
                    { label: "Single", value: "Single" },
                    { label: "SET", value: "SET" },
                  ]}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                  onChange={(v) => setFilters((f) => ({ ...f, setType: v }))}
                />
                <FilterDropdown
                  label={t.filter_gift}
                  field="gift"
                  value={filters.gift}
                  options={[
                    { label: t.filter_all, value: "" },
                    { label: "no", value: "no" },
                    { label: "ask", value: "ask" },
                  ]}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                  onChange={(v) => setFilters((f) => ({ ...f, gift: v }))}
                />
                <FilterDropdown
                  label={t.filter_photo}
                  field="photoSent"
                  value={filters.photoSent}
                  options={[
                    { label: t.filter_all, value: "" },
                    ...PHOTO_STATUS.map((s) => ({ label: s, value: s })),
                  ]}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                  onChange={(v) => setFilters((f) => ({ ...f, photoSent: v }))}
                />
                <FilterDropdown
                  label={t.filter_balance}
                  field="hasBalance"
                  value={filters.hasBalance}
                  options={[
                    { label: t.filter_all, value: "" },
                    { label: t.filter_has_balance, value: "yes" },
                    { label: t.filter_no_balance, value: "no" },
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
                    {t.filter_reset}
                  </button>
                )}
                <DeliveryImportButton onImportDone={fetchOrders} />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="되돌리기 (Ctrl+Z)"
                    onClick={handleUndo}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    ↩
                  </button>
                  <button
                    type="button"
                    title="다시 실행 (Ctrl+Y)"
                    onClick={handleRedo}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    ↪
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={t.orders_search_placeholder}
                  className="ml-auto rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  style={{ minWidth: "220px" }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t.orders_counter
                  .replace("{orders}", String(orderCount))
                  .replace("{lines}", String(rowData.length))}
              </p>
            </div>
          </>,
          portalEl,
        )}

      {/* ── FormulaBar + AG Grid (flex column) ──────────────────────────── */}
      <div className="flex h-full flex-col">
        {!isMobile && (
          <FormulaBar
            cell={focusedCell}
            isMobile={false}
            onSave={handleFormulaSave}
            onCancel={() => setFocusedCell(null)}
          />
        )}
        <div
          className="min-h-0 flex-1"
          style={{ height: "100%", width: "100%" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          <AgGridReact<OrderGridRow>
            ref={gridRef}
            theme={fankoTheme}
            rowData={rowData}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            getRowStyle={getRowStyle}
            onCellValueChanged={handleCellValueChanged}
            onCellFocused={handleCellFocused}
            onCellKeyDown={handleCellKeyDown}
            context={{ onOrderClick: openDrawer } satisfies GridContext}
            suppressClickEdit={false}
            undoRedoCellEditing={true}
            undoRedoCellEditingLimit={30}
            enableCellTextSelection={true}
            stopEditingWhenCellsLoseFocus={true}
            suppressMovableColumns={false}
            rowBuffer={20}
          />
        </div>

        {/* ── + 행 추가 버튼 ────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={addDraftRow}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-400"
          >
            <span className="text-base font-bold leading-none">+</span>
            {t.btn_add_row}
          </button>
        </div>
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
