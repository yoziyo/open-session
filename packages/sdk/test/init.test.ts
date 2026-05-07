import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureError,
  DEFAULT_CAPTURE_OPTIONS,
  DEFAULT_REPLAY_LIMITS,
  decodeReplayPayload,
  flushOpenSession,
  getReplayClient,
  initOpenSession,
  OPEN_SESSION_PAYLOAD_PREFIX,
  OPEN_SESSION_SDK_VERSION,
  parseReplayEnvelope,
  type ReplayClient,
  shutdownReplay,
} from "../src";

const captureOff = {
  clicks: false,
  keydown: false,
  network: false,
  navigation: false,
  console: false,
  errors: false,
} as const;

let client: ReplayClient | undefined;

afterEach(() => {
  shutdownReplay();
  client = undefined;
});

class FailingFlushWorker {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(): void {
    queueMicrotask(() => {
      for (const listener of this.listeners.get("error") ?? []) {
        if (typeof listener === "function") {
          listener({ type: "error" } as Event);
        } else {
          listener.handleEvent({ type: "error" } as Event);
        }
      }
    });
  }

  terminate(): void {
    this.listeners.clear();
  }
}

function createFailingWorker(): Worker {
  return new FailingFlushWorker() as unknown as Worker;
}

class SilentFlushWorker {
  terminated = false;

  addEventListener(): void {
    // Intentionally never responds.
  }

  removeEventListener(): void {
    // Intentionally never responds.
  }

  postMessage(): void {
    // Intentionally never responds.
  }

  terminate(): void {
    this.terminated = true;
  }
}

class ThrowingPostMessageWorker {
  terminated = false;

  addEventListener(): void {
    // no-op
  }

  removeEventListener(): void {
    // no-op
  }

  postMessage(): void {
    throw new Error("postMessage failed");
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("public API defaults", () => {
  it("exports stable SDK constants and validates option ranges", () => {
    expect(OPEN_SESSION_SDK_VERSION).toBe("0.1.0");
    expect(OPEN_SESSION_PAYLOAD_PREFIX).toBe("osr1:");
    expect(DEFAULT_CAPTURE_OPTIONS).toMatchObject({ navigation: true, network: true, errors: true });
    expect(DEFAULT_REPLAY_LIMITS).toMatchObject({ maxEvents: 250, maxApproxBytes: 750_000, compressionLevel: 6 });

    expect(() =>
      initOpenSession({
        passphrase: "demo-passphrase",
        sampleRate: Number.NaN,
        capture: captureOff,
      }),
    ).toThrow(/sampleRate/);
    expect(() =>
      initOpenSession({
        passphrase: "demo-passphrase",
        compressionLevel: 10 as 0,
        capture: captureOff,
      }),
    ).toThrow(/compressionLevel/);
    expect(() =>
      initOpenSession({
        passphrase: "demo-passphrase",
        maxEvents: 0,
        capture: captureOff,
      }),
    ).toThrow(/maxEvents/);
  });

  it("emits opt-in debug logs for init configuration failures", () => {
    const logger = { error: vi.fn() };

    expect(() =>
      initOpenSession({
        passphrase: "",
        debug: logger,
      }),
    ).toThrow(/passphrase/iu);

    expect(logger.error).toHaveBeenCalledWith(
      "[open-session] init failed",
      expect.objectContaining({
        message: expect.stringMatching(/passphrase/iu),
      }),
    );
  });
});

describe("initOpenSession flush", () => {
  it("does not create a worker for main-thread processing", async () => {
    const createFlushWorker = vi.fn(() => createFailingWorker());
    client = initOpenSession({
      sessionId: "main-thread-session",
      passphrase: "demo-passphrase",
      processing: "main-thread",
      createFlushWorker,
      capture: captureOff,
    });

    const result = await client.flush("main-thread");

    expect(result.ok).toBe(true);
    expect(createFlushWorker).not.toHaveBeenCalled();
  });

  it("passes compression level options into encrypted payloads", async () => {
    client = initOpenSession({
      appId: "sdk-init-test",
      sessionId: "compression-session",
      passphrase: "demo-passphrase",
      compressionLevel: 1,
      capture: captureOff,
    });

    const result = await client.flush("manual-test");

    expect(result.ok).toBe(true);
    expect(result.payload).toBeTruthy();
    expect(parseReplayEnvelope(result.payload ?? "").compression.level).toBe(1);
    await expect(decodeReplayPayload(result.payload ?? "", "demo-passphrase")).resolves.toMatchObject({
      session: { metadata: { sessionId: "compression-session" } },
    });
  });

  it("falls back to main-thread encoding when auto worker processing fails", async () => {
    client = initOpenSession({
      sessionId: "auto-fallback-session",
      passphrase: "demo-passphrase",
      processing: "auto",
      createFlushWorker: createFailingWorker,
      capture: captureOff,
    });

    const result = await client.flush("auto-worker-fallback");

    expect(result.ok).toBe(true);
    expect(result.payload).toBeTruthy();
    await expect(decodeReplayPayload(result.payload ?? "", "demo-passphrase")).resolves.toMatchObject({
      session: { metadata: { sessionId: "auto-fallback-session" } },
    });
  });

  it("reports an isolated flush failure when strict worker processing fails", async () => {
    client = initOpenSession({
      sessionId: "strict-worker-session",
      passphrase: "demo-passphrase",
      processing: "worker",
      createFlushWorker: createFailingWorker,
      capture: captureOff,
    });

    const result = await client.flush("strict-worker-failure");

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("Replay flush worker failed");
  });

  it("reports an isolated flush failure when strict worker processing has no worker factory", async () => {
    client = initOpenSession({
      sessionId: "strict-worker-without-factory-session",
      passphrase: "demo-passphrase",
      processing: "worker",
      capture: captureOff,
    });

    const result = await client.flush("strict-worker-without-factory");

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("createFlushWorker is required for worker processing");
  });

  it("reports an isolated flush failure when strict worker processing times out", async () => {
    const worker = new SilentFlushWorker();
    client = initOpenSession({
      sessionId: "strict-worker-timeout-session",
      passphrase: "demo-passphrase",
      processing: "worker",
      createFlushWorker: () => worker as unknown as Worker,
      flushWorkerTimeoutMs: 1,
      capture: captureOff,
    });

    const result = await client.flush("strict-worker-timeout");

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("Replay flush worker timed out");
    expect(worker.terminated).toBe(true);
  });

  it("cleans up worker resources when postMessage fails", async () => {
    const worker = new ThrowingPostMessageWorker();
    client = initOpenSession({
      sessionId: "strict-worker-postmessage-session",
      passphrase: "demo-passphrase",
      processing: "worker",
      createFlushWorker: () => worker as unknown as Worker,
      capture: captureOff,
    });

    const result = await client.flush("strict-worker-postmessage-failure");

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("postMessage failed");
    expect(worker.terminated).toBe(true);
  });

  it("emits opt-in debug logs for flush failures without throwing", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() };
    client = initOpenSession({
      sessionId: "debug-flush-session",
      passphrase: "demo-passphrase",
      capture: captureOff,
      debug: logger,
      transport: () => {
        throw new Error("transport unavailable");
      },
    });

    const result = await client.flush("debug-failure");

    expect(result.ok).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith("[open-session] flush started", { reason: "debug-failure" });
    expect(logger.error).toHaveBeenCalledWith(
      "[open-session] flush failed",
      expect.objectContaining({
        reason: "debug-failure",
        message: "transport unavailable",
      }),
    );
  });
});

describe("Sentry-style singleton API", () => {
  it("exposes the active client and flushes through top-level helpers", async () => {
    const sentPayloads: string[] = [];
    client = initOpenSession({
      sessionId: "singleton-session",
      passphrase: "demo-passphrase",
      capture: captureOff,
      transport(payload) {
        sentPayloads.push(payload);
      },
    });

    expect(getReplayClient()).toBe(client);

    captureError(new Error("singleton checkout failure"), { componentStack: "at Singleton" });
    const result = await flushOpenSession("singleton-helper");

    expect(result.ok).toBe(true);
    expect(sentPayloads).toEqual([result.payload]);
    await expect(decodeReplayPayload(result.payload ?? "", "demo-passphrase")).resolves.toMatchObject({
      session: {
        metadata: { sessionId: "singleton-session" },
        errors: [{ message: "singleton checkout failure" }],
      },
    });
  });

  it("returns an isolated flush error when initOpenSession was not called", async () => {
    shutdownReplay();

    const result = await flushOpenSession("missing-init");

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("initOpenSession must be called before flushOpenSession");
  });

  it("clears the active client on shutdownReplay", () => {
    client = initOpenSession({
      sessionId: "shutdown-session",
      passphrase: "demo-passphrase",
      capture: captureOff,
    });

    shutdownReplay();

    expect(getReplayClient()).toBeNull();
    client = undefined;
  });
});
