# Payload format

Korean: [`payload-format.md`](./payload-format.md)

The transport payload is one copy/paste-safe string. It uses the compact envelope.

```text
osr1:2.<base64url-compact-metadata>.<base64url-encrypted-compressed-bytes>
```

## Compact metadata

The first segment is base64url-encoded JSON with short keys.

- `v`: public replay envelope version. Currently `1`.
- `t`: encoding time.
- `d`: SDK version. SDK name is restored as `@open-session/sdk`.
- `a`: app metadata. `i` is app id, and `u` is app URL.
- `s`: session id.
- `k`: crypto tuple `[salt, iv, iterations]`. Algorithm/key defaults are `AES-GCM`, `PBKDF2`, and `256` bits.
- `z`: compression tuple `[originalBytes, compressedBytes, level]`. Algorithm is `brotli`.
- `x`: stats tuple `[eventCount, droppedEvents, truncatedEvents, redactionCount]`.

The second segment is base64url AES-GCM ciphertext. After decryption, the bytes are Brotli-compressed compact-session JSON. The compact body is an implementation detail, not a human-readable transport contract.

Decode order: remove `osr1:` prefix, parse segments, derive key with the passphrase, decrypt bytes, decompress JSON, expand when `compact-session-v1` exists, validate replay session.

Payload size defaults:

- Payload event IDs are generated in compact/generated form during decode instead of serializing UUID-sized IDs. They only need to be stable and unique inside the replay session.
- Events keep redacted `pageUrl` context. Dedicated `navigation` events also record redacted `fromUrl`/`toUrl` route transitions. Repeated URLs are stored in the compact string dictionary instead of being removed during flush.
- Character keydown events store `[character]` and omit the physical key code. Repeated input may be combined into one event with `count` and `lastTimestamp`.
- Click, console, and safe repeated network bursts can also be combined with `count` and `lastTimestamp` while preserving diagnostic status/timing fields.
