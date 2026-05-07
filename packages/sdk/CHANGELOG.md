# @open-session/sdk

## 0.1.1

### Patch Changes

- cbd3dd5: Open Session으로 패키지와 뷰어를 리브랜딩했습니다. 브라우저 오류 직전의 클릭, 키 입력 여부, 화면 이동, 네트워크 상태, 콘솔 로그, 오류 메타데이터를 암호화된 `osr1:` payload로 만들고 Viewer에서 열 수 있습니다.

  SDK에는 navigation 수집, `capture.*`, `consoleLevels`, `networkStatusFilter`, `sampleRate`, `beforeSend` 옵션을 추가했고, wrapper에서 재사용할 기본값과 SDK version/payload prefix export를 공개했습니다.

  `crypto.subtle`을 사용할 수 없는 개발 환경에서도 payload를 만들 수 있도록 Web Crypto 우선 암호화에 JS fallback을 추가했습니다. SDK에는 `debug` 옵션을 추가해 초기화, capture 설치, flush 실패를 payload나 passphrase 없이 진단 로그로 확인할 수 있게 했습니다.

  민감 query redaction 범위를 넓히고, 수집 항목과 privacy boundary, release readiness, API 안정성 기준, 운영 보안 기준을 문서로 정리했습니다. 패키지 metadata를 실제 GitHub remote 기준으로 정리하고, Changesets version PR과 tag 기반 npm Trusted Publishing release flow를 구성했습니다. protocol/sdk tarball은 `dist`, README, LICENSE만 포함하고 clean install ESM smoke test로 검증합니다.

- Updated dependencies [cbd3dd5]
  - @open-session/protocol@0.1.1
