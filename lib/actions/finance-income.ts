"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FinIncomeRecord } from "@/lib/schema";

// ─── helpers ──────────────────────────────────────────────────────────────────

function monthBounds(yearMonth: string): { gte: string; lte: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const gte = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const lte = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { gte, lte };
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// sale_krw / purchase_krw / profit_krw 계산
function computeKrw(
  saleCurrency: "KRW" | "RUB",
  saleAmount: number,
  saleRate: number | null,
  purchaseCurrency: "KRW" | "RUB",
  purchaseAmount: number,
  purchaseRate: number | null,
): { sale_krw: number; purchase_krw: number; profit_krw: number } {
  const saleKrw =
    saleCurrency === "KRW"
      ? saleAmount
      : saleAmount * (saleRate ?? 16.5);
  const buyKrw =
    purchaseCurrency === "KRW"
      ? purchaseAmount
      : purchaseAmount * (purchaseRate ?? 16.5);
  return {
    sale_krw: Math.round(saleKrw),
    purchase_krw: Math.round(buyKrw),
    profit_krw: Math.round(saleKrw - buyKrw),
  };
}

// ─── 수입 기록 payload 타입 ────────────────────────────────────────────────────

export type IncomeRecordPayload = {
  date: string;
  category: "러시아판매" | "도매" | "국내판매" | "기타";
  sub_category: string | null;
  product_name: string;
  product_type: string | null;
  sale_currency: "KRW" | "RUB";
  sale_amount: number;
  sale_rate: number | null;
  purchase_currency: "KRW" | "RUB";
  purchase_amount: number;
  purchase_rate: number | null;
  note: string | null;
};

// ─── 조회 ──────────────────────────────────────────────────────────────────────

export async function getIncomeRecords(yearMonth: string): Promise<FinIncomeRecord[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  const { gte, lte } = monthBounds(yearMonth);
  const { data, error } = await supabase
    .from("fin_income_records")
    .select("*")
    .gte("date", gte)
    .lte("date", lte)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinIncomeRecord[];
}

// ─── 생성/수정 ─────────────────────────────────────────────────────────────────

export async function upsertIncomeRecord(
  payload: IncomeRecordPayload,
  id?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };

  const { sale_krw, purchase_krw, profit_krw } = computeKrw(
    payload.sale_currency,
    payload.sale_amount,
    payload.sale_rate,
    payload.purchase_currency,
    payload.purchase_amount,
    payload.purchase_rate,
  );

  const row = {
    ...payload,
    sale_krw,
    purchase_krw,
    profit_krw,
    source: "manual" as const,
    order_item_id: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("fin_income_records").update(row).eq("id", id)
    : await supabase.from("fin_income_records").insert(row);

  if (error) return { error: error.message };
  revalidatePath("/finance/income");
  revalidatePath("/finance");
  return {};
}

// ─── 삭제 ──────────────────────────────────────────────────────────────────────

export async function deleteIncomeRecord(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };

  // source='order' 행은 삭제 불가
  const { data: existing } = await supabase
    .from("fin_income_records")
    .select("source")
    .eq("id", id)
    .single();
  if (existing?.source === "order") {
    return { error: "주문목록과 연동된 항목은 주문목록에서 삭제하세요." };
  }

  const { error } = await supabase.from("fin_income_records").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finance/income");
  revalidatePath("/finance");
  return {};
}
