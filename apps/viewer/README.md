# Open Session Viewer

Viewer는 `@open-session/sdk`가 만든 암호화된 `osr1:` payload를 열어 보는
도구입니다. 로그인 없이 로컬에서 payload를 붙여넣고 passphrase로 복호화한 뒤
세션을 확인합니다.

English: [`README.en.md`](./README.en.md)

서비스 README: [`../../README.md`](../../README.md)

## 확인할 수 있는 것

- 에러 요약과 stack 정보
- 에러 직전의 실패 흐름
- 필터와 가상 스크롤이 있는 이벤트 스트림
- 네트워크 상태와 요청 시간
- 콘솔 메시지
- 개인정보 보호/redaction 상태
- 압축, 이벤트 수, drop 수 같은 payload 정보

Viewer는 SDK의 decode helper를 사용합니다. 별도 decoder를 따로 두지 않습니다.

## 로컬 실행

```bash
pnpm --filter @open-session/viewer dev
```

Vite dev server가 로컬 URL을 출력합니다. 브라우저에서 열고 `osr1:...` payload와 SDK에서 사용한 passphrase를 입력합니다.

테스트 중에는 URL로 passphrase를 미리 넣을 수 있습니다.

```text
http://localhost:3101?passphrase=demo-passphrase
```

## 내장 샘플 보기

첫 화면의 sample 버튼을 누르면 내장된 결제 실패 payload를 바로 열 수 있습니다.
샘플 앱을 실행하지 않아도 Viewer UI를 확인할 수 있습니다.

실제 end-to-end 흐름을 보려면 샘플 앱도 함께 실행하세요.

```bash
pnpm --filter @open-session/sample-next dev
```

샘플에서 에러를 발생시키고 DevTools에서 `OPEN_SESSION_PAYLOAD osr1:...` 값을 복사합니다. Viewer에 붙여넣고 `demo-passphrase`로 엽니다.

## 빌드

```bash
pnpm --filter @open-session/viewer build
```

브라우저에서 payload를 복호화하기 위해 Brotli WASM asset이 포함됩니다. 이 asset은 첫 화면에서 바로 불러오지 않고 decode 시점에 lazy-load합니다.

## 다국어

Viewer는 첫 진입 시 브라우저 언어를 따르고, 화면에서도 언어를 바꿀 수 있습니다. 리소스 파일은 아래에 있습니다.

- `src/shared/i18n/resources/ko.json`
- `src/shared/i18n/resources/en.json`

## 유지보수 메모

- payload decode는 `@open-session/sdk`를 통해 처리합니다.
- 긴 이벤트 목록은 virtualized list를 유지합니다.
- screenshot이나 fixture에 실제 secret이 들어가지 않도록 합니다.
- payload 포맷이 바뀌면 내장 샘플 payload와 E2E 테스트도 같이 갱신합니다.

## 관련 문서

- SDK README: [`../../packages/sdk/README.md`](../../packages/sdk/README.md)
- payload 포맷: [`../../docs/payload-format.md`](../../docs/payload-format.md)
- 개인정보 모델: [`../../docs/privacy.md`](../../docs/privacy.md)
- 브라우저 QA: [`../../docs/browser-use-qa.md`](../../docs/browser-use-qa.md)
