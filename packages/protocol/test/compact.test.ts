import { describe, expect, it } from "vitest";
import { compactReplaySession, expandCompactReplaySession, type ReplaySession } from "../src";

const baseSession: ReplaySession = {
  metadata: {
    appId: "compact-test",
    sessionId: "compact-session",
    sdkVersion: "0.1.0",
    createdAt: "2026-05-01T00:00:00.000Z",
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
    notes: ["test"],
  },
};

function normalizeGeneratedIds(session: ReplaySession): ReplaySession {
  return {
    ...session,
    events: session.events.map((event, index) => {
      if (event.kind === "keydown" && event.key === "[character]") {
        const { code: _removedHighCardinalityCode, ...compactEquivalent } = event;
        return { ...compactEquivalent, id: index.toString(36) };
      }
      return { ...event, id: index.toString(36) };
    }),
    errors: session.errors.map((error) => {
      const index = session.events.findIndex((event) => event.id === error.id);
      return { ...error, id: Math.max(0, index).toString(36) };
    }),
  };
}

describe("compact replay session", () => {
  it("round-trips all event kinds with generated ids and error anchors", () => {
    const error = {
      id: "error-original-id",
      kind: "error" as const,
      timestamp: 1600,
      name: "CheckoutError",
      message: "payment approval failed",
      stack: "Error: payment approval failed\n at CheckoutPage (checkout.tsx:10:1)",
      componentStack: " at CheckoutPage",
    };
    const session: ReplaySession = {
      ...baseSession,
      events: [
        {
          id: "click-original-id",
          kind: "click",
          timestamp: 1000,
          target: { strategy: "id", selector: "#pay", tagName: "button" },
          button: 0,
          count: 3,
          lastTimestamp: 1220,
        },
        {
          id: "keydown-original-id",
          kind: "keydown",
          timestamp: 1200,
          target: { strategy: "attribute", selector: "[data-field='email']", tagName: "input", redacted: true },
          key: "[character]",
          code: "KeyA",
          privacy: "masked",
          count: 4,
          lastTimestamp: 1260,
        },
        {
          id: "network-original-id",
          kind: "network",
          timestamp: 1400,
          method: "POST",
          url: "https://api.example.test/payments?token=[redacted]",
          status: 502,
          durationMs: 180,
          ok: false,
          redactions: ["query:token", "body:default"],
          count: 2,
          lastTimestamp: 1500,
          minDurationMs: 120,
          maxDurationMs: 180,
        },
        {
          id: "navigation-original-id",
          kind: "navigation",
          timestamp: 1450,
          navigationType: "pushState",
          fromUrl: "https://example.test/cart",
          toUrl: "https://example.test/checkout",
          pageUrl: "https://example.test/checkout",
        },
        {
          id: "console-original-id",
          kind: "console",
          timestamp: 1500,
          level: "warn",
          args: ["checkout retry", { safe: true }],
          redactions: ["object:password"],
          count: 2,
          lastTimestamp: 1550,
        },
        error,
        {
          id: "lifecycle-original-id",
          kind: "lifecycle",
          timestamp: 1700,
          name: "flush",
          detail: "error-boundary",
        },
        {
          id: "truncate-original-id",
          kind: "truncate",
          timestamp: 1800,
          reason: "byte-limit",
          droppedEvents: 5,
          truncatedBytes: 1024,
        },
      ],
      errors: [error],
      stats: { ...baseSession.stats, eventCount: 8, redactionCount: 3, truncatedEvents: 1 },
    };

    const compact = compactReplaySession(session);
    const expanded = expandCompactReplaySession(compact);

    expect(compact.r).toBe(1);
    expect(expanded).toEqual(normalizeGeneratedIds(session));
    expect(expanded.errors).toHaveLength(1);
    expect(expanded.errors[0]?.id).toBe("5");
    expect(expanded.events[5]).toEqual(expanded.errors[0]);
    expect(JSON.stringify(compact)).not.toContain("original-id");
  });

  it("rejects malformed compact payload bodies with a clear error", () => {
    expect(() =>
      expandCompactReplaySession({
        f: "compact-session-v1",
        r: 1,
        m: baseSession.metadata,
        g: {} as never,
        x: [],
        s: baseSession.stats,
        p: baseSession.privacy,
        z: [],
        a: [],
        t0: 0,
      }),
    ).toThrow(/Malformed compact-session-v1 payload body/u);
  });

  it("keeps error anchors correct when event timestamps collide across buckets", () => {
    const timestamp = 2000;
    const error = {
      id: "same-timestamp-error",
      kind: "error" as const,
      timestamp,
      name: "Error",
      message: "same millisecond failure",
    };
    const session: ReplaySession = {
      ...baseSession,
      events: [
        {
          id: "same-timestamp-lifecycle",
          kind: "lifecycle",
          timestamp,
          name: "init",
        },
        error,
      ],
      errors: [error],
      stats: { ...baseSession.stats, eventCount: 2 },
    };

    const expanded = expandCompactReplaySession(compactReplaySession(session));

    expect(expanded.errors).toHaveLength(1);
    expect(expanded.errors[0]).toMatchObject({ kind: "error", message: "same millisecond failure" });
    expect(expanded.events.find((event) => event.id === expanded.errors[0]?.id)).toEqual(expanded.errors[0]);
  });

  it("round-trips high-cardinality strings through template series coding", () => {
    const base = 1_800_000_000_000;
    const pageUrl = "https://example.test/checkout?token=%5Bredacted%5D&safe=ok";
    const session: ReplaySession = {
      ...baseSession,
      metadata: { ...baseSession.metadata, url: pageUrl },
      events: Array.from({ length: 6 }, (_, index) => ({
        id: `event-${index}`,
        kind: "console" as const,
        timestamp: base + index * 100,
        pageUrl,
        level: index % 2 === 0 ? "warn" : "log",
        args: [
          `checkout diagnostic ${index.toString(36)}-${((index * 2_654_435_761 + 1_013_904_223) >>> 0).toString(36)}`,
          {
            requestId: `${index.toString(36)}-${((index * 2_654_435_761 + 1_013_904_223) >>> 0).toString(36)}`,
            state: [`${(index * 13).toString(36)}-${((index * 13 * 2_654_435_761 + 1_013_904_223) >>> 0).toString(36)}:0`],
          },
        ],
        redactions: ["object:password"],
      })),
      errors: [],
      stats: { ...baseSession.stats, eventCount: 6, redactionCount: 6 },
    };

    const compact = compactReplaySession(session);
    const expanded = expandCompactReplaySession(compact);

    expect(compact.z.g.length).toBeGreaterThan(0);
    expect(JSON.stringify(compact)).not.toContain("checkout diagnostic 0-");
    expect(expanded).toEqual(normalizeGeneratedIds(session));
  });
});
