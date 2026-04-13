"use server";

import { createClient } from "@/lib/supabase/server";

export type InsertHistoryEntry = {
  order_num: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
};

export async function insertOrderHistoryAction(
  entries: InsertHistoryEntry | InsertHistoryEntry[],
): Promise<void> {
  const supabase = await createClient();
  const rows = Array.isArray(entries) ? entries : [entries];
  if (rows.length === 0) return;
  await supabase.from("order_history").insert(rows);
}

export type OrderHistoryRow = {
  id: string;
  order_num: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
};

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
