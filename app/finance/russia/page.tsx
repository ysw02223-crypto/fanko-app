import { getRuTransactions } from "@/lib/actions/finance";
import { currentYearMonth } from "@/lib/finance-utils";
import { FinMonthSelect } from "@/components/fin-month-select";
import { FinRuTable } from "@/components/fin-ru-table";

interface Props {
  searchParams: Promise<{ ym?: string }>;
}

export default async function FinanceRussiaPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getRuTransactions(yearMonth);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">러시아 내역</h1>
          <p className="mt-0.5 text-sm text-zinc-500">루블 매출·지출 관리</p>
        </div>
        <FinMonthSelect value={yearMonth} />
      </div>
      <FinRuTable initialRows={rows} yearMonth={yearMonth} />
    </div>
  );
}
