# Open Session

[`한국어`](./README.md) / [`English`](./README.en.md)

Open Session is a library that encrypts a short window of browser events before an error so the situation can be inspected later.

It does not record the screen. The SDK keeps only metadata in memory, such as clicks, input activity, route changes, network status, console logs, and errors. When the app calls `flushOpenSession()`, the SDK compacts, compresses, and encrypts the payload.

## Features

- See what happened before the user encountered an error.
- Use it to inspect browser errors more closely.
- Use it as a lightweight option when cost makes full SaaS collection difficult or forces heavy sampling elsewhere.
- Receive generated payloads through webhooks or other channels, then inspect them in the Viewer.
- Network headers/bodies and password values are not collected by default.

## How it works

1. Initialize `@open-session/sdk` in client-side app code.
2. The SDK keeps selected events in an in-memory buffer.
3. Call `flushOpenSession()` from an Error Boundary, global error handler, or manual report point.
4. The SDK compacts, compresses, and encrypts the replay session.
5. Open the payload in the Viewer with the same passphrase.

## SDK example

### Quick start

If the defaults are enough, pass only the required value and transport. Clicks, input activity, route changes, network, console, and error capture run by default.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  passphrase: "replace-with-user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});

captureError(error, { componentStack: info.componentStack });
void flushOpenSession("error-boundary");
```

### Detailed options

In production, add only the options you need. Values below are examples; omitted options use SDK defaults.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web", // app/service label
  sessionId: "checkout-session-id", // existing session ID
  userId: "internal-user-id", // non-sensitive identifier only
  passphrase: "replace-with-user-controlled-secret", // payload encryption key

  sampleRate: 0.25, // 0~1 session-level sampling
  maxEvents: 250, // max buffered events
  maxApproxBytes: 750_000, // pre-compression buffer size limit
  compressionLevel: 6, // 0~9 compression level
  keydownCoalesceWindowMs: 350, // repeated keydown coalescing window

  capture: {
    clicks: true, // capture click metadata
    keydown: true, // capture keydown activity without input values
    navigation: true, // capture History/hash route changes
    network: true, // capture fetch/XHR metadata
    console: true, // capture console metadata
    errors: true, // capture window errors/rejections
  },
  consoleLevels: ["warn", "error"], // console levels to capture
  networkStatusFilter: (status) => status === undefined || status >= 400, // keep failed APIs only

  additionalQueryKeys: ["paymentToken"], // extra query redaction keys
  maskSelectors: ["[data-private]"], // mask DOM text/value
  excludeSelectors: ["[data-never-record]"], // exclude matching DOM events
  excludeUrls: [/\/health$/, /\/metrics$/], // exclude matching URLs
  excludeConsole: [/secret/i], // exclude matching console content
  maxSanitizedStringLength: 500, // long string truncate limit
  maxConsoleArgs: 20, // max console args
  maxConsoleObjectKeys: 30, // max object keys
  maxConsoleArrayEntries: 20, // max array entries
  maxErrorStackLength: 5_000, // error stack length limit
  maxComponentStackLength: 3_000, // component stack length limit

  processing: "main-thread", // flush processing location
  flushWorkerTimeoutMs: 5_000, // worker flush timeout
  debug: true, // log init/flush diagnostics

  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload); // storage/transport integration point
  },
  beforeSend(session) {
    return session.stats.eventCount > 0 ? session : null; // final filter before sending
  },
});

captureError(error, { componentStack: info.componentStack });
void flushOpenSession("error-boundary");
```

## Quick demo

```bash
pnpm install
pnpm --filter @open-session/viewer dev
pnpm --filter @open-session/sample-next dev

# Passphrase used by the sample:
demo-passphrase
```

## Workspace

- `packages/protocol`: replay types, compact format, compression, encryption, `osr1:` envelope
- `packages/sdk`: browser capture, redaction, buffer, flush, transport callback
- `apps/viewer`: Viewer for opening payloads
- `apps/sample-next`: Next.js sample that reproduces a checkout failure flow

## Docs

- Technical guide: [`docs/technical-guide.en.md`](./docs/technical-guide.en.md)
- Korean technical guide: [`docs/technical-guide.md`](./docs/technical-guide.md)
- SDK usage guide: [`docs/usage-guide.en.md`](./docs/usage-guide.en.md)
- Korean SDK usage guide: [`docs/usage-guide.md`](./docs/usage-guide.md)
- Privacy model: [`docs/privacy.en.md`](./docs/privacy.en.md)
- Data collection inventory: [`docs/data-collection.en.md`](./docs/data-collection.en.md)
- Payload format: [`docs/payload-format.en.md`](./docs/payload-format.en.md)
- Performance budget: [`docs/performance-budget.en.md`](./docs/performance-budget.en.md)
- Publishing: [`docs/publishing.en.md`](./docs/publishing.en.md)
- Protocol README: [`packages/protocol/README.en.md`](./packages/protocol/README.en.md)
- SDK README: [`packages/sdk/README.en.md`](./packages/sdk/README.en.md)
- Viewer README: [`apps/viewer/README.en.md`](./apps/viewer/README.en.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)

## License

MIT. See [`LICENSE`](./LICENSE).
