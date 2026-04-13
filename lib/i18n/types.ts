export type Locale = "ko" | "en" | "ru";
export type TranslationDict = Record<keyof typeof import("./ko").ko, string>;
