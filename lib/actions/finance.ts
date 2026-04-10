"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  FinKrTransaction,
  FinRuTransaction,
  FinExchangeRecord,
  FinAccountSnapshot,
} from "@/lib/schema";

// ─── helpers ───────────────────────────────────────────────────────────────
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

// ─── 한국 수입/지출 ─────────────────────────────────────────────────────────

export async function getKrTransactions(yearMonth: string): Promise<FinKrTransaction[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  const { gte, lte } = monthBounds(yearMonth);
  const { data, error } = await supabase
    .from("fin_kr_transactions")
    .select("*")
    .gte("date", gte)
    .lte("date", lte)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinKrTransaction[];
}

export async function upsertKrTransaction(
  payload: Omit<FinKrTransaction, "id" | "created_at" | "updated_at">,
  id?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from("fin_kr_transactions").update(row).eq("id", id)
    : await supabase.from("fin_kr_transactions").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/korea");
  return {};
}

export async function deleteKrTransaction(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = await supabase.from("fin_kr_transactions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/korea");
  return {};
}

// ─── 러시아 루블 매출/지출 ──────────────────────────────────────────────────

export async function getRuTransactions(yearMonth: string): Promise<FinRuTransaction[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  const { gte, lte } = monthBounds(yearMonth);
  const { data, error } = await supabase
    .from("fin_ru_transactions")
    .select("*")
    .gte("date", gte)
    .lte("date", lte)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinRuTransaction[];
}

export async function upsertRuTransaction(
  payload: Omit<FinRuTransaction, "id" | "created_at" | "updated_at">,
  id?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from("fin_ru_transactions").update(row).eq("id", id)
    : await supabase.from("fin_ru_transactions").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/russia");
  return {};
}

export async function deleteRuTransaction(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = await supabase.from("fin_ru_transactions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/russia");
  return {};
}

// ─── 환전 이력 ──────────────────────────────────────────────────────────────

export async function getExchangeRecords(yearMonth?: string): Promise<FinExchangeRecord[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  let q = supabase
    .from("fin_exchange_records")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (yearMonth) {
    const { gte, lte } = monthBounds(yearMonth);
    q = q.gte("date", gte).lte("date", lte);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FinExchangeRecord[];
}

export async function upsertExchangeRecord(
  payload: Omit<FinExchangeRecord, "id" | "created_at">,
  id?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = id
    ? await supabase.from("fin_exchange_records").update(payload).eq("id", id)
    : await supabase.from("fin_exchange_records").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/exchange");
  return {};
}

export async function deleteExchangeRecord(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = await supabase.from("fin_exchange_records").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/exchange");
  return {};
}

// ─── 계좌 현황 ──────────────────────────────────────────────────────────────

export async function getAccountSnapshots(yearMonth: string): Promise<FinAccountSnapshot[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  const { data, error } = await supabase
    .from("fin_account_snapshots")
    .select("*")
    .eq("year_month", yearMonth)
    .order("account");
  if (error) throw new Error(error.message);
  return (data ?? []) as FinAccountSnapshot[];
}

export async function upsertAccountSnapshot(
  payload: Omit<FinAccountSnapshot, "id" | "created_at">,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireAuth();
  if (!user) return { error: "로그인이 필요합니다." };
  const { error } = await supabase
    .from("fin_account_snapshots")
    .upsert(payload, { onConflict: "year_month,account" });
  if (error) return { error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/accounts");
  return {};
}

// ─── 대시보드 집계 ──────────────────────────────────────────────────────────

export type FinMonthlySummary = {
  year_month: string;
  kr_income: number;
  kr_expense: number;
  ru_income_rub: number;
  ru_income_krw: number;
  ru_expense_rub: number;
  exchange_krw: number;
  fx_profit: number;
};

export async function getFinanceSummaries(months: number): Promise<FinMonthlySummary[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];

  // 최근 N개월 범위 계산
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;

  const [krRes, ruRes, exRes] = await Promise.all([
    supabase
      .from("fin_kr_transactions")
      .select("date, type, amount")
      .gte("date", fromStr),
    supabase
      .from("fin_ru_transactions")
      .select("date, type, amount_rub, amount_krw")
      .gte("date", fromStr),
    supabase
      .from("fin_exchange_records")
      .select("date, krw_amount, fx_profit")
      .gte("date", fromStr),
  ]);

  // 월별로 집계
  const map = new Map<string, FinMonthlySummary>();

  const ensure = (ym: string): FinMonthlySummary => {
    if (!map.has(ym)) {
      map.set(ym, {
        year_month: ym,
        kr_income: 0,
        kr_expense: 0,
        ru_income_rub: 0,
        ru_income_krw: 0,
        ru_expense_rub: 0,
        exchange_krw: 0,
        fx_profit: 0,
      });
    }
    return map.get(ym)!;
  };

  for (const row of krRes.data ?? []) {
    const ym = row.date.slice(0, 7);
    const s = ensure(ym);
    if (row.type === "income") s.kr_income += row.amount;
    else s.kr_expense += row.amount;
  }

  for (const row of ruRes.data ?? []) {
    const ym = row.date.slice(0, 7);
    const s = ensure(ym);
    if (row.type === "income") {
      s.ru_income_rub += row.amount_rub ?? 0;
      s.ru_income_krw += row.amount_krw ?? 0;
    } else {
      s.ru_expense_rub += row.amount_rub ?? 0;
    }
  }

  for (const row of exRes.data ?? []) {
    const ym = row.date.slice(0, 7);
    const s = ensure(ym);
    s.exchange_krw += row.krw_amount ?? 0;
    s.fx_profit += row.fx_profit ?? 0;
  }

  return Array.from(map.values()).sort((a, b) => a.year_month.localeCompare(b.year_month));
}

// ─── 계좌 현황 여러 달 ──────────────────────────────────────────────────────

export async function getAccountSnapshotsRange(months: number): Promise<FinAccountSnapshot[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];
  const now = new Date();
  const ymList: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    ymList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const { data, error } = await supabase
    .from("fin_account_snapshots")
    .select("*")
    .in("year_month", ymList)
    .order("year_month", { ascending: false })
    .order("account");
  if (error) throw new Error(error.message);
  return (data ?? []) as FinAccountSnapshot[];
}

// ─── 현재 달 계좌 잔액 합계 (대시보드용) ───────────────────────────────────

export type AccountTotals = {
  krw_total: number;
  rub_total: number;
  snapshots: FinAccountSnapshot[];
};

export async function getCurrentAccountTotals(): Promise<AccountTotals> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const snapshots = await getAccountSnapshots(yearMonth);
  let krw_total = 0;
  let rub_total = 0;
  for (const s of snapshots) {
    if (s.currency === "KRW") krw_total += s.balance;
    else rub_total += s.balance;
  }
  return { krw_total, rub_total, snapshots };
}

