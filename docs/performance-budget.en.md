# SDK Performance Budget

Korean: [`performance-budget.md`](./performance-budget.md)

Use this document when choosing SDK defaults and app-specific overrides. The SDK
captures events on the main thread, then compacts, compresses, encrypts, and
encodes the payload during `flush()`.

## Benchmark command

```bash
pnpm bench:payload
```

The benchmark generates synthetic replay sessions and prints:

- event count
- compact JSON bytes before compression
- compressed bytes
- final `osr1:` envelope characters
- compression ratio
- encode time in milliseconds
- approximate Node heap delta

The script is intentionally local. It uses the same protocol
compaction/compression code and Web Crypto primitives as the SDK path, but it is
not a browser profiler. Browser main-thread stall and worker transfer overhead
should still be checked with Chrome DevTools before release.

The benchmark exits non-zero if any gated stress fixture exceeds `20,000`
compressed body bytes at the default level `6`. The currently gated fixtures are
`stress-repetitive-uncoalesced` and `stress-high-entropy`. That threshold is a
synthetic stress regression target, not a runtime cap for normal users. Apps can
intentionally choose larger `maxEvents`/`maxApproxBytes` budgets when their
transport can carry bigger payloads. The larger
`high-entropy-reference` fixture is tracked separately as an unbounded
reference baseline.

## Current benchmark snapshot

Representative local run from 2026-05-01 after compact-session-v1 revision 1
template/series Brotli encoding:

| Profile | Logical events | Captured events | Level | Compact JSON | Compressed | Envelope chars | Encode ms | Heap Δ MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small-error | 71 | 32 | 6 | 3,076 B | 998 B | 1,723 | ~42 ms | ~4.5 |
| checkout-mixed | 241 | 60 | 6 | 4,207 B | 1,191 B | 1,986 | ~36 ms | ~4.4 |
| network-heavy | 322 | 241 | 6 | 12,056 B | 2,092 B | 3,190 | ~55 ms | ~10.2 |
| stress-repetitive-uncoalesced | 4,310 | 4,310 | 6 | 94,301 B | 7,854 B | 10,897 | ~180 ms | ~6.6 |
| stress-repetitive-coalesced | 4,310 | 829 | 6 | 35,938 B | 3,840 B | 5,541 | ~101 ms | ~14.4 |
| stress-high-entropy | 2,110 | 2,110 | 6 | 104,695 B | 11,702 B | 16,015 | ~188 ms | ~12.0 |
| high-entropy-reference | 2,110 | 2,110 | 6 | 104,698 B | 11,699 B | 16,015 | ~218 ms | ~0.8 |

## Buffer retention policy

When `maxEvents` or `maxApproxBytes` is exceeded, the SDK no longer drops events
by plain FIFO. It drops lower-value events first so the payload keeps the context
most useful for incident diagnosis:

1. errors / captured exceptions
2. failed or errored network requests
3. warning/error console entries
4. user interactions such as click and keydown
5. successful network, low-level console, lifecycle, and truncate/noise events

If every remaining event has similar priority, the older event is dropped first.
The configured budgets still apply. This policy keeps the most useful captured
data without making the buffer unbounded.

## Runtime stability notes

`maxApproxBytes` is an in-memory, pre-compression guardrail. It is intentionally
approximate; do not treat it as the final `osr1:` payload size. The buffer keeps
lightweight size accounting next to each retained event so budget enforcement
does not repeatedly stringify every event while dropping low-value entries.

Flush keeps redacted event `pageUrl` values instead of cloning every event to
remove repeated URLs. This keeps a small amount of pre-compression data to avoid
extra flush-time object churn; repeated URLs are still compacted through the
string dictionary and Brotli.

Manual `addReplayEvent()` callers can still pass unusual objects in console-like
payloads. If an event cannot be serialized safely, the SDK records a bounded
truncate marker instead of throwing through the host app or retaining an
unencodable object graph. Built-in console capture also handles circular objects
with bounded-depth sanitization.

Flush processing has two memory/CPU profiles:

- `main-thread`: simplest and most compatible; compression/encryption runs during
  `flush()`.
- `auto`/`worker`: moves compact/compress/encrypt work to a caller-provided
  worker when possible. This can reduce UI blocking, but structured-cloning the
  session into the worker briefly duplicates the replay data in memory. Prefer it
  for larger buffers after validating bundler and CSP behavior.

## Recommended budgets

Default web app profile:

```ts
initOpenSession({
  passphrase,
  transport,
  maxEvents: 250,
  maxApproxBytes: 750_000,
  compressionLevel: 6,
  processing: "main-thread",
});
```

Webhook/Slack profile:

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

Mobile-first profile:

```ts
initOpenSession({
  passphrase,
  transport,
  maxEvents: 120,
  maxApproxBytes: 250_000,
  compressionLevel: 6,
});
```

Worker-assisted profile:

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

Use `processing: "worker"` only after validating the app bundler and CSP policy.
`processing: "auto"` is safer because it falls back to main-thread encoding.

## Release gate proposal

Before changing SDK defaults, run:

```bash
pnpm bench:payload
pnpm check
pnpm test
pnpm test:e2e
pnpm build
pnpm test:pack
```

Treat these as warning thresholds for the default profile:

- final envelope > 100 KB for a representative 250-event session
- encode time > 50 ms for normal/default sessions, or >250 ms for stress
  fixtures on a normal laptop
- heap delta > 5 MB for normal/default sessions, or >20 MB for stress fixtures
  in the Node benchmark
- observable browser main-thread stall during manual flush
