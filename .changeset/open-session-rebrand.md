---
"@open-session/protocol": minor
"@open-session/sdk": minor
---

Open Session으로 패키지와 뷰어를 리브랜딩했습니다. 브라우저 오류 직전의 클릭, 키 입력 여부, 화면 이동, 네트워크 상태, 콘솔 로그, 오류 메타데이터를 암호화된 `osr1:` payload로 만들고 Viewer에서 열 수 있습니다.

SDK에는 navigation 수집, `capture.*`, `consoleLevels`, `networkStatusFilter`, `sampleRate`, `beforeSend` 옵션을 추가했고, wrapper에서 재사용할 기본값과 SDK version/payload prefix export를 공개했습니다.

민감 query redaction 범위를 넓히고, 수집 항목과 privacy boundary, release readiness, API 안정성 기준, 운영 보안 기준을 문서로 정리했습니다. 패키지 metadata를 실제 GitHub remote 기준으로 정리하고, Changesets version PR과 tag 기반 npm Trusted Publishing release flow를 구성했습니다. protocol/sdk tarball은 `dist`, README, LICENSE만 포함하고 clean install ESM smoke test로 검증합니다.
