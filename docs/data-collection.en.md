# Data collection inventory

Korean: [`data-collection.md`](./data-collection.md)

Open Session is a metadata collector for incident analysis, not a screen recorder. This table defines what the SDK keeps by default, what it does not keep, and which options reduce collection scope.

## Collection table

| Area | Default | Stored values | Values not stored | Security/privacy handling | Controls |
| --- | --- | --- | --- | --- | --- |
| Session metadata | Collected | `appId`, `sessionId`, optional `userId`, SDK version, redacted page URL, user agent, viewport, created time | cookies, localStorage, full account profile | page URL query values are redacted before storage | `sessionId`, `userId`, `additionalQueryKeys`, `beforeSend` |
| Lifecycle | Collected | `init`, `flush`, optional flush reason, redacted page URL | app state snapshot, React tree | reason is caller-provided, so do not put secrets in it | `beforeSend` |
| Click | Collected | target descriptor, mouse button, repeat count, redacted page URL | element text, input value, DOM snapshot, screenshot | sensitive/masked DOM targets become `data-redacted` selectors | `capture.clicks`, `maskSelectors`, `excludeSelectors` |
| Keydown | Collected | input activity event, non-sensitive key category, repeat count, target descriptor | password value, raw sensitive key, raw code | password/sensitive inputs keep only masked activity events | `capture.keydown`, `keydownCoalesceWindowMs`, `maskSelectors`, `excludeSelectors` |
| Navigation | Collected | `pushState`, `replaceState`, `popstate`, `hashchange`, redacted from/to URLs | browser history object state, document title, page content | from/to URL query values are redacted before storage | `capture.navigation`, `additionalQueryKeys` |
| Network | Collected | method, redacted URL, status, duration, ok/error marker, redaction marker | request body, response body, request/response headers, cookies, authorization values | sensitive query redaction; headers/bodies are represented by markers only | `capture.network`, `excludeUrls`, `networkStatusFilter`, `additionalQueryKeys` |
| Console | Collected | selected console level, sanitized args, redaction marker, repeat count | unbounded object graph, functions, symbols, secret-like field values | secret-like strings/object keys are redacted; depth/size budgets apply | `capture.console`, `consoleLevels`, `excludeConsole`, console budget options |
| Error | Collected | error name, sanitized message, sanitized stack, optional component stack | full component state, props, source file content | message/stack/component stack use string sanitization and length budgets | `capture.errors`, `maxErrorStackLength`, `maxComponentStackLength`, `beforeSend` |
| Manual events | Caller controlled | `ReplayEvent` values passed to `client.addEvent()` | SDK cannot automatically redact caller-defined custom fields | caller must respect the public schema and redaction policy | app wrapper, `beforeSend` |

## Sensitive query keys

Default query redaction covers these keys:

```text
token, access_token, refresh_token, id_token, password, pass, secret,
client_secret, key, api_key, code, otp, email, auth, authorization,
session, jwt, signature, sig
```

Add service-specific sensitive keys with `additionalQueryKeys`.

## Processing and storage boundary

| Stage | Behavior | Security rule |
| --- | --- | --- |
| Capture | Keep metadata events in a browser memory buffer | No screen capture and no DOM snapshot |
| Buffer limit | Limit by event count and approximate byte budget | Prefer errors, failed network, warn/error console, and user actions |
| Flush | compact replay session → Brotli compress → AES-GCM encrypt | `passphrase` is never included in the payload |
| Transport | SDK only calls user-provided `transport(payload)` | Do not put Slack/S3/OpenSearch credentials in browser code |
| Viewer | locally decodes a pasted `osr1:` payload with the passphrase | bundled Viewer does not upload pasted payloads to a collector |

## Test-locked behavior

- E2E verifies that known secret strings do not appear in decoded payloads or Viewer text.
- Unit tests cover URL query redaction, navigation redaction, console/error sanitization, and password keydown masking.
- `pnpm test:pack` verifies package tarballs include `dist`, README, and LICENSE while excluding `src/`.

## Operational notes

- `userId`, `flush(reason)`, and manual events contain values your app provides. Do not put secrets in identifiers or reason strings.
- Use `beforeSend` as the final policy gate for tenant-specific deletion or reduction rules.
- For high-sensitivity screens, combine `capture.*` with `excludeSelectors`, `excludeUrls`, and `excludeConsole`.
