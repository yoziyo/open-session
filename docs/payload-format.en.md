# Payload Format

Korean: [`payload-format.md`](./payload-format.md)

The transport payload is one copy/paste-safe string using the compact envelope:

```text
osr1:2.<base64url-compact-metadata>.<base64url-encrypted-compressed-bytes>
```

The compact envelope keeps only one base64url layer around the encrypted bytes
and uses short metadata keys. The encrypted bytes are still base64url because
they must remain copy/paste-safe text.

## Compact metadata

The first segment contains base64url-encoded JSON with short keys:

- `v`: public replay envelope version, currently `1`.
- `t`: encoding time.
- `d`: SDK version. SDK name is reconstructed as `@open-session/sdk`.
- `a`: app metadata, with `i` for app id and `u` for app URL.
- `s`: session id.
- `k`: crypto tuple `[salt, iv, iterations]`. Algorithm/key defaults are
  `AES-GCM`, `PBKDF2`, and `256` bits.
- `z`: compression tuple `[originalBytes, compressedBytes, level]`. Algorithm is
  `brotli`.
- `x`: stats tuple `[eventCount, droppedEvents, truncatedEvents, redactionCount]`.

The second segment is the base64url AES-GCM ciphertext. After decryption, the
bytes are Brotli-compressed compact-session JSON. The compact body is an
implementation detail, not a human-readable transport contract.

Decoding order: remove `osr1:` prefix, parse segments, derive key from
passphrase, decrypt bytes, decompress JSON, expand
`compact-session-v1` when present, validate replay session.

Payload-size defaults:

- Payload event IDs are compact/generated during decode instead of serializing
  UUID-sized IDs. They only need to be stable and unique inside the replay
  session.
- Events keep redacted `pageUrl` context. Dedicated `navigation` events also
  record redacted `fromUrl`/`toUrl` route transitions. Repeated URLs are stored
  through the compact string dictionary rather than removed during flush.
- Character keydown events store `[character]`, omit physical key code, and may
  coalesce into one event with `count` and `lastTimestamp`.
- Click, console, and safe repeated network bursts can also coalesce with `count`
  and `lastTimestamp` while preserving diagnostic status/timing fields.
