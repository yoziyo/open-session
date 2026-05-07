# Payload format

English: [`payload-format.en.md`](./payload-format.en.md)

전송 payload는 복사해서 붙여넣을 수 있는 문자열 하나입니다. 형식은 compact envelope입니다.

```text
osr1:2.<base64url-compact-metadata>.<base64url-encrypted-compressed-bytes>
```

## Compact metadata

첫 번째 segment는 짧은 key로 된 JSON을 base64url로 인코딩한 값입니다.

- `v`: public replay envelope version. 현재 `1`입니다.
- `t`: encoding time.
- `d`: SDK version. SDK name은 `@open-session/sdk`로 복원합니다.
- `a`: app metadata. `i`는 app id, `u`는 app URL입니다.
- `s`: session id.
- `k`: crypto tuple `[salt, iv, iterations]`. Algorithm/key 기본값은 `AES-GCM`, `PBKDF2`, `256` bits입니다.
- `z`: compression tuple `[originalBytes, compressedBytes, level]`. Algorithm은 `brotli`입니다.
- `x`: stats tuple `[eventCount, droppedEvents, truncatedEvents, redactionCount]`.

두 번째 segment는 base64url AES-GCM ciphertext입니다. 복호화한 bytes는 Brotli로 압축된 compact-session JSON입니다. compact body는 구현 세부사항이라 사람이 읽는 transport contract로 보지 않습니다.

Decode 순서는 다음과 같습니다. `osr1:` prefix 제거, segment parse, passphrase로 key derive, bytes decrypt, JSON decompress, `compact-session-v1`이 있으면 expand, replay session validate.

Payload size 기본 동작:

- Payload event ID는 UUID 크기의 ID를 직렬화하지 않습니다. decode 중 compact/generated 형태로 만들며, replay session 안에서 stable하고 unique하면 충분합니다.
- Event는 redaction된 `pageUrl` context를 유지합니다. 전용 `navigation` event는 redaction된 `fromUrl`/`toUrl` 화면 이동도 기록합니다. 반복 URL은 flush 중 제거하지 않고 compact string dictionary로 저장합니다.
- Character keydown event는 `[character]`를 저장하고 physical key code를 생략합니다. 반복 입력은 `count`와 `lastTimestamp`가 있는 하나의 event로 합쳐질 수 있습니다.
- Click, console, 안전한 반복 network burst도 진단용 status/timing field를 유지한 채 `count`와 `lastTimestamp`로 합칠 수 있습니다.
