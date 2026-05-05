import { encodeReplayPayload, type ReplaySession } from "@open-session/sdk";
import { describe, expect, it } from "vitest";
import { pickFailureEvents } from "../src/entities/replay/model/timeline-filter";
import { decodeFromText } from "../src/features/replay-import/model";

it("decodes pasted payloads for viewer import", async () => {
  const session: ReplaySession = {
    metadata: {
      sessionId: "viewer",
      sdkVersion: "0.1.0",
      createdAt: new Date().toISOString(),
    },
    events: [],
    errors: [],
    stats: {
      eventCount: 0,
      droppedEvents: 0,
      truncatedEvents: 0,
      redactionCount: 0,
    },
    privacy: { defaultRedactions: [], notes: [] },
  };
  const payload = await encodeReplayPayload(session, "demo-passphrase");
  const decoded = await decodeFromText(payload, "demo-passphrase");
  expect(decoded.session.metadata.sessionId).toBe("viewer");
});

describe("decode errors", () => {
  it("surfaces malformed payloads", async () => {
    await expect(decodeFromText("not-a-payload", "demo-passphrase")).rejects.toThrow(/Invalid payload prefix/iu);
  });

  it("surfaces wrong passphrases with actionable copy", async () => {
    const session: ReplaySession = {
      metadata: {
        sessionId: "viewer",
        sdkVersion: "0.1.0",
        createdAt: new Date().toISOString(),
      },
      events: [],
      errors: [],
      stats: {
        eventCount: 0,
        droppedEvents: 0,
        truncatedEvents: 0,
        redactionCount: 0,
      },
      privacy: { defaultRedactions: [], notes: [] },
    };
    const payload = await encodeReplayPayload(session, "right-passphrase");

    await expect(decodeFromText(payload, "wrong-passphrase")).rejects.toThrow(/Unable to decrypt payload/iu);
  });
});

describe("failure sequence", () => {
  it("keeps the immediate event flow around the first error", () => {
    const base = new Date("2026-05-01T09:24:18.120Z").getTime();
    const events: ReplaySession["events"] = [
      {
        id: "route-cart",
        kind: "navigation",
        navigationType: "pushState",
        fromUrl: "https://checkout.open.example/cart",
        toUrl: "https://checkout.open.example/checkout",
        timestamp: base,
        pageUrl: "https://checkout.open.example/checkout",
      },
      {
        id: "safe-api",
        kind: "network",
        method: "GET",
        url: "https://checkout.open.example/api/cart",
        status: 200,
        ok: true,
        timestamp: base + 10,
        pageUrl: "https://checkout.open.example/checkout",
        redactions: [],
      },
      {
        id: "click-pay",
        kind: "click",
        target: { tagName: "button", selector: "button#pay", strategy: "id" },
        timestamp: base + 20,
        pageUrl: "https://checkout.open.example/checkout",
      },
      {
        id: "failed-api",
        kind: "network",
        method: "POST",
        url: "https://checkout.open.example/api/authorize",
        status: 502,
        ok: false,
        timestamp: base + 30,
        pageUrl: "https://checkout.open.example/checkout",
        redactions: [],
      },
      {
        id: "error",
        kind: "error",
        name: "PaymentApprovalError",
        message: "결제 진행중 오류발생",
        timestamp: base + 40,
        pageUrl: "https://checkout.open.example/checkout",
      },
    ];

    expect(pickFailureEvents(events, events.at(-1) as ReplaySession["errors"][number]).map((event) => event.id)).toEqual([
      "route-cart",
      "safe-api",
      "click-pay",
      "failed-api",
      "error",
    ]);
  });
});
