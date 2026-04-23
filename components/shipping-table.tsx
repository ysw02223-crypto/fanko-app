"use client";

import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type CellStyle,
  type ValueFormatterParams,
  type ICellRendererParams,
  type CellValueChangedEvent,
  type CellFocusedEvent,
  type GetRowIdParams,
  type RowClassParams,
  type RowStyle,
} from "ag-grid-community";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toggleDownloadedAction } from "@/lib/actions/shipping";
import type { OrderForShipping } from "@/lib/actions/shipping";
import { useT } from "@/lib/i18n";
import { RecipientInfoUploadButton } from "@/components/recipient-info-upload-button";

// ── AG Grid 모듈 등록 ─────────────────────────────────────────────────────
ModuleRegistry.registerModules([AllCommunityModule]);

// ── 타입 ──────────────────────────────────────────────────────────────────

type ShippingEditableField =
  | "recipient_name"
  | "recipient_phone"
  | "recipient_email"
  | "zip_code"
  | "region"
  | "city"
  | "address"
  | "customs_number";

type ShippingGridRow = {
  order_num: string;
  date: string;
  progress: string | null;
  product_names: string;
  downloaded: boolean;
  recipient_name: string;
  recipient_phone: string;
  recipient_email: string;
  zip_code: string;
  region: string;
  city: string;
  address: string;
  customs_number: string;
};

type HistoryEntry = {
  id: string;
  at: number;
  orderNum: string;
  field: ShippingEditableField;
  columnLabel: string;
  oldDisplay: string;
  newDisplay: string;
  revert: () => Promise<void>;
};

type ShippingFocusedCell = {
  orderNum: string;
  field: ShippingEditableField;
  label: string;
  currentValue: string;
};

type GridContext = {
  onDownloadToggle: (orderNum: string, checked: boolean) => void;
};

// ── 상수 ──────────────────────────────────────────────────────────────────

const SHIPPING_EDITABLE_FIELDS: ShippingEditableField[] = [
  "recipient_name",
  "recipient_phone",
  "recipient_email",
  "zip_code",
  "region",
  "city",
  "address",
  "customs_number",
];

const SHIPPING_SELECT =
  "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number, downloaded";

// ── 테마 ──────────────────────────────────────────────────────────────────

const fankoTheme = themeQuartz.withParams({
  accentColor: "#059669",
  rowHeight: 36,
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

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

function isComplete(row: ShippingGridRow): boolean {
  return SHIPPING_EDITABLE_FIELDS.every((f) => !!row[f]?.trim());
}

function hasAnyData(row: ShippingGridRow): boolean {
  return SHIPPING_EDITABLE_FIELDS.some((f) => !!row[f]?.trim());
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return dateStr;
}

function displayVal(val: string | null): string {
  return val?.trim() ? val.trim() : "—";
}

function toShippingGridRow(order: OrderForShipping): ShippingGridRow {
  return {
    order_num: order.order_num,
    date: order.date,
    progress: order.progress,
    product_names: order.product_names,
    downloaded: order.shipping?.downloaded ?? false,
    recipient_name: order.shipping?.recipient_name ?? "",
    recipient_phone: order.shipping?.recipient_phone ?? "",
    recipient_email: order.shipping?.recipient_email ?? "",
    zip_code: order.shipping?.zip_code ?? "",
    region: order.shipping?.region ?? "",
    city: order.shipping?.city ?? "",
    address: order.shipping?.address ?? "",
    customs_number: order.shipping?.customs_number ?? "",
  };
}

async function fetchAllShippingOrders(): Promise<OrderForShipping[]> {
  const supabase = createClient();
  const [ordersRes, itemsRes, shippingRes] = await Promise.all([
    supabase
      .from("orders")
      .select("order_num, date, progress")
      .order("date", { ascending: true })
      .order("order_num", { ascending: true }),
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
    progress: o.progress ?? null,
    product_names: (itemsByOrder.get(o.order_num) ?? []).join("\n"),
    shipping: shippingByOrder.get(o.order_num) ?? null,
  }));
}

// ── 셀 렌더러: 다운로드 체크박스 ─────────────────────────────────────────

function DownloadedRenderer(
  params: ICellRendererParams<ShippingGridRow, boolean>,
) {
  const ctx = params.context as GridContext;
  const row = params.data;
  if (!row) return null;
  return (
    <div className="flex h-full items-center justify-center">
      <input
        type="checkbox"
        checked={row.progress === "IN DELIVERY"}
        disabled={row.progress === "DONE"}
        onChange={(e) => ctx.onDownloadToggle(row.order_num, e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

// ── 셀 렌더러: 상품명 ─────────────────────────────────────────────────────

function ProductNamesRenderer(
  params: ICellRendererParams<ShippingGridRow, string>,
) {
  const value = params.value;
  if (!value) return <span className="text-zinc-400">—</span>;
  const names = value.split("\n");
  return (
    <div className="flex flex-col justify-center gap-0.5 py-1">
      {names.map((name, i) => (
        <span
          key={i}
          className="truncate text-xs leading-tight text-zinc-600 dark:text-zinc-400"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

// ── 통계 카드 ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className={`flex min-w-[80px] flex-col gap-0.5 rounded-lg px-3 py-2 ${color}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
        {label}
      </span>
      <span className="text-xl font-bold leading-tight">{value}</span>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export type ShippingTableProps = {
  initialOrders: OrderForShipping[];
};

export function ShippingTable({ initialOrders }: ShippingTableProps) {
  const t = useT();

  const FIELD_LABELS = useMemo<Record<ShippingEditableField, string>>(
    () => ({
      recipient_name: t.ship_col_recipient,
      recipient_phone: t.ship_col_phone,
      recipient_email: t.ship_col_email,
      zip_code: t.ship_col_zip,
      region: t.ship_col_region,
      city: t.ship_col_city,
      address: t.ship_col_address,
      customs_number: t.ship_col_customs,
    }),
    [t],
  );

  const [rows, setRows] = useState<ShippingGridRow[]>(() =>
    initialOrders.map(toShippingGridRow),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"error" | "success">("error");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "done" | "todo" | "order_done">("");
  const [openFilter, setOpenFilter] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [focusedCell, setFocusedCell] = useState<ShippingFocusedCell | null>(null);
  const [formulaDraft, setFormulaDraft] = useState("");
  const [formulaDirty, setFormulaDirty] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const gridRef = useRef<AgGridReact<ShippingGridRow>>(null);
  const savingRef = useRef(false);
  const togglingRef = useRef<Set<string>>(new Set());

  // ── 초기화 ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setPortalEl(document.getElementById("crm-subheader-portal"));
  }, []);

  useEffect(() => {
    setRows(initialOrders.map(toShippingGridRow));
  }, [initialOrders]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
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

  // ── 재로드 ───────────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    try {
      const fresh = await fetchAllShippingOrders();
      setRows(fresh.map(toShippingGridRow));
    } catch {
      setToastType("error");
      setToast("목록 새로고침 실패");
    }
  }, []);

  // ── 저장 ─────────────────────────────────────────────────────────────────

  const saveField = useCallback(
    async (
      rowData: ShippingGridRow,
      field: ShippingEditableField,
      newRaw: string,
      oldRaw: string,
    ): Promise<void> => {
      if (newRaw === oldRaw) return;
      if (savingRef.current) return;

      const newVal = newRaw.trim() === "" ? null : newRaw.trim();
      const oldVal = oldRaw.trim() === "" ? null : oldRaw.trim();

      const payload = {
        order_num: rowData.order_num,
        recipient_name: rowData.recipient_name || null,
        recipient_phone: rowData.recipient_phone || null,
        recipient_email: rowData.recipient_email || null,
        zip_code: rowData.zip_code || null,
        region: rowData.region || null,
        city: rowData.city || null,
        address: rowData.address || null,
        customs_number: rowData.customs_number || null,
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
          setToastType("error");
          setToast(error.message);
          return;
        }

        await refetch();

        const snapshotRow = { ...rowData };
        const newDisplay = displayVal(newVal);
        const oldDisplay = displayVal(oldVal);
        const columnLabel = FIELD_LABELS[field];

        setHistory((h) => {
          const entry: HistoryEntry = {
            id: crypto.randomUUID(),
            at: Date.now(),
            orderNum: rowData.order_num,
            field,
            columnLabel,
            oldDisplay,
            newDisplay,
            revert: async () => {
              const supa = createClient();
              const revertPayload = {
                order_num: rowData.order_num,
                recipient_name: snapshotRow.recipient_name || null,
                recipient_phone: snapshotRow.recipient_phone || null,
                recipient_email: snapshotRow.recipient_email || null,
                zip_code: snapshotRow.zip_code || null,
                region: snapshotRow.region || null,
                city: snapshotRow.city || null,
                address: snapshotRow.address || null,
                customs_number: snapshotRow.customs_number || null,
                [field]: oldVal,
                updated_at: new Date().toISOString(),
              };
              const { error: revertErr } = await supa
                .from("shipping_info")
                .upsert(revertPayload, { onConflict: "order_num" });
              if (revertErr) {
                setToastType("error");
                setToast(`되돌리기 실패: ${revertErr.message}`);
              } else {
                await refetch();
              }
            },
          };
          if (
            h.length > 0 &&
            h[0].field === field &&
            h[0].orderNum === rowData.order_num &&
            newDisplay === h[0].oldDisplay
          ) {
            return [entry, ...h.slice(1)].slice(0, 30);
          }
          return [entry, ...h].slice(0, 30);
        });
      } finally {
        savingRef.current = false;
      }
    },
    [refetch, FIELD_LABELS],
  );

  // ── onCellValueChanged ────────────────────────────────────────────────────

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<ShippingGridRow>) => {
      const field = event.colDef.field as ShippingEditableField | undefined;
      if (!field || !SHIPPING_EDITABLE_FIELDS.includes(field)) return;
      void saveField(
        event.data,
        field,
        String(event.newValue ?? ""),
        String(event.oldValue ?? ""),
      );
    },
    [saveField],
  );

  // ── onCellFocused → FormulaBar ────────────────────────────────────────────

  const handleCellFocused = useCallback(
    (event: CellFocusedEvent) => {
      if (event.rowIndex === null || event.rowIndex === undefined) return;
      const col = event.column;
      if (!col || typeof col === "string") {
        setFocusedCell(null);
        return;
      }
      const api = gridRef.current?.api;
      if (!api) return;

      const colId = col.getColId() as ShippingEditableField;
      if (!SHIPPING_EDITABLE_FIELDS.includes(colId)) {
        setFocusedCell(null);
        return;
      }

      const node = api.getDisplayedRowAtIndex(event.rowIndex);
      if (!node?.data) {
        setFocusedCell(null);
        return;
      }

      const currentValue = String(node.data[colId] ?? "");
      setFocusedCell({
        orderNum: node.data.order_num,
        field: colId,
        label: FIELD_LABELS[colId],
        currentValue,
      });
      setFormulaDraft(currentValue);
      setFormulaDirty(false);
    },
    [FIELD_LABELS],
  );

  // ── FormulaBar 저장 ───────────────────────────────────────────────────────

  const handleFormulaSave = useCallback(() => {
    if (!focusedCell || !formulaDirty) {
      setFocusedCell(null);
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;
    const rowNode = api.getRowNode(focusedCell.orderNum);
    if (rowNode) {
      rowNode.setDataValue(focusedCell.field, formulaDraft);
    }
    setFocusedCell(null);
  }, [focusedCell, formulaDraft, formulaDirty]);

  // ── 다운로드 토글 ─────────────────────────────────────────────────────────

  const handleDownloadToggle = useCallback(
    async (orderNum: string, checked: boolean) => {
      if (togglingRef.current.has(orderNum)) return;
      togglingRef.current.add(orderNum);
      const newProgress = checked ? "IN DELIVERY" : "PROBLEM";
      setRows((prev) =>
        prev.map((r) =>
          r.order_num === orderNum ? { ...r, progress: newProgress } : r,
        ),
      );
      try {
        const result = await toggleDownloadedAction(orderNum, checked);
        if (result?.error) {
          setToastType("error");
          setToast(result.error);
          setRows((prev) =>
            prev.map((r) =>
              r.order_num === orderNum
                ? { ...r, progress: checked ? "PROBLEM" : "IN DELIVERY" }
                : r,
            ),
          );
        } else {
          if (result?.ok) {
            setToastType("success");
            setToast(result.ok);
          }
          const confirmed = result?.confirmedProgress ?? newProgress;
          setRows((prev) =>
            prev.map((r) =>
              r.order_num === orderNum ? { ...r, progress: confirmed } : r,
            ),
          );
        }
      } finally {
        togglingRef.current.delete(orderNum);
      }
    },
    [],
  );

  // ── 엑셀 다운로드 ─────────────────────────────────────────────────────────

  const handleExcelDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch("/shipping/export");
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setToastType("error");
        setToast(json.error ?? "다운로드 실패");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.split("filename=")[1]?.replace(/"/g, "") ?? "shipping.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      await refetch();
    } catch {
      setToastType("error");
      setToast("다운로드 중 오류가 발생했습니다.");
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, refetch]);

  // ── Ctrl+Z ────────────────────────────────────────────────────────────────

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
  }, [history, undoingId, onHistoryUndo]);

  // ── 필터링된 rowData ──────────────────────────────────────────────────────

  const rowData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q && r.progress === "DONE" && statusFilter !== "order_done") return false;
      if (statusFilter === "done"       && !isComplete(r))              return false;
      if (statusFilter === "todo"       && isComplete(r))               return false;
      if (statusFilter === "order_done" && r.progress !== "DONE")       return false;
      if (q && !r.order_num.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  // ── 통계 ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const done = rows.filter(isComplete).length;
    const todo = rows.filter((r) => !isComplete(r)).length;
    const inDelivery = rows.filter((r) => r.progress === "IN DELIVERY").length;
    return { done, todo, inDelivery, total: rows.length };
  }, [rows]);

  // ── 컬럼 정의 ─────────────────────────────────────────────────────────────

  const colDefs = useMemo<ColDef<ShippingGridRow>[]>(() => {
    const missingStyle =
      (field: ShippingEditableField) =>
      (params: { data?: ShippingGridRow }) => {
        const row = params.data;
        if (!row || !hasAnyData(row)) return null;
        if (!row[field]?.trim())
          return {
            backgroundColor: "#fffbeb",
            borderLeft: "2px solid #f59e0b",
          };
        return null;
      };

    const editableCol = (
      field: ShippingEditableField,
      width: number,
    ): ColDef<ShippingGridRow> => ({
      field,
      headerName: FIELD_LABELS[field],
      width,
      editable: true,
      cellEditor: "agTextCellEditor",
      cellStyle: missingStyle(field),
      valueFormatter: ({ value }: ValueFormatterParams<ShippingGridRow, string>) =>
        value ?? "",
    });

    return [
      {
        headerName: "#",
        width: 44,
        pinned: "left" as const,
        editable: false,
        sortable: false,
        headerClass: "ag-header-cell-center",
        valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
        cellStyle: {
          textAlign: "center",
          color: "#a1a1aa",
          fontSize: "11px",
        } as CellStyle,
      },
      {
        field: "order_num",
        headerName: t.col_order_num,
        width: 100,
        pinned: "left" as const,
        editable: false,
        cellStyle: { fontFamily: "monospace", fontSize: "12px", fontWeight: 600 } as CellStyle,
      },
      {
        field: "date",
        headerName: t.col_date,
        width: 70,
        editable: false,
        valueFormatter: ({ value }: ValueFormatterParams<ShippingGridRow, string>) =>
          formatDate(value ?? ""),
        cellStyle: {
          textAlign: "center",
          color: "#71717a",
          fontSize: "11px",
        } as CellStyle,
      },
      {
        field: "product_names",
        headerName: t.col_product_name,
        width: 500,
        minWidth: 180,
        editable: false,
        autoHeight: true,
        cellRenderer: ProductNamesRenderer,
        tooltipField: "product_names",
      },
      {
        field: "downloaded",
        headerName: t.ship_col_down,
        width: 52,
        editable: false,
        cellRenderer: DownloadedRenderer,
        cellStyle: {
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        },
      },
      editableCol("recipient_name", 160),
      editableCol("recipient_phone", 105),
      editableCol("recipient_email", 185),
      editableCol("zip_code", 85),
      editableCol("region", 120),
      editableCol("city", 120),
      editableCol("address", 200),
      editableCol("customs_number", 110),
    ];
  }, [FIELD_LABELS, t]);

  // ── getRowStyle ───────────────────────────────────────────────────────────

  const getRowStyle = useCallback(
    (params: RowClassParams<ShippingGridRow>): RowStyle | undefined => {
      const row = params.data;
      if (!row) return undefined;
      if (row.downloaded) return { backgroundColor: "#eff6ff" };
      if (isComplete(row)) return { backgroundColor: "#f0fdf4" };
      if (row.progress === "DONE") return { backgroundColor: "#ffffff", opacity: "0.5" };
      return undefined;
    },
    [],
  );

  // ── context / getRowId / defaultColDef ───────────────────────────────────

  const gridContext = useMemo<GridContext>(
    () => ({ onDownloadToggle: handleDownloadToggle }),
    [handleDownloadToggle],
  );

  const getRowId = useCallback(
    (params: GetRowIdParams<ShippingGridRow>) => params.data.order_num,
    [],
  );

  const defaultColDef = useMemo<ColDef<ShippingGridRow>>(
    () => ({ sortable: true, resizable: true, suppressMovable: false }),
    [],
  );

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toast */}
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

      {/* 변경 이력 패널 */}
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
              <p className="mb-2 text-xs text-gray-400">{t.history_panel_hint}</p>
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
                        {t.col_order_num} {e.orderNum} · {e.columnLabel} ·{" "}
                        {e.oldDisplay} → {e.newDisplay}
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

      {/* 이력 버튼 */}
      <button
        type="button"
        className="fixed bottom-20 right-4 z-[90] rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        onClick={() => setHistoryOpen(true)}
      >
        {t.btn_history}
        {history.length > 0 ? ` (${history.length})` : ""}
      </button>

      {/* 통계 카드 + 필터바 → portal */}
      {portalEl &&
        createPortal(
          <>
            {/* 통계 카드 */}
            <div className="flex gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <StatCard
                label={t.ship_stats_done}
                value={stats.done}
                color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              />
              <StatCard
                label={t.ship_stats_todo}
                value={stats.todo}
                color="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              />
              <StatCard
                label="IN DELIVERY"
                value={stats.inDelivery}
                color="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
              />
              <StatCard
                label="전체"
                value={stats.total}
                color="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              />
            </div>

            {/* 필터바 */}
            <div className="w-full border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center gap-2">
                {/* 작성 상태 필터 */}
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
                    {statusFilter === "done"
                      ? ` · ${t.ship_filter_done}`
                      : statusFilter === "todo"
                        ? ` · ${t.ship_filter_todo}`
                        : statusFilter === "order_done"
                          ? ` · ${t.ship_filter_order_done}`
                          : ""}
                    <span className="text-xs opacity-50">▾</span>
                  </button>
                  {openFilter && (
                    <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      {(
                        [
                          { label: t.filter_all,              value: "" },
                          { label: t.ship_filter_done,        value: "done" },
                          { label: t.ship_filter_todo,        value: "todo" },
                          { label: t.ship_filter_order_done,  value: "order_done" },
                        ] as { label: string; value: "" | "done" | "todo" | "order_done" }[]
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

                {statusFilter && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("")}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    {t.ship_filter_reset}
                  </button>
                )}

                {/* 수취인 정보 업로드 */}
                <RecipientInfoUploadButton />

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
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t.ship_stats_shown} {rowData.length}
              </p>
            </div>
          </>,
          portalEl,
        )}

      {/* 제목 + FormulaBar + AG Grid */}
      <div className="flex h-full flex-col">
        <div className="shrink-0 mb-1 flex flex-col gap-1 px-5 pt-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t.page_shipping}</h1>
        </div>

        {/* FormulaBar + AG Grid */}
        <div className="flex flex-1 min-h-0 flex-col">
        {/* FormulaBar */}
        {focusedCell ? (
          <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
            <span className="select-none font-mono text-xs font-bold text-emerald-500">
              fx
            </span>
            <span className="min-w-[80px] shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {focusedCell.label}
            </span>
            <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />
            <input
              type="text"
              value={formulaDraft}
              onChange={(e) => {
                setFormulaDraft(e.target.value);
                setFormulaDirty(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFormulaSave();
                if (e.key === "Escape") setFocusedCell(null);
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setFocusedCell(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={handleFormulaSave}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg transition ${
                formulaDirty
                  ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  : "text-zinc-300 dark:text-zinc-600"
              }`}
            >
              ✓
            </button>
          </div>
        ) : (
          <div className="flex h-11 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-700 dark:bg-zinc-900">
            <span className="select-none font-mono text-xs font-bold text-zinc-400">
              fx
            </span>
            <span className="text-sm text-zinc-400">셀을 선택하세요</span>
          </div>
        )}

        {/* 그리드 */}
        <div className="min-h-0 flex-1" style={{ height: "100%", width: "100%" }}>
          <AgGridReact<ShippingGridRow>
            ref={gridRef}
            theme={fankoTheme}
            rowData={rowData}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            getRowStyle={getRowStyle}
            context={gridContext}
            onCellValueChanged={handleCellValueChanged}
            onCellFocused={handleCellFocused}
            suppressClickEdit={false}
            enableCellTextSelection
            stopEditingWhenCellsLoseFocus
            rowBuffer={20}
          />
        </div>
        </div>
      </div>
    </>
  );
}
