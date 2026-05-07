import { decodeReplayPayload, OPEN_SESSION_PAYLOAD_PREFIX } from "@open-session/sdk";

export type DecodeMessages = {
  emptyPayload?: string;
  invalidPrefix?: string;
  passphraseRequired?: string;
  unableToDecrypt?: string;
  decryptFailed?: string;
  malformedPayload?: (message: string) => string;
};

const defaultDecodeMessages: Required<DecodeMessages> = {
  emptyPayload: "Paste an osr1 payload before decoding.",
  invalidPrefix: "Invalid payload prefix. Expected a value starting with osr1:.",
  passphraseRequired: "Passphrase is required to decrypt payloads.",
  unableToDecrypt: "Unable to decrypt payload.",
  decryptFailed: "Unable to decrypt payload. Check the passphrase and ensure the payload was copied completely.",
  malformedPayload: (message) => `Malformed replay payload: ${message}`,
};

export async function decodeFromText(payload: string, passphrase: string, messages: DecodeMessages = {}) {
  const copy = { ...defaultDecodeMessages, ...messages };
  const trimmed = payload.trim();
  if (!trimmed) throw new Error(copy.emptyPayload);
  if (!trimmed.startsWith(OPEN_SESSION_PAYLOAD_PREFIX)) {
    throw new Error(copy.invalidPrefix);
  }
  if (!passphrase) throw new Error(copy.passphraseRequired);

  try {
    return await decodeReplayPayload(trimmed, passphrase);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).trim();
    if (!message) {
      throw new Error(copy.unableToDecrypt);
    }
    if (/decrypt|operation|cipher|crypto|passphrase|key/iu.test(message)) {
      throw new Error(copy.decryptFailed);
    }
    if (/json|base64|valid replay session|payload/iu.test(message)) {
      throw new Error(copy.malformedPayload(message));
    }
    throw new Error(message);
  }
}
