# Privacy model

English: [`privacy.en.md`](./privacy.en.md)

수집 항목별 기준표: [`data-collection.md`](./data-collection.md)

SDK는 보수적인 privacy model에서 시작합니다. Secret이 아니라 진단용 metadata를 수집하고, MVP에서는 완벽한 replay fidelity보다 redaction을 우선합니다.

## 기본 redaction rule

| Surface | 기본 동작 |
| --- | --- |
| Password inputs | keydown이 있었다는 사실만 기록합니다. raw key, code, value는 직렬화하지 않습니다. |
| Sensitive DOM targets | `input[type="password"]`, `data-replay-mask`, `data-mask`, `aria-hidden="true"`, user `maskSelectors` 아래 target을 mask합니다. |
| Excluded DOM targets | user `excludeSelectors`에 걸리는 click/keydown event를 버립니다. |
| Current page URL | session metadata와 event `pageUrl` field에는 redaction된 `location.href`만 저장합니다. |
| URL query params | `token`, `access_token`, `refresh_token`, `id_token`, `password`, `pass`, `secret`, `client_secret`, `key`, `api_key`, `code`, `otp`, `email`, `auth`, `authorization`, `session`, `jwt`, `signature`, `sig`, user `additionalQueryKeys`를 redact합니다. |
| Network headers/bodies | request/response body나 header를 수집하지 않고 redaction marker만 기록합니다. |
| Console args | 얕은 진단 데이터를 직렬화하고, 민감한 object key와 token-like string을 redact하며, 큰 값은 truncate합니다. |
| Errors/component stacks | Message, error stack, optional UI/component stack은 payload encoding 전에 sanitize합니다. |
| Payload transport | User transport callback이 data를 받기 전에 compact, encrypt, compress를 끝냅니다. |

## User controls

`initOpenSession`은 아래 옵션을 지원합니다.

- `excludeUrls`: matching URL의 network event를 버립니다.
- `excludeConsole`: string 또는 regex와 matching되는 console event를 버립니다.
- `maskSelectors`: event는 유지하되 DOM target descriptor를 mask합니다.
- `excludeSelectors`: DOM interaction event를 완전히 버립니다.
- `additionalQueryKeys`: 추가 URL query key를 redact합니다.
- `capture`: clicks, keydown, navigation, network, console, errors category를 끌 수 있습니다.
- `maxSanitizedStringLength`: 큰 문자열을 제한합니다. console 인자 수, object key 수, stack 길이는 SDK 내부 기본값으로 제한합니다.
- `compressionLevel`: Brotli size/CPU tradeoff를 조정합니다.
- `processing`: `main-thread`, `auto`, `worker` flush encoding을 선택합니다.

## Failure isolation

Capture, encoding, transport, cleanup 실패는 host app에서 격리됩니다. 실패한 flush는 `{ ok: false, error }`를 반환하며 host app을 crash시키면 안 됩니다.

## Verification

Privacy 동작은 unit test와 browser E2E test로 확인합니다. Test는 decoded payload JSON과 viewer-rendered text를 모두 검사해서 알려진 secret이 없는지 확인합니다.
