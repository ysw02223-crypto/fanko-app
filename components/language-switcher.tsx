"use client";

import { useLanguage } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const LOCALES: Locale[] = ["ko", "en", "ru"];
const LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ru: "Рус",
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`rounded px-2 py-1 text-xs font-medium transition ${
            locale === l
              ? "bg-emerald-600 text-white"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
