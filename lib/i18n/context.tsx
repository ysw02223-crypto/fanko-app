"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Locale, TranslationDict } from "./types";
import { ko } from "./ko";
import { en } from "./en";
import { ru } from "./ru";

const DICTIONARIES: Record<Locale, TranslationDict> = { ko, en, ru };
const STORAGE_KEY = "fanko_locale";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TranslationDict;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "ko",
  setLocale: () => {},
  t: ko,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && saved in DICTIONARIES) {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: DICTIONARIES[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
