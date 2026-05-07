# @open-session/sdk

Open Session 브라우저 SDK입니다.

오류 직전의 브라우저 상황을 짧게 기록한 뒤, 암호화된 `osr1:` payload를 앱의
`transport` 콜백으로 넘깁니다. SDK가 외부 서버로 자동 전송하지는 않습니다.

English: [`README.en.md`](./README.en.md)

서비스 README: [`../../README.md`](../../README.md)

## 설치

```bash
pnpm add @open-session/sdk
```

## 기본 사용법

client 코드에서 `initOpenSession()`을 한 번 호출합니다. 에러가 발생하면
`captureError()`와 `flushOpenSession()`을 호출합니다.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});

captureError(error, { componentStack: info.componentStack });
const result = await flushOpenSession("error-boundary");

if (result.ok) {
  console.log(result.payload);
}
```

대부분의 앱은 반환된 client를 따로 저장하지 않아도 됩니다.
`initOpenSession()`이 active client를 설정하고, top-level helper가 그 client를
사용합니다.

## 처음 시작할 때 추천 설정

```ts
import { initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",

  maxEvents: 200,
  maxApproxBytes: 500_000,
  sampleRate: 1,
  additionalQueryKeys: ["invite", "coupon", "paymentToken"],
  maskSelectors: ["[data-replay-mask]"],
  excludeSelectors: ["[data-replay-exclude]"],
  excludeUrls: [/\/health$/, /\/metrics$/],
  consoleLevels: ["warn", "error"],
  networkStatusFilter: (status) => status === undefined || status >= 400,
  debug: true,

  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
  beforeSend(session) {
    return session.stats.eventCount > 0 ? session : null;
  },
});
```

알아둘 점:

- `passphrase`는 필수입니다. payload는 기본적으로 암호화됩니다.
- `maxApproxBytes`는 압축 전 메모리 버퍼 기준입니다. 최종 payload 크기가 아닙니다.
- 버퍼가 가득 차면 에러, 실패한 네트워크, warn/error 로그, 사용자 행동을 낮은
  가치 이벤트보다 오래 남깁니다.
- password 입력값은 수집하지 않습니다.
- `consoleLevels`로 console 수집을 warn/error 등 필요한 레벨로 줄일 수 있습니다.
- `sampleRate`로 session 단위 sampling을 하고, `networkStatusFilter`로 실패 API 중심 payload를 만들 수 있습니다.
- 개발 환경에서는 `debug: true` 또는 logger 객체를 넘기면 init/flush 실패 원인을 콘솔에서 확인할 수 있습니다.
- `beforeSend`는 암호화와 transport 직전에 session을 마지막으로 줄이거나 `null`로 전송을 취소하는 안전장치입니다.

## Next.js 패턴

SDK 설정은 client-side 모듈 하나에 모아두는 편이 좋습니다.

```ts
"use client";

import { captureError, type FlushResult, flushOpenSession, initOpenSession } from "@open-session/sdk";

let initialized = false;

export function initOpenReporter(): void {
  if (initialized) return;

  initOpenSession({
    appId: "checkout-web",
    passphrase: "user-controlled-secret",
    maxEvents: 200,
    maxApproxBytes: 500_000,
    compressionLevel: 6,
    additionalQueryKeys: ["paymentToken"],
    maskSelectors: ["[data-replay-mask]"],
    excludeSelectors: ["[data-replay-exclude]"],
    transport(payload) {
      console.log("OPEN_SESSION_PAYLOAD", payload);
    },
  });

  initialized = true;
}

export function captureReportedError(error: unknown, componentStack?: string): void {
  initOpenReporter();
  captureError(error, componentStack ? { componentStack } : undefined);
}

export function flushOpenReport(reason = "manual-report"): Promise<FlushResult> {
  initOpenReporter();
  return flushOpenSession(reason);
}
```

client component에서 한 번만 초기화합니다.

```tsx
"use client";

import { useEffect } from "react";
import { initOpenReporter } from "./replay";

export function OpenBootstrap() {
  useEffect(() => {
    initOpenReporter();
  }, []);

  return null;
}
```

## Error Boundary

```tsx
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { captureReportedError, flushOpenReport } from "./replay";

export class OpenErrorBoundary extends Component<{ children: ReactNode }> {
  componentDidCatch(error: Error, info: ErrorInfo) {
    captureReportedError(error, info.componentStack);
    void flushOpenReport("error-boundary");
  }

  render() {
    return this.props.children;
  }
}
```

`componentStack`은 선택값입니다. SDK는 React 전용이 아닙니다.

## Transport

SDK는 `transport(payload)` 콜백만 호출합니다. 로컬 테스트에서는 콘솔 출력이면 충분합니다.

```ts
transport(payload) {
  console.log("OPEN_SESSION_PAYLOAD", payload);
}
```

운영에서는 payload를 직접 만든 서버 API로 보내세요.

```ts
transport(payload) {
  return fetch("/api/replay-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });
}
```

Slack, OpenSearch, S3, R2 credential을 브라우저 코드에 넣지 마세요. 대신 서버에서 payload를 전달하세요.

## 공개 API 안정화 기준

`initOpenSession()` 옵션은 잘못된 수치가 들어오면 초기화 시점에 `RangeError`를 던집니다. `sampleRate`는 `0`부터 `1` 사이의 finite number여야 하고, `compressionLevel`은 `0`부터 `9` 사이의 integer여야 합니다. 버퍼/문자열 예산 옵션도 0 또는 양의 정수 범위를 벗어나면 거부됩니다.

운영 코드나 wrapper에서는 아래 export를 기준값으로 사용할 수 있습니다.

```ts
import { DEFAULT_CAPTURE_OPTIONS, DEFAULT_REPLAY_LIMITS, OPEN_SESSION_SDK_VERSION } from "@open-session/sdk";
```

## 수집 범위 옵션

`capture`는 팀별로 event category를 끄고 켜는 opt-out 설정입니다. 지정하지 않은 항목은 기본적으로 켜집니다.
자동 수집만 제어하므로 `captureError()`나 `client.addEvent()`로 직접 넣은 이벤트와 `init`/`flush` lifecycle marker는 계속 남습니다.

```ts
initOpenSession({
  passphrase,
  capture: {
    clicks: true,
    keydown: true,
    navigation: true,
    network: true,
    console: true,
    errors: true,
  },
  consoleLevels: ["warn", "error"],
});
```

- `capture.navigation: false`는 History API, 뒤/앞으로가기, hash 기반 화면 이동을 수집하지 않습니다.
- `capture.network: false`는 fetch/XHR metadata 수집을 끕니다.
- `capture.console: false`는 console log 수집을 끕니다.
- `consoleLevels`는 `capture.console`이 켜져 있을 때 수집할 console level을 제한합니다.
- `sampleRate: 0.1`은 session 단위로 약 10%만 replay payload를 남깁니다. `0`은 모두 drop, `1`은 모두 keep입니다.
- `networkStatusFilter: (status) => status === undefined || status >= 400`는 실패/예외 network event만 남깁니다.
- `debug: true`는 SDK 내부 진단 로그를 켭니다. payload, passphrase, session 원문은 로그에 남기지 않습니다.

민감도가 높은 화면은 `capture`만으로 판단하지 말고 `excludeSelectors`, `excludeUrls`, `excludeConsole`도 함께 설정하세요.

## 전송 직전 필터

`beforeSend`는 payload를 암호화하고 `transport`로 넘기기 전에 마지막으로 실행됩니다. session을 반환하면 그 session이 전송되고, `null` 또는 `undefined`를 반환하면 이번 flush payload를 만들지 않습니다.

```ts
initOpenSession({
  passphrase,
  transport,
  beforeSend(session) {
    const hasIncidentSignal = session.errors.length > 0 || session.events.some((event) => event.kind === "network" && event.ok === false);
    if (!hasIncidentSignal) return null;

    return {
      ...session,
      metadata: {
        ...session.metadata,
        userId: undefined,
      },
    };
  },
});
```

## Worker flush

수집은 메인 스레드에서 실행됩니다. worker 모드는 flush 시점의 compact, 압축, 암호화, envelope 생성만 옮깁니다.

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

- `main-thread`: worker를 쓰지 않습니다. 호환성이 가장 좋습니다.
- `auto`: worker를 시도하고 실패하면 main thread로 돌아옵니다.
- `worker`: worker가 반드시 필요합니다. 실패하면 flush도 실패합니다.

## payload 복호화

직접 Viewer나 분석 도구를 만들 때 사용합니다.

```ts
import { decodeReplayPayload } from "@open-session/sdk";

const decoded = await decodeReplayPayload("osr1:...", "user-controlled-secret");

console.log(decoded.envelope);
console.log(decoded.session.events);
console.log(decoded.session.errors);
```

SDK는 `ReplaySession`, `ReplayEvent`, `DecodedReplayPayload` 같은 public replay 타입도 다시 export합니다.

## 안전 동작

- SSR import와 init은 DOM, `fetch`, `console` capture를 설치하지 않습니다.
- capture 실패는 앱 동작을 막지 않습니다.
- worker, transport, 압축, 암호화 실패는 flush 결과의 `{ ok: false, error }`로 돌아옵니다.
- 순환 참조가 있는 console object는 제한된 형태로 sanitize합니다.
- 직렬화할 수 없는 수동 이벤트는 앱을 깨뜨리지 않고 truncate marker로 바뀝니다.

## 관련 문서

- SDK 사용 가이드: [`../../docs/usage-guide.md`](../../docs/usage-guide.md)
- English SDK guide: [`../../docs/usage-guide.en.md`](../../docs/usage-guide.en.md)
- 개인정보 모델: [`../../docs/privacy.md`](../../docs/privacy.md)
- 수집 항목 표: [`../../docs/data-collection.md`](../../docs/data-collection.md)
- 성능 예산: [`../../docs/performance-budget.md`](../../docs/performance-budget.md)

## 라이선스

MIT. 패키지 tarball에는 `LICENSE`가 포함됩니다.
