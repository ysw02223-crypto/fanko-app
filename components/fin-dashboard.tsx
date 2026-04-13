"use client";

import { useRouter } from "next/navigation";
import type { FinDashboardMonthly } from "@/lib/actions/finance-dashboard";

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtKrwFull(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtRub(n: number) {
  return "₽" + n.toLocaleString("ru-RU");
}

const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

type KpiColor = "emerald" | "red" | "amber" | "blue" | "purple" | "zinc";

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: KpiColor }) {
  const bg: Record<KpiColor, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/40",
    red: "bg-red-50 dark:bg-red-950/40",
    amber: "bg-amber-50 dark:bg-amber-950/40",
    blue: "bg-blue-50 dark:bg-blue-950/40",
    purple: "bg-purple-50 dark:bg-purple-950/40",
    zinc: "bg-zinc-100 dark:bg-zinc-800",
  };
  const text: Record<KpiColor, string> = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    purple: "text-purple-700 dark:text-purple-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className={`rounded-xl ${bg[color]} px-4 py-3`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${text[color]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function MiniBar({ income, expense, maxVal, label }: { income: number; expense: number; maxVal: number; label: string }) {
  const pct = (v: number) => maxVal > 0 ? Math.max(2, Math.round((v / maxVal) * 80)) : 2;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-20 items-end gap-0.5">
        <div className="w-4 rounded-t-sm bg-emerald-400 dark:bg-emerald-600" style={{ height: `${pct(income)}px` }} title={fmtKrwFull(income)} />
        <div className="w-4 rounded-t-sm bg-red-400 dark:bg-red-600" style={{ height: `${pct(expense)}px` }} title={fmtKrwFull(expense)} />
      </div>
      <span className="text-[10px] text-zinc-400">{label}</span>
    </div>
  );
}

type AnnualTotals = Omit<FinDashboardMonthly, "year_month">;

function sumSummaries(summaries: FinDashboardMonthly[]): AnnualTotals {
  return summaries.reduce<AnnualTotals>(
    (acc, s) => ({
      expense_domestic_krw: acc.expense_domestic_krw + s.expense_domestic_krw,
      expense_overseas_krw: acc.expense_overseas_krw + s.expense_overseas_krw,
      export_rub: acc.export_rub + s.export_rub,
      profit_cosmetic: acc.profit_cosmetic + s.profit_cosmetic,
      profit_clothes: acc.profit_clothes + s.profit_clothes,
      profit_toy: acc.profit_toy + s.profit_toy,
      profit_etc_product: acc.profit_etc_product + s.profit_etc_product,
      profit_oliveyoung: acc.profit_oliveyoung + s.profit_oliveyoung,
      profit_domestic_sales: acc.profit_domestic_sales + s.profit_domestic_sales,
      exchange_krw: acc.exchange_krw + s.exchange_krw,
      fx_profit: acc.fx_profit + s.fx_profit,
      total_profit: acc.total_profit + s.total_profit,
    }),
    {
      expense_domestic_krw: 0, expense_overseas_krw: 0, export_rub: 0,
      profit_cosmetic: 0, profit_clothes: 0, profit_toy: 0, profit_etc_product: 0,
      profit_oliveyoung: 0, profit_domestic_sales: 0,
      exchange_krw: 0, fx_profit: 0, total_profit: 0,
    },
  );
}

export function FinDashboard({
  summaries,
  year,
  selectedMonth,
}: {
  summaries: FinDashboardMonthly[];
  year: number;
  selectedMonth: string | null;
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const annual = sumSummaries(summaries);
  const activeData = selectedMonth
    ? (summaries.find((s) => s.year_month === selectedMonth) ?? null)
    : null;
  const display: AnnualTotals = activeData ?? annual;

  const totalSales =
    display.profit_cosmetic + display.profit_clothes +
    display.profit_toy + display.profit_etc_product + display.profit_domestic_sales;

  const maxIncomeExpense = Math.max(
    ...summaries.map((s) =>
      Math.max(
        s.profit_cosmetic + s.profit_clothes + s.profit_toy + s.profit_etc_product + s.profit_domestic_sales,
        s.expense_domestic_krw + s.expense_overseas_krw,
      )
    ),
    1,
  );

  const tableRows = selectedMonth
    ? summaries.filter((s) => s.year_month === selectedMonth)
    : summaries;

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더: 연도 + 월 선택 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">재무 대시보드</h1>
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200 p-1 dark:border-zinc-700">
            {yearOptions.map((y) => (
              <button
                key={y}
                onClick={() => router.push(`/finance?year=${y}`)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  year === y
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* 월 버튼 */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => router.push(`/finance?year=${year}`)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !selectedMonth
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            연간
          </button>
          {summaries.map((s) => {
            const mIdx = parseInt(s.year_month.slice(5, 7)) - 1;
            const isActive = selectedMonth === s.year_month;
            return (
              <button
                key={s.year_month}
                onClick={() =>
                  isActive
                    ? router.push(`/finance?year=${year}`)
                    : router.push(`/finance?year=${year}&month=${s.year_month}`)
                }
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {MONTH_LABELS[mIdx]}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-zinc-500">
          {selectedMonth
            ? `${year}년 ${MONTH_LABELS[parseInt(selectedMonth.slice(5, 7)) - 1]} 상세`
            : `${year}년 연간 합계`}
        </p>
      </div>

      {/* KPI 그리드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="총 수익" value={fmtKrw(display.total_profit)} color={display.total_profit >= 0 ? "emerald" : "red"} />
        <KpiCard label="수출대금 (₽)" value={fmtRub(display.export_rub)} color="blue" />
        <KpiCard label="환차익" value={fmtKrw(display.fx_profit)} color={display.fx_profit >= 0 ? "amber" : "red"} />
        <KpiCard label="국내 운영비" value={fmtKrw(display.expense_domestic_krw)} color="red" />
        <KpiCard label="국외 운영비" value={fmtKrw(display.expense_overseas_krw)} color="red" sub="루블→원 환산" />
        <KpiCard label="매출 수익" value={fmtKrw(totalSales)} color="emerald" />
        <KpiCard label="올리브영" value={fmtKrw(display.profit_oliveyoung)} color="purple" />
        <KpiCard label="환전 원화" value={fmtKrw(display.exchange_krw)} color="zinc" />
      </div>

      {/* 카테고리별 수익 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">카테고리별 수익</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="화장품" value={fmtKrw(display.profit_cosmetic)} color={display.profit_cosmetic >= 0 ? "emerald" : "red"} />
          <KpiCard label="의류" value={fmtKrw(display.profit_clothes)} color={display.profit_clothes >= 0 ? "emerald" : "red"} />
          <KpiCard label="완구" value={fmtKrw(display.profit_toy)} color={display.profit_toy >= 0 ? "emerald" : "red"} />
          <KpiCard label="기타제품" value={fmtKrw(display.profit_etc_product)} color={display.profit_etc_product >= 0 ? "emerald" : "red"} />
        </div>
      </div>

      {/* 바 차트 (연간 뷰에서만) */}
      {!selectedMonth && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">월별 수익/지출</h2>
          <div className="flex items-end gap-2 overflow-x-auto rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            {summaries.map((s) => {
              const mIdx = parseInt(s.year_month.slice(5, 7)) - 1;
              return (
                <MiniBar
                  key={s.year_month}
                  label={MONTH_LABELS[mIdx] ?? ""}
                  income={s.profit_cosmetic + s.profit_clothes + s.profit_toy + s.profit_etc_product + s.profit_domestic_sales}
                  expense={s.expense_domestic_krw + s.expense_overseas_krw}
                  maxVal={maxIncomeExpense}
                />
              );
            })}
            <div className="ml-4 flex flex-col gap-1 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm bg-emerald-400" /> 수익
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm bg-red-400" /> 지출
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 월별 상세 테이블 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {selectedMonth ? "선택된 월 상세" : "월별 종합 현황"}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">월</th>
                <th className="px-3 py-2 text-right">국내운영비</th>
                <th className="px-3 py-2 text-right">국외운영비</th>
                <th className="px-3 py-2 text-right">화장품</th>
                <th className="px-3 py-2 text-right">의류</th>
                <th className="px-3 py-2 text-right">기타</th>
                <th className="px-3 py-2 text-right">올리브영</th>
                <th className="px-3 py-2 text-right">수출대금(₽)</th>
                <th className="px-3 py-2 text-right">환차익</th>
                <th className="px-3 py-2 text-right font-semibold">총수익</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {tableRows.map((s) => {
                const mIdx = parseInt(s.year_month.slice(5, 7)) - 1;
                const isSelected = selectedMonth === s.year_month;
                return (
                  <tr
                    key={s.year_month}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                    onClick={() =>
                      isSelected
                        ? router.push(`/finance?year=${year}`)
                        : router.push(`/finance?year=${year}&month=${s.year_month}`)
                    }
                  >
                    <td className="px-3 py-2 font-medium">{MONTH_LABELS[mIdx] ?? s.year_month}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmtKrw(s.expense_domestic_krw)}</td>
                    <td className="px-3 py-2 text-right text-red-500">{fmtKrw(s.expense_overseas_krw)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(s.profit_cosmetic)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(s.profit_clothes)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(s.profit_etc_product + s.profit_toy)}</td>
                    <td className="px-3 py-2 text-right text-purple-600">{fmtKrw(s.profit_oliveyoung)}</td>
                    <td className="px-3 py-2 text-right text-blue-600">{fmtRub(s.export_rub)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${s.fx_profit >= 0 ? "text-amber-600" : "text-red-600"}`}>
                      {fmtKrw(s.fx_profit)}
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${s.total_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtKrw(s.total_profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!selectedMonth && (
              <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
                <tr>
                  <td className="px-3 py-2 text-zinc-500">연간 합계</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmtKrw(annual.expense_domestic_krw)}</td>
                  <td className="px-3 py-2 text-right text-red-500">{fmtKrw(annual.expense_overseas_krw)}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(annual.profit_cosmetic)}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(annual.profit_clothes)}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{fmtKrw(annual.profit_etc_product + annual.profit_toy)}</td>
                  <td className="px-3 py-2 text-right text-purple-600">{fmtKrw(annual.profit_oliveyoung)}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{fmtRub(annual.export_rub)}</td>
                  <td className={`px-3 py-2 text-right ${annual.fx_profit >= 0 ? "text-amber-600" : "text-red-600"}`}>
                    {fmtKrw(annual.fx_profit)}
                  </td>
                  <td className={`px-3 py-2 text-right ${annual.total_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtKrw(annual.total_profit)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
