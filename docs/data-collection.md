# Data collection inventory

English: [`data-collection.en.md`](./data-collection.en.md)

Open Session은 화면 녹화 도구가 아니라 오류 분석용 metadata 수집 도구입니다. 아래 표는 SDK가 기본 설정에서 어떤 값을 남기고, 어떤 값은 수집하지 않으며, 어떤 옵션으로 줄일 수 있는지 정리한 기준표입니다.

## 수집 항목별 기준

| 구분 | 기본 수집 여부 | 저장되는 값 | 저장하지 않는 값 | 보안/개인정보 처리 | 제어 옵션 |
| --- | --- | --- | --- | --- | --- |
| Session metadata | 수집 | `appId`, `sessionId`, optional `userId`, SDK version, redacted page URL, user agent, viewport, created time | cookie, localStorage, full account profile | page URL query는 redaction 후 저장 | `sessionId`, `userId`, `additionalQueryKeys`, `beforeSend` |
| Lifecycle | 수집 | `init`, `flush`, optional flush reason, redacted page URL | app state snapshot, React tree | reason은 caller가 넣은 string이므로 민감값을 넣지 않아야 함 | `beforeSend` |
| Click | 수집 | target descriptor, mouse button, repeat count, redacted page URL | element text, input value, DOM snapshot, screenshot | sensitive/masked DOM target은 `data-redacted` selector로 대체 | `capture.clicks`, `maskSelectors`, `excludeSelectors` |
| Keydown | 수집 | 입력이 있었다는 event, non-sensitive key category, repeat count, target descriptor | password value, raw sensitive key, raw code | password/sensitive input은 masked event만 남김 | `capture.keydown`, `maskSelectors`, `excludeSelectors` |
| Navigation | 수집 | `pushState`, `replaceState`, `popstate`, `hashchange`, redacted from/to URL | browser history object state, document title, page content | from/to URL query는 redaction 후 저장 | `capture.navigation`, `additionalQueryKeys` |
| Network | 수집 | method, redacted URL, status, duration, ok/error marker, redaction marker | request body, response body, request/response headers, cookies, authorization values | sensitive query redaction, headers/body는 marker만 기록 | `capture.network`, `excludeUrls`, `networkStatusFilter`, `additionalQueryKeys` |
| Console | 수집 | selected console level, sanitized args, redaction marker, repeat count | unbounded object graph, functions, symbols, secret-like field values | secret-like string/object key redaction, depth/size budget 적용 | `capture.console`, `consoleLevels`, `excludeConsole`, console budget options |
| Error | 수집 | error name, sanitized message, sanitized stack, optional component stack | full component state, props, source file content | message/stack/component stack에 string sanitizer와 length budget 적용 | `capture.errors`, `beforeSend` |
| Manual events | caller controlled | `client.addEvent()`로 넣은 `ReplayEvent` | SDK가 자동 redaction을 보장하지 않는 caller-defined field | caller가 public schema와 redaction policy를 지켜야 함 | app wrapper, `beforeSend` |

## 민감 query key

기본 redaction 대상 query key는 다음과 같습니다.

```text
token, access_token, refresh_token, id_token, password, pass, secret,
client_secret, key, api_key, code, otp, email, auth, authorization,
session, jwt, signature, sig
```

서비스별 민감 key는 `additionalQueryKeys`에 추가합니다.

## 처리·보관 경계

| 단계 | 처리 방식 | 보안 기준 |
| --- | --- | --- |
| Capture | 브라우저 메모리 buffer에 metadata event만 보관 | 화면/DOM snapshot을 만들지 않음 |
| Buffer limit | event count와 approximate byte budget으로 제한 | error, failed network, warn/error console, user action을 우선 보존 |
| Flush | replay session을 compact → Brotli compress → AES-GCM encrypt | `passphrase`는 payload에 포함하지 않음 |
| Transport | SDK는 user-provided `transport(payload)`만 호출 | Slack/S3/OpenSearch credential은 브라우저 코드에 두지 않음 |
| Viewer | pasted `osr1:` payload를 passphrase로 local decode | 내장 Viewer는 payload를 collector로 업로드하지 않음 |
