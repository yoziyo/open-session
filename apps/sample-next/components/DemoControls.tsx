"use client";

import { useEffect, useMemo, useState } from "react";
import { type SampleTranslationKey, useSampleI18n } from "../lib/i18n";
import { initSampleReplay } from "../lib/replay";

const sampleBasePath = process.env.NEXT_PUBLIC_OPEN_SESSION_SAMPLE_BASE_PATH ?? "";

function sampleAssetPath(path: string) {
  return `${sampleBasePath}${path}`;
}

const basket = [
  { nameKey: "order.items.item1Name", noteKey: "order.items.item1Note", price: 17900 },
  { nameKey: "order.items.item2Name", noteKey: "order.items.item2Note", price: 3980 },
  { nameKey: "order.items.item3Name", noteKey: "order.items.item3Note", price: 12900 },
] satisfies Array<{ nameKey: SampleTranslationKey; noteKey: SampleTranslationKey; price: number }>;

type StatusKey = "preparing" | "initialized" | "approving" | "approved";

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

function Exploder({ active, message }: { active: boolean; message: string }) {
  if (active) {
    throw new Error(message);
  }
  return null;
}

export function DemoControls() {
  const { locale, t } = useSampleI18n();
  const [explode, setExplode] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [coupon, setCoupon] = useState(() => t("payment.defaultCoupon"));
  const [status, setStatus] = useState<StatusKey>("preparing");

  const subtotal = useMemo(() => basket.reduce((sum, item) => sum + item.price, 0), []);
  const discount = coupon ? 5000 : 0;
  const deliveryFee = 0;
  const total = subtotal - discount + deliveryFee;

  useEffect(() => {
    setCoupon((currentCoupon) => {
      const previousDefault = locale === "ko" ? "WELCOME5000" : "첫구매5000";
      return currentCoupon === previousDefault ? t("payment.defaultCoupon") : currentCoupon;
    });
  }, [locale, t]);

  const handlePayment = async () => {
    await callApi();
    console.log(t("console.paymentAttempt"), {
      total,
      safe: true,
    });
    setExplode(true);
  };

  useEffect(() => {
    initSampleReplay();
    console.info(t("console.initialized"), {
      surface: "sample-next-payment",
    });
    setStatus("initialized");
  }, [t]);

  async function callApi() {
    setStatus("approving");
    console.warn(t("console.preApprovalWarning"));
    const response = await fetch(
      sampleAssetPath("/api/ping.json?token=e2e-super-secret-token&email=person@example.test&invite=VIP-042&safe=visible"),
    );
    const result = await response.json();
    console.log(t("console.preApprovalDone"), {
      orderId: result.orderId,
      provider: result.provider,
      safe: true,
    });
    setStatus("approved");
  }

  return (
    <div className="checkout-grid">
      <Exploder active={explode} message={t("incident.message")} />

      <section className="panel order-panel" aria-label={t("order.aria")}>
        <div className="section-heading">
          <p className="eyebrow">{t("order.eyebrow")}</p>
          <h2>{t("order.title")}</h2>
        </div>
        <div className="basket-list">
          {basket.map((item, index) => (
            <div className="basket-item" key={item.nameKey}>
              <span className="item-thumb" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="basket-copy">
                <strong>{t(item.nameKey)}</strong>
                <p>{t(item.noteKey)}</p>
              </div>
              <b className="basket-price">{formatCurrency(item.price, locale)}</b>
            </div>
          ))}
        </div>
        <dl className="price-summary">
          <div>
            <dt>{t("order.subtotal")}</dt>
            <dd>{formatCurrency(subtotal, locale)}</dd>
          </div>
          <div>
            <dt>{t("order.discount")}</dt>
            <dd>-{formatCurrency(discount, locale)}</dd>
          </div>
          <div>
            <dt>{t("order.deliveryFee")}</dt>
            <dd>{deliveryFee ? formatCurrency(deliveryFee, locale) : t("order.freeDelivery")}</dd>
          </div>
          <div className="total-row">
            <dt>{t("order.total")}</dt>
            <dd>{formatCurrency(total, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel payment-panel" aria-label={t("payment.aria")}>
        <div className="section-heading">
          <p className="eyebrow">{t("payment.eyebrow")}</p>
          <h2>{t("payment.title")}</h2>
          <p>
            {t("payment.descriptionLine1")}
            <br />
            {t("payment.descriptionLine2")}
          </p>
        </div>

        <div className="form-stack">
          <label>
            {t("payment.recipientLabel")}
            <input
              id="safe-name"
              data-testid="safe-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("payment.recipientPlaceholder")}
            />
          </label>
          <label>
            {t("payment.passwordLabel")}
            <input
              id="account-password"
              data-testid="account-password"
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("payment.passwordPlaceholder")}
            />
          </label>
          <label>
            {t("payment.deliveryNoteLabel")}
            <input
              id="delivery-note"
              className="input"
              value={deliveryNote}
              onChange={(event) => setDeliveryNote(event.target.value)}
              placeholder={t("payment.deliveryNotePlaceholder")}
            />
          </label>
          <label>
            {t("payment.couponLabel")}
            <input
              id="coupon-code"
              data-replay-mask
              className="input"
              value={coupon}
              onChange={(event) => setCoupon(event.target.value)}
              placeholder={t("payment.couponPlaceholder")}
            />
          </label>
        </div>

        <div className="action-row">
          <button
            className="button secondary"
            data-testid="console-log"
            type="button"
            onClick={() =>
              console.log(t("console.reviewedSummary"), {
                total,
                safe: true,
              })
            }
          >
            {t("payment.reviewLogButton")}
          </button>
          <button className="button secondary" data-testid="fetch-network" type="button" onClick={callApi}>
            {t("payment.approveApiButton")}
          </button>
          <button className="button danger" data-testid="trigger-react-error" type="button" onClick={() => void handlePayment()}>
            {t("payment.triggerErrorButton")}
          </button>
        </div>

        <div className="status-strip">
          <p>
            {t("payment.passphraseLabel")}: <strong>demo-passphrase</strong>
          </p>
          <p data-testid="sample-status">
            {t("payment.statusLabel")}: {t(`status.${status}` as SampleTranslationKey)}
          </p>
        </div>
      </section>
    </div>
  );
}
