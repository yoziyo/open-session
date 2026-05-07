import type { ReplayEvent } from "@open-session/protocol";
import { describe, expect, it } from "vitest";
import { ReplayBuffer } from "../src/buffer";

function event(id: string, detail = "small"): ReplayEvent {
  return {
    id,
    kind: "lifecycle",
    name: "init",
    detail,
    timestamp: Date.now(),
  };
}

describe("ReplayBuffer", () => {
  it("drops oldest events when maxEvents is exceeded", () => {
    const buffer = new ReplayBuffer({ maxEvents: 2, maxApproxBytes: 10_000 });
    buffer.add(event("one"));
    buffer.add(event("two"));
    buffer.add(event("three"));

    expect(buffer.snapshot().map((item) => item.id)).toEqual(["two", "three"]);
    expect(buffer.stats().droppedEvents).toBe(1);
  });

  it("enforces approximate byte budget and records truncation", () => {
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 220 });
    buffer.add(event("one", "x".repeat(20)));
    buffer.add(event("two", "y".repeat(20)));
    buffer.add(event("huge", "z".repeat(400)));

    expect(buffer.stats().truncatedEvents).toBe(1);
    expect(buffer.snapshot().at(-1)?.kind).toBe("truncate");
    expect(buffer.stats().droppedEvents).toBeGreaterThanOrEqual(1);
  });

  it("turns non-serializable manual events into truncation markers instead of throwing", () => {
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 500 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      buffer.add({
        id: "circular-console",
        kind: "console",
        timestamp: 1000,
        level: "warn",
        args: [circular],
        redactions: [],
      }),
    ).not.toThrow();

    expect(buffer.stats().truncatedEvents).toBe(1);
    expect(buffer.snapshot()).toEqual([expect.objectContaining({ kind: "truncate", reason: "byte-limit" })]);
  });

  it("coalesces repeated keydown events within the internal time window", () => {
    const buffer = new ReplayBuffer({
      maxEvents: 10,
      maxApproxBytes: 10_000,
    });
    const keydown = (timestamp: number): ReplayEvent => ({
      id: String(timestamp),
      kind: "keydown",
      timestamp,
      target: { strategy: "id", selector: "#search", tagName: "input" },
      key: "[character]",
      privacy: "safe",
    });

    buffer.add(keydown(1000));
    buffer.add(keydown(1100));
    buffer.add(keydown(1200));

    expect(buffer.snapshot()).toHaveLength(1);
    expect(buffer.snapshot()[0]).toMatchObject({
      kind: "keydown",
      count: 3,
      lastTimestamp: 1200,
    });
  });

  it("coalesces rapid duplicate click events on the same target", () => {
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 10_000 });
    const click = (timestamp: number, selector = "#pay"): ReplayEvent => ({
      id: String(timestamp),
      kind: "click",
      timestamp,
      pageUrl: "https://example.test/checkout",
      target: { strategy: "id", selector, tagName: "button" },
      button: 0,
    });

    buffer.add(click(1000));
    buffer.add(click(1200));
    buffer.add(click(1400));
    buffer.add(click(2000));
    buffer.add(click(2100, "#cancel"));

    expect(buffer.snapshot()).toHaveLength(3);
    expect(buffer.snapshot()[0]).toMatchObject({
      kind: "click",
      count: 3,
      lastTimestamp: 1400,
    });
  });

  it("coalesces repeated console events without merging different messages", () => {
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 10_000 });
    const consoleEvent = (timestamp: number, message = "retry"): ReplayEvent => ({
      id: String(timestamp),
      kind: "console",
      timestamp,
      pageUrl: "https://example.test/checkout",
      level: "warn",
      args: [message, { safe: true }],
      redactions: [],
    });

    buffer.add(consoleEvent(1000));
    buffer.add(consoleEvent(1400));
    buffer.add(consoleEvent(1900));
    buffer.add(consoleEvent(3100));
    buffer.add(consoleEvent(2700, "different"));

    expect(buffer.snapshot()).toHaveLength(3);
    expect(buffer.snapshot()[0]).toMatchObject({
      kind: "console",
      count: 3,
      lastTimestamp: 1900,
    });
  });

  it("coalesces repeated network events and preserves latency range", () => {
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 10_000 });
    const networkEvent = (timestamp: number, durationMs: number, url = "https://api.example.test/pay"): ReplayEvent => ({
      id: String(timestamp),
      kind: "network",
      timestamp,
      pageUrl: "https://example.test/checkout",
      method: "POST",
      url,
      status: 502,
      durationMs,
      ok: false,
      redactions: ["headers:default", "body:default"],
    });

    buffer.add(networkEvent(1000, 640));
    buffer.add(networkEvent(1700, 522));
    buffer.add(networkEvent(2600, 590));
    buffer.add(networkEvent(3200, 100, "https://api.example.test/cart"));

    expect(buffer.snapshot()).toHaveLength(2);
    expect(buffer.snapshot()[0]).toMatchObject({
      kind: "network",
      count: 3,
      lastTimestamp: 2600,
      durationMs: 590,
      minDurationMs: 522,
      maxDurationMs: 640,
    });
  });

  it("preserves high-value failure context before low-priority events under budget pressure", () => {
    const buffer = new ReplayBuffer({ maxEvents: 3, maxApproxBytes: 10_000 });

    buffer.add(event("init"));
    buffer.add({
      id: "failed-network",
      kind: "network",
      timestamp: 1000,
      method: "POST",
      url: "https://api.example.test/pay",
      status: 500,
      ok: false,
      durationMs: 640,
      redactions: ["headers:default"],
    });
    buffer.add({
      id: "error",
      kind: "error",
      timestamp: 1100,
      message: "checkout failed",
      name: "Error",
    });
    buffer.add({
      id: "click",
      kind: "click",
      timestamp: 1200,
      target: { strategy: "id", selector: "#pay", tagName: "button" },
      button: 0,
    });

    expect(buffer.snapshot().map((item) => item.id)).toEqual(["failed-network", "error", "click"]);
    expect(buffer.stats().droppedEvents).toBe(1);
  });
});
