# Open Session SDK usage guide

Korean: [`usage-guide.md`](./usage-guide.md)

Open Session captures a short browser history before an error and turns it into
an encrypted `osr1:` payload. It records user actions, route changes, network calls, console
logs, and errors so you can inspect what happened without running a hosted replay
service.

The SDK does not provide a server. It collects, compresses, encrypts, and calls
your `transport` callback. Your app decides where that payload goes.

## Install

```bash
pnpm add @open-session/sdk
```

## Basic flow

1. Call `initOpenSession()` once from client-side app code.
2. The SDK keeps click, keydown, navigation, network, console, and error events in memory.
3. Call `captureError()` when an error happens.
4. Call `flushOpenSession()` when you need a payload.
5. The SDK calls `transport(payload)`.
6. Decode the payload in the viewer or in your own tool with the same passphrase.

## Minimal example

```ts
import { initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});
```

`passphrase` is required because payloads are encrypted by default. Encryption uses Web Crypto first, then a JS fallback when `crypto.subtle` is unavailable, such as on hosts-based HTTP development domains. `crypto.getRandomValues` is still required for salt/iv generation.

## Recommended starting setup

Start with this shape, then tune it after you have seen a few real payloads from
your app.

```ts
import { initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",

  maxEvents: 200,
  maxApproxBytes: 500_000,
  compressionLevel: 6,
  keydownCoalesceWindowMs: 350,

  additionalQueryKeys: ["invite", "coupon", "paymentToken"],
  maskSelectors: ["[data-replay-mask]"],
  excludeSelectors: ["[data-replay-exclude]"],
  excludeUrls: [/\/health$/, /\/metrics$/],
  debug: true,

  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});
```

A few details matter:

- `maxApproxBytes` is a pre-compression memory budget. It is not the final `osr1:` string size.
- When the buffer is full, the SDK does not drop events with plain FIFO. It keeps errors, failed network calls, warn/error console logs, and user actions longer than low-value noise.
- Password input values are not collected. Sensitive URLs, selectors, console values, and stacks are masked or truncated before encoding.
- If flush does not work in development, use `debug: true` to check whether `crypto.subtle` fallback was used or `getRandomValues` is missing.

## Sentry-style usage

`initOpenSession()` sets the active client. Most application code can use the top-level helpers instead of storing the returned client.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});

captureError(error, {
  componentStack: info.componentStack,
});

const result = await flushOpenSession("error-boundary");

if (result.ok) {
  console.log(result.payload);
}
```

## Next.js pattern

Keep the SDK wiring in one client-side module. Components can call small wrapper functions without knowing how the SDK is initialized.

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

Call `initOpenReporter()` once from a client component.

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

## Error Boundary example

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

`componentStack` is optional. The SDK is not React-only. If another framework can pass useful UI stack text, pass it. Otherwise omit it.

## Where transport should send payloads

For local testing, console output is enough.

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

From that server route, you can forward payloads to Slack webhooks, OpenSearch, S3, R2, or any other storage you control. Do not put those credentials in the browser.

## Worker flush

Capture runs on the main thread. The worker option only moves flush-time work:

- session cleanup
- compact encoding
- Brotli compression
- encryption
- `osr1:` envelope creation

The default is `main-thread` because it works with more bundlers and CSP setups. If payloads are large or flush causes UI pauses, use `auto` after testing it in your app.

```ts
initOpenSession({
  passphrase: "user-controlled-secret",
  transport,
  processing: "auto",
  createFlushWorker: () =>
    new Worker(new URL("@open-session/sdk/flush-worker", import.meta.url), {
      type: "module",
    }),
});
```

| Value | Behavior |
| --- | --- |
| `main-thread` | Does not use a worker. Most compatible. |
| `auto` | Tries the worker and falls back to main thread if it fails. |
| `worker` | Requires the worker. Flush fails if the worker fails. |

## Main options

| Option | Suggested start | Meaning |
| --- | --- | --- |
| `appId` | app name | Label shown in the viewer |
| `passphrase` | managed by your app | Key for payload encryption/decryption |
| `transport` | console or server API | Callback that receives the payload |
| `sampleRate` | `1` | Session-level sampling. `0` drops all sessions and `1` keeps all sessions. |
| `maxEvents` | `200` | Maximum retained events. SDK default is `250`. |
| `maxApproxBytes` | `500_000` | Pre-compression buffer budget. SDK default is `750_000`. |
| `compressionLevel` | `6` | Compression level. Lower it for CPU, raise it for size. |
| `keydownCoalesceWindowMs` | `350` | Keydown coalescing window |
| `additionalQueryKeys` | app-specific | Extra query keys to redact |
| `maskSelectors` | `[data-replay-mask]` | Keep the event but mask its DOM target |
| `excludeSelectors` | `[data-replay-exclude]` | Drop events from matching DOM areas |
| `excludeUrls` | app-specific | Drop matching network events |
| `networkStatusFilter` | failed APIs only | Keep/drop redacted network events by status |
| `excludeConsole` | app-specific | Drop matching console messages |
| `consoleLevels` | `["warn", "error"]` | Limit console capture to the levels you need |
| `capture.*` | all `true` | Toggle event categories with the capture-scope options below. |
| `beforeSend` | app policy | Modify or drop the session immediately before encryption/transport |
| `processing` | default `main-thread`, production `auto` | Where flush work runs |

### Capture-scope options

`capture` is a category-level opt-out. Unspecified categories stay enabled by default.
It controls automatic collection only. Events added through `captureError()` or `client.addEvent()`, plus `init`/`flush` lifecycle markers, are still retained.

| Option | Default | Captures |
| --- | --- | --- |
| `capture.clicks` | `true` | Click DOM targets and button metadata |
| `capture.keydown` | `true` | Input occurrence and masked keydown metadata |
| `capture.navigation` | `true` | History API, back/forward, and hash route changes |
| `capture.network` | `true` | fetch/XHR request metadata and failure details |
| `capture.console` | `true` | console log/info/warn/error/debug metadata |
| `capture.errors` | `true` | window errors and unhandled rejections |

`consoleLevels` applies when `capture.console` is enabled. For example, `["warn", "error"]` leaves `console.log`/`console.info` behavior unchanged but does not retain those calls in replay data.

`networkStatusFilter` runs after URL redaction and before the event is stored in the buffer. Start with this when you only want failed APIs:

```ts
initOpenSession({
  passphrase,
  transport,
  networkStatusFilter(status) {
    return status === undefined || status >= 400;
  },
});
```

`sampleRate` is decided once at init time for the whole session. A sampled-out session keeps no automatic events, manual `addEvent()` calls, `captureError()` calls, or flush payloads.

### Final pre-transport filter

`beforeSend(session)` runs immediately before encryption and `transport`. The returned session is encoded into the payload; returning `null`/`undefined` skips payload creation for that flush. Use it to remove sensitive metadata one last time or to drop flushes that do not contain failure signals.

```ts
initOpenSession({
  passphrase,
  transport,
  beforeSend(session) {
    const hasFailure = session.errors.length > 0 || session.events.some((event) => event.kind === "network" && event.ok === false);
    if (!hasFailure) return null;

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

### Privacy and payload limit options

These options do not expand collection. They reduce or truncate what is kept in the payload.

| Option | Default | Meaning |
| --- | --- | --- |
| `excludeUrls` | none | Drop network URL events matching a string or regular expression. |
| `excludeConsole` | none | Drop console events matching a string or regular expression. |
| `maxSanitizedStringLength` | `500` | Truncate console/error strings after this length. |
| `maxConsoleArgs` | `10` | Maximum retained args per console call |
| `maxConsoleObjectKeys` | `30` | Maximum retained keys per console object |
| `maxConsoleArrayEntries` | `20` | Maximum retained entries per console array |
| `maxErrorStackLength` | `500` | Maximum error stack length |
| `maxComponentStackLength` | `500` | Maximum React component stack length |

For production, prefer “collect less and truncate safely.” For checkout, auth, healthcare, or admin surfaces, start with `excludeSelectors`, `excludeUrls`, and `excludeConsole`, then enable only the categories the team needs.

## Open in the viewer

1. Start the viewer.

   ```bash
   pnpm --filter @open-session/viewer dev
   ```

2. Copy the generated `osr1:...` payload from your app.
3. Paste it into the viewer.
4. Enter the same passphrase used by the SDK.
5. Click `Open viewer`.

The viewer also accepts a passphrase query string.

```text
http://localhost:3101?passphrase=demo-passphrase
```

## Decode from code

Use `decodeReplayPayload()` when you build your own viewer or analysis tool.

```ts
import { decodeReplayPayload } from "@open-session/sdk";

const decoded = await decodeReplayPayload("osr1:...", "user-controlled-secret");

console.log(decoded.envelope);
console.log(decoded.session.events);
console.log(decoded.session.errors);
```

## Before production

- Do not hardcode the passphrase in source code.
- Send production payloads through a server API.
- Do not expose Slack/OpenSearch/S3 credentials in the browser.
- Add your own `additionalQueryKeys`, `maskSelectors`, and `excludeSelectors`.
- Tune `maxEvents`, `maxApproxBytes`, and `compressionLevel` after checking real payloads.
- Call `captureError()` and `flushOpenSession()` from your error path.
- Decode a real payload in the viewer before you ship.
- If you use `processing: "auto"`, test worker and CSP behavior in target browsers.

## Related docs

- [`privacy.en.md`](./privacy.en.md): what is collected, masked, or dropped
- [`payload-format.en.md`](./payload-format.en.md): `osr1:` payload structure
- [`payload-size.en.md`](./payload-size.en.md): payload size and compression strategy
- [`performance-budget.en.md`](./performance-budget.en.md): memory and performance budget
