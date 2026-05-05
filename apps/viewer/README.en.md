# Open Session Viewer

The viewer opens encrypted `osr1:` payloads created by `@open-session/sdk`.
It is a local inspection tool that does not need a login. Paste a payload, enter
the passphrase, and inspect the session.

Korean: [`README.md`](./README.md)

Service README: [`../../README.en.md`](../../README.en.md)

## What you can inspect

- Error summary and captured stack text
- Failure flow before the error
- Event stream with filtering and virtual scrolling
- Network status and request timing
- Console messages
- Privacy/redaction state
- Payload metadata such as compression, event count, and dropped events

The viewer uses the SDK decode helper. It does not maintain a separate decoder.

## Run locally

```bash
pnpm --filter @open-session/viewer dev
```

The Vite dev server prints the local URL. Open it in a browser, paste an
`osr1:...` payload, and enter the passphrase used when the SDK generated it.

You can prefill the passphrase from the URL while testing.

```text
http://localhost:3101?passphrase=demo-passphrase
```

## Try the bundled sample

The import screen includes a sample button. It loads a built-in checkout failure
payload so you can inspect the UI without running the sample app first.

For a real end-to-end check, run the sample app as well.

```bash
pnpm --filter @open-session/sample-next dev
```

Trigger an error in the sample, copy `OPEN_SESSION_PAYLOAD osr1:...` from DevTools,
and paste it into the viewer with `demo-passphrase`.

## Build

```bash
pnpm --filter @open-session/viewer build
```

The build includes a Brotli WASM asset used for browser-side decode. That asset
is lazy-loaded during decode, not when the import screen first renders.

## Language

The viewer follows the browser language on first load and also has a language
selector. Current resources live in:

- `src/shared/i18n/resources/ko.json`
- `src/shared/i18n/resources/en.json`

## Maintainer notes

- Keep payload decode through `@open-session/sdk`.
- Keep long event lists virtualized.
- Do not show raw secrets in screenshots or fixtures.
- If payload format changes, update the bundled sample payload and E2E tests.

## Related docs

- SDK README: [`../../packages/sdk/README.en.md`](../../packages/sdk/README.en.md)
- Payload format: [`../../docs/payload-format.en.md`](../../docs/payload-format.en.md)
- Privacy model: [`../../docs/privacy.en.md`](../../docs/privacy.en.md)
- Browser QA: [`../../docs/browser-use-qa.en.md`](../../docs/browser-use-qa.en.md)
