import type { OrderItemRow, OrderRow } from "@/lib/schema";

export type OrderWithNestedItems = OrderRow & {
  order_items: OrderItemRow[] | null;
};

export type FlatOrderItemRow = {
  order: OrderRow;
  item: OrderItemRow | null;
  isFirstInOrder: boolean;
  groupColorIndex: number;
};

export function flattenOrders(orders: OrderWithNestedItems[]): FlatOrderItemRow[] {
  const out: FlatOrderItemRow[] = [];
  orders.forEach((order, orderIdx) => {
    const items = order.order_items ?? [];
    const groupColorIndex = orderIdx;
    if (items.length === 0) {
      out.push({ order, item: null, isFirstInOrder: true, groupColorIndex });
    } else {
      items.forEach((item, i) => {
        out.push({ order, item, isFirstInOrder: i === 0, groupColorIndex });
      });
    }
  });
  return out;
}

export function replaceOrderSegment(
  prev: FlatOrderItemRow[],
  orderNum: string,
  newOrder: OrderWithNestedItems,
): FlatOrderItemRow[] {
  const start = prev.findIndex((r) => r.order.order_num === orderNum);
  if (start === -1) return prev;
  let end = start;
  while (end < prev.length && prev[end].order.order_num === orderNum) end++;
  const seg = flattenOrders([newOrder]);
  return [...prev.slice(0, start), ...seg, ...prev.slice(end)];
}
