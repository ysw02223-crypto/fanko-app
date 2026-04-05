"use server";

import { createClient } from "@/lib/supabase/server";

export type OrderHistoryRow = {
  id: string;
  order_num: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
};

export async function logOrderHistory(
  orderNum: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  changedBy: string = "수동"
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("order_history").insert({
    order_num: orderNum,
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_by: changedBy,
  });
}

export async function getOrderHistory(orderNum?: string): Promise<OrderHistoryRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("order_history")
    .select("*")
    .order("created_at", { ascending: false });

  if (orderNum) {
    query = query.eq("order_num", orderNum);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderHistoryRow[];
}
