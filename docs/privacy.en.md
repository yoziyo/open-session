# Privacy model

Korean: [`privacy.md`](./privacy.md)

Collection inventory: [`data-collection.en.md`](./data-collection.en.md)

The SDK starts with a conservative privacy model. It captures diagnostic metadata rather than secrets, and the MVP favors redaction over perfect replay fidelity.

## Default redaction rules

| Surface | Default behavior |
| --- | --- |
| Password inputs | Record that a keydown happened; never serialize raw key, code, or value. |
| Sensitive DOM targets | Mask targets under `input[type="password"]`, `data-replay-mask`, `data-mask`, `aria-hidden="true"`, and user-provided `maskSelectors`. |
| Excluded DOM targets | Drop click/keydown events for user-provided `excludeSelectors`. |
| Current page URL | Store only a redacted `location.href` in session metadata and event `pageUrl` fields. |
| URL query params | Redact `token`, `access_token`, `refresh_token`, `id_token`, `password`, `pass`, `secret`, `client_secret`, `key`, `api_key`, `code`, `otp`, `email`, `auth`, `authorization`, `session`, `jwt`, `signature`, `sig`, and user-provided `additionalQueryKeys`. |
| Network headers/bodies | Do not capture request/response bodies or headers; record redaction markers instead. |
| Console args | Serialize shallow diagnostic data, redact sensitive object keys and token-like strings, and truncate large values. |
| Errors/component stacks | Sanitize messages, error stacks, and optional UI/component stacks before payload encoding. |
| Payload transport | Compact, compress, and encrypt before the user transport callback receives data. |

## User controls

`initOpenSession` supports:

- `excludeUrls`: drop network events for matching URLs.
- `excludeConsole`: drop console events matching a string or regex.
- `maskSelectors`: keep the event but mask the DOM target descriptor.
- `excludeSelectors`: drop DOM interaction events entirely.
- `additionalQueryKeys`: redact extra URL query keys.
- `capture`: disable clicks, keydown, navigation, network, console, or errors by category.
- `maxSanitizedStringLength`: bound large strings. Console argument count, object key count, and stack length are limited by SDK internal defaults.
- `compressionLevel`: tune Brotli size/CPU tradeoff.
- `processing`: choose `main-thread`, `auto`, or `worker` flush encoding.

## Failure isolation

Capture, encoding, transport, and cleanup failures are isolated from the host
app. A failed flush returns `{ ok: false, error }` and should not crash the host app.

## Verification

Privacy behavior is covered by unit tests and browser E2E tests. The tests check
both decoded payload JSON and viewer-rendered text to make sure known secrets are absent.
