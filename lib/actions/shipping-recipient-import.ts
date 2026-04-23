"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type RecipientRow = {
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

export type RecipientImportResult = {
  updated: number;
  notFound: string[];
  error?: string;
};

export async function bulkUpsertRecipientInfoAction(
  rows: RecipientRow[]
): Promise<RecipientImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { updated: 0, notFound: [], error: "로그인이 필요합니다." };

  const allNums = rows.map((r) => r.order_num);
  const { data: existing } = await supabase
    .from("orders")
    .select("order_num")
    .in("order_num", allNums);

  const existingSet = new Set((existing ?? []).map((r) => r.order_num));
  const notFound = allNums.filter((n) => !existingSet.has(n));
  const toUpsert = rows.filter((r) => existingSet.has(r.order_num));

  if (toUpsert.length === 0) return { updated: 0, notFound };

  // 같은 order_num이 배열에 두 번 이상 있으면 PostgreSQL이
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" 에러를 냄.
  // Map으로 중복 제거 (나중에 나온 행이 최종값으로 덮어씀).
  const dedupedMap = new Map<string, RecipientRow & { updated_at: string }>();
  const ts = new Date().toISOString();
  for (const r of toUpsert) {
    dedupedMap.set(r.order_num, { ...r, updated_at: ts });
  }
  const payload = Array.from(dedupedMap.values());

  const { error } = await supabase
    .from("shipping_info")
    .upsert(payload, { onConflict: "order_num" });

  if (error) return { updated: 0, notFound, error: error.message };

  revalidatePath("/shipping");
  return { updated: payload.length, notFound };
}
