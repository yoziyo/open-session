# Data collection inventory

Korean: [`data-collection.md`](./data-collection.md)

Open Session is a metadata collection tool for incident analysis, not a screen recorder. The table below defines what the SDK keeps with default settings, what it does not collect, and which options can reduce the collection scope.

## Collection criteria by item

| Area | Collected by default | Stored values | Values not stored | Security/privacy handling | Controls |
| --- | --- | --- | --- | --- | --- |
| Session metadata | Collected | `appId`, `sessionId`, optional `userId`, SDK version, redacted page URL, user agent, viewport, created time | cookie, localStorage, full account profile | page URL query is stored after redaction | `sessionId`, `userId`, `additionalQueryKeys`, `beforeSend` |
| Lifecycle | Collected | `init`, `flush`, optional flush reason, redacted page URL | app state snapshot, React tree | reason is caller-provided string, so do not put sensitive values in it | `beforeSend` |
| Click | Collected | target descriptor, mouse button, repeat count, redacted page URL | element text, input value, DOM snapshot, screenshot | sensitive/masked DOM targets are replaced with a `data-redacted` selector | `capture.clicks`, `maskSelectors`, `excludeSelectors` |
| Keydown | Collected | event that input happened, non-sensitive key category, repeat count, target descriptor | password value, raw sensitive key, raw code | password/sensitive inputs keep only masked events | `capture.keydown`, `maskSelectors`, `excludeSelectors` |
| Navigation | Collected | `pushState`, `replaceState`, `popstate`, `hashchange`, redacted from/to URLs | browser history object state, document title, page content | from/to URL query is stored after redaction | `capture.navigation`, `additionalQueryKeys` |
| Network | Collected | method, redacted URL, status, duration, ok/error marker, redaction marker | request body, response body, request/response headers, cookies, authorization values | sensitive query redaction; headers/body are recorded only as markers | `capture.network`, `excludeUrls`, `networkStatusFilter`, `additionalQueryKeys` |
| Console | Collected | selected console level, sanitized args, redaction marker, repeat count | unbounded object graph, functions, symbols, secret-like field values | secret-like string/object key redaction, depth/size budgets applied | `capture.console`, `consoleLevels`, `excludeConsole`, console budget options |
| Error | Collected | error name, sanitized message, sanitized stack, optional component stack | full component state, props, source file content | string sanitizer and length budgets are applied to message/stack/component stack | `capture.errors`, `beforeSend` |
| Manual events | Caller controlled | `ReplayEvent` passed through `client.addEvent()` | caller-defined fields where SDK cannot guarantee automatic redaction | caller must follow the public schema and redaction policy | app wrapper, `beforeSend` |

## Sensitive query keys

Default query redaction covers these keys:

```text
token, access_token, refresh_token, id_token, password, pass, secret,
client_secret, key, api_key, code, otp, email, auth, authorization,
session, jwt, signature, sig
```

Add service-specific sensitive keys with `additionalQueryKeys`.

## Processing and storage boundary

| Stage | Processing | Security criteria |
| --- | --- | --- |
| Capture | Keep only metadata events in a browser memory buffer | No screen/DOM snapshot is created |
| Buffer limit | Limit by event count and approximate byte budget | Preserve errors, failed network, warn/error console, and user actions first |
| Flush | compact replay session → Brotli compress → AES-GCM encrypt | `passphrase` is not included in the payload |
| Transport | SDK only calls user-provided `transport(payload)` | Do not put Slack/S3/OpenSearch credentials in browser code |
| Viewer | locally decodes a pasted `osr1:` payload with the passphrase | bundled Viewer does not upload payloads to a collector |
