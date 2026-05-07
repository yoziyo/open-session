# Open Session

[`한국어`](./README.md) / [`English`](./README.en.md)

Open Session은 브라우저 오류 직전의 이벤트를 짧게 모아 암호화하고, 당시 상황을 다시 볼 수 있게 돕는 라이브러리입니다.

화면을 녹화하지는 않습니다. SDK는 클릭, 키 입력 여부, 화면 이동, 네트워크 상태, 콘솔 로그, 에러 같은 metadata만 메모리에 보관합니다. 앱이 `flushOpenSession()`을 호출하면 SDK가 payload를 줄이고 압축한 뒤 암호화해서 반환합니다.

## 특징

- 사용자가 에러를 만나기 전 어떤 일이 있었는지 확인할 수 있습니다.
- 브라우저 오류의 원인을 더 쉽게 좁힐 수 있습니다.
- 비용 때문에 다른 SaaS에서 샘플링만 해야 하거나, 모든 데이터를 수집하기 어려운 상황에서 가볍게 사용할 수 있습니다.
- 생성된 payload를 webhook 등으로 전달받고, Viewer에서 확인할 수 있습니다.
- 네트워크 header/body와 password 값은 기본적으로 수집하지 않습니다.

## 동작 방식

1. 앱의 client 코드에서 `@open-session/sdk`를 초기화합니다.
2. SDK가 선택된 이벤트를 메모리 buffer에 보관합니다.
3. Error Boundary, 전역 오류 핸들러, 수동 리포트 지점에서 `flushOpenSession()`을 호출합니다.
4. SDK가 replay session을 줄이고 압축한 뒤 암호화합니다.
5. [Viewer](https://yoziyo.github.io/open-session/viewer/)에서 같은 passphrase로 payload를 열어서 확인합니다.

## SDK 예제

### 가장 빠른 체험

Viewer와 샘플 사이트에서 반환되는 payload와 뷰어 동작을 확인할 수 있습니다.

- Viewer: https://yoziyo.github.io/open-session/viewer/
- Sample app: https://yoziyo.github.io/open-session/sample/

### 설치

애플리케이션에는 SDK만 설치하면 됩니다. `@open-session/protocol`은 payload 타입, compact format, 압축, 암호화 envelope를 담는 기반 패키지이며 SDK 의존성으로 함께 설치됩니다.

```bash
pnpm add @open-session/sdk
npm install @open-session/sdk
yarn add @open-session/sdk
```

Viewer는 payload를 열어볼 때 쓰는 별도 도구입니다. 앱 코드에 Viewer를 설치할 필요는 없습니다.

### 빠른 시작

기본 설정으로 시작하려면 필수값과 transport만 넣으면 됩니다. 클릭, 키 입력 여부, 화면 이동, 네트워크, 콘솔, 에러 수집은 기본으로 동작합니다.

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

### 자주 쓰는 예제

처음에는 최소 설정으로 시작하고, 실제 payload를 확인한 뒤 필요한 옵션만 추가하는 편을 권장합니다.

```ts
import { captureError, flushOpenSession, initOpenSession } from "@open-session/sdk";

initOpenSession({
  appId: "checkout-web", // 앱/서비스 구분
  sessionId: "checkout-session-id", // 기존 세션 ID 연결
  passphrase: "replace-with-user-controlled-secret", // payload 암호화 키

  additionalQueryKeys: ["paymentToken"], // 서비스 고유 query key 마스킹
  maskSelectors: ["[data-private]"], // 민감 영역 DOM metadata 마스킹
  excludeSelectors: ["[data-never-record]"], // 수집하지 않을 DOM 영역
  excludeUrls: [/\/health$/, /\/metrics$/], // 수집하지 않을 URL

  debug: true, // 개발 중 init/flush 진단 로그

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

더 자세한 설정은 [`SDK 사용 가이드`](./docs/usage-guide.md)를 참고하세요. 수집 항목 기준은 [`수집 항목 표`](./docs/data-collection.md), payload 구조는 [`payload 포맷`](./docs/payload-format.md)에 정리되어 있습니다.

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
- `apps/sample-next`: 결제 실패 흐름을 재현하는 Next.js sample

## 문서

- 기술 가이드: [`docs/technical-guide.md`](./docs/technical-guide.md)
- SDK 사용 가이드: [`docs/usage-guide.md`](./docs/usage-guide.md)
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
