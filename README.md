# Open Session

[`한국어`](./README.md) / [`English`](./README.en.md)

Open Session은 브라우저 오류 직전의 이벤트를 짧게 모아 암호화하고, 상황을 다시 볼 수 있게 돕는 라이브러리입니다.

화면을 녹화하진 않습니다. SDK는 클릭, 키 입력 여부, 화면 이동, 네트워크 상태, 콘솔 로그, 에러 같은 metadata만 메모리에 보관합니다. 앱이 `flushOpenSession()`을 호출하면 SDK가 payload를 compact, 압축, 암호화해서 반환합니다.

## 특징

- 사용자가 에러를 마주하기 전까지 어떤 일이 있었는지 확인 할 수 있습니다.
- 브라우저 오류를 더 면밀하게 파악 하기 위해서 사용할 수 있습니다.
- 비용적 부담으로 다른 SaaS에서 sampling 해야하거나, 데이터를 모두 수집할 수 없는 상황에 가볍게 사용할 수 있습니다.
- 발생한 payload를 webhook 등 다양한 방법으로 전달받고, viewer를 통해 확인할 수 있습니다.
- 네트워크 header/body와 password 값은 기본으로 수집하지 않습니다.

## 동작 방식

1. 앱의 client 코드에서 `@open-session/sdk`를 초기화합니다.
2. SDK가 선택된 이벤트를 메모리 buffer에 보관합니다.
3. Error Boundary, 전역 오류 핸들러, 수동 리포트 지점에서 `flushOpenSession()`을 호출합니다.
4. SDK가 replay session을 compact, 압축, 암호화합니다.
5. Viewer에서 같은 passphrase로 payload를 열어서 확인합니다.

## SDK 예제

### 빠른 시작

기본값으로 충분하면 필수값과 transport만 넣습니다. 클릭, 키 입력 여부, 화면 이동, 네트워크, 콘솔, 에러 수집은 기본으로 동작합니다.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  passphrase: "replace-with-user-controlled-secret",
  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload);
  },
});

captureError(error, { componentStack: info.componentStack });
void flushOpenSession("error-boundary");
```

### 상세 옵션

운영 환경에서는 필요한 옵션만 골라서 추가합니다. 아래 값은 예시이며, 지정하지 않은 옵션은 SDK 기본값을 사용합니다.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web", // 앱/서비스 구분
  sessionId: "checkout-session-id", // 기존 세션 ID 연결
  userId: "internal-user-id", // 민감하지 않은 식별자만 사용
  passphrase: "replace-with-user-controlled-secret", // payload 암호화 키

  sampleRate: 0.25, // 0~1 세션 단위 샘플링
  maxEvents: 250, // 버퍼 최대 이벤트 수
  maxApproxBytes: 750_000, // 압축 전 버퍼 크기 제한
  compressionLevel: 6, // 0~9 압축 수준
  keydownCoalesceWindowMs: 350, // 연속 keydown 묶음 시간

  capture: {
    clicks: true, // click metadata 수집
    keydown: true, // 입력값 없이 keydown 여부 수집
    navigation: true, // History/hash 화면 이동 수집
    network: true, // fetch/XHR metadata 수집
    console: true, // console metadata 수집
    errors: true, // window error/rejection 수집
  },
  consoleLevels: ["warn", "error"], // 수집할 console level
  networkStatusFilter: (status) => status === undefined || status >= 400, // 실패 API만 유지

  additionalQueryKeys: ["paymentToken"], // 추가 query redaction key
  maskSelectors: ["[data-private]"], // DOM text/value 마스킹
  excludeSelectors: ["[data-never-record]"], // 해당 DOM 이벤트 제외
  excludeUrls: [/\/health$/, /\/metrics$/], // 해당 URL 수집 제외
  excludeConsole: [/secret/i], // 해당 console 내용 제외
  maxSanitizedStringLength: 500, // 긴 문자열 truncate 기준
  maxConsoleArgs: 20, // console args 최대 개수
  maxConsoleObjectKeys: 30, // object key 최대 개수
  maxConsoleArrayEntries: 20, // array entry 최대 개수
  maxErrorStackLength: 5_000, // error stack 길이 제한
  maxComponentStackLength: 3_000, // component stack 길이 제한

  processing: "main-thread", // flush 처리 위치
  flushWorkerTimeoutMs: 5_000, // worker flush timeout
  debug: true, // init/flush 실패 진단 로그 출력

  transport(payload) {
    console.log("OPEN_SESSION_PAYLOAD", payload); // 저장/전송 연결 지점
  },
  beforeSend(session) {
    return session.stats.eventCount > 0 ? session : null; // 전송 직전 마지막 필터
  },
});

captureError(error, { componentStack: info.componentStack });
void flushOpenSession("error-boundary");
```

## 관련 링크

- 온라인 Viewer: https://yoziyo.github.io/open-session/viewer/
- 온라인 Sample app: https://yoziyo.github.io/open-session/sample/
- GitHub repository: https://github.com/yoziyo/open-session
- npm SDK: https://www.npmjs.com/package/@open-session/sdk
- npm Protocol: https://www.npmjs.com/package/@open-session/protocol

## 빠른 데모

```bash
pnpm install
pnpm --filter @open-session/viewer dev
pnpm --filter @open-session/sample-next dev

#샘플에 사용되는 passphrase:
demo-passphrase
```

## 워크스페이스

- `packages/protocol`: replay 타입, compact format, compression, encryption, `osr1:` envelope
- `packages/sdk`: browser capture, redaction, buffer, flush, transport callback
- `apps/viewer`: payload를 여는 Viewer
- `apps/sample-next`: 결제 실패 흐름을 통해 재현하는 Next.js sample


## 문서

- 기술 가이드: [`docs/technical-guide.md`](./docs/technical-guide.md)
- Technical guide English: [`docs/technical-guide.en.md`](./docs/technical-guide.en.md)
- SDK 사용 가이드: [`docs/usage-guide.md`](./docs/usage-guide.md)
- SDK usage guide English: [`docs/usage-guide.en.md`](./docs/usage-guide.en.md)
- 개인정보 모델: [`docs/privacy.md`](./docs/privacy.md)
- 수집 항목 표: [`docs/data-collection.md`](./docs/data-collection.md)
- payload 포맷: [`docs/payload-format.md`](./docs/payload-format.md)
- 성능 예산: [`docs/performance-budget.md`](./docs/performance-budget.md)
- 배포 방법: [`docs/publishing.md`](./docs/publishing.md)
- Protocol README: [`packages/protocol/README.md`](./packages/protocol/README.md)
- SDK README: [`packages/sdk/README.md`](./packages/sdk/README.md)
- Viewer README: [`apps/viewer/README.md`](./apps/viewer/README.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)

## 라이선스

MIT. 자세한 내용은 [`LICENSE`](./LICENSE)를 참고하세요.
