import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./resources/en.json";
import ko from "./resources/ko.json";

export type Locale = "ko" | "en";
type Resource = typeof ko;
type Primitive = string | number | boolean | null;
type NestedKey<T> = {
  [K in keyof T & string]: T[K] extends Primitive ? K : `${K}.${NestedKey<T[K]>}`;
}[keyof T & string];

export type TranslationKey = NestedKey<Resource>;
export type TranslationValues = Record<string, string | number>;

const resources: Record<Locale, Resource> = { ko, en };
const supportedLocales: Locale[] = ["ko", "en"];
const STORAGE_KEY = "open-viewer-locale";
const QUERY_KEY = "lang";

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("en")) return "en";
  return null;
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "ko";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.map(normalizeLocale).find((locale): locale is Locale => locale !== null) ?? "ko";
}

function initialLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const queryLocale = normalizeLocale(new URLSearchParams(window.location.search).get(QUERY_KEY));
  if (queryLocale) return queryLocale;
  const storedLocale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  if (storedLocale) return storedLocale;
  return detectBrowserLocale();
}

function readResource(locale: Locale, key: TranslationKey): string {
  const value = key.split(".").reduce<unknown>((cursor, segment) => {
    if (cursor && typeof cursor === "object" && segment in cursor) return (cursor as Record<string, unknown>)[segment];
    return undefined;
  }, resources[locale]);

  if (typeof value === "string") return value;
  if (locale !== "ko") return readResource("ko", key);
  return key;
}

function interpolate(template: string, values: TranslationValues = {}) {
  return template.replace(/\{\{(\w+)\}\}/gu, (match, name: string) => (values[name] === undefined ? match : String(values[name])));
}

type I18nContextValue = {
  locale: Locale;
  locales: Locale[];
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales: supportedLocales,
      setLocale,
      t: (key, values) => interpolate(readResource(locale, key), values),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function LanguageSelect({ className = "" }: { className?: string }) {
  const { locale, locales, setLocale, t } = useI18n();
  return (
    <label className={`grid gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 ${className}`}>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="min-h-9 cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold normal-case tracking-normal text-slate-800 shadow-sm outline-none transition hover:border-indigo-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        aria-label={t("language.label")}
      >
        {locales.map((option) => (
          <option key={option} value={option}>
            {t(`language.${option}` as TranslationKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
