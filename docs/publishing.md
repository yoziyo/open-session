# 배포 방법

이 문서는 Open Session package를 npm에 배포할 때 쓰는 실행 절차만 정리합니다. 배포 대상은 `@open-session/protocol`과 `@open-session/sdk`입니다. Viewer와 sample app은 npm에 배포하지 않습니다.

## 기본 원칙

- `main` push는 npm publish를 실행하지 않습니다.
- `main` push는 CI 검증만 실행합니다.
- npm publish는 `v*` tag push에서만 실행합니다.
- CI에는 장기 `NPM_TOKEN`을 저장하지 않습니다.
- npm 배포는 Trusted Publishing(OIDC)을 사용합니다.
- package tarball은 `pnpm pack`으로 만들고, 실제 publish는 `npm publish <tarball>` 경로를 사용합니다.

## 최초 1회 수동 배포

package가 npm registry에 아직 없으면 Trusted Publisher를 연결할 package 페이지가 없을 수 있습니다. 이 경우 최초 버전만 로컬에서 수동으로 배포합니다.

```bash
git pull --ff-only
corepack enable
pnpm install --frozen-lockfile
pnpm release:verify
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

registry가 반드시 HTTPS인지 확인합니다.

```bash
npm config get registry
npm config set registry https://registry.npmjs.org/
```

수동 publish는 tarball을 만든 뒤 tarball을 publish합니다.

```bash
tmp=$(mktemp -d)
pnpm --dir packages/protocol pack --pack-destination "$tmp"
pnpm --dir packages/sdk pack --pack-destination "$tmp"

tar -xOf "$tmp"/open-session-protocol-*.tgz package/package.json | jq '{name,version,main,types,exports}'
tar -xOf "$tmp"/open-session-sdk-*.tgz package/package.json | jq '{name,version,main,types,exports}'

npm publish "$tmp"/open-session-protocol-*.tgz --access public --tag latest --registry=https://registry.npmjs.org/
npm publish "$tmp"/open-session-sdk-*.tgz --access public --tag latest --registry=https://registry.npmjs.org/
```

`main`, `types`, `exports`가 `dist/...`를 가리키는지 확인한 뒤 publish합니다. 2FA OTP를 요구하면 npm prompt에 입력합니다.

## Trusted Publisher 연결

최초 package가 npm에 생기면 package별로 Trusted Publisher를 연결합니다.

- package: `@open-session/protocol`, `@open-session/sdk`
- provider: GitHub Actions
- owner/user: `yoziyo`
- repository: `open-session`
- workflow filename: `release.yml`
- environment: 비움

0.1.0처럼 수동으로 배포한 버전은 provenance가 없을 수 있습니다. 이후 tag 기반 CI 배포부터 provenance가 붙는지 확인합니다.

## 작업 중 changeset 작성

`pnpm changeset`은 자동으로 실행되지 않습니다. Package 사용자에게 의미 있는 변경을 만들 때 작업자가 직접 추가합니다.

```bash
pnpm changeset
```

작성 기준은 아래와 같습니다.

- `@open-session/sdk` 또는 `@open-session/protocol`의 runtime/API가 바뀐 경우
- 버그 수정이 npm package 사용자에게 영향을 주는 경우
- README, package 문서, export, publish metadata처럼 package 소비자에게 보이는 내용이 바뀐 경우
- Viewer나 sample app만 바뀌고 npm package 내용이 바뀌지 않은 경우에는 보통 changeset을 만들지 않습니다.

같은 릴리즈에 변경이 많으면 changeset을 여러 개 쌓아둡니다. 릴리즈 직전 `pnpm version-packages`가 package별로 가장 큰 bump를 골라 한 번의 version/changelog 갱신으로 합칩니다.

```text
patch + patch = patch
patch + minor = minor
patch + major = major
```

작업 중 여러 changeset을 그대로 둬도 괜찮습니다. 릴리즈 전에 사람이 하나로 합칠 수는 있지만 필수는 아닙니다.

## 일반 릴리즈

릴리즈할 시점에는 로컬에서 version/changelog를 갱신하고 커밋합니다.

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm release:verify
pnpm version-packages
git status --short
git add .
git commit -m "chore: release v0.2.0"
git push origin main
```

그 다음 같은 커밋에 release tag를 만들고 push합니다.

```bash
git tag v0.2.0
git push origin v0.2.0
```

`v*` tag push가 `.github/workflows/release.yml`의 `Publish` workflow를 실행합니다. 이 workflow는 `pnpm release:verify`를 다시 실행하고, 아직 npm에 없는 package version만 publish합니다.

중요한 기준은 tag 전에 version/changelog commit이 이미 `main`에 있어야 한다는 점입니다. Tag workflow는 version을 바꾸지 않고 publish만 합니다.

## 배포 확인

```bash
npm view @open-session/protocol version dist-tags --json
npm view @open-session/sdk version dist-tags --json
```

npm package 페이지에서 아래를 확인합니다.

- version과 `latest` dist-tag
- README 표시
- `LICENSE`
- `exports`가 `dist` artifact를 가리키는지
- provenance 표시

## 실패 시 확인할 것

- `426 Upgrade Required`: npm registry가 `http://registry.npmjs.org`로 잡힌 상태입니다. `https://registry.npmjs.org/`로 바꿉니다.
- `E403`: npm scope 권한, package name, 2FA/OTP, Trusted Publisher 연결을 확인합니다.
- 이미 publish된 version: 같은 version은 다시 publish할 수 없습니다. 다음 version을 올려야 합니다.
- `--no-git-checks` 경고/오류: 수동 publish 때 `pnpm publish`를 직접 쓰지 말고, `pnpm pack` 후 `npm publish <tarball>`을 사용합니다.
