# Open Session

[`한국어`](./README.md) / [`English`](./README.en.md)

Open Session is a library that encrypts a short window of browser events before an error so the situation at that moment can be inspected later.

It does not record the screen. The SDK keeps only metadata in memory, such as clicks, input activity, route changes, network status, console logs, and errors. When the app calls `flushOpenSession()`, the SDK reduces, compresses, and encrypts the payload.

## Features

- See what happened before the user encountered an error.
- Use it to narrow down browser error causes more easily.
- Use it as a lightweight option when cost makes full SaaS collection difficult or when another tool forces heavy sampling.
- Receive generated payloads through webhooks or other channels, then inspect them in the Viewer.
- Network headers/bodies and password values are not collected by default.

## How it works

1. Initialize `@open-session/sdk` in client-side app code.
2. The SDK keeps selected events in an in-memory buffer.
3. Call `flushOpenSession()` from an Error Boundary, global error handler, or manual report point.
4. The SDK reduces, compresses, and encrypts the replay session.
5. Open the payload in the [Viewer](https://yoziyo.github.io/open-session/viewer/) with the same passphrase.

## SDK example

### Fastest experience

Use the Viewer and sample site to check the returned payload and how it opens in the Viewer.

- Viewer: https://yoziyo.github.io/open-session/viewer/
- Sample app: https://yoziyo.github.io/open-session/sample/

### Installation

Applications only need the SDK. `@open-session/protocol` contains the payload types, compact format, compression, and encryption envelope, and is installed as an SDK dependency.

```bash
pnpm add @open-session/sdk
npm install @open-session/sdk
yarn add @open-session/sdk
```

The Viewer is a separate tool used to open payloads. You do not need to install the Viewer in your app code.

### Quick start

To start with the default setup, pass only the required value and transport. Clicks, input activity, route changes, network, console, and error capture run by default.

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

### Common example

Start with the minimal setup first, then add only the options you need after checking actual payloads.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web", // app/service label
  sessionId: "checkout-session-id", // existing session ID
  passphrase: "replace-with-user-controlled-secret", // payload encryption key

  additionalQueryKeys: ["paymentToken"], // mask service-specific query keys
  maskSelectors: ["[data-private]"], // mask sensitive DOM metadata
  excludeSelectors: ["[data-never-record]"], // skip matching DOM regions
  excludeUrls: [/\/health$/, /\/metrics$/], // skip matching URLs

  debug: true, // init/flush diagnostics during development

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

For more configuration details, see the [`SDK usage guide`](./docs/usage-guide.en.md). The collection policy is summarized in the [`data collection inventory`](./docs/data-collection.en.md), and the payload structure is documented in [`payload format`](./docs/payload-format.en.md).

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
- SDK usage guide: [`docs/usage-guide.en.md`](./docs/usage-guide.en.md)
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
