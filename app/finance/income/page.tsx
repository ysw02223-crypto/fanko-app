import { getIncomeRecords } from "@/lib/actions/finance-income";
import { currentYearMonth } from "@/lib/finance-utils";
import { IncomeTable } from "@/components/income-table";
import { FinMonthSelect } from "@/components/fin-month-select";
import Link from "next/link";

type Props = { searchParams: Promise<{ ym?: string }> };

export default async function FinanceIncomePage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getIncomeRecords(yearMonth);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">수입 목록</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            러시아판매 항목은 주문목록과 자동 동기화됩니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FinMonthSelect value={yearMonth} />
          <Link
            href="/finance/income/new"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            수입 추가
          </Link>
        </div>
      </div>

      <IncomeTable initialRows={rows} />
    </div>
  );
}
