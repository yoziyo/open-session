"use client";

import { SampleLanguageSelect, useSampleI18n } from "../lib/i18n";
import { DemoControls } from "./DemoControls";
import { LocalizedErrorBoundary } from "./ErrorBoundary";

export function SamplePageContent() {
  const { t } = useSampleI18n();

  return (
    <main className="commerce-shell">
      <div className="checkout-page-card">
        <nav className="topbar" aria-label={t("nav.aria")}>
          <div className="brand-lockup">
            <span className="brand-mark">R</span>
            <span>
              <strong>{t("nav.title")}</strong>
              <small>{t("nav.subtitle")}</small>
            </span>
          </div>
          <SampleLanguageSelect />
        </nav>

        <section className="hero-panel">
          <div>
            <p className="eyebrow">{t("hero.eyebrow")}</p>
            <h1>{t("hero.title")}</h1>
            <p className="hero-copy">{t("hero.copy")}</p>
          </div>
        </section>

        <LocalizedErrorBoundary>
          <DemoControls />
        </LocalizedErrorBoundary>
      </div>
    </main>
  );
}
