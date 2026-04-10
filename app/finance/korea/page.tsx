import { getKrTransactions } from "@/lib/actions/finance";
import { currentYearMonth } from "@/lib/finance-utils";
import { FinMonthSelect } from "@/components/fin-month-select";
import { FinKrTable } from "@/components/fin-kr-table";

interface Props {
  searchParams: Promise<{ ym?: string }>;
}

export default async function FinanceKoreaPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getKrTransactions(yearMonth);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">한국 내역</h1>
          <p className="mt-0.5 text-sm text-zinc-500">원화 수입·지출 관리</p>
        </div>
        <FinMonthSelect value={yearMonth} />
      </div>
      <FinKrTable initialRows={rows} yearMonth={yearMonth} />
    </div>
  );
}
