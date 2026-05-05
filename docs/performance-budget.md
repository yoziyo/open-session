# SDK performance budget

English: [`performance-budget.en.md`](./performance-budget.en.md)

SDK 기본값과 app별 override를 정할 때 보는 문서입니다. SDK는 event를 main thread에서 수집하고, `flush()` 시점에 compact, compress, encrypt, encode를 실행합니다.

## Benchmark command

```bash
pnpm bench:payload
```

Benchmark는 synthetic replay session을 만들고 아래 값을 출력합니다.

- event count
- 압축 전 compact JSON bytes
- compressed bytes
- 최종 `osr1:` envelope characters
- compression ratio
- encode time in milliseconds
- approximate Node heap delta

이 script는 local 측정용입니다. SDK 경로와 같은 protocol compaction/compression code와 Web Crypto primitive를 쓰지만 browser profiler는 아닙니다. Release 전에는 Chrome DevTools로 browser main-thread stall과 worker transfer overhead를 따로 확인해야 합니다.

기본 level `6`에서 gated stress fixture가 `20,000` compressed body bytes를 넘으면 benchmark는 non-zero로 종료합니다. 현재 gated fixture는 `stress-repetitive-uncoalesced`와 `stress-high-entropy`입니다. 이 threshold는 synthetic stress regression target이며 일반 사용자 runtime cap이 아닙니다. App은 transport가 더 큰 payload를 감당할 수 있다면 더 큰 `maxEvents`/`maxApproxBytes` budget을 선택할 수 있습니다. 더 큰 `high-entropy-reference` fixture는 unbounded reference baseline으로 별도 추적합니다.

## 현재 benchmark snapshot

compact-session-v1 revision 1 template/series Brotli encoding 이후 2026-05-01 local 대표 실행 결과:

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

`maxEvents` 또는 `maxApproxBytes`를 넘으면 SDK는 plain FIFO로만 버리지 않습니다. Incident diagnosis에 더 필요한 context가 남도록 낮은 가치 event를 먼저 버립니다.

1. errors / captured exceptions
2. failed 또는 errored network requests
3. warning/error console entries
4. click, keydown 같은 user interactions
5. successful network, low-level console, lifecycle, truncate/noise events

남은 event의 priority가 비슷하면 더 오래된 event를 먼저 버립니다. 설정된 budget은 계속 적용됩니다. 이 정책은 buffer를 무한정 키우지 않으면서 유용한 수집 데이터를 더 오래 남깁니다.

## Runtime stability notes

`maxApproxBytes`는 memory 안에서 쓰는 압축 전 guardrail입니다. 의도적으로 approximate 값이며 최종 `osr1:` payload size로 보면 안 됩니다. Buffer는 retained event 옆에 가벼운 size accounting을 저장하므로 낮은 가치 event를 drop할 때 매번 모든 event를 stringify하지 않습니다.

Flush는 반복 URL 제거를 위해 모든 event를 clone하지 않고 redaction된 event `pageUrl` 값을 유지합니다. 약간의 압축 전 data를 남기는 대신 flush-time object churn을 줄입니다. 반복 URL은 string dictionary와 Brotli를 통해 계속 compact됩니다.

Manual `addReplayEvent()` 호출자는 console-like payload에 특이한 object를 넣을 수 있습니다. Event를 안전하게 serialize할 수 없으면 SDK는 host app으로 throw하거나 인코딩 불가능한 object graph를 들고 있지 않고 bounded truncate marker를 기록합니다. Built-in console capture도 bounded-depth sanitization으로 circular object를 처리합니다.

Flush processing에는 두 가지 memory/CPU profile이 있습니다.

- `main-thread`: 가장 단순하고 호환성이 좋습니다. compression/encryption이 `flush()` 중 실행됩니다.
- `auto`/`worker`: 가능하면 caller-provided worker로 compact/compress/encrypt 작업을 옮깁니다. UI blocking을 줄일 수 있지만, session을 worker로 structured-clone하는 동안 replay data가 일시적으로 memory에 중복됩니다. 큰 buffer에서 bundler와 CSP 동작을 확인한 뒤 쓰는 편이 좋습니다.

## 추천 budget

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
  maxConsoleArgs: 3,
  maxSanitizedStringLength: 160,
  maxErrorStackLength: 300,
  maxComponentStackLength: 300,
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
  maxConsoleArgs: 3,
  maxErrorStackLength: 300,
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

`processing: "worker"`는 app bundler와 CSP policy를 검증한 뒤에만 사용합니다. `processing: "auto"`는 실패 시 main-thread encoding으로 돌아가므로 더 안전합니다.

## Release gate proposal

SDK 기본값을 바꾸기 전에는 아래를 실행합니다.

```bash
pnpm bench:payload
pnpm check
pnpm test
pnpm test:e2e
pnpm build
pnpm test:pack
```

Default profile 기준 warning threshold:

- 대표 250-event session의 final envelope > 100 KB
- normal/default session encode time > 50 ms, 또는 일반 laptop에서 stress fixture > 250 ms
- Node benchmark에서 normal/default session heap delta > 5 MB, 또는 stress fixture > 20 MB
- manual flush 중 browser main-thread stall이 관찰됨
