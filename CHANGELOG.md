# Changelog

## Unreleased

### Added

- Rebranded packages and Viewer from Rewind Session to Open Session.
- Added `navigation` replay events for History API, popstate, and hashchange changes.
- Added SDK capture controls for `capture.navigation`, `consoleLevels`, `networkStatusFilter`, `sampleRate`, and `beforeSend`.
- Added exported SDK defaults for wrapper code: `DEFAULT_CAPTURE_OPTIONS`, `DEFAULT_REPLAY_LIMITS`, `OPEN_SESSION_SDK_VERSION`, and `OPEN_SESSION_PAYLOAD_PREFIX`.
- Added a Viewer error flow section for route changes, user actions, failed APIs, console signals, and errors.
- Added Changesets-based versioning and GitHub Actions release flow.

### Changed

- Payload prefix is now `osr1:`.
- Public package scope is now `@open-session/*`.
- Release package metadata now includes MIT license, repository, homepage, bugs, and package-local LICENSE files.
- Package verification now installs packed tarballs into a clean temporary project and checks ESM imports.
- Sensitive query redaction now covers OAuth/token/signature-style keys by default.

### Security

- Added a data collection inventory and privacy/security guidance for collected and excluded values.
- Added a root `pnpm.overrides.postcss` pin to keep dependency audit clean.
- Hardened package verification so tarballs include `dist`, README, and LICENSE while excluding `src/`.
