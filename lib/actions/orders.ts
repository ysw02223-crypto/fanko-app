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

  revalidatePath("/orders");
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
