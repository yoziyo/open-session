# Open Session 기술 가이드

English: [`technical-guide.en.md`](./technical-guide.en.md)

Open Session은 브라우저 오류 직전의 이벤트를 `osr1:` payload로 묶는 SDK와 Viewer입니다. 화면 녹화 도구가 아닙니다. SDK는 오류 분석에 필요한 metadata만 저장합니다.

## 구성

| 패키지 | 역할 |
| --- | --- |
| `@open-session/sdk` | 브라우저 이벤트 수집, redaction, buffer, flush |
| `@open-session/protocol` | replay schema, compact format, compression, encryption |
| `@open-session/viewer` | payload 확인용 React app |
| `@open-session/sample-next` | Next.js sample app |

## 데이터 흐름

1. 앱이 `initOpenSession()`을 호출합니다.
2. SDK가 선택된 이벤트를 memory buffer에 저장합니다.
3. 앱이 오류 처리 지점에서 `captureError()`와 `flushOpenSession()`을 호출합니다.
4. SDK가 replay session을 compact format으로 바꿉니다.
5. payload를 압축하고 passphrase로 암호화합니다. Web Crypto를 우선 사용하고, `crypto.subtle`이 없으면 JS fallback을 사용합니다.
6. 앱이 `transport` callback에서 payload를 처리합니다.
7. Viewer는 같은 passphrase로 payload를 복호화합니다.

## 수집 이벤트

| Event | 내용 | 기본 처리 |
| --- | --- | --- |
| `navigation` | History API, popstate, hashchange | URL query redaction |
| `click` | DOM target descriptor, mouse button | masked/excluded selector 적용 |
| `keydown` | 입력 발생 여부, non-sensitive key metadata | password/sensitive input 값 미수집 |
| `network` | method, URL, status, duration, error | header/body 미수집 |
| `console` | level, sanitized args | sensitive string/object redaction |
| `error` | message, stack, component stack | string redaction, length limit |
| `lifecycle` | init, flush, shutdown marker | SDK 내부 marker |

## 기본 예제

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web",
  passphrase: "user-controlled-secret",
  transport(payload) {
    return fetch("/api/open-session-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
  },
});

captureError(error, { componentStack: info.componentStack });
await flushOpenSession("error-boundary");
```

## 운영 옵션

```ts
initOpenSession({
  appId: "checkout-web",
  passphrase,
  maxEvents: 200,
  maxApproxBytes: 500_000,
  sampleRate: 0.25,
  compressionLevel: 6,
  processing: "auto",
  createFlushWorker: () =>
    new Worker(new URL("@open-session/sdk/flush-worker", import.meta.url), {
      type: "module",
    }),
  capture: {
    clicks: true,
    keydown: true,
    navigation: true,
    network: true,
    console: true,
    errors: true,
  },
  consoleLevels: ["warn", "error"],
  networkStatusFilter: (status) => status === undefined || status >= 400,
  maskSelectors: ["[data-replay-mask]"],
  excludeSelectors: ["[data-replay-exclude]"],
  excludeUrls: [/\/health$/, /\/metrics$/],
  excludeConsole: [/ResizeObserver loop/],
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
  transport(payload) {
    return fetch("/api/open-session-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
  },
});
```

## 옵션 기준

| 옵션 | 기준 |
| --- | --- |
| `capture.*` | 자동 수집 category를 끄거나 켭니다. 수동 `addEvent()`와 `captureError()`는 별도입니다. |
| `consoleLevels` | console noise를 줄입니다. 보통 `["warn", "error"]`로 시작합니다. |
| `networkStatusFilter` | network event를 저장하기 전에 거릅니다. 실패 API만 남길 때 씁니다. |
| `sampleRate` | session 단위 sampling입니다. `0.1`은 약 10% session을 남깁니다. |
| `beforeSend` | 암호화 직전 마지막 필터입니다. session을 수정하거나 `null`로 drop할 수 있습니다. |
| `maxEvents` | event 개수 상한입니다. buffer가 넘치면 낮은 우선순위 event부터 제거합니다. |
| `maxApproxBytes` | 압축 전 buffer 크기 상한입니다. 최종 payload 크기가 아닙니다. |
| `processing` | flush 작업 위치입니다. `main-thread`, `auto`, `worker`를 지원합니다. |
| `debug` | init/capture/flush 진단 로그를 켭니다. payload, passphrase, session 원문은 남기지 않습니다. |

## 내부 제한값

아래 값은 payload 폭주를 막기 위한 SDK 내부 기본값입니다. public `initOpenSession()` 옵션으로 직접 조정하지 않습니다.

| 항목 | 내부 기본값 | 의미 |
| --- | --- | --- |
| keydown 병합 시간 | `1000ms` | 같은 target의 연속 keydown event를 묶습니다. |
| console 인자 수 | `10` | console 호출 1회에서 남길 최대 arg 수입니다. |
| console object key 수 | `30` | object 하나에서 남길 최대 key 수입니다. |
| console array entry 수 | `20` | array 하나에서 남길 최대 entry 수입니다. |
| error stack 길이 | `500` | error stack 문자열 truncate 기준입니다. |
| component stack 길이 | `500` | React component stack 문자열 truncate 기준입니다. |
| worker flush timeout | `5000ms` | worker flush 응답 대기 시간입니다. |

사용자가 조정할 수 있는 public 제한값은 `maxEvents`, `maxApproxBytes`, `maxSanitizedStringLength`입니다.

## 암호화 런타임

- `crypto.subtle`이 있으면 Web Crypto를 사용합니다.
- hosts 기반 HTTP 개발 도메인처럼 `crypto.subtle`이 없으면 JS fallback을 사용합니다.
- `crypto.getRandomValues`가 없으면 안전한 salt/iv를 만들 수 없으므로 flush는 실패합니다. 개발 중에는 `debug: true`로 원인을 확인하세요.

## 개인정보 처리

SDK는 아래 값을 기본으로 저장하지 않습니다.

- password input value
- request/response body
- Authorization, Cookie 같은 network header 값
- 민감 query value

추가로 적용할 수 있는 제한:

- `additionalQueryKeys`로 query key redaction을 늘립니다.
- `maskSelectors`로 DOM target descriptor를 가립니다.
- `excludeSelectors`로 특정 영역의 DOM event를 버립니다.
- `excludeUrls`로 network event를 버립니다.
- `excludeConsole`로 console event를 버립니다.
- `maxSanitizedStringLength`로 큰 문자열을 제한합니다. console 인자 수, object key 수, stack 길이는 SDK 내부 기본값으로 제한합니다.

## Viewer 확인 순서

1. Error summary에서 오류와 수집 구간을 봅니다.
2. 오류 발생 흐름에서 화면 이동, 사용자 행동, 실패 API, 오류 순서를 확인합니다.
3. Network tab에서 실패 요청과 duration을 봅니다.
4. Console tab에서 warn/error 로그를 봅니다.
5. Privacy tab에서 redaction 결과를 확인합니다.
6. Payload Info에서 envelope metadata를 확인합니다.

## 배포 전 확인

- 실제 payload를 Viewer에서 열어봅니다.
- 민감한 화면에 `maskSelectors` 또는 `excludeSelectors`를 적용합니다.
- server transport의 인증, 저장 기간, 접근 권한을 정합니다.
- `pnpm release:verify`를 실행합니다.
- npm publish 전 version, changelog, license, repository metadata를 확인합니다.

## 관련 문서

- SDK 사용 가이드: [`usage-guide.md`](./usage-guide.md)
- 개인정보 모델: [`privacy.md`](./privacy.md)
- payload 포맷: [`payload-format.md`](./payload-format.md)
- 성능 예산: [`performance-budget.md`](./performance-budget.md)
