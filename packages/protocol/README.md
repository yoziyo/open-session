# @open-session/protocol

Open Session payload를 다루는 protocol helper 패키지입니다.

English: [`README.en.md`](./README.en.md)

이 패키지는 아래 기능을 제공합니다.

- replay event/session TypeScript 계약
- `osr1:` envelope encode/decode helper
- compact session payload 변환
- compact string/template coding을 포함한 Brotli 압축/해제
- Web Crypto 우선 암호화/복호화와 `crypto.subtle`이 없는 개발 환경용 JS fallback

## 기본 사용법

```ts
import { decodeReplayPayload, encodeReplayPayload } from "@open-session/protocol";

const encoded = await encodeReplayPayload(session, passphrase);
const decoded = await decodeReplayPayload(encoded, passphrase);
```

## release 계약

배포 패키지는 `dist/`의 build 결과를 노출합니다. publish 전에는 저장소 root에서 아래 명령을 실행하세요.

```bash
pnpm release:verify
```

## 라이선스

MIT. 패키지 tarball에는 `LICENSE`가 포함됩니다.
