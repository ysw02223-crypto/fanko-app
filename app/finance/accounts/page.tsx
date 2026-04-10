import { getAccountSnapshots } from "@/lib/actions/finance";
import { currentYearMonth } from "@/lib/finance-utils";
import { FinMonthSelect } from "@/components/fin-month-select";
import { FinAccountsTable } from "@/components/fin-accounts-table";

interface Props {
  searchParams: Promise<{ ym?: string }>;
}

export default async function FinanceAccountsPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const snapshots = await getAccountSnapshots(yearMonth);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">계좌 현황</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            월말 기준 계좌별 잔액 기록
          </p>
        </div>
        <FinMonthSelect value={yearMonth} />
      </div>
      <FinAccountsTable snapshots={snapshots} yearMonth={yearMonth} />
    </div>
  );
}
