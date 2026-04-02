"use client";

import { createClient } from "@/lib/supabase/client";
import type { OrderRow } from "@/lib/schema";
import { ORDER_PROGRESS, PHOTO_STATUS } from "@/lib/schema";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type OrderItemSnip = {
  product_name: string;
  price_rub: string | number;
  krw: string | number | null;
};

export type OrderListRow = OrderRow & { order_items: OrderItemSnip[] | null };

type EditableField = "progress" | "customer_name" | "gift" | "photo_sent" | "purchase_channel";

type EditTarget = { orderNum: string; field: EditableField } | null;

function aggregateItems(items: OrderItemSnip[] | null | undefined) {
  const list = items ?? [];
  const names = list.map((i) => i.product_name).join(", ");
  const totalRub = list.reduce((s, i) => s + Number(i.price_rub ?? 0), 0);
  let totalKrw = 0;
  let hasKrw = false;
  for (const i of list) {
    if (i.krw != null && i.krw !== "") {
      hasKrw = true;
      totalKrw += Number(i.krw);
    }
  }
  return { names, totalRub, totalKrw: hasKrw ? totalKrw : null };
}

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

const thClass =
  "whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400";
const tdClass = "border-b border-zinc-100 px-3 py-2 align-top text-sm dark:border-zinc-800";
const cellInteractive = "cursor-pointer rounded px-1 py-0.5 transition hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60";
const editingBg = "bg-sky-100 dark:bg-sky-950/40";

export function OrdersSpreadsheetTable({ initialRows }: { initialRows: OrderListRow[] }) {
  const [rows, setRows] = useState<OrderListRow[]>(initialRows);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [draft, setDraft] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      if (editing.field === "customer_name" || editing.field === "purchase_channel") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        selectRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const showError = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const commit = useCallback(
    async (orderNum: string, field: EditableField, raw: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        let payload: Record<string, unknown> = {};
        if (field === "progress") {
          if (!(ORDER_PROGRESS as readonly string[]).includes(raw)) {
            showError("진행 상태 값이 올바르지 않습니다.");
            setEditing(null);
            return;
          }
          payload = { progress: raw };
        } else if (field === "customer_name") {
          payload = { customer_name: raw.trim() === "" ? null : raw.trim() };
        } else if (field === "gift") {
          payload = { gift: raw === "ask" ? "ask" : "no" };
        } else if (field === "photo_sent") {
          if (!(PHOTO_STATUS as readonly string[]).includes(raw)) {
            showError("사진 발송 상태가 올바르지 않습니다.");
            setEditing(null);
            return;
          }
          payload = { photo_sent: raw };
        } else if (field === "purchase_channel") {
          payload = { purchase_channel: raw.trim() === "" ? null : raw.trim() };
        }

        const supabase = createClient();
        const { data, error } = await supabase
          .from("orders")
          .update(payload)
          .eq("order_num", orderNum)
          .select(
            `
          *,
          order_items (
            product_name,
            price_rub,
            krw
          )
        `,
          )
          .single();

        if (error) {
          showError(error.message);
          setEditing(null);
          return;
        }

        const updated = data as unknown as OrderListRow;
        setRows((rs) => rs.map((r) => (r.order_num === orderNum ? updated : r)));
        setEditing(null);
      } finally {
        savingRef.current = false;
      }
    },
    [showError],
  );

  const startEdit = (orderNum: string, field: EditableField, current: string) => {
    setEditing({ orderNum, field });
    setDraft(current);
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const onBlurCommit = (orderNum: string, field: EditableField) => {
    const target = editing;
    if (!target || target.orderNum !== orderNum || target.field !== field) return;
    void commit(orderNum, field, draft);
  };

  const onKeyDown = (e: React.KeyboardEvent, orderNum: string, field: EditableField) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit(orderNum, field, draft);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  function EditableTextCell({
    orderNum,
    field,
    display,
    valueForEdit,
    minW,
  }: {
    orderNum: string;
    field: EditableField;
    display: string;
    valueForEdit: string;
    minW: string;
  }) {
    const active = editing?.orderNum === orderNum && editing?.field === field;
    return (
      <td className={`${tdClass} ${minW} ${active ? editingBg : ""}`}>
        {active ? (
          <input
            ref={inputRef}
            className="w-full min-w-[8rem] rounded border border-sky-300 bg-white px-2 py-1 text-sm dark:border-sky-700 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onBlurCommit(orderNum, field)}
            onKeyDown={(e) => onKeyDown(e, orderNum, field)}
          />
        ) : (
          <button
            type="button"
            className={`${cellInteractive} w-full text-left`}
            onClick={() => startEdit(orderNum, field, valueForEdit)}
          >
            {display || "—"}
          </button>
        )}
      </td>
    );
  }

  function EditableSelectCell({
    orderNum,
    field,
    value,
    options,
    minW,
    renderDisplay,
  }: {
    orderNum: string;
    field: EditableField;
    value: string;
    options: { value: string; label: string }[];
    minW: string;
    renderDisplay: (v: string) => React.ReactNode;
  }) {
    const active = editing?.orderNum === orderNum && editing?.field === field;
    return (
      <td className={`${tdClass} ${minW} ${active ? editingBg : ""}`}>
        {active ? (
          <select
            ref={selectRef}
            className="w-full min-w-[7rem] rounded border border-sky-300 bg-white px-2 py-1 text-sm dark:border-sky-700 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              void commit(orderNum, field, v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className={`${cellInteractive} w-full text-left`}
            onClick={() => startEdit(orderNum, field, value)}
          >
            {renderDisplay(value)}
          </button>
        )}
      </td>
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

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={`${thClass} min-w-[88px]`}>주문번호</th>
              <th className={`${thClass} min-w-[72px]`}>플랫폼</th>
              <th className={`${thClass} min-w-[72px]`}>경로</th>
              <th className={`${thClass} min-w-[96px]`}>일자</th>
              <th className={`${thClass} min-w-[120px]`}>진행</th>
              <th className={`${thClass} min-w-[140px]`}>고객</th>
              <th className={`${thClass} min-w-[64px]`}>선물</th>
              <th className={`${thClass} min-w-[88px]`}>사진</th>
              <th className={`${thClass} min-w-[100px]`}>거래처</th>
              <th className={`${thClass} min-w-[280px]`}>상품목록</th>
              <th className={`${thClass} min-w-[96px] text-right`}>총판매가₽</th>
              <th className={`${thClass} min-w-[88px] text-right`}>총원화</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-zinc-500">
                  표시할 주문이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const { names, totalRub, totalKrw } = aggregateItems(row.order_items);
                return (
                  <tr
                    key={row.order_num}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className={`${tdClass} min-w-[88px] font-mono font-medium`}>
                      <Link
                        href={`/orders/${encodeURIComponent(row.order_num)}`}
                        className="text-emerald-700 hover:underline dark:text-emerald-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.order_num}
                      </Link>
                    </td>
                    <td className={`${tdClass} min-w-[72px] whitespace-nowrap`}>{row.platform}</td>
                    <td className={`${tdClass} min-w-[72px] whitespace-nowrap`}>{row.order_type}</td>
                    <td className={`${tdClass} min-w-[96px] whitespace-nowrap`}>
                      {row.date?.slice(0, 10) ?? "—"}
                    </td>
                    <EditableSelectCell
                      orderNum={row.order_num}
                      field="progress"
                      value={row.progress}
                      minW="min-w-[120px]"
                      options={ORDER_PROGRESS.map((p) => ({ value: p, label: p }))}
                      renderDisplay={(v) => (
                        <span
                          className={`inline-flex max-w-[200px] truncate rounded-full px-2 py-0.5 text-xs font-medium ${progressBadgeClass(v)}`}
                          title={v}
                        >
                          {v}
                        </span>
                      )}
                    />
                    <EditableTextCell
                      orderNum={row.order_num}
                      field="customer_name"
                      display={row.customer_name ?? ""}
                      valueForEdit={row.customer_name ?? ""}
                      minW="min-w-[140px]"
                    />
                    <EditableSelectCell
                      orderNum={row.order_num}
                      field="gift"
                      value={row.gift === "ask" ? "ask" : "no"}
                      minW="min-w-[64px]"
                      options={[
                        { value: "no", label: "no" },
                        { value: "ask", label: "ask" },
                      ]}
                      renderDisplay={(v) => v}
                    />
                    <EditableSelectCell
                      orderNum={row.order_num}
                      field="photo_sent"
                      value={row.photo_sent}
                      minW="min-w-[88px]"
                      options={PHOTO_STATUS.map((p) => ({ value: p, label: p }))}
                      renderDisplay={(v) => v}
                    />
                    <EditableTextCell
                      orderNum={row.order_num}
                      field="purchase_channel"
                      display={row.purchase_channel ?? ""}
                      valueForEdit={row.purchase_channel ?? ""}
                      minW="min-w-[100px]"
                    />
                    <td className={`${tdClass} min-w-[280px] max-w-[420px]`}>
                      <span className="line-clamp-3 whitespace-normal break-words" title={names}>
                        {names || "—"}
                      </span>
                    </td>
                    <td className={`${tdClass} min-w-[96px] text-right tabular-nums`}>
                      {totalRub.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`${tdClass} min-w-[88px] text-right tabular-nums`}>
                      {totalKrw != null
                        ? totalKrw.toLocaleString("ko-KR")
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
