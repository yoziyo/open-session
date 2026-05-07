# @open-session/protocol

Protocol helpers for Open Session payloads.

Korean: [`README.md`](./README.md)

This package contains:

- replay event/session TypeScript contracts
- `osr1:` envelope encode/decode helpers
- compact session payload conversion
- Brotli compression/decompression with compact string/template coding
- Web Crypto-first encryption/decryption with a JS fallback when `crypto.subtle` is unavailable in development

## Basic usage

```ts
import { decodeReplayPayload, encodeReplayPayload } from "@open-session/protocol";

const encoded = await encodeReplayPayload(session, passphrase);
const decoded = await decodeReplayPayload(encoded, passphrase);
```

## Release contract

Published packages expose built files from `dist/`. Run from the repo root before
publishing:

```bash
pnpm release:verify
```

## License

MIT. The package tarball includes `LICENSE`.
