# Open Session technical guide

Korean: [`technical-guide.md`](./technical-guide.md)

Open Session consists of the SDK and Viewer. The SDK packages browser events before an error into an `osr1:` payload. The Viewer opens that payload. It is not a screen recorder, and the SDK stores only the metadata needed for error analysis.

## Packages

| Package | Role |
| --- | --- |
| `@open-session/sdk` | Browser event capture, redaction, buffer, flush |
| `@open-session/protocol` | Replay schema, compact format, compression, encryption |
| `@open-session/viewer` | React app for opening payloads |
| `@open-session/sample-next` | Next.js sample app |

## Data flow

1. The app calls `initOpenSession()`.
2. The SDK stores selected events in an in-memory buffer.
3. The app calls `captureError()` and `flushOpenSession()` from an error path.
4. The SDK converts the replay session into compact format.
5. The SDK compresses the payload and encrypts it with the passphrase. It uses Web Crypto first; when `crypto.subtle` is unavailable, it uses a JS fallback.
6. The app handles the payload in the `transport` callback.
7. The Viewer decrypts the payload with the same passphrase.

## Captured events

| Event | Data | Default handling |
| --- | --- | --- |
| `navigation` | History API, popstate, hashchange | URL query redaction |
| `click` | DOM target descriptor, mouse button | masked/excluded selectors |
| `keydown` | input activity, non-sensitive key metadata | no password/sensitive input values |
| `network` | method, URL, status, duration, error | no headers or bodies |
| `console` | level, sanitized args | sensitive string/object redaction |
| `error` | message, stack, component stack | string redaction, length limits |
| `lifecycle` | init, flush, shutdown marker | SDK marker |

## Basic example

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    return fetch("/api/open-session-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
  },
});

captureError(error, { componentStack: info.componentStack });
await flushOpenSession("error-boundary");
```

## Production options

```ts
initOpenSession({
  appId: "checkout-web",
  passphrase,
  maxEvents: 200,
  maxApproxBytes: 500_000,
  sampleRate: 0.25,
  compressionLevel: 6,
  processing: "auto",
  createFlushWorker: () =>
    new Worker(new URL("@open-session/sdk/flush-worker", import.meta.url), {
      type: "module",
    }),
  capture: {
    clicks: true,
    keydown: true,
    navigation: true,
    network: true,
    console: true,
    errors: true,
  },
  consoleLevels: ["warn", "error"],
  networkStatusFilter: (status) => status === undefined || status >= 400,
  maskSelectors: ["[data-replay-mask]"],
  excludeSelectors: ["[data-replay-exclude]"],
  excludeUrls: [/\/health$/, /\/metrics$/],
  excludeConsole: [/ResizeObserver loop/],
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
  transport(payload) {
    return fetch("/api/open-session-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
  },
});
```

## Option notes

| Option | Notes |
| --- | --- |
| `capture.*` | Toggles automatic capture categories. Manual `addEvent()` and `captureError()` are separate. |
| `consoleLevels` | Reduces console noise. `["warn", "error"]` is a common starting point. |
| `networkStatusFilter` | Filters network events before they enter the buffer. Use it to keep failed APIs only. |
| `sampleRate` | Session-level sampling. `0.1` keeps about 10% of sessions. |
| `beforeSend` | Final filter before encryption. Return a modified session or `null` to discard it. |
| `maxEvents` | Maximum event count. When the buffer is full, lower-priority events are dropped first. |
| `maxApproxBytes` | Pre-compression buffer budget. It is not the final payload size. |
| `processing` | Flush execution mode. Supports `main-thread`, `auto`, and `worker`. |
| `debug` | Enables init/capture/flush diagnostics. Payloads, passphrases, and raw sessions are not logged. |

## Internal limits

These values are SDK internal defaults that keep payloads from growing without bound. They are not directly configurable through public `initOpenSession()` options.

| Item | Internal default | Meaning |
| --- | --- | --- |
| keydown coalescing window | `1000ms` | Coalesces repeated keydown events on the same target. |
| console argument count | `10` | Maximum retained args per console call. |
| console object key count | `30` | Maximum retained keys per object. |
| console array entry count | `20` | Maximum retained entries per array. |
| error stack length | `500` | Truncation budget for error stack strings. |
| component stack length | `500` | Truncation budget for React component stack strings. |
| worker flush timeout | `5000ms` | Wait time for worker flush responses. |

The public limit options are `maxEvents`, `maxApproxBytes`, and `maxSanitizedStringLength`.

## Crypto runtime

- When `crypto.subtle` is available, the SDK uses Web Crypto.
- When `crypto.subtle` is unavailable, such as on HTTP development domains mapped through the hosts file, the SDK uses a JS fallback.
- If `crypto.getRandomValues` is unavailable, flush fails because the SDK cannot create a safe salt/iv. Use `debug: true` during development to see the reason.

## Privacy handling

The SDK does not store these values by default:

- password input values
- request/response bodies
- network header values such as Authorization and Cookie
- sensitive query values

Additional controls:

- `additionalQueryKeys` adds query keys to redact.
- `maskSelectors` masks DOM target descriptors.
- `excludeSelectors` drops DOM events from selected regions.
- `excludeUrls` drops network events.
- `excludeConsole` drops console events.
- `maxSanitizedStringLength` limits large strings. Console argument count, object key count, and stack length are limited by SDK internal defaults.

## Viewer workflow

1. Check Error summary for the error and capture window.
2. Check Error flow for route changes, user actions, failed APIs, and errors.
3. Use Network for failed requests and duration.
4. Use Console for warn/error logs.
5. Use Privacy to verify redaction.
6. Use Payload Info for envelope metadata.

## Before release

- Open a real payload in the Viewer.
- Apply `maskSelectors` or `excludeSelectors` to sensitive screens.
- Decide server transport authentication, retention, and access control.
- Run `pnpm release:verify`.
- Check package version, changelog, license, and repository metadata before npm publish.

## Related docs

- SDK usage guide: [`usage-guide.en.md`](./usage-guide.en.md)
- Privacy model: [`privacy.en.md`](./privacy.en.md)
- Payload format: [`payload-format.en.md`](./payload-format.en.md)
- Performance budget: [`performance-budget.en.md`](./performance-budget.en.md)
