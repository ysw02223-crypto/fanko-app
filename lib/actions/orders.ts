"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ORDER_PROGRESS,
  ORDER_ROUTES,
  PHOTO_STATUS,
  PLATFORMS,
  type OrderProgress,
  type OrderRoute,
  type PhotoStatus,
  type Platform,
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
