"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type DeliveryImportRow = {
  order_num: string;
  shipping_fee: number | null;
  applied_weight: number | null;
  tracking_number: string | null;
};

export type DeliveryImportResult = {
  updated: number;
  notFound: string[];
  error?: string;
};

export async function importDeliveryDataAction(
  rows: DeliveryImportRow[],
): Promise<DeliveryImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { updated: 0, notFound: [], error: "로그인이 필요합니다." };

  if (rows.length === 0) return { updated: 0, notFound: [] };

  // 존재하는 주문번호만 찾기
  const orderNums = rows.map((r) => r.order_num);
  const { data: existing } = await supabase
    .from("orders")
    .select("order_num")
    .in("order_num", orderNums);

  const existingSet = new Set((existing ?? []).map((r) => r.order_num));
  const notFound = orderNums.filter((n) => !existingSet.has(n));
  const toUpdate = rows.filter((r) => existingSet.has(r.order_num));

  let updated = 0;
  for (const row of toUpdate) {
    const { error } = await supabase
      .from("orders")
      .update({
        shipping_fee: row.shipping_fee,
        applied_weight: row.applied_weight,
        tracking_number: row.tracking_number,
        updated_at: new Date().toISOString(),
      })
      .eq("order_num", row.order_num);
    if (!error) updated++;
  }

  revalidatePath("/orders");
  return { updated, notFound };
}
