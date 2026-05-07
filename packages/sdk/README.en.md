# @open-session/sdk

Browser SDK for Open Session.

It records a short slice of browser context before an error and emits an
encrypted `osr1:` payload through your transport callback. It never sends data
anywhere on its own.

Korean: [`README.md`](./README.md)

Service README: [`../../README.en.md`](../../README.en.md)

## Install

```bash
pnpm add @open-session/sdk
```

## Basic usage

Call `initOpenSession()` once from client-side code. Use `captureError()` and
`flushOpenSession()` when an error happens.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});

captureError(error, { componentStack: info.componentStack });
const result = await flushOpenSession("error-boundary");

if (result.ok) {
  console.log(result.payload);
}
```

You usually do not need to store the returned client. `initOpenSession()` sets
the active client, and the top-level helpers use it.

## Recommended starting point

```ts
import { initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",

  maxEvents: 200,
  maxApproxBytes: 500_000,
  sampleRate: 1,
  compressionLevel: 6,
  keydownCoalesceWindowMs: 350,

  additionalQueryKeys: ["invite", "coupon", "paymentToken"],
  maskSelectors: ["[data-replay-mask]"],
  excludeSelectors: ["[data-replay-exclude]"],
  excludeUrls: [/\/health$/, /\/metrics$/],
  consoleLevels: ["warn", "error"],
  networkStatusFilter: (status) => status === undefined || status >= 400,
  debug: true,

  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
  beforeSend(session) {
    return session.stats.eventCount > 0 ? session : null;
  },
});
```

A few things to know:

- `passphrase` is required. Payloads are encrypted by default.
- `maxApproxBytes` is a pre-compression memory budget, not the final payload size.
- When the buffer is full, the SDK keeps errors, failed network calls, warn/error
  logs, and user actions longer than low-value events.
- Password input values are not collected.
- Use `consoleLevels` to reduce console capture to the levels you need, such as warn/error.
- Use `sampleRate` for session-level sampling and `networkStatusFilter` to keep payloads focused on failed APIs.
- In development, pass `debug: true` or a logger object to see init/flush failure reasons in the console.
- `beforeSend` is the last safety gate before encryption and transport; return a smaller session or `null` to cancel sending.

## Next.js pattern

Keep the SDK setup in one client-side module.

```ts
"use client";

import { captureError, type FlushResult, flushOpenSession, initOpenSession } from "@open-session/sdk";

let initialized = false;

export function initOpenReporter(): void {
  if (initialized) return;

  initOpenSession({
    appId: "checkout-web",
    passphrase: "user-controlled-secret",
    maxEvents: 200,
    maxApproxBytes: 500_000,
    compressionLevel: 6,
    additionalQueryKeys: ["paymentToken"],
    maskSelectors: ["[data-replay-mask]"],
    excludeSelectors: ["[data-replay-exclude]"],
    transport(payload) {
      console.log("OPEN_SESSION_PAYLOAD", payload);
    },
  });

  initialized = true;
}

export function captureReportedError(error: unknown, componentStack?: string): void {
  initOpenReporter();
  captureError(error, componentStack ? { componentStack } : undefined);
}

export function flushOpenReport(reason = "manual-report"): Promise<FlushResult> {
  initOpenReporter();
  return flushOpenSession(reason);
}
```

Then initialize it once from a client component.

```tsx
"use client";

import { useEffect } from "react";
import { initOpenReporter } from "./replay";

export function OpenBootstrap() {
  useEffect(() => {
    initOpenReporter();
  }, []);

  return null;
}
```

## Error Boundary

```tsx
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { captureReportedError, flushOpenReport } from "./replay";

export class OpenErrorBoundary extends Component<{ children: ReactNode }> {
  componentDidCatch(error: Error, info: ErrorInfo) {
    captureReportedError(error, info.componentStack);
    void flushOpenReport("error-boundary");
  }

  render() {
    return this.props.children;
  }
}
```

`componentStack` is optional. The SDK is not React-only.

## Transport

The SDK calls your `transport(payload)` callback. For local testing, console output is enough.

```ts
transport(payload) {
  console.log("OPEN_SESSION_PAYLOAD", payload);
}
```

In production, send the payload to your own server.

```ts
transport(payload) {
  return fetch("/api/replay-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });
}
```

Do not put Slack, OpenSearch, S3, or R2 credentials in browser code. Forward the payload from your server instead.

## Capture-scope options

`capture` is an opt-out setting for event categories by team. Unspecified categories stay enabled by default.
It controls automatic collection only, so events added through `captureError()` or `client.addEvent()`, plus `init`/`flush` lifecycle markers, are still retained.

```ts
initOpenSession({
  passphrase,
  capture: {
    clicks: true,
    keydown: true,
    navigation: true,
    network: true,
    console: true,
    errors: true,
  },
  consoleLevels: ["warn", "error"],
});
```

- `capture.navigation: false` disables History API, back/forward, and hash route capture.
- `capture.network: false` disables fetch/XHR metadata capture.
- `capture.console: false` disables console log capture.
- `consoleLevels` limits which console levels are captured when `capture.console` is enabled.
- `sampleRate: 0.1` keeps roughly 10% of sessions. `0` drops all sessions and `1` keeps all sessions.
- `networkStatusFilter: (status) => status === undefined || status >= 400` keeps only failed/exception network events.
- `debug: true` enables SDK diagnostics. Payloads, passphrases, and raw sessions are not written to the log.

For sensitive surfaces, do not rely on `capture` alone. Pair it with `excludeSelectors`, `excludeUrls`, and `excludeConsole`.

## Final pre-transport filter

`beforeSend` runs immediately before payload encryption and `transport`. Return a session to send that session, or return `null`/`undefined` to skip payload creation for this flush.

```ts
initOpenSession({
  passphrase,
  transport,
  beforeSend(session) {
    const hasIncidentSignal = session.errors.length > 0 || session.events.some((event) => event.kind === "network" && event.ok === false);
    if (!hasIncidentSignal) return null;

    return {
      ...session,
      metadata: {
        ...session.metadata,
        userId: undefined,
      },
    };
  },
});
```

## Worker flush

Capture runs on the main thread. Worker mode only moves flush-time work: compacting, compressing, encrypting, and building the envelope.

```ts
initOpenSession({
  passphrase,
  transport,
  processing: "auto",
  createFlushWorker: () =>
    new Worker(new URL("@open-session/sdk/flush-worker", import.meta.url), {
      type: "module",
    }),
});
```

- `main-thread`: no worker, most compatible.
- `auto`: try the worker, then fall back to main thread.
- `worker`: require the worker and fail flush if it fails.

## Decode a payload

Use this when you build your own viewer or analysis tool.

```ts
import { decodeReplayPayload } from "@open-session/sdk";

const decoded = await decodeReplayPayload("osr1:...", "user-controlled-secret");

console.log(decoded.envelope);
console.log(decoded.session.events);
console.log(decoded.session.errors);
```

The SDK re-exports public replay types such as `ReplaySession`, `ReplayEvent`, and `DecodedReplayPayload`.

## Safety behavior

- SSR import and init do not install DOM, `fetch`, or `console` capture.
- Capture failures are swallowed.
- Worker, transport, compression, and encryption failures resolve as `{ ok: false, error }` from flush.
- Circular console objects are bounded and sanitized.
- Non-serializable manual events become bounded truncate markers instead of crashing the host app.

## More docs

- Korean SDK guide: [`../../docs/usage-guide.md`](../../docs/usage-guide.md)
- English SDK guide: [`../../docs/usage-guide.en.md`](../../docs/usage-guide.en.md)
- Privacy model: [`../../docs/privacy.en.md`](../../docs/privacy.en.md)
- Data collection inventory: [`../../docs/data-collection.en.md`](../../docs/data-collection.en.md)
- Performance budget: [`../../docs/performance-budget.en.md`](../../docs/performance-budget.en.md)

## License

MIT. The package tarball includes `LICENSE`.
