"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./resources/en.json";
import ko from "./resources/ko.json";

export type SampleLocale = "ko" | "en";
type Resource = typeof ko;
type Primitive = string | number | boolean | null;
type NestedKey<T> = {
  [K in keyof T & string]: T[K] extends Primitive ? K : `${K}.${NestedKey<T[K]>}`;
}[keyof T & string];

export type SampleTranslationKey = NestedKey<Resource>;
export type SampleTranslationValues = Record<string, string | number>;

const resources: Record<SampleLocale, Resource> = { ko, en };
const supportedLocales: SampleLocale[] = ["ko", "en"];
const STORAGE_KEY = "open-sample-locale";
const QUERY_KEY = "lang";

function normalizeLocale(value: string | null | undefined): SampleLocale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("en")) return "en";
  return null;
}

function detectBrowserLocale(): SampleLocale {
  if (typeof navigator === "undefined") return "ko";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.map(normalizeLocale).find((locale): locale is SampleLocale => locale !== null) ?? "ko";
}

function resolveInitialLocale(): SampleLocale {
  if (typeof window === "undefined") return "ko";
  const queryLocale = normalizeLocale(new URLSearchParams(window.location.search).get(QUERY_KEY));
  if (queryLocale) return queryLocale;
  const storedLocale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  if (storedLocale) return storedLocale;
  return detectBrowserLocale();
}

function readResource(locale: SampleLocale, key: SampleTranslationKey): string {
  const value = key.split(".").reduce<unknown>((cursor, segment) => {
    if (cursor && typeof cursor === "object" && segment in cursor) return (cursor as Record<string, unknown>)[segment];
    return undefined;
  }, resources[locale]);

  if (typeof value === "string") return value;
  if (locale !== "ko") return readResource("ko", key);
  return key;
}

function interpolate(template: string, values: SampleTranslationValues = {}) {
  return template.replace(/\{\{(\w+)\}\}/gu, (match, name: string) => (values[name] === undefined ? match : String(values[name])));
}

type SampleI18nContextValue = {
  locale: SampleLocale;
  locales: SampleLocale[];
  setLocale: (locale: SampleLocale) => void;
  t: (key: SampleTranslationKey, values?: SampleTranslationValues) => string;
};

const SampleI18nContext = createContext<SampleI18nContextValue | null>(null);

export function SampleI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SampleLocale>("ko");

  useEffect(() => {
    setLocaleState(resolveInitialLocale());
  }, []);

  const setLocale = useCallback((nextLocale: SampleLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<SampleI18nContextValue>(
    () => ({
      locale,
      locales: supportedLocales,
      setLocale,
      t: (key, values) => interpolate(readResource(locale, key), values),
    }),
    [locale, setLocale],
  );

  return <SampleI18nContext.Provider value={value}>{children}</SampleI18nContext.Provider>;
}

export function useSampleI18n() {
  const context = useContext(SampleI18nContext);
  if (!context) throw new Error("useSampleI18n must be used inside SampleI18nProvider");
  return context;
}

export function SampleLanguageSelect({ className = "" }: { className?: string }) {
  const { locale, locales, setLocale, t } = useSampleI18n();
  return (
    <label className={`language-select ${className}`}>
      <select value={locale} onChange={(event) => setLocale(event.target.value as SampleLocale)} aria-label={t("language.label")}>
        {locales.map((option) => (
          <option key={option} value={option}>
            {t(`language.${option}` as SampleTranslationKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
