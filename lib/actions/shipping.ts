"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string; ok?: string } | null;

export type ShippingInfoRow = {
  order_num: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  zip_code: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  customs_number: string | null;
};

export type OrderForShipping = {
  order_num: string;
  date: string;
  customer_name: string | null;
  product_names: string;
  shipping: ShippingInfoRow | null;
};

export type ShippingExportRow = {
  order_num: string;
  date: string;
  customer_name: string | null;
  product_name: string;
  product_option: string | null;
  brand: string | null;
  quantity: number;
  price_rub: number;
  krw: number | null;
  unit_price_usd: number | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  zip_code: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  customs_number: string | null;
};

export async function getOrdersForShipping(): Promise<OrderForShipping[]> {
  const supabase = await createClient();

  const [ordersResult, itemsResult, shippingResult] = await Promise.all([
    supabase
      .from("orders")
      .select("order_num, date, customer_name")
      .order("date", { ascending: false }),
    supabase
      .from("order_items")
      .select("order_num, product_name"),
    supabase
      .from("shipping_info")
      .select(
        "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number"
      ),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (shippingResult.error) throw new Error(shippingResult.error.message);

  const itemsByOrder = new Map<string, string[]>();
  for (const item of itemsResult.data ?? []) {
    const existing = itemsByOrder.get(item.order_num) ?? [];
    existing.push(item.product_name);
    itemsByOrder.set(item.order_num, existing);
  }

  const shippingByOrder = new Map<string, ShippingInfoRow>();
  for (const row of shippingResult.data ?? []) {
    shippingByOrder.set(row.order_num, row as ShippingInfoRow);
  }

  return (ordersResult.data ?? []).map((order) => ({
    order_num: order.order_num,
    date: order.date,
    customer_name: order.customer_name,
    product_names: (itemsByOrder.get(order.order_num) ?? []).join("\n"),
    shipping: shippingByOrder.get(order.order_num) ?? null,
  }));
}

export async function upsertShippingInfoAction(
  orderNum: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const { error: authError } = await supabase.auth.getUser();
  if (authError) return { error: authError.message };

  const parseField = (key: string): string | null => {
    const val = formData.get(key);
    if (typeof val !== "string" || val.trim() === "") return null;
    return val.trim();
  };

  const payload = {
    order_num: orderNum,
    recipient_name: parseField("recipient_name"),
    recipient_phone: parseField("recipient_phone"),
    recipient_email: parseField("recipient_email"),
    zip_code: parseField("zip_code"),
    region: parseField("region"),
    city: parseField("city"),
    address: parseField("address"),
    customs_number: parseField("customs_number"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("shipping_info")
    .upsert(payload, { onConflict: "order_num" });

  if (error) return { error: error.message };

  revalidatePath("/shipping");
  return { ok: "배송 정보를 저장했습니다." };
}

export async function getShippingExportRows(): Promise<ShippingExportRow[]> {
  const supabase = await createClient();

  const [itemsResult, ordersResult, shippingResult] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        "order_num, product_name, product_option, brand, quantity, price_rub, krw, unit_price_usd"
      ),
    supabase
      .from("orders")
      .select("order_num, date, customer_name"),
    supabase
      .from("shipping_info")
      .select(
        "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number"
      ),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (shippingResult.error) throw new Error(shippingResult.error.message);

  const ordersByNum = new Map<
    string,
    { date: string; customer_name: string | null }
  >();
  for (const order of ordersResult.data ?? []) {
    ordersByNum.set(order.order_num, {
      date: order.date,
      customer_name: order.customer_name,
    });
  }

  const shippingByOrder = new Map<string, ShippingInfoRow>();
  for (const row of shippingResult.data ?? []) {
    shippingByOrder.set(row.order_num, row as ShippingInfoRow);
  }

  return (itemsResult.data ?? []).map((item) => {
    const order = ordersByNum.get(item.order_num);
    const shipping = shippingByOrder.get(item.order_num) ?? null;
    return {
      order_num: item.order_num,
      date: order?.date ?? "",
      customer_name: order?.customer_name ?? null,
      product_name: item.product_name,
      product_option: item.product_option,
      brand: item.brand,
      quantity: item.quantity,
      price_rub: item.price_rub,
      krw: item.krw,
      unit_price_usd: item.unit_price_usd,
      recipient_name: shipping?.recipient_name ?? null,
      recipient_phone: shipping?.recipient_phone ?? null,
      recipient_email: shipping?.recipient_email ?? null,
      zip_code: shipping?.zip_code ?? null,
      region: shipping?.region ?? null,
      city: shipping?.city ?? null,
      address: shipping?.address ?? null,
      customs_number: shipping?.customs_number ?? null,
    };
  });
}