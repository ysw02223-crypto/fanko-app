import { getOrderHistory } from "@/lib/actions/order-history";
import { HistoryRefreshButton } from "@/components/history-refresh-button";
import { HistoryTable } from "@/components/history-table";
import { HistoryPageHeader } from "@/components/history-page-header";

export default async function HistoryPage() {
  const history = await getOrderHistory();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <HistoryPageHeader count={history.length} />
        <HistoryRefreshButton />
      </div>

      <HistoryTable rows={history} />
    </div>
  );
}
