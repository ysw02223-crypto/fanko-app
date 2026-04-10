import { getExchangeRecords } from "@/lib/actions/finance";
import { currentYearMonth } from "@/lib/finance-utils";
import { FinMonthSelect } from "@/components/fin-month-select";
import { FinExchangeTable } from "@/components/fin-exchange-table";

interface Props {
  searchParams: Promise<{ ym?: string }>;
}

export default async function FinanceExchangePage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getExchangeRecords(yearMonth);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">환전 관리</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            대리수취인별 환전 이력 및 환차익 관리
          </p>
        </div>
        <FinMonthSelect value={yearMonth} />
      </div>
      <FinExchangeTable initialRows={rows} />
    </div>
  );
}
