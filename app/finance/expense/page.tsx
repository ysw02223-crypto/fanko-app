import { getExpenseRecords } from "@/lib/actions/finance-expense";
import { currentYearMonth } from "@/lib/finance-utils";
import { ExpenseTable } from "@/components/expense-table";
import { FinMonthSelect } from "@/components/fin-month-select";
import Link from "next/link";

type Props = { searchParams: Promise<{ ym?: string }> };

export default async function FinanceExpensePage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getExpenseRecords(yearMonth);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">지출 목록</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            배송비 항목은 주문목록과 자동 동기화됩니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FinMonthSelect value={yearMonth} />
          <Link
            href="/finance/expense/new"
            className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
          >
            지출 추가
          </Link>
        </div>
      </div>

      <ExpenseTable initialRows={rows} />
    </div>
  );
}
