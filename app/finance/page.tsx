import { getDashboardData } from "@/lib/actions/finance-dashboard";
import { FinDashboard } from "@/components/fin-dashboard";

type Props = { searchParams: Promise<{ year?: string; month?: string }> };

export default async function FinanceDashboardPage({ searchParams }: Props) {
  const { year: yearStr, month } = await searchParams;
  const year = yearStr ? Number(yearStr) : new Date().getFullYear();
  const selectedMonth = month ?? null;

  const summaries = await getDashboardData(year);

  return (
    <div className="mx-auto max-w-6xl">
      <FinDashboard summaries={summaries} year={year} selectedMonth={selectedMonth} />
    </div>
  );
}
