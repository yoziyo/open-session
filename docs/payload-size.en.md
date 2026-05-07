# Payload size strategy

Korean: [`payload-size.md`](./payload-size.md)

The replay body is compacted and compressed before encryption. The encrypted bytes are then encoded into a copy-paste-safe `osr1:` envelope. Because encrypted bytes look random, size reduction has to happen before encryption.

## Current defaults

- Payload bodies use `compact-session-v1` with an internal revision-1 tuple/template/series codec.
- Compression uses `brotli` by default. SDK `compressionLevel: 6` maps to fast Brotli mode for this structured body. Higher modes produced small size gains and much higher CPU/memory cost.
- SDK flush processing defaults to `main-thread` for compatibility. For larger buffers, use `processing: "auto"` or `processing: "worker"` with `createFlushWorker` so Brotli work blocks the host app less.
- `osr1` payloads use compact envelope v2: short metadata keys and one base64url ciphertext segment.
- Compact payload event IDs are regenerated from canonical event order during
  decode instead of serializing UUID-sized IDs.
- Event-level `pageUrl` stays in SDK capture after redaction. `compact-session-v1` dictionary-compresses repeated page URLs. Keeping them avoids an extra flush-time object-cloning pass and preserves route-change context.
- Character keydowns omit physical key `code`, and repeated bursts can coalesce
  with `count`/`lastTimestamp`.
- Console args are serialized into the string dictionary. URL/ID/stack-like strings inside console payloads get the same template/series coding.

## Measurement snapshot

Run the synthetic benchmark with:

```sh
pnpm bench:payload
```

Results excluding the benchmark-only generated profile:

| Profile | Logical events | Captured events | Compact JSON | Brotli level 6 body | Envelope chars | Saved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `checkout-mixed` | 241 | 60 | 4,207 B | 1,191 B | 1,986 | 71.7% |
| `verbose-unoptimized-comparison` | 241 | 241 | 7,003 B | 1,491 B | 2,409 | 78.7% |
| `stress-repetitive-uncoalesced` | 4,310 | 4,310 | 94,301 B | 7,854 B | 10,897 | 91.7% |
| `stress-repetitive-coalesced` | 4,310 | 829 | 35,938 B | 3,840 B | 5,541 | 89.3% |
| `stress-high-entropy` | 2,110 | 2,110 | 104,695 B | 11,702 B | 16,015 | 88.8% |
| `high-entropy-reference` | 2,110 | 2,110 | 104,698 B | 11,699 B | 16,015 | 88.8% |

The gated stress profiles stay below the `20,000` compressed body-byte target
at `compressionLevel: 6` without fixture regeneration or data reduction. The
final copy-paste envelope is larger than the compressed bytes because AES-GCM adds an
authentication tag and base64url text expands encrypted bytes.

## Persisted stress fixtures

`pnpm bench:payload` writes payloads, source sessions, and metadata under
`.omx/artifacts/stress-payloads/`:

- `stress-repetitive-uncoalesced.*`: 20KB compressed-body regression fixture.
- `stress-high-entropy.*`: high-cardinality 20KB compressed-body regression
  fixture.
- `high-entropy-reference.*`: same high-cardinality shape for comparison. No separate fixture profile is used.

## Runtime tuning examples

Compatibility default:

```ts
initOpenSession({
  passphrase,
  transport,
});
```

Worker-assisted flush with fallback:

```ts
initOpenSession({
  passphrase,
  transport,
  processing: "auto",
  compressionLevel: 6,
  createFlushWorker: () =>
    new Worker(new URL("./open-flush-worker.js", import.meta.url), {
      type: "module",
    }),
});
```

Strict worker mode for apps with validated worker and CSP support:

```ts
initOpenSession({
  passphrase,
  transport,
  processing: "worker",
  createFlushWorker: () =>
    new Worker(new URL("./open-flush-worker.js", import.meta.url), {
      type: "module",
    }),
});
```

Small webhook payload budget:

```ts
initOpenSession({
  passphrase,
  transport,
  maxEvents: 100,
  maxApproxBytes: 150_000,
  compressionLevel: 6,
  maxSanitizedStringLength: 160,
});
```
