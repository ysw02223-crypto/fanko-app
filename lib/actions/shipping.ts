"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string; ok?: string; confirmedProgress?: string } | null;

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
  downloaded: boolean;
};

export type OrderForShipping = {
  order_num: string;
  date: string;
  progress: string | null;
  product_names: string;
  shipping: ShippingInfoRow | null;
};

export type ShippingExportRow = {
  order_num: string;
  date: string;
  product_name: string;
  product_type: string | null;
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
      .select("order_num, date, progress")
      .order("date", { ascending: true })
      .order("order_num", { ascending: true }),
    supabase
      .from("order_items")
      .select("order_num, product_name"),
    supabase
      .from("shipping_info")
      .select(
        "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number, downloaded"
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
    progress: order.progress ?? null,
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

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
        "order_num, product_name, product_type, product_option, brand, quantity, price_rub, krw, unit_price_usd"
      ),
    supabase
      .from("orders")
      .select("order_num, date, progress"),
    supabase
      .from("shipping_info")
      .select(
        "order_num, recipient_name, recipient_phone, recipient_email, zip_code, region, city, address, customs_number, downloaded"
      ),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (shippingResult.error) throw new Error(shippingResult.error.message);

  const ordersByNum = new Map<string, { date: string; progress: string | null }>();
  for (const order of ordersResult.data ?? []) {
    ordersByNum.set(order.order_num, { date: order.date, progress: order.progress ?? null });
  }

  const shippingByOrder = new Map<string, ShippingInfoRow>();
  for (const row of shippingResult.data ?? []) {
    shippingByOrder.set(row.order_num, row as ShippingInfoRow);
  }

  const isComplete = (s: ShippingInfoRow) =>
    !!(
      s.recipient_name?.trim() &&
      s.recipient_phone?.trim() &&
      s.recipient_email?.trim() &&
      s.zip_code?.trim() &&
      s.region?.trim() &&
      s.city?.trim() &&
      s.address?.trim() &&
      s.customs_number?.trim()
    );

  return (itemsResult.data ?? [])
    .filter((item) => {
      const shipping = shippingByOrder.get(item.order_num);
      const order = ordersByNum.get(item.order_num);
      return (
        shipping &&
        isComplete(shipping) &&
        order?.progress !== "IN DELIVERY"
      );
    })
    .map((item) => {
      const order = ordersByNum.get(item.order_num);
      const shipping = shippingByOrder.get(item.order_num) ?? null;
      return {
        order_num: item.order_num,
        date: order?.date ?? "",
        product_name: item.product_name,
        product_type: item.product_type,
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

export async function toggleDownloadedAction(
  orderNum: string,
  downloaded: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // orders progress 업데이트
  const newProgress = downloaded ? "IN DELIVERY" : "PROBLEM";

  // 현재 progress 조회 (히스토리용)
  const { data: orderData } = await supabase
    .from("orders")
    .select("progress")
    .eq("order_num", orderNum)
    .maybeSingle();

  const oldProgress = orderData?.progress ?? null;

  const { data: updatedOrder, error: orderError } = await supabase
    .from("orders")
    .update({ progress: newProgress })
    .eq("order_num", orderNum)
    .select("progress")
    .single();

  if (orderError) return { error: orderError.message };
  if (!updatedOrder) return { error: "업데이트된 항목을 찾을 수 없습니다." };

  // order_items.progress도 동일하게 업데이트
  const { data: itemsData } = await supabase
    .from("order_items")
    .select("id, progress")
    .eq("order_num", orderNum);

  await supabase
    .from("order_items")
    .update({ progress: newProgress })
    .eq("order_num", orderNum);

  // 히스토리 기록 (orders.progress)
  await supabase.from("order_history").insert({
    order_num: orderNum,
    field: "progress",
    old_value: oldProgress,
    new_value: newProgress,
    changed_by: "자동변경",
  });

  // 히스토리 기록 (order_items.progress 각 항목)
  if (itemsData && itemsData.length > 0) {
    await supabase.from("order_history").insert(
      itemsData.map((item) => ({
        order_num: orderNum,
        field: "items_progress",
        old_value: item.progress ?? null,
        new_value: newProgress,
        changed_by: "자동변경",
      }))
    );
  }

  revalidatePath("/shipping");
  revalidatePath("/orders");
  return { ok: downloaded ? "IN DELIVERY로 변경됐습니다." : "PROBLEM으로 변경됐습니다.", confirmedProgress: updatedOrder.progress };
}

export async function markShippingDownloadedAction(
  orderNums: string[]
): Promise<ActionState> {
  if (orderNums.length === 0) return { ok: "다운로드할 항목이 없습니다." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // orders progress → IN DELIVERY 업데이트 + 히스토리 기록
  for (const orderNum of orderNums) {
    const { data: orderData } = await supabase
      .from("orders")
      .select("progress")
      .eq("order_num", orderNum)
      .maybeSingle();

    const oldProgress = orderData?.progress ?? null;

    await supabase
      .from("orders")
      .update({ progress: "IN DELIVERY" })
      .eq("order_num", orderNum);

    // order_items.progress도 동일하게 업데이트
    const { data: itemsData } = await supabase
      .from("order_items")
      .select("id, progress")
      .eq("order_num", orderNum);

    await supabase
      .from("order_items")
      .update({ progress: "IN DELIVERY" })
      .eq("order_num", orderNum);

    // 히스토리 기록 (orders.progress)
    await supabase.from("order_history").insert({
      order_num: orderNum,
      field: "progress",
      old_value: oldProgress,
      new_value: "IN DELIVERY",
      changed_by: "자동변경",
    });

    // 히스토리 기록 (order_items.progress 각 항목)
    if (itemsData && itemsData.length > 0) {
      await supabase.from("order_history").insert(
        itemsData.map((item) => ({
          order_num: orderNum,
          field: "items_progress",
          old_value: item.progress ?? null,
          new_value: "IN DELIVERY",
          changed_by: "자동변경",
        }))
      );
    }
  }

  revalidatePath("/shipping");
  revalidatePath("/orders");
  return { ok: `${orderNums.length}건 IN DELIVERY로 변경됐습니다.` };
}

export async function syncOrderProgressFromItemsAction(
  orderNum: string
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // 해당 주문의 모든 아이템 progress 조회
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("progress")
    .eq("order_num", orderNum);

  if (itemsError) return { error: itemsError.message };
  if (!items || items.length === 0) return null;

  // 전체 아이템이 모두 IN DELIVERY일 때만 동기화
  const allInDelivery = items.every((item) => item.progress === "IN DELIVERY");
  if (!allInDelivery) return null;

  // 현재 orders.progress 조회 (이미 IN DELIVERY면 스킵)
  const { data: orderData } = await supabase
    .from("orders")
    .select("progress")
    .eq("order_num", orderNum)
    .maybeSingle();

  const oldProgress = orderData?.progress ?? null;
  if (oldProgress === "IN DELIVERY") return null;

  // orders.progress 업데이트
  const { error: updateError } = await supabase
    .from("orders")
    .update({ progress: "IN DELIVERY" })
    .eq("order_num", orderNum);

  if (updateError) return { error: updateError.message };

  // 히스토리 기록
  await supabase.from("order_history").insert({
    order_num: orderNum,
    field: "progress",
    old_value: oldProgress,
    new_value: "IN DELIVERY",
    changed_by: "자동변경",
  });

  revalidatePath("/shipping");
  revalidatePath("/orders");
  return { ok: "주문 상태가 IN DELIVERY로 자동 변경됐습니다." };
}