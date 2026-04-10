import type { FinAccount } from "@/lib/schema";

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function accountCurrency(account: FinAccount): "KRW" | "RUB" {
  return account === "sber" || account === "tinkoff" || account === "receivable"
    ? "RUB"
    : "KRW";
}
