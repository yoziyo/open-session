"use client";

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useSampleI18n } from "../lib/i18n";
import { captureSampleError, flushSampleReplay, OPEN_PASSPHRASE } from "../lib/replay";

interface State {
  copyState?: "idle" | "copied" | "failed";
  error?: Error;
  payload?: string;
}

const configuredViewerUrl = process.env.NEXT_PUBLIC_OPEN_SESSION_VIEWER_URL;

function resolveViewerBaseUrl() {
  if (configuredViewerUrl) return configuredViewerUrl;
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) return "http://127.0.0.1:3101/";
  return "https://yoziyo.github.io/open-session/viewer/";
}

function viewerUrlWithPassphrase() {
  const baseUrl = typeof window === "undefined" ? "https://yoziyo.github.io/open-session/viewer/" : resolveViewerBaseUrl();
  const url = new URL(baseUrl, typeof window === "undefined" ? "https://yoziyo.github.io" : window.location.origin);
  url.searchParams.set("passphrase", OPEN_PASSPHRASE);
  return url.toString();
}

type ErrorBoundaryLabels = {
  aria: string;
  eyebrow: string;
  title: string;
  descriptionBeforeCode: string;
  descriptionAfterCode: string;
  payloadEyebrow: string;
  payloadReady: string;
  payloadAria: string;
  copyPayload: string;
  copySuccess: string;
  openViewer: string;
  pending: string;
};

export class ErrorBoundary extends Component<{ children: ReactNode; labels: ErrorBoundaryLabels }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureSampleError(error, info.componentStack ?? undefined);
    void this.flushAndExposePayload();
  }

  async flushAndExposePayload() {
    const result = await flushSampleReplay("checkout-confirmation-crash");
    if (!result.ok || !result.payload) return;
    this.setState({ copyState: "idle", payload: result.payload });
  }

  async copyPayload() {
    if (!this.state.payload) return;
    try {
      await navigator.clipboard.writeText(this.state.payload);
      this.setState({ copyState: "copied" });
      alert(this.props.labels.copySuccess);
    } catch {
      this.setState({ copyState: "failed" });
    }
  }

  render() {
    const { labels } = this.props;
    if (this.state.error) {
      return (
        <section className="panel incident-panel" aria-label={labels.aria}>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h2>{labels.title}</h2>
          <p data-testid="captured-error-message">{this.state.error.message}</p>
          <p>
            {labels.descriptionBeforeCode} <code>OPEN_SESSION_PAYLOAD</code> {labels.descriptionAfterCode}
          </p>
          {this.state.payload ? (
            <div className="payload-alert" data-testid="payload-alert" role="alert">
              <div>
                <p className="eyebrow">{labels.payloadEyebrow}</p>
                <strong>{labels.payloadReady}</strong>
              </div>
              <textarea
                className="payload-textarea"
                data-testid="payload-textarea"
                readOnly
                value={this.state.payload}
                aria-label={labels.payloadAria}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="payload-actions">
                <button className="button" data-testid="copy-payload" type="button" onClick={() => void this.copyPayload()}>
                  {labels.copyPayload}
                </button>
                <a className="button secondary" data-testid="open-viewer" href={viewerUrlWithPassphrase()} target="_blank" rel="noreferrer">
                  {labels.openViewer}
                </a>
              </div>
            </div>
          ) : (
            <p className="payload-pending" data-testid="payload-pending">
              {labels.pending}
            </p>
          )}
        </section>
      );
    }
    return this.props.children;
  }
}

export function LocalizedErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useSampleI18n();
  return (
    <ErrorBoundary
      labels={{
        aria: t("incident.aria"),
        eyebrow: t("incident.eyebrow"),
        title: t("incident.title"),
        descriptionBeforeCode: t("incident.descriptionBeforeCode"),
        descriptionAfterCode: t("incident.descriptionAfterCode"),
        payloadEyebrow: t("incident.payloadEyebrow"),
        payloadReady: t("incident.payloadReady"),
        payloadAria: t("incident.payloadAria"),
        copyPayload: t("incident.copyPayload"),
        copySuccess: t("incident.copySuccess"),
        openViewer: t("incident.openViewer"),
        pending: t("incident.pending"),
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
