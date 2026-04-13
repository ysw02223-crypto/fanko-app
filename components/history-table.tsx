"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { HISTORY_FIELD_LABELS } from "@/lib/constants/history-labels";
import type { OrderHistoryRow } from "@/lib/actions/order-history";

export function HistoryTable({ rows }: { rows: OrderHistoryRow[] }) {
  const t = useT();

  function badgeClass(changedBy: string) {
    if (changedBy === "자동변경") {
      return "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
    }
    if (changedBy === "드래그채우기") {
      return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    }
    return "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }

  function badgeLabel(changedBy: string) {
    if (changedBy === "자동변경") return t.badge_auto;
    if (changedBy === "드래그채우기") return t.badge_drag;
    return t.badge_manual;
  }

  const thClass = "px-4 py-3 text-left font-semibold text-zinc-600 dark:text-zinc-400";

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <th className={thClass}>{t.history_col_time}</th>
            <th className={thClass}>{t.history_col_order}</th>
            <th className={thClass}>{t.history_col_field}</th>
            <th className={thClass}>{t.history_col_old}</th>
            <th className={thClass}>{t.history_col_new}</th>
            <th className={thClass}>{t.history_col_by}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                {t.state_empty_history}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
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
                <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                  {HISTORY_FIELD_LABELS[row.field] ?? row.field}
                </td>
                <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.old_value ?? "—"}</td>
                <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{row.new_value ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={badgeClass(row.changed_by)}>
                    {badgeLabel(row.changed_by)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
