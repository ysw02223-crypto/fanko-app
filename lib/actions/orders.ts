"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ORDER_PROGRESS,
  ORDER_ROUTES,
  PHOTO_STATUS,
  PLATFORMS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderProgress,
  type OrderRoute,
  type PhotoStatus,
  type Platform,
  type ProductCategory,
  type SetType,
} from "@/lib/schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v);
}

function isOrderRoute(v: string): v is OrderRoute {
  return (ORDER_ROUTES as readonly string[]).includes(v);
}

function isProgress(v: string): v is OrderProgress {
  return (ORDER_PROGRESS as readonly string[]).includes(v);
}

function isPhoto(v: string): v is PhotoStatus {
  return (PHOTO_STATUS as readonly string[]).includes(v);
}

export type ActionState = { error?: string; ok?: string } | null;

export type NewOrderLinePayload = {
  product_type: string;
  product_name: string;
  product_option: string;
  product_set_type: string;
  quantity: number;
  price_rub: number;
  prepayment_rub: number;
};

export type CreateOrderWithItemsPayload = {
  order_num: string;
  platform: string;
  order_type: string;
  date: string;
  customer_name: string;
  gift: string;
  lines: NewOrderLinePayload[];
};

function isCategory(v: string): v is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}

function isSetType(v: string): v is SetType {
  return (SET_TYPES as readonly string[]).includes(v);
}

/** 주문 + 품목 한 번에 생성. 성공 시 /orders 로 redirect (에러 시 { error } 반환). */
export async function createOrderWithItemsAction(
  payload: CreateOrderWithItemsPayload,
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const order_num = String(payload.order_num ?? "").trim();
  if (!order_num) return { error: "주문번호를 입력하세요." };

  const platform = String(payload.platform ?? "");
  const order_type = String(payload.order_type ?? "KOREA");
  const date = String(payload.date ?? "").trim();
  const customer_name = String(payload.customer_name ?? "").trim();
  const gift = String(payload.gift ?? "no");

  if (!isPlatform(platform)) return { error: "플랫폼이 올바르지 않습니다." };
  if (!isOrderRoute(order_type)) return { error: "주문 경로가 올바르지 않습니다." };
  if (!date) return { error: "주문일을 입력하세요." };

  const lines = payload.lines ?? [];
  if (lines.length < 1) return { error: "상품을 최소 1개 이상 추가하세요." };

  const rows: Array<{
    order_num: string;
    product_type: ProductCategory | null;
    product_name: string;
    product_option: string | null;
    product_set_type: SetType;
    quantity: number;
    price_rub: number;
    prepayment_rub: number;
    extra_payment_rub: number;
    krw: null;
    progress: OrderProgress;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const product_name = String(L.product_name ?? "").trim();
    if (!product_name) return { error: `상품 ${i + 1}행: 상품명을 입력하세요.` };

    const ptRaw = String(L.product_type ?? "").trim();
    let product_type: ProductCategory | null = null;
    if (ptRaw) {
      if (!isCategory(ptRaw)) return { error: `상품 ${i + 1}행: 카테고리가 올바르지 않습니다.` };
      product_type = ptRaw;
    }

    const product_option = String(L.product_option ?? "").trim();
    const product_set_type = String(L.product_set_type ?? "Single");
    if (!isSetType(product_set_type)) return { error: `상품 ${i + 1}행: 단품/세트 값이 올바르지 않습니다.` };

    const quantity = Math.floor(Number(L.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) return { error: `상품 ${i + 1}행: 수량을 확인하세요.` };

    const price_rub = Number(L.price_rub);
    const prepayment_rub = Number(L.prepayment_rub);
    if (!Number.isFinite(price_rub)) return { error: `상품 ${i + 1}행: 판매가(₽)를 입력하세요.` };
    if (!Number.isFinite(prepayment_rub) || prepayment_rub < 0) {
      return { error: `상품 ${i + 1}행: 선결제(₽)를 확인하세요.` };
    }

    const extra_payment_rub = price_rub - prepayment_rub;

    rows.push({
      order_num,
      product_type,
      product_name,
      product_option: product_option || null,
      product_set_type,
      quantity,
      price_rub,
      prepayment_rub,
      extra_payment_rub,
      krw: null,
      progress: "PAY",
    });
  }

  const { error: orderErr } = await supabase.from("orders").insert({
    order_num,
    platform,
    order_type,
    date,
    progress: "PAY" as OrderProgress,
    customer_name: customer_name || null,
    gift: gift === "ask" ? "ask" : "no",
    photo_sent: "Not sent" as PhotoStatus,
    purchase_channel: null,
  });

  if (orderErr) return { error: orderErr.message };

  const { error: itemsErr } = await supabase.from("order_items").insert(rows);

  if (itemsErr) {
    await supabase.from("orders").delete().eq("order_num", order_num);
    return { error: itemsErr.message };
  }

  // 수입목록 동기화 — 각 품목을 fin_income_records 에 upsert
  const { data: insertedItems } = await supabase
    .from("order_items")
    .select("id, product_name, product_type, price_rub, krw")
    .eq("order_num", order_num);

  for (const item of insertedItems ?? []) {
    const saleKrw = Math.round(Number(item.price_rub) * 16.5);
    const buyKrw  = Number(item.krw ?? 0);
    await supabase.from("fin_income_records").upsert(
      {
        date,
        category: "러시아판매",
        sub_category: null,
        product_name: item.product_name as string,
        product_type: (item.product_type as string | null) ?? null,
        sale_currency: "RUB",
        sale_amount: Number(item.price_rub),
        sale_rate: 16.5,
        sale_krw: saleKrw,
        purchase_currency: "KRW",
        purchase_amount: buyKrw,
        purchase_rate: null,
        purchase_krw: buyKrw,
        profit_krw: saleKrw - buyKrw,
        source: "order",
        order_item_id: item.id as string,
        note: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_item_id" },
    );
  }

  revalidatePath("/orders");
  revalidatePath("/finance/income");
  redirect("/orders");
}

export async function createOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const order_num = String(formData.get("order_num") ?? "").trim();
  if (!order_num) return { error: "주문번호를 입력하세요." };

  const platform = String(formData.get("platform") ?? "");
  const order_type = String(formData.get("order_type") ?? "KOREA");
  const date = String(formData.get("date") ?? "");
  const progress = String(formData.get("progress") ?? "PAY");
  const customer_name = String(formData.get("customer_name") ?? "").trim();
  const gift = String(formData.get("gift") ?? "no");
  const photo_sent = String(formData.get("photo_sent") ?? "Not sent");
  const purchase_channel = String(formData.get("purchase_channel") ?? "").trim();

  if (!isPlatform(platform)) return { error: "플랫폼이 올바르지 않습니다." };
  if (!isOrderRoute(order_type)) return { error: "주문 경로가 올바르지 않습니다." };
  if (!date) return { error: "주문일을 입력하세요." };
  if (!isProgress(progress)) return { error: "진행 상태가 올바르지 않습니다." };
  if (!isPhoto(photo_sent)) return { error: "사진 발송 상태가 올바르지 않습니다." };

  const { error } = await supabase.from("orders").insert({
    order_num,
    platform,
    order_type,
    date,
    progress,
    customer_name: customer_name || null,
    gift: gift === "ask" ? "ask" : "no",
    photo_sent,
    purchase_channel: purchase_channel || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/orders");
  redirect(`/orders/${encodeURIComponent(order_num)}`);
}

export async function updateOrder(
  orderNum: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const platform = String(formData.get("platform") ?? "");
  const order_type = String(formData.get("order_type") ?? "KOREA");
  const date = String(formData.get("date") ?? "");
  const progress = String(formData.get("progress") ?? "PAY");
  const customer_name = String(formData.get("customer_name") ?? "").trim();
  const gift = String(formData.get("gift") ?? "no");
  const photo_sent = String(formData.get("photo_sent") ?? "Not sent");
  const purchase_channel = String(formData.get("purchase_channel") ?? "").trim();

  if (!isPlatform(platform)) return { error: "플랫폼이 올바르지 않습니다." };
  if (!isOrderRoute(order_type)) return { error: "주문 경로가 올바르지 않습니다." };
  if (!date) return { error: "주문일을 입력하세요." };
  if (!isProgress(progress)) return { error: "진행 상태가 올바르지 않습니다." };
  if (!isPhoto(photo_sent)) return { error: "사진 발송 상태가 올바르지 않습니다." };

  const { error } = await supabase
    .from("orders")
    .update({
      platform,
      order_type,
      date,
      progress,
      customer_name: customer_name || null,
      gift: gift === "ask" ? "ask" : "no",
      photo_sent,
      purchase_channel: purchase_channel || null,
    })
    .eq("order_num", orderNum);

  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${encodeURIComponent(orderNum)}`);
  return { ok: "저장했습니다." };
}

// ── 인라인 신규주문 저장 (redirect 없음, itemId 반환) ──────────────────────
export type InsertDraftOrderResult = { itemId: string } | { error: string };

export async function insertDraftOrderAction(
  payload: CreateOrderWithItemsPayload,
): Promise<InsertDraftOrderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const order_num = String(payload.order_num ?? "").trim();
  if (!order_num) return { error: "주문번호를 입력하세요." };

  const platform = String(payload.platform ?? "");
  const order_type = String(payload.order_type ?? "KOREA");
  const date = String(payload.date ?? "").trim();
  if (!isPlatform(platform))   return { error: "플랫폼이 올바르지 않습니다. (주문번호 앞 2자리 확인)" };
  if (!isOrderRoute(order_type)) return { error: "주문 경로가 올바르지 않습니다." };
  if (!date) return { error: "주문일을 입력하세요." };

  const L = (payload.lines ?? [])[0];
  if (!L) return { error: "상품명을 입력하세요." };
  const product_name = String(L.product_name ?? "").trim();
  if (!product_name) return { error: "상품명을 입력하세요." };

  const product_option  = String(L.product_option ?? "").trim();
  const pst             = String(L.product_set_type ?? "Single");
  const product_set_type: SetType = isSetType(pst) ? pst : "Single";
  const quantity        = Math.max(1, Math.floor(Number(L.quantity) || 1));
  const price_rub       = Number(L.price_rub) || 0;
  const prepayment_rub  = Number(L.prepayment_rub) || 0;

  // ① 중복 주문번호 사전 체크
  const { data: existing } = await supabase
    .from("orders")
    .select("order_num")
    .eq("order_num", order_num)
    .maybeSingle();
  if (existing) return { error: `주문번호 ${order_num}은 이미 존재합니다.` };

  // ② orders INSERT
  const { error: orderErr } = await supabase.from("orders").insert({
    order_num,
    platform,
    order_type,
    date,
    progress:      "PAY" as OrderProgress,
    customer_name: String(payload.customer_name ?? "").trim() || null,
    gift:          payload.gift === "ask" ? "ask" : "no",
    photo_sent:    "Not sent" as PhotoStatus,
    purchase_channel: null,
  });
  if (orderErr) return { error: orderErr.message };

  // ② order_items INSERT
  const { data: itemData, error: itemErr } = await supabase
    .from("order_items")
    .insert({
      order_num,
      product_type:     null,
      product_name,
      product_option:   product_option || null,
      product_set_type,
      quantity,
      price_rub,
      prepayment_rub,
      extra_payment_rub: price_rub - prepayment_rub,
      krw:               null,
      progress:          "PAY" as OrderProgress,
    })
    .select("id")
    .single();

  if (itemErr) {
    await supabase.from("orders").delete().eq("order_num", order_num);
    return { error: itemErr.message };
  }

  const itemId = itemData.id as string;

  // ③ fin_income_records 동기화
  const saleKrw = Math.round(price_rub * 16.5);
  await supabase.from("fin_income_records").upsert(
    {
      date,
      category:          "러시아판매",
      sub_category:      null,
      product_name,
      product_type:      null,
      sale_currency:     "RUB",
      sale_amount:       price_rub,
      sale_rate:         16.5,
      sale_krw:          saleKrw,
      purchase_currency: "KRW",
      purchase_amount:   0,
      purchase_rate:     null,
      purchase_krw:      0,
      profit_krw:        saleKrw,
      source:            "order",
      order_item_id:     itemId,
      note:              null,
      updated_at:        new Date().toISOString(),
    },
    { onConflict: "order_item_id" },
  );

  revalidatePath("/orders");
  revalidatePath("/finance/income");
  return { itemId };
}

// ── 엑셀 대량 주문 업로드 ──────────────────────────────────────────────────

export type BulkImportResult = {
  inserted: number;
  skipped: string[];
  errors: string[];
};

export async function bulkImportOrdersAction(
  orders: import("@/lib/excel-order-parser").ParsedOrder[],
): Promise<BulkImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { inserted: 0, skipped: [], errors: ["로그인이 필요합니다."] };

  const orderNums = orders.map((o) => o.order_num);

  // 이미 존재하는 주문번호 일괄 조회 (쿼리 1번)
  const { data: existing } = await supabase
    .from("orders")
    .select("order_num")
    .in("order_num", orderNums);

  const existingSet = new Set((existing ?? []).map((r) => r.order_num as string));
  const toInsert = orders.filter((o) => !existingSet.has(o.order_num));
  const skipped  = orders.filter((o) =>  existingSet.has(o.order_num)).map((o) => o.order_num);
  const errors: string[] = [];
  let inserted = 0;

  for (const order of toInsert) {
    const firstItem = order.items[0];

    const { error: orderErr } = await supabase.from("orders").insert({
      order_num:        order.order_num,
      platform:         order.platform,
      order_type:       "KOREA" as const,
      date:             order.date,
      progress:         firstItem?.progress ?? "PAY",
      customer_name:    order.customer_name,
      gift:             firstItem?.gift ?? "no",
      photo_sent:       firstItem?.photo_sent ?? "Not sent",
      purchase_channel: null,
    });

    if (orderErr) { errors.push(`${order.order_num}: ${orderErr.message}`); continue; }

    const itemRows = order.items.map((item) => ({
      order_num:         order.order_num,
      product_type:      null,
      product_name:      item.product_name,
      product_option:    null,
      product_set_type:  "Single" as const,
      quantity:          item.quantity,
      price_rub:         item.price_rub,
      prepayment_rub:    item.prepayment_rub,
      extra_payment_rub: item.extra_payment_rub,
      krw:               item.krw,
      progress:          item.progress,
      gift:              item.gift,
      photo_sent:        item.photo_sent,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);

    if (itemsErr) {
      await supabase.from("orders").delete().eq("order_num", order.order_num);
      errors.push(`${order.order_num} (items): ${itemsErr.message}`);
      continue;
    }

    // fin_income_records 동기화
    const { data: insertedItems } = await supabase
      .from("order_items")
      .select("id, product_name, product_type, price_rub, krw")
      .eq("order_num", order.order_num);

    for (const item of insertedItems ?? []) {
      const saleKrw = Math.round(Number(item.price_rub) * 16.5);
      const buyKrw  = Number(item.krw ?? 0);
      await supabase.from("fin_income_records").upsert(
        {
          date:              order.date,
          category:          "러시아판매",
          sub_category:      null,
          product_name:      item.product_name as string,
          product_type:      (item.product_type as string | null) ?? null,
          sale_currency:     "RUB",
          sale_amount:       Number(item.price_rub),
          sale_rate:         16.5,
          sale_krw:          saleKrw,
          purchase_currency: "KRW",
          purchase_amount:   buyKrw,
          purchase_rate:     null,
          purchase_krw:      buyKrw,
          profit_krw:        saleKrw - buyKrw,
          source:            "order",
          order_item_id:     item.id as string,
          note:              null,
          updated_at:        new Date().toISOString(),
        },
        { onConflict: "order_item_id" },
      );
    }

    inserted++;
  }

  revalidatePath("/orders");
  revalidatePath("/finance/income");
  return { inserted, skipped, errors };
}

export async function deleteOrder(orderNum: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/orders/${encodeURIComponent(orderNum)}`)}`);
  }

  const { error } = await supabase.from("orders").delete().eq("order_num", orderNum);
  if (error) {
    redirect(`/orders/${encodeURIComponent(orderNum)}?e=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/orders");
  redirect("/orders");
}
