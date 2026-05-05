import { describe, expect, it } from "vitest";
import { decodeReplayPayload, encodeReplayPayload, parseReplayEnvelope, type ReplaySession } from "../src";

const session: ReplaySession = {
  metadata: {
    appId: "sdk-decode-test",
    sessionId: "session-sdk-decode",
    sdkVersion: "0.1.0",
    createdAt: "2026-04-30T00:00:00.000Z",
  },
  events: [],
  errors: [],
  stats: {
    eventCount: 0,
    droppedEvents: 0,
    truncatedEvents: 0,
    redactionCount: 0,
  },
  privacy: {
    defaultRedactions: ["password-values"],
    notes: ["Encryption is default-on"],
  },
};

describe("SDK replay payload decoding", () => {
  it("decrypts osr1 payloads without importing the protocol package directly", async () => {
    const payload = await encodeReplayPayload(session, "demo-passphrase");

    expect(parseReplayEnvelope(payload).session.id).toBe("session-sdk-decode");
    await expect(decodeReplayPayload(payload, "demo-passphrase")).resolves.toMatchObject({
      session: { metadata: { sessionId: "session-sdk-decode" } },
    });
  });

  it("requires a passphrase before attempting decrypt", async () => {
    const payload = await encodeReplayPayload(session, "demo-passphrase");

    await expect(decodeReplayPayload(payload, "")).rejects.toThrow(/Passphrase is required/iu);
  });
});
