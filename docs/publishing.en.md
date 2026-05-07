# Publishing

This document only covers the execution steps for publishing Open Session packages to npm. The publishable packages are `@open-session/protocol` and `@open-session/sdk`. The Viewer and sample app are not published to npm.

## Rules

- `main` pushes do not publish to npm.
- `main` pushes run CI verification only.
- npm publishing runs only on `v*` tag pushes.
- CI does not store a long-lived `NPM_TOKEN`.
- npm publishing uses Trusted Publishing (OIDC).
- Package tarballs are created with `pnpm pack`, then published with `npm publish <tarball>`.

## First manual publish

If a package does not exist in the npm registry yet, there may be no package page where Trusted Publisher can be connected. In that case, publish the first version manually from a local npm account.

```bash
git pull --ff-only
corepack enable
pnpm install --frozen-lockfile
pnpm release:verify
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

Make sure the registry uses HTTPS.

```bash
npm config get registry
npm config set registry https://registry.npmjs.org/
```

For manual publish, create tarballs first and publish those tarballs.

```bash
tmp=$(mktemp -d)
pnpm --dir packages/protocol pack --pack-destination "$tmp"
pnpm --dir packages/sdk pack --pack-destination "$tmp"

tar -xOf "$tmp"/open-session-protocol-*.tgz package/package.json | jq '{name,version,main,types,exports}'
tar -xOf "$tmp"/open-session-sdk-*.tgz package/package.json | jq '{name,version,main,types,exports}'

npm publish "$tmp"/open-session-protocol-*.tgz --access public --tag latest --registry=https://registry.npmjs.org/
npm publish "$tmp"/open-session-sdk-*.tgz --access public --tag latest --registry=https://registry.npmjs.org/
```

Confirm `main`, `types`, and `exports` point to `dist/...` before publishing. If npm asks for a 2FA OTP, enter it in the npm prompt.

## Connect Trusted Publisher

After the first package exists on npm, connect Trusted Publisher for each package.

- package: `@open-session/protocol`, `@open-session/sdk`
- provider: GitHub Actions
- owner/user: `yoziyo`
- repository: `open-session`
- workflow filename: `release.yml`
- environment: leave blank

A manually published version such as 0.1.0 may not have provenance. Confirm provenance on the next tag-triggered CI publish.

## Writing changesets during work

`pnpm changeset` is not automatic. The person making a package-visible change adds one manually.

```bash
pnpm changeset
```

Add a changeset when:

- `@open-session/sdk` or `@open-session/protocol` runtime/API behavior changes
- a bug fix affects npm package consumers
- README, package docs, exports, or publish metadata changes are visible to package consumers
- Viewer-only or sample-app-only changes usually do not need a changeset

If many changes belong to the same release, keep multiple changesets. Before release, `pnpm version-packages` combines them into one version/changelog update per package and chooses the largest bump.

```text
patch + patch = patch
patch + minor = minor
patch + major = major
```

It is fine to keep multiple changesets during development. A person may merge them before release, but it is not required.

## Normal release

When it is time to release, update versions/changelogs locally and commit them.

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

Then create and push a release tag on that same commit.

```bash
git tag v0.2.0
git push origin v0.2.0
```

The `v*` tag push runs the `Publish` workflow in `.github/workflows/release.yml`. The workflow runs `pnpm release:verify` again and publishes only package versions that are not already on npm.

The key rule is that the version/changelog commit must already be on `main` before the tag is created. The tag workflow does not change versions; it only publishes.

## Verify publish

```bash
npm view @open-session/protocol version dist-tags --json
npm view @open-session/sdk version dist-tags --json
```

On the npm package page, confirm:

- version and `latest` dist-tag
- README rendering
- `LICENSE`
- `exports` point to `dist` artifacts
- provenance

## Troubleshooting

- `426 Upgrade Required`: npm registry is set to `http://registry.npmjs.org`. Change it to `https://registry.npmjs.org/`.
- `E403`: check npm scope permission, package name, 2FA/OTP, and Trusted Publisher connection.
- Version already published: npm cannot publish the same version twice. Release the next version.
- `--no-git-checks` warning/error: do not use `pnpm publish` directly for manual publish. Use `pnpm pack`, then `npm publish <tarball>`.
