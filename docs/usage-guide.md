# Open Session SDK 사용 가이드

English: [`usage-guide.en.md`](./usage-guide.en.md)

Open Session은 오류 직전의 브라우저 상황을 짧게 모아 암호화된 `osr1:`
payload로 만듭니다. 사용자가 무엇을 눌렀는지, 어떤 네트워크 요청이 실패했는지,
콘솔에 어떤 로그가 남았는지, 어떤 에러가 발생했는지 한 번에 확인할 수 있습니다.

SDK는 서버를 제공하지 않습니다. SDK는 수집하고, 압축하고, 암호화한 뒤
`transport` 콜백을 호출합니다. 그 다음 payload를 어디로 보낼지는 앱이 정합니다.

## 설치

```bash
pnpm add @open-session/sdk
```

## 기본 흐름

1. 클라이언트 진입점에서 `initOpenSession()`을 한 번 호출합니다.
2. SDK가 click, keydown, navigation, network, console, error 이벤트를 메모리에 보관합니다.
3. 에러가 발생하면 `captureError()`를 호출합니다.
4. payload가 필요할 때 `flushOpenSession()`을 호출합니다.
5. SDK가 `transport(payload)`를 호출합니다.
6. Viewer나 직접 만든 도구에서 payload와 passphrase로 복호화합니다.

## 최소 예제

```ts
import { initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});
```

`passphrase`는 필수입니다. Open payload는 기본적으로 암호화됩니다. 암호화는 Web Crypto를 먼저 사용하고, hosts 기반 HTTP 개발 도메인처럼 `crypto.subtle`이 없는 환경에서는 JS fallback을 사용합니다. 단, salt/iv 생성을 위해 `crypto.getRandomValues`는 필요합니다.

## 처음 붙일 때 추천 설정

처음에는 아래 설정으로 시작하는 것을 권장합니다. 실제 payload를 몇 개 확인한 뒤
`maxEvents`, `maxApproxBytes`, redaction 옵션을 조정하세요.

```ts
import { initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",

  maxEvents: 200,
  maxApproxBytes: 500_000,
  compressionLevel: 6,
  keydownCoalesceWindowMs: 350,

  additionalQueryKeys: ["invite", "coupon", "paymentToken"],
  maskSelectors: ["[data-replay-mask]"],
  excludeSelectors: ["[data-replay-exclude]"],
  excludeUrls: [/\/health$/, /\/metrics$/],
  debug: true,

  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});
```

알아둘 점:

- `maxApproxBytes`는 압축 전 메모리 버퍼의 대략적인 크기입니다. 최종 `osr1:` 문자열 크기가 아닙니다.
- 버퍼가 넘치면 단순 FIFO로 버리지 않습니다. 에러, 실패한 네트워크, warn/error 콘솔, 사용자 행동을 더 오래 남깁니다.
- password 입력값은 수집하지 않습니다. 민감한 URL, selector, console 값, stack은 저장 전에 마스킹하거나 자릅니다.
- 개발 환경에서 flush가 안 되면 `debug: true`로 `crypto.subtle` fallback 또는 `getRandomValues` 누락 여부를 확인하세요.

## Sentry처럼 쓰기

`initOpenSession()`은 내부 active client를 설정합니다. 대부분의 경우 반환된 client를 직접 들고 다니지 않아도 됩니다.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});

captureError(error, {
  componentStack: info.componentStack,
});

const result = await flushOpenSession("error-boundary");

if (result.ok) {
  console.log(result.payload);
}
```

## Next.js에서 정리하는 방식

SDK 코드는 한 파일에 모아두는 편이 좋습니다. Error Boundary나 버튼 핸들러가 SDK 초기화 방식을 몰라도 되기 때문입니다.

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

앱 시작 시점에는 client component에서 한 번 호출합니다.

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

## Error Boundary 예제

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

`componentStack`은 선택값입니다. SDK는 React 전용이 아닙니다. 다른 프레임워크에서 비슷한 UI stack을 줄 수 있으면 넘기고, 없으면 생략하면 됩니다.

## transport는 어디로 보내나

로컬 테스트에서는 콘솔 출력이면 충분합니다.

```ts
transport(payload) {
  console.log("OPEN_SESSION_PAYLOAD", payload);
}
```

운영에서는 직접 만든 서버 API로 보내세요.

```ts
transport(payload) {
  return fetch("/api/replay-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });
}
```

Slack webhook, OpenSearch, S3, R2 같은 곳으로 보낼 수는 있습니다. 다만 브라우저에서 직접 credential을 들고 호출하지 마세요. 서버 API를 거쳐 처리하는 쪽이 안전합니다.

## worker flush

수집은 메인 스레드에서 합니다. worker 옵션은 flush 시점의 작업만 옮깁니다.

- replay session 정리
- compact 변환
- Brotli 압축
- 암호화
- `osr1:` envelope 생성

기본값은 `main-thread`입니다. 호환성이 가장 좋아 기본값으로 둡니다. payload가 커지거나 flush 중 UI 멈춤이 보이면 `auto`를 검토하세요.

```ts
initOpenSession({
  passphrase: "user-controlled-secret",
  transport,
  processing: "auto",
  createFlushWorker: () =>
    new Worker(new URL("@open-session/sdk/flush-worker", import.meta.url), {
      type: "module",
    }),
});
```

모드 차이는 아래와 같습니다.

| 값 | 동작 |
| --- | --- |
| `main-thread` | worker를 쓰지 않습니다. 가장 호환성이 좋습니다. |
| `auto` | worker를 시도하고, 실패하면 main thread로 돌아옵니다. |
| `worker` | worker가 반드시 필요합니다. 실패하면 flush도 실패합니다. |

## 주요 옵션

| 옵션 | 추천 시작값 | 설명 |
| --- | --- | --- |
| `appId` | 앱 이름 | Viewer에서 앱을 구분하는 값 |
| `passphrase` | 운영 환경에서 관리 | payload 암호화/복호화 키 |
| `transport` | 콘솔 또는 서버 API | payload 전달 함수 |
| `sampleRate` | `1` | session 단위 sampling. `0`은 모두 drop, `1`은 모두 keep |
| `maxEvents` | `200` | 버퍼에 남길 최대 이벤트 수. SDK 기본값은 `250`입니다. |
| `maxApproxBytes` | `500_000` | 압축 전 버퍼 크기 제한. SDK 기본값은 `750_000`입니다. |
| `compressionLevel` | `6` | 기본 압축 레벨. 크기보다 CPU가 중요하면 낮추고, 크기가 더 중요하면 올립니다. |
| `keydownCoalesceWindowMs` | `350` | 연속 keydown 병합 시간 |
| `additionalQueryKeys` | 서비스별 설정 | 추가로 마스킹할 query key |
| `maskSelectors` | `[data-replay-mask]` | 이벤트는 남기고 DOM target을 마스킹할 영역 |
| `excludeSelectors` | `[data-replay-exclude]` | 이벤트 자체를 버릴 DOM 영역 |
| `excludeUrls` | 서비스별 설정 | 수집하지 않을 network URL |
| `networkStatusFilter` | 실패 API만 유지 | redaction 이후 network event를 status 기준으로 유지/drop |
| `excludeConsole` | 서비스별 설정 | 수집하지 않을 console 메시지 |
| `consoleLevels` | `["warn", "error"]` | console 수집을 필요한 level로 제한 |
| `capture.*` | 모두 `true` | 아래 수집 범위 옵션으로 event category를 끄고 켭니다. |
| `beforeSend` | 서비스별 정책 | 암호화/전송 직전 session 수정 또는 drop |
| `processing` | 기본 `main-thread`, 운영 권장 `auto` | flush 작업을 어디서 처리할지 정합니다. |

### 수집 범위 옵션

`capture`는 category별 opt-out입니다. 지정하지 않은 항목은 기본적으로 켜집니다.
이 옵션은 자동 수집 범위만 제어합니다. `captureError()`나 `client.addEvent()`로 직접 넣는 이벤트와 `init`/`flush` lifecycle marker는 계속 남습니다.

| 옵션 | 기본값 | 수집 범위 |
| --- | --- | --- |
| `capture.clicks` | `true` | click DOM target과 버튼 정보 |
| `capture.keydown` | `true` | 입력 발생 여부와 masked keydown metadata |
| `capture.navigation` | `true` | History API, 뒤/앞으로가기, hash 기반 화면 이동 |
| `capture.network` | `true` | fetch/XHR 요청 metadata와 실패 정보 |
| `capture.console` | `true` | console log/info/warn/error/debug metadata |
| `capture.errors` | `true` | window error와 unhandled rejection |

`consoleLevels`는 `capture.console`이 켜진 상태에서 적용됩니다. 예를 들어 `["warn", "error"]`로 설정하면 `console.log`/`console.info`는 원래 동작만 하고 replay에는 남기지 않습니다.

`networkStatusFilter`는 URL redaction 이후, buffer 저장 전에 실행됩니다. 실패 API만 보고 싶다면 아래처럼 시작하세요.

```ts
initOpenSession({
  passphrase,
  transport,
  networkStatusFilter(status) {
    return status === undefined || status >= 400;
  },
});
```

`sampleRate`는 init 시점에 session 단위로 결정됩니다. sample에서 제외된 session은 자동 수집, 수동 `addEvent()`, `captureError()`, flush payload를 모두 남기지 않습니다.

### 전송 직전 필터

`beforeSend(session)`은 암호화와 `transport` 직전에 실행됩니다. 반환한 session이 payload로 인코딩되고, `null`/`undefined`를 반환하면 이번 flush payload를 만들지 않습니다. 민감한 metadata를 마지막으로 제거하거나, 오류 신호가 없는 flush를 버릴 때 사용하세요.

```ts
initOpenSession({
  passphrase,
  transport,
  beforeSend(session) {
    const hasFailure = session.errors.length > 0 || session.events.some((event) => event.kind === "network" && event.ok === false);
    if (!hasFailure) return null;

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

### 개인정보·payload 제한 옵션

아래 옵션은 수집을 더 늘리는 옵션이 아니라, payload에 남길 값을 줄이거나 자르는 안전장치입니다.

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `excludeUrls` | 없음 | 문자열/정규식과 맞는 network URL 이벤트를 버립니다. |
| `excludeConsole` | 없음 | 문자열/정규식과 맞는 console 이벤트를 버립니다. |
| `maxSanitizedStringLength` | `500` | console/error 문자열을 이 길이 이후 잘라냅니다. |
| `maxConsoleArgs` | `10` | console 호출 1회당 남길 인자 수 |
| `maxConsoleObjectKeys` | `30` | console object에서 남길 key 수 |
| `maxConsoleArrayEntries` | `20` | console array에서 남길 entry 수 |
| `maxErrorStackLength` | `500` | error stack 최대 길이 |
| `maxComponentStackLength` | `500` | React component stack 최대 길이 |

운영 기본값은 “적게 수집하고 안전하게 자르기”를 권장합니다. 결제, 인증, 의료, 관리자 화면처럼 민감도가 높은 영역은 `excludeSelectors`, `excludeUrls`, `excludeConsole`을 먼저 적용한 뒤 필요한 category만 켜세요.

## Viewer에서 확인하기

1. Viewer를 실행합니다.

   ```bash
   pnpm --filter @open-session/viewer dev
   ```

2. 앱에서 생성된 `osr1:...` payload를 복사합니다.
3. Viewer 첫 화면에 붙여넣습니다.
4. SDK 초기화에 사용한 passphrase를 입력합니다.
5. `Open viewer`를 누릅니다.

passphrase를 query string으로 미리 넣을 수도 있습니다.

```text
http://localhost:3101?passphrase=demo-passphrase
```

## SDK로 직접 복호화하기

직접 Viewer나 분석 도구를 만들 때는 `decodeReplayPayload()`를 쓰면 됩니다.

```ts
import { decodeReplayPayload } from "@open-session/sdk";

const decoded = await decodeReplayPayload("osr1:...", "user-controlled-secret");

console.log(decoded.envelope);
console.log(decoded.session.events);
console.log(decoded.session.errors);
```

## 운영 적용 전 체크

- passphrase를 코드에 하드코딩하지 않습니다.
- 운영 transport는 서버 API를 거칩니다.
- 브라우저에 Slack/OpenSearch/S3 credential을 노출하지 않습니다.
- 서비스에 맞는 `additionalQueryKeys`, `maskSelectors`, `excludeSelectors`를 넣습니다.
- 실제 payload를 보고 `maxEvents`, `maxApproxBytes`, `compressionLevel`을 조정합니다.
- Error Boundary나 전역 에러 핸들러에서 `captureError()`와 `flushOpenSession()`을 호출합니다.
- Viewer에서 실제 payload가 복호화되는지 확인합니다.
- `processing: "auto"`를 쓸 경우 worker와 CSP 설정을 브라우저에서 확인합니다.

## 관련 문서

- [`privacy.md`](./privacy.md): 무엇을 수집하고 무엇을 버리는지
- [`payload-format.md`](./payload-format.md): `osr1:` payload 구조
- [`payload-size.md`](./payload-size.md): payload 크기와 압축 전략
- [`performance-budget.md`](./performance-budget.md): 메모리/성능 예산
