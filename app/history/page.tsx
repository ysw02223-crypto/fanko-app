import { getOrderHistory } from "@/lib/actions/order-history";
import Link from "next/link";

export default async function HistoryPage() {
  const history = await getOrderHistory();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">변경 이력</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          총 {history.length}건
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <th className="px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400">일시</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400">주문번호</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400">항목</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400">이전 값</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400">변경 값</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400">변경 주체</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  변경 이력이 없습니다.
                </td>
              </tr>
            ) : (
              history.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                    {new Date(row.created_at).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/orders/${encodeURIComponent(row.order_num)}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {row.order_num}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{row.field}</td>
                  <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.old_value ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{row.new_value ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        row.changed_by === "자동변경"
                          ? "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }
                    >
                      {row.changed_by}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
