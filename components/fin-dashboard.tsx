"use client";

import type { FinMonthlySummary } from "@/lib/actions/finance";
import type { AccountTotals } from "@/lib/actions/finance";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKrw(n: number) {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + "백만원";
  }
  return n.toLocaleString("ko-KR") + "원";
}
function fmtKrwFull(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtRub(n: number) {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + "백만₽";
  }
  return n.toLocaleString("ru-RU") + "₽";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "red" | "blue" | "amber" | "zinc";
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <div className={`rounded-xl p-5 ${colorMap[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBar({
  label,
  incomeVal,
  expenseVal,
  maxVal,
}: {
  label: string;
  incomeVal: number;
  expenseVal: number;
  maxVal: number;
}) {
  const incomeH = maxVal > 0 ? Math.max(2, (incomeVal / maxVal) * 80) : 0;
  const expenseH = maxVal > 0 ? Math.max(2, (expenseVal / maxVal) * 80) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-20 items-end gap-1">
        <div
          className="w-4 rounded-t bg-emerald-400"
          style={{ height: `${incomeH}px` }}
          title={`수입: ${fmtKrwFull(incomeVal)}`}
        />
        <div
          className="w-4 rounded-t bg-red-400"
          style={{ height: `${expenseH}px` }}
          title={`지출: ${fmtKrwFull(expenseVal)}`}
        />
      </div>
      <span className="text-[10px] text-zinc-500">{label.slice(5)}</span>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function FinDashboard({
  summaries,
  accountTotals,
}: {
  summaries: FinMonthlySummary[];
  accountTotals: AccountTotals;
}) {
  const latest = summaries[summaries.length - 1];

  const thisKrIncome = latest?.kr_income ?? 0;
  const thisKrExpense = latest?.kr_expense ?? 0;
  const thisRuIncome = latest?.ru_income_rub ?? 0;
  const thisRuExpense = latest?.ru_expense_rub ?? 0;
  const thisFxProfit = latest?.fx_profit ?? 0;
  const thisExchangeKrw = latest?.exchange_krw ?? 0;

  const netKrw = thisKrIncome - thisKrExpense;
  const netRub = thisRuIncome - thisRuExpense;

  const maxIncome = Math.max(...summaries.map((s) => s.kr_income));
  const maxExpense = Math.max(...summaries.map((s) => s.kr_expense));
  const maxVal = Math.max(maxIncome, maxExpense);

  return (
    <div className="space-y-8">
      {/* Current month label */}
      {latest && (
        <p className="text-sm text-zinc-500">
          기준 월: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{latest.year_month}</span>
        </p>
      )}

      {/* Account balances */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          현재 계좌 잔액
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="한국 원화 합계"
            value={fmtKrw(accountTotals.krw_total)}
            color="emerald"
          />
          <KpiCard
            label="러시아 루블 합계"
            value={fmtRub(accountTotals.rub_total)}
            color="blue"
          />
          <KpiCard
            label="총 계좌 수"
            value={`${accountTotals.snapshots.length}개`}
            sub="등록된 계좌"
            color="zinc"
          />
          <KpiCard
            label="환전 이번달"
            value={fmtKrw(thisExchangeKrw)}
            sub={`환차익 ${fmtKrwFull(thisFxProfit)}`}
            color="amber"
          />
        </div>
      </section>

      {/* This month summary */}
      {latest && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            이번 달 요약
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              label="한국 수입"
              value={fmtKrw(thisKrIncome)}
              color="emerald"
            />
            <KpiCard
              label="한국 지출"
              value={fmtKrw(thisKrExpense)}
              color="red"
            />
            <KpiCard
              label="한국 순이익"
              value={fmtKrw(netKrw)}
              color={netKrw >= 0 ? "emerald" : "red"}
            />
            <KpiCard
              label="러시아 매출"
              value={fmtRub(thisRuIncome)}
              color="emerald"
            />
            <KpiCard
              label="러시아 지출"
              value={fmtRub(thisRuExpense)}
              color="red"
            />
            <KpiCard
              label="러시아 순이익"
              value={fmtRub(netRub)}
              color={netRub >= 0 ? "emerald" : "red"}
            />
          </div>
        </section>
      )}

      {/* Monthly KRW chart */}
      {summaries.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            월별 한국 수입/지출
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-end gap-2 overflow-x-auto pb-2">
              {summaries.map((s) => (
                <MiniBar
                  key={s.year_month}
                  label={s.year_month}
                  incomeVal={s.kr_income}
                  expenseVal={s.kr_expense}
                  maxVal={maxVal}
                />
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />
                수입
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-400" />
                지출
              </span>
            </div>
          </div>
        </section>
      )}

      {/* RUB monthly chart */}
      {summaries.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            월별 러시아 매출/지출 (루블)
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-end gap-2 overflow-x-auto pb-2">
              {(() => {
                const rubMax = Math.max(
                  ...summaries.map((s) =>
                    Math.max(s.ru_income_rub, s.ru_expense_rub),
                  ),
                );
                return summaries.map((s) => (
                  <MiniBar
                    key={s.year_month}
                    label={s.year_month}
                    incomeVal={s.ru_income_rub}
                    expenseVal={s.ru_expense_rub}
                    maxVal={rubMax}
                  />
                ));
              })()}
            </div>
            <div className="mt-4 flex gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />
                매출
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-400" />
                지출
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Monthly table */}
      {summaries.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            월별 상세
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2 text-left">월</th>
                  <th className="px-3 py-2 text-right">한국수입</th>
                  <th className="px-3 py-2 text-right">한국지출</th>
                  <th className="px-3 py-2 text-right">한국순이익</th>
                  <th className="px-3 py-2 text-right">러시아매출</th>
                  <th className="px-3 py-2 text-right">러시아지출</th>
                  <th className="px-3 py-2 text-right">환차익</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[...summaries].reverse().map((s) => {
                  const krNet = s.kr_income - s.kr_expense;
                  return (
                    <tr key={s.year_month} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-2 font-medium">{s.year_month}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">
                        {fmtKrwFull(s.kr_income)}
                      </td>
                      <td className="px-3 py-2 text-right text-red-600">
                        {fmtKrwFull(s.kr_expense)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          krNet >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {fmtKrwFull(krNet)}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-600">
                        {fmtRub(s.ru_income_rub)}
                      </td>
                      <td className="px-3 py-2 text-right text-red-600">
                        {fmtRub(s.ru_expense_rub)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right ${
                          s.fx_profit >= 0 ? "text-amber-600" : "text-red-600"
                        }`}
                      >
                        {fmtKrwFull(s.fx_profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
