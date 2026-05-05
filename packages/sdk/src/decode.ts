import { type DecodedReplayPayload, decodeReplayPayload as decodeProtocolReplayPayload, type EncodedReplayPayload } from "@open-session/protocol";

/**
 * Decode and decrypt an encrypted `osr1:` replay payload.
 *
 * This helper is exported from the SDK so custom viewers do not need to depend
 * on the internal protocol package directly. It returns the envelope metadata
 * plus the expanded public ReplaySession shape used by the bundled viewer.
 */
export async function decodeReplayPayload(payload: EncodedReplayPayload | string, passphrase: string): Promise<DecodedReplayPayload> {
  if (!passphrase) {
    throw new Error("Passphrase is required to decrypt replay payloads.");
  }
  return decodeProtocolReplayPayload(payload, passphrase);
}
