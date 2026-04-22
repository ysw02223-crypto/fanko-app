import type { FlatOrderItemRow } from "@/lib/orders-line-items-flatten";

export type OrderGridRow = {
  // ── 식별자 ──────────────────────────────────────
  rowKey: string;          // `${order_num}_${item_id ?? "none"}`
  groupColorIndex: number;

  // ── orders 테이블 필드 ──────────────────────────
  order_num: string;
  date: string;
  platform: string;
  order_type: string;
  customer_name: string | null;
  order_gift: string;        // orders.gift
  order_photo_sent: string;  // orders.photo_sent
  purchase_channel: string | null;

  // ── order_items 테이블 필드 ─────────────────────
  item_id: string | null;
  product_type: string | null;
  product_name: string;
  product_option: string | null;
  product_set_type: string;
  quantity: number;
  price_rub: number;
  prepayment_rub: number;
  extra_payment_rub: number;   // computed: price_rub - prepayment_rub
  krw: number | null;
  item_progress: string | null;
  item_gift: string | null;
  item_photo_sent: string | null;

  // ── shipping (읽기 전용) ─────────────────────────
  shipping_fee: number | null;
  applied_weight: number | null;
  tracking_number: string | null;
};

export function toGridRow(flat: FlatOrderItemRow): OrderGridRow {
  const { order, item, groupColorIndex } = flat;
  const priceRub = Number(item?.price_rub ?? 0);
  const prepayRub = Number(item?.prepayment_rub ?? 0);
  return {
    rowKey: `${order.order_num}_${item?.id ?? "none"}`,
    groupColorIndex,
    order_num: order.order_num,
    date: order.date,
    platform: order.platform,
    order_type: order.order_type,
    customer_name: order.customer_name,
    order_gift: order.gift,
    order_photo_sent: order.photo_sent,
    purchase_channel: order.purchase_channel,
    item_id: item?.id ?? null,
    product_type: item?.product_type ?? null,
    product_name: item?.product_name ?? "",
    product_option: item?.product_option ?? null,
    product_set_type: item?.product_set_type ?? "Single",
    quantity: item?.quantity ?? 0,
    price_rub: priceRub,
    prepayment_rub: prepayRub,
    extra_payment_rub: priceRub - prepayRub,
    krw: item?.krw != null ? Number(item.krw) : null,
    item_progress: item?.progress ?? order.progress,
    item_gift: item?.gift ?? null,
    item_photo_sent: item?.photo_sent ?? null,
    shipping_fee: order.shipping_fee,
    applied_weight: order.applied_weight,
    tracking_number: order.tracking_number,
  };
}
