import { signOut } from "@/lib/actions/auth";
import Link from "next/link";

export function CrmShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/orders" className="text-emerald-700 dark:text-emerald-400">
              FANKO CRM
            </Link>
            <Link
              href="/orders"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              주문 목록
            </Link>
            <Link
              href="/orders/new"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              주문 추가
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="hidden max-w-[200px] truncate sm:inline">{email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-200 px-3 py-1.5 font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
