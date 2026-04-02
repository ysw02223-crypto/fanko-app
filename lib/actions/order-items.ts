"use server";

import { createClient } from "@/lib/supabase/server";
import {
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type ProductCategory,
  type SetType,
} from "@/lib/schema";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "./orders";

function isCategory(v: string): v is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}

function isSetType(v: string): v is SetType {
  return (SET_TYPES as readonly string[]).includes(v);
}

function num(name: string, formData: FormData, required: boolean) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return required ? NaN : 0;
  return Number(raw);
}

export async function createOrderItem(
  orderNum: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const product_type_raw = String(formData.get("product_type") ?? "").trim();
  let product_type: ProductCategory | null = null;
  if (product_type_raw) {
    if (!isCategory(product_type_raw)) return { error: "상품 카테고리가 올바르지 않습니다." };
    product_type = product_type_raw;
  }

  const product_name = String(formData.get("product_name") ?? "").trim();
  if (!product_name) return { error: "상품명을 입력하세요." };

  const product_option = String(formData.get("product_option") ?? "").trim();
  const product_set_type = String(formData.get("product_set_type") ?? "Single");
  if (!isSetType(product_set_type)) return { error: "세트 구분이 올바르지 않습니다." };

  const quantity = Math.floor(num("quantity", formData, true));
  if (!Number.isFinite(quantity) || quantity < 1) return { error: "수량을 확인하세요." };

  const price_rub = num("price_rub", formData, true);
  const prepayment_rub = num("prepayment_rub", formData, false);
  const extra_payment_rub = num("extra_payment_rub", formData, false);
  const krwRaw = String(formData.get("krw") ?? "").trim();
  const krw = krwRaw === "" ? null : Math.round(Number(krwRaw));

  if (!Number.isFinite(price_rub)) return { error: "판매가(₽)를 입력하세요." };
  if (!Number.isFinite(prepayment_rub) || !Number.isFinite(extra_payment_rub)) {
    return { error: "선결제/잔금을 확인하세요." };
  }

  const { error } = await supabase.from("order_items").insert({
    order_num: orderNum,
    product_type,
    product_name,
    product_option: product_option || null,
    product_set_type,
    quantity,
    price_rub,
    prepayment_rub,
    extra_payment_rub,
    krw: krw !== null && Number.isFinite(krw) ? krw : null,
  });

  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${encodeURIComponent(orderNum)}`);
  return { ok: "상품을 추가했습니다." };
}

export async function updateOrderItem(
  itemId: string,
  orderNum: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const product_type_raw = String(formData.get("product_type") ?? "").trim();
  let product_type: ProductCategory | null = null;
  if (product_type_raw) {
    if (!isCategory(product_type_raw)) return { error: "상품 카테고리가 올바르지 않습니다." };
    product_type = product_type_raw;
  }

  const product_name = String(formData.get("product_name") ?? "").trim();
  if (!product_name) return { error: "상품명을 입력하세요." };

  const product_option = String(formData.get("product_option") ?? "").trim();
  const product_set_type = String(formData.get("product_set_type") ?? "Single");
  if (!isSetType(product_set_type)) return { error: "세트 구분이 올바르지 않습니다." };

  const quantity = Math.floor(num("quantity", formData, true));
  if (!Number.isFinite(quantity) || quantity < 1) return { error: "수량을 확인하세요." };

  const price_rub = num("price_rub", formData, true);
  const prepayment_rub = num("prepayment_rub", formData, false);
  const extra_payment_rub = num("extra_payment_rub", formData, false);
  const krwRaw = String(formData.get("krw") ?? "").trim();
  const krw = krwRaw === "" ? null : Math.round(Number(krwRaw));

  if (!Number.isFinite(price_rub)) return { error: "판매가(₽)를 입력하세요." };
  if (!Number.isFinite(prepayment_rub) || !Number.isFinite(extra_payment_rub)) {
    return { error: "선결제/잔금을 확인하세요." };
  }

  const { error } = await supabase
    .from("order_items")
    .update({
      product_type,
      product_name,
      product_option: product_option || null,
      product_set_type,
      quantity,
      price_rub,
      prepayment_rub,
      extra_payment_rub,
      krw: krw !== null && Number.isFinite(krw) ? krw : null,
    })
    .eq("id", itemId)
    .eq("order_num", orderNum);

  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${encodeURIComponent(orderNum)}`);
  return { ok: "상품을 수정했습니다." };
}

export async function deleteOrderItem(itemId: string, orderNum: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/orders/${encodeURIComponent(orderNum)}`)}`);
  }

  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("id", itemId)
    .eq("order_num", orderNum);

  if (error) {
    redirect(`/orders/${encodeURIComponent(orderNum)}?e=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${encodeURIComponent(orderNum)}`);
  redirect(`/orders/${encodeURIComponent(orderNum)}`);
}
