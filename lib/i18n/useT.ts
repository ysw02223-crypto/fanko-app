"use client";

import { useLanguage } from "./context";
import type { TranslationDict } from "./types";

export function useT(): TranslationDict {
  return useLanguage().t;
}
