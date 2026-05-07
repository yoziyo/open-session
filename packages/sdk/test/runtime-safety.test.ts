import { afterEach, describe, expect, it, vi } from "vitest";
import { addReplayEvent, captureError, flushOpenSession, getReplayClient, initOpenSession, shutdownReplay } from "../src";
import { ReplayBuffer } from "../src/buffer";
import { installConsoleCapture } from "../src/capture/console";
import { installNetworkCapture } from "../src/capture/network";

const captureOff = {
  clicks: false,
  keydown: false,
  network: false,
  console: false,
  errors: false,
} as const;

afterEach(() => {
  shutdownReplay();
  vi.restoreAllMocks();
});

describe("runtime safety", () => {
  it("keeps top-level helpers safe without an active client", async () => {
    expect(() => shutdownReplay()).not.toThrow();
    expect(() => captureError(new Error("ignored"))).not.toThrow();
    expect(() =>
      addReplayEvent({
        id: "manual",
        kind: "lifecycle",
        name: "init",
        timestamp: Date.now(),
      }),
    ).not.toThrow();

    await expect(flushOpenSession("missing-init")).resolves.toMatchObject({ ok: false });
  });

  it("does not patch fetch or console by default in a non-browser runtime", () => {
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;

    const client = initOpenSession({
      sessionId: "ssr-session",
      passphrase: "demo-passphrase",
    });

    expect(getReplayClient()).toBe(client);
    expect(globalThis.fetch).toBe(originalFetch);
    expect(console.log).toBe(originalLog);
  });

  it("keeps missing passphrase as an intentional configuration error", () => {
    expect(() => initOpenSession({ passphrase: "" })).toThrow(/passphrase/iu);
  });

  it("does not synchronously crash init when crypto.randomUUID is unavailable", () => {
    const cryptoObject = globalThis.crypto;
    const randomUUIDSpy = cryptoObject
      ? vi.spyOn(cryptoObject, "randomUUID").mockImplementation(() => {
          throw new Error("randomUUID unavailable");
        })
      : undefined;

    expect(() =>
      initOpenSession({
        passphrase: "demo-passphrase",
        capture: captureOff,
      }),
    ).not.toThrow();

    randomUUIDSpy?.mockRestore();
  });

  it("isolates async transport rejections into flush results", async () => {
    const client = initOpenSession({
      passphrase: "demo-passphrase",
      capture: captureOff,
      transport: async () => {
        throw new Error("async transport unavailable");
      },
    });

    await expect(client.flush("transport-reject")).resolves.toMatchObject({ ok: false });
  });

  it("isolates encryption primitive failures into flush results", async () => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    vi.spyOn(subtle, "importKey").mockRejectedValue(new Error("crypto unavailable"));
    const client = initOpenSession({
      passphrase: "demo-passphrase",
      capture: captureOff,
    });

    await expect(client.flush("crypto-failure")).resolves.toMatchObject({ ok: false });
  });
});

describe("capture failure isolation", () => {
  it("preserves original fetch behavior when network metadata extraction fails", async () => {
    const response = new Response("ok", { status: 201 });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => response);
    globalThis.fetch = fetchMock as typeof fetch;
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 10_000, createEventId: () => "network-event" });
    const cleanup = installNetworkCapture(buffer, { passphrase: "demo-passphrase" }, () => "network-event");
    const hostileInput = Object.defineProperty({}, "url", {
      get() {
        throw new Error("url getter failed");
      },
    }) as RequestInfo;

    await expect(fetch(hostileInput)).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(hostileInput);

    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("calls the original console method when console serialization fails", () => {
    const originalWarn = console.warn;
    const warnMock = vi.fn();
    console.warn = warnMock;
    const buffer = new ReplayBuffer({ maxEvents: 10, maxApproxBytes: 10_000, createEventId: () => "console-event" });
    const cleanup = installConsoleCapture(buffer, { passphrase: "demo-passphrase" }, () => "console-event");
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => console.warn(circular)).not.toThrow();
    expect(warnMock).toHaveBeenCalledWith(circular);

    cleanup();
    console.warn = originalWarn;
  });
});
