import { IncomeAddForm } from "@/components/income-add-form";
import Link from "next/link";

export default function FinanceIncomeNewPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/finance/income"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ← 목록
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">수입 추가</h1>
      </div>
      <IncomeAddForm />
    </div>
  );
}
