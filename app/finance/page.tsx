import {
  getFinanceSummaries,
  getCurrentAccountTotals,
} from "@/lib/actions/finance";
import { FinDashboard } from "@/components/fin-dashboard";

export default async function FinanceDashboardPage() {
  const [summaries, accountTotals] = await Promise.all([
    getFinanceSummaries(12),
    getCurrentAccountTotals(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">재무 대시보드</h1>
        <p className="mt-0.5 text-sm text-zinc-500">최근 12개월 재무 현황</p>
      </div>
      <FinDashboard summaries={summaries} accountTotals={accountTotals} />
    </div>
  );
}
