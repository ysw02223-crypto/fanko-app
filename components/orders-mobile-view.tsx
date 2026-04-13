"use client";

import { useMemo, useState } from "react";
import type { FlatOrderItemRow } from "@/lib/orders-line-items-flatten";
import type { OrderItemRow, OrderRow } from "@/lib/schema";
import { OrdersMobileDrawer } from "@/components/orders-mobile-drawer";

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

type OrderEditableField =
  | "customer_name"
  | "purchase_channel"
  | "date"
  | "platform"
  | "order_type";

type SaveItemField = (
  itemId: string,
  orderNum: string,
  field: ItemEditableField,
  newRaw: string,
  oldRaw: string,
  itemBefore: OrderItemRow,
) => Promise<boolean>;

type SaveOrderField = (
  orderNum: string,
  field: OrderEditableField,
  newRaw: string,
  oldRaw: string,
) => Promise<boolean>;

type Props = {
  filteredRows: (FlatOrderItemRow & { item: OrderItemRow })[];
  orderCount: number;
  lineCount: number;
  saveItemField: SaveItemField;
  saveOrderField: SaveOrderField;
};

type OrderGroup = {
  order: OrderRow;
  items: OrderItemRow[];
};

type DrawerTarget = {
  item: OrderItemRow;
  order: OrderRow;
};

const PROGRESS_COLORS: Record<string, string> = {
  PAY: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "BUY IN KOREA": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "ARRIVE KOR": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "IN DELIVERY": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "ARRIVE RUS": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "RU DELIVERY": "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "WAIT CUSTOMER": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  PROBLEM: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  CANCEL: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function progressClass(p: string | null | undefined): string {
  if (!p) return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  return PROGRESS_COLORS[p] ?? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
}

function fmtRub(n: string | number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!v || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ₽`;
}

function fmtKrw(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!v || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 0 })} ₩`;
}

export function OrdersMobileView({
  filteredRows,
  orderCount,
  lineCount,
  saveItemField,
  saveOrderField,
}: Props) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set());
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);

  const orderGroups = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderGroup>();
    for (const row of filteredRows) {
      const num = row.order.order_num;
      if (!map.has(num)) {
        map.set(num, { order: row.order, items: [] });
      }
      map.get(num)!.items.push(row.item);
    }
    return Array.from(map.values());
  }, [filteredRows]);

  function toggleOrder(orderNum: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderNum)) {
        next.delete(orderNum);
      } else {
        next.add(orderNum);
      }
      return next;
    });
  }

  function openDrawer(item: OrderItemRow, order: OrderRow) {
    setDrawerTarget({ item, order });
  }

  function closeDrawer() {
    setDrawerTarget(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stats row */}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        주문 {orderCount}건 · 표시 행 {lineCount}줄
      </p>

      {/* Order cards */}
      {orderGroups.map((group) => {
        const isExpanded = expandedOrders.has(group.order.order_num);
        // Dominant progress: most common among items, or order-level
        const progressValues = group.items.map((i) => i.progress ?? group.order.progress ?? "");
        const dominantProgress = progressValues[0] ?? "";

        return (
          <div
            key={group.order.order_num}
            className="overflow-hidden rounded-2xl bg-white shadow-sm outline outline-1 outline-zinc-200 dark:bg-zinc-900 dark:outline-zinc-800"
          >
            {/* Order header — tap to expand/collapse */}
            <button
              type="button"
              onClick={() => toggleOrder(group.order.order_num)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            >
              {/* Expand chevron */}
              <svg
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>

              <div className="min-w-0 flex-1">
                {/* Top line: order_num + date + item count */}
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  <span className="font-mono">{group.order.order_num}</span>
                  <span className="text-xs font-normal text-zinc-400">{group.order.date}</span>
                  <span className="ml-auto text-xs font-normal text-zinc-500">
                    {group.items.length}개
                  </span>
                </div>

                {/* Bottom line: customer + platform + route */}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {group.order.customer_name && (
                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                      {group.order.customer_name}
                    </span>
                  )}
                  <span>{group.order.platform}</span>
                  <span>{group.order.order_type}</span>
                </div>
              </div>

              {/* Progress badge */}
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${progressClass(dominantProgress)}`}
              >
                {dominantProgress || "—"}
              </span>
            </button>

            {/* Expanded: item cards */}
            {isExpanded && (
              <div className="border-t border-zinc-100 dark:border-zinc-800">
                {group.items.map((item, idx) => {
                  const itemProgress = item.progress ?? group.order.progress ?? "";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openDrawer(item, group.order)}
                      className="flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-b-0 transition hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
                    >
                      {/* Index number */}
                      <span className="mt-0.5 min-w-[1.25rem] text-xs font-semibold text-zinc-400">
                        {idx + 1}.
                      </span>

                      {/* Item details */}
                      <div className="min-w-0 flex-1">
                        {/* Product name + option */}
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {item.product_name}
                          {item.product_option && (
                            <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                              ({item.product_option})
                            </span>
                          )}
                        </p>

                        {/* Prices row */}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          <span>수량 {item.quantity}</span>
                          <span>{fmtRub(item.price_rub)}</span>
                          {item.krw && <span>{fmtKrw(item.krw)}</span>}
                        </div>

                        {/* Tags row */}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${progressClass(itemProgress)}`}
                          >
                            {itemProgress || "—"}
                          </span>
                          {item.photo_sent && item.photo_sent !== "Not sent" && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {item.photo_sent}
                            </span>
                          )}
                          {item.photo_sent === "Not sent" && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              사진미발송
                            </span>
                          )}
                          {item.gift === "ask" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                              선물ask
                            </span>
                          )}
                          {item.product_set_type === "SET" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                              SET
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Edit arrow */}
                      <svg
                        className="mt-1 h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {orderGroups.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-600">
          표시할 주문이 없습니다.
        </p>
      )}

      {/* Edit drawer */}
      {drawerTarget && (
        <OrdersMobileDrawer
          item={drawerTarget.item}
          order={drawerTarget.order}
          onClose={closeDrawer}
          saveItemField={saveItemField}
          saveOrderField={saveOrderField}
        />
      )}
    </div>
  );
}
