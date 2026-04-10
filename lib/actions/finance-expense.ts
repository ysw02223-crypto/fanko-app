"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FinExpenseRecord } from "@/lib/schema";

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

// ─── 지출 기록 payload 타입 ────────────────────────────────────────────────────

export type ExpenseRecordPayload = {
  date: string;
  major_category: string;
  mid_category: string | null;
  minor_category: string | null;
  description: string;
  currency: "KRW" | "RUB";
  amount: number;
  rate: number | null;
  memo: string | null;
};

// ─── 조회 ──────────────────────────────────────────────────────────────────────

export async function getExpenseRecords(yearMonth: string): Promise<FinExpenseRecord[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  const { gte, lte } = monthBounds(yearMonth);
  const { data, error } = await supabase
    .from("fin_expense_records")
    .select("*")
    .gte("date", gte)
    .lte("date", lte)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinExpenseRecord[];
}

// ─── 생성/수정 ─────────────────────────────────────────────────────────────────

export async function upsertExpenseRecord(
  payload: ExpenseRecordPayload,
  id?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };

  const amount_krw =
    payload.currency === "KRW"
      ? payload.amount
      : Math.round(payload.amount * (payload.rate ?? 16.5));

  const row = {
    ...payload,
    amount_krw,
    source: "manual" as const,
    order_num: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("fin_expense_records").update(row).eq("id", id)
    : await supabase.from("fin_expense_records").insert(row);

  if (error) return { error: error.message };
  revalidatePath("/finance/expense");
  revalidatePath("/finance");
  return {};
}

// ─── 삭제 ──────────────────────────────────────────────────────────────────────

export async function deleteExpenseRecord(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };

  // source='order' 행은 삭제 불가
  const { data: existing } = await supabase
    .from("fin_expense_records")
    .select("source")
    .eq("id", id)
    .single();
  if (existing?.source === "order") {
    return { error: "주문목록과 연동된 배송비 항목은 주문목록에서 수정하세요." };
  }

  const { error } = await supabase.from("fin_expense_records").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finance/expense");
  revalidatePath("/finance");
  return {};
}
