"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertAccountSnapshot } from "@/lib/actions/finance";
import {
  ACCOUNT_LABELS,
  KR_ACCOUNT_KEYS,
  RU_ACCOUNT_KEYS,
} from "@/lib/finance-categories";
import type { FinAccountSnapshot, FinAccount } from "@/lib/schema";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKrw(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtRub(n: number) {
  return n.toLocaleString("ru-RU") + "₽";
}

type SnapshotMap = Map<FinAccount, number>;

function buildMap(snapshots: FinAccountSnapshot[]): SnapshotMap {
  const m = new Map<FinAccount, number>();
  for (const s of snapshots) {
    m.set(s.account, s.balance);
  }
  return m;
}

// ── Account row component ─────────────────────────────────────────────────────

function AccountRow({
  account,
  currency,
  label,
  balance,
  yearMonth,
}: {
  account: FinAccount;
  currency: "KRW" | "RUB";
  label: string;
  balance: number;
  yearMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(balance === 0 ? "" : String(balance));
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const num = Number(value.replace(/,/g, ""));
    if (isNaN(num)) return;
    startTransition(async () => {
      await upsertAccountSnapshot({
        year_month: yearMonth,
        account,
        balance: num,
        currency,
      });
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave();
  }

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="py-3 pl-4 pr-3 font-medium">{label}</td>
      <td className="px-3 py-3 text-xs text-zinc-500">{currency}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder="0"
            className="w-36 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-right outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
          {saved && (
            <span className="text-xs text-emerald-600">저장됨</span>
          )}
          {isPending && (
            <span className="text-xs text-zinc-400">저장 중…</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-right text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {currency === "KRW"
          ? fmtKrw(Number(value.replace(/,/g, "")) || 0)
          : fmtRub(Number(value.replace(/,/g, "")) || 0)}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinAccountsTable({
  snapshots,
  yearMonth,
}: {
  snapshots: FinAccountSnapshot[];
  yearMonth: string;
}) {
  const map = buildMap(snapshots);

  const krwTotal = KR_ACCOUNT_KEYS.reduce(
    (s, a) => s + (map.get(a) ?? 0),
    0,
  );
  const rubTotal = RU_ACCOUNT_KEYS.reduce(
    (s, a) => s + (map.get(a) ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          한국 잔액 합계 {fmtKrw(krwTotal)}
        </span>
        <span className="rounded-lg bg-blue-50 px-4 py-2 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          러시아 잔액 합계 {fmtRub(rubTotal)}
        </span>
      </div>

      {/* Korean accounts */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <div className="bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          한국 계좌 (KRW)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-400 dark:bg-zinc-800">
            <tr>
              <th className="py-2 pl-4 pr-3 text-left">계좌</th>
              <th className="px-3 py-2 text-left">통화</th>
              <th className="px-3 py-2 text-left">잔액 입력</th>
              <th className="px-3 py-2 text-right">표시</th>
            </tr>
          </thead>
          <tbody>
            {KR_ACCOUNT_KEYS.map((a) => (
              <AccountRow
                key={a}
                account={a}
                currency="KRW"
                label={ACCOUNT_LABELS[a] ?? a}
                balance={map.get(a) ?? 0}
                yearMonth={yearMonth}
              />
            ))}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-800">
            <tr>
              <td colSpan={3} className="py-2 pl-4 pr-3 text-right text-zinc-500">
                합계
              </td>
              <td className="px-3 py-2 text-right text-emerald-600">
                {fmtKrw(krwTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Russian accounts */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <div className="bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          러시아 계좌 (RUB)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-400 dark:bg-zinc-800">
            <tr>
              <th className="py-2 pl-4 pr-3 text-left">계좌</th>
              <th className="px-3 py-2 text-left">통화</th>
              <th className="px-3 py-2 text-left">잔액 입력</th>
              <th className="px-3 py-2 text-right">표시</th>
            </tr>
          </thead>
          <tbody>
            {RU_ACCOUNT_KEYS.map((a) => (
              <AccountRow
                key={a}
                account={a}
                currency="RUB"
                label={ACCOUNT_LABELS[a] ?? a}
                balance={map.get(a) ?? 0}
                yearMonth={yearMonth}
              />
            ))}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-800">
            <tr>
              <td colSpan={3} className="py-2 pl-4 pr-3 text-right text-zinc-500">
                합계
              </td>
              <td className="px-3 py-2 text-right text-blue-600">
                {fmtRub(rubTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
