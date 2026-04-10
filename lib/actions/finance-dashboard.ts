"use server";

import { createClient } from "@/lib/supabase/server";

export type FinDashboardMonthly = {
  year_month: string;
  // 지출
  expense_domestic_krw: number;   // 국내 운영비 (currency='KRW')
  expense_overseas_krw: number;   // 국외 운영비 (currency='RUB', amount_krw 환산)
  // 수출대금 (order_items 직접 집계)
  export_rub: number;
  // 카테고리별 판매 수익
  profit_cosmetic: number;        // product_type='Cosmetic'
  profit_clothes: number;         // product_type='Clothes'
  profit_toy: number;             // product_type='Toy'
  profit_etc_product: number;     // product_type='ETC'
  profit_oliveyoung: number;      // category='기타' AND sub_category='올리브영'
  profit_domestic_sales: number;  // category IN ('도매','국내판매','기타' 올리브영 제외)
  // 환전
  exchange_krw: number;
  fx_profit: number;
  // 총 수익
  total_profit: number;
};

// orders_items 조인용 내부 타입
type OrderItemWithDate = {
  price_rub: number;
  orders: { date: string } | { date: string }[] | null;
};

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getDashboardData(year: number): Promise<FinDashboardMonthly[]> {
  const { supabase, user } = await requireAuth();
  if (!user) return [];

  const from = `${year}-01-01`;
  const to   = `${year}-12-31`;

  const [incomeRes, expenseRes, exchangeRes, orderItemsRes] = await Promise.all([
    supabase
      .from("fin_income_records")
      .select("date, category, sub_category, product_type, profit_krw")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("fin_expense_records")
      .select("date, currency, amount_krw")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("fin_exchange_records")
      .select("date, krw_amount, fx_profit")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("order_items")
      .select("price_rub, orders!inner(date)")
      .gte("orders.date", from)
      .lte("orders.date", to),
  ]);

  // 12개월 빈 슬롯 초기화
  const map = new Map<string, FinDashboardMonthly>();
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    map.set(ym, {
      year_month: ym,
      expense_domestic_krw: 0,
      expense_overseas_krw: 0,
      export_rub: 0,
      profit_cosmetic: 0,
      profit_clothes: 0,
      profit_toy: 0,
      profit_etc_product: 0,
      profit_oliveyoung: 0,
      profit_domestic_sales: 0,
      exchange_krw: 0,
      fx_profit: 0,
      total_profit: 0,
    });
  }

  const get = (ym: string): FinDashboardMonthly | undefined => map.get(ym);

  // 수입 집계
  for (const row of incomeRes.data ?? []) {
    const ym = (row.date as string).slice(0, 7);
    const s = get(ym);
    if (!s) continue;
    const profit = Number(row.profit_krw ?? 0);
    const cat = row.category as string;
    const sub = row.sub_category as string | null;
    const pt  = row.product_type as string | null;

    if (cat === "러시아판매") {
      if (pt === "Cosmetic") s.profit_cosmetic += profit;
      else if (pt === "Clothes") s.profit_clothes += profit;
      else if (pt === "Toy") s.profit_toy += profit;
      else s.profit_etc_product += profit;
    } else if (cat === "기타" && sub === "올리브영") {
      s.profit_oliveyoung += profit;
    } else {
      s.profit_domestic_sales += profit;
    }
  }

  // 지출 집계
  for (const row of expenseRes.data ?? []) {
    const ym = (row.date as string).slice(0, 7);
    const s = get(ym);
    if (!s) continue;
    const krw = Number(row.amount_krw ?? 0);
    if (row.currency === "KRW") s.expense_domestic_krw += krw;
    else s.expense_overseas_krw += krw;
  }

  // 환전 집계
  for (const row of exchangeRes.data ?? []) {
    const ym = (row.date as string).slice(0, 7);
    const s = get(ym);
    if (!s) continue;
    s.exchange_krw += Number(row.krw_amount ?? 0);
    s.fx_profit    += Number(row.fx_profit ?? 0);
  }

  // 수출대금 집계 (order_items)
  for (const rawRow of orderItemsRes.data ?? []) {
    const row = rawRow as OrderItemWithDate;
    const ordersField = row.orders;
    const orderDate = Array.isArray(ordersField)
      ? ordersField[0]?.date
      : ordersField?.date;
    if (!orderDate) continue;
    const ym = orderDate.slice(0, 7);
    const s = get(ym);
    if (!s) continue;
    s.export_rub += Number(row.price_rub ?? 0);
  }

  // 총 수익 계산
  for (const s of map.values()) {
    s.total_profit =
      s.profit_cosmetic +
      s.profit_clothes +
      s.profit_toy +
      s.profit_etc_product +
      s.profit_oliveyoung +
      s.profit_domestic_sales +
      s.fx_profit;
  }

  return Array.from(map.values());
}

// 특정 월 단일 집계 (월 상세 뷰용)
export async function getDashboardMonth(yearMonth: string): Promise<FinDashboardMonthly> {
  const year = Number(yearMonth.slice(0, 4));
  const all = await getDashboardData(year);
  return (
    all.find((s) => s.year_month === yearMonth) ?? {
      year_month: yearMonth,
      expense_domestic_krw: 0,
      expense_overseas_krw: 0,
      export_rub: 0,
      profit_cosmetic: 0,
      profit_clothes: 0,
      profit_toy: 0,
      profit_etc_product: 0,
      profit_oliveyoung: 0,
      profit_domestic_sales: 0,
      exchange_krw: 0,
      fx_profit: 0,
      total_profit: 0,
    }
  );
}
