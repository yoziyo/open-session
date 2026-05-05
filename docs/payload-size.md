# Payload size 전략

English: [`payload-size.en.md`](./payload-size.en.md)

Replay body는 암호화 전에 compact와 압축을 거칩니다. 암호화된 bytes는 copy/paste 가능한 `osr1:` envelope로 인코딩됩니다. 암호화 뒤 bytes는 random처럼 보이므로, 용량 절감은 암호화 전에 끝나야 합니다.

## 현재 기본값

- Payload body는 internal revision-1 tuple/template/series codec을 포함한 `compact-session-v1`을 사용합니다.
- 압축은 기본적으로 `brotli`를 사용합니다. SDK `compressionLevel: 6`은 이 구조화된 body에서 빠른 Brotli mode로 매핑됩니다. 더 높은 level은 용량 이득이 작고 CPU/memory 비용이 컸습니다.
- SDK flush processing 기본값은 호환성을 위해 `main-thread`입니다. buffer가 크다면 `createFlushWorker`와 함께 `processing: "auto"` 또는 `processing: "worker"`를 선호합니다. 이렇게 하면 Brotli 작업이 host app을 덜 막습니다.
- `osr1` payload는 compact envelope v2를 사용합니다. metadata key가 짧고 base64url ciphertext segment가 하나입니다.
- Compact payload event ID는 UUID 크기 ID를 직렬화하지 않고 decode 중 canonical event order에서 다시 만듭니다.
- Event-level `pageUrl`은 redaction 뒤 SDK capture에 남깁니다. 반복 page URL은 `compact-session-v1` dictionary로 압축됩니다. 이 방식은 flush-time object cloning을 피하면서 route-change context를 명시적으로 남깁니다.
- Character keydown은 physical key `code`를 생략하고, 반복 burst는 `count`/`lastTimestamp`로 합칠 수 있습니다.
- Console args는 string dictionary로 직렬화됩니다. console payload 안의 URL/ID/stack 비슷한 문자열도 같은 template/series coding을 받습니다.

## 측정 snapshot

Synthetic benchmark 실행:

```sh
pnpm bench:payload
```

Benchmark-only generated profile을 제거한 뒤 결과:

| Profile | Logical events | Captured events | Compact JSON | Brotli level 6 body | Envelope chars | Saved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `checkout-mixed` | 241 | 60 | 4,207 B | 1,191 B | 1,986 | 71.7% |
| `verbose-unoptimized-comparison` | 241 | 241 | 7,003 B | 1,491 B | 2,409 | 78.7% |
| `stress-repetitive-uncoalesced` | 4,310 | 4,310 | 94,301 B | 7,854 B | 10,897 | 91.7% |
| `stress-repetitive-coalesced` | 4,310 | 829 | 35,938 B | 3,840 B | 5,541 | 89.3% |
| `stress-high-entropy` | 2,110 | 2,110 | 104,695 B | 11,702 B | 16,015 | 88.8% |
| `high-entropy-reference` | 2,110 | 2,110 | 104,698 B | 11,699 B | 16,015 | 88.8% |

Gated stress profile은 fixture regeneration이나 data reduction 없이 기본 `compressionLevel: 6`에서 `20,000` compressed body-byte target 아래를 유지합니다. 최종 copy/paste envelope는 AES-GCM authentication tag와 base64url text expansion 때문에 compressed bytes보다 큽니다.

## 저장되는 stress fixture

`pnpm bench:payload`는 payload, source session, metadata를 `.omx/artifacts/stress-payloads/` 아래에 씁니다.

- `stress-repetitive-uncoalesced.*`: 20KB compressed-body regression fixture.
- `stress-high-entropy.*`: high-cardinality 20KB compressed-body regression fixture.
- `high-entropy-reference.*`: 비교용 같은 high-cardinality 형태. 별도 fixture profile은 쓰지 않습니다.

## Runtime tuning 예시

호환성 기본값:

```ts
initOpenSession({
  passphrase,
  transport,
});
```

Fallback이 있는 worker-assisted flush:

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

Worker와 CSP 지원을 이미 검증한 app의 strict worker mode:

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

작은 webhook payload budget:

```ts
initOpenSession({
  passphrase,
  transport,
  maxEvents: 100,
  maxApproxBytes: 150_000,
  compressionLevel: 6,
  maxConsoleArgs: 3,
  maxSanitizedStringLength: 160,
  maxErrorStackLength: 300,
  maxComponentStackLength: 300,
});
```
