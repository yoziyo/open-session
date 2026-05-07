// @vitest-environment jsdom

import { decodeReplayPayload, encodeReplayPayload, parseEnvelope, type ReplaySession } from "@open-session/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initOpenSession, shutdownReplay } from "../src";
import { redactUrl, sanitizeString, sanitizeUnknown } from "../src/privacy/redact";
import { describeTarget, isExcludedTarget } from "../src/privacy/selectors";

class FakeFlushWorker extends EventTarget {
  terminated = false;

  postMessage(message: { id: string; session: ReplaySession; passphrase: string; compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }) {
    queueMicrotask(async () => {
      const payload = await encodeReplayPayload(message.session, message.passphrase, {
        compression: { level: message.compressionLevel },
      });
      this.dispatchEvent(
        new MessageEvent("message", {
          data: { id: message.id, ok: true, payload },
        }),
      );
    });
  }

  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  shutdownReplay();
  vi.restoreAllMocks();
});

describe("privacy defaults", () => {
  it("redacts sensitive URL query values", () => {
    const result = redactUrl("https://example.test/path?token=abc&access_token=def&client_secret=ghi&signature=sig&email=a@example.test&safe=ok");
    expect(result.url).toContain("token=%5Bredacted%5D");
    expect(result.url).toContain("access_token=%5Bredacted%5D");
    expect(result.url).toContain("client_secret=%5Bredacted%5D");
    expect(result.url).toContain("signature=%5Bredacted%5D");
    expect(result.url).toContain("email=%5Bredacted%5D");
    expect(result.url).toContain("safe=ok");
    expect(result.redactions).toEqual(
      expect.arrayContaining(["query:token", "query:access_token", "query:client_secret", "query:signature", "query:email"]),
    );
  });

  it("redacts the current page URL before metadata and event serialization", async () => {
    window.history.pushState({}, "", "/checkout?token=page-secret-token&email=person@example.test&safe=ok");
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    document.body.innerHTML = '<button id="safe">Safe</button>';
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const result = await client.flush("page-url-redaction");

    expect(result.ok).toBe(true);
    expect(payloads[0]).not.toContain("page-secret-token");
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const decodedJson = JSON.stringify(decoded);
    expect(decoded.envelope.app?.url).not.toContain("page-secret-token");
    expect(decodedJson).not.toContain("page-secret-token");
    expect(decodedJson).not.toContain("person@example.test");
    expect(decodedJson).toContain("token=%5Bredacted%5D");
    expect(decoded.session.events.every((event) => event.pageUrl?.includes("token=%5Bredacted%5D"))).toBe(true);
    client.shutdown();
    window.history.pushState({}, "", "/");
  });

  it("captures redacted navigation events for history route changes", async () => {
    window.history.pushState({}, "", "/start?token=initial-secret&safe=ok");
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: true,
        console: false,
        errors: false,
      },
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    window.history.pushState({}, "", "/checkout?token=route-secret&safe=visible");
    window.history.replaceState({}, "", "/review?email=person@example.test&safe=visible");

    const result = await client.flush("navigation");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const navigationEvents = decoded.session.events.filter((event) => event.kind === "navigation");
    expect(navigationEvents).toHaveLength(2);
    expect(navigationEvents[0]).toMatchObject({
      navigationType: "pushState",
      fromUrl: expect.stringContaining("token=%5Bredacted%5D"),
      toUrl: expect.stringContaining("/checkout"),
    });
    expect(navigationEvents[1]).toMatchObject({
      navigationType: "replaceState",
      fromUrl: expect.stringContaining("/checkout"),
      toUrl: expect.stringContaining("email=%5Bredacted%5D"),
    });
    const decodedJson = JSON.stringify(decoded);
    expect(decodedJson).not.toContain("initial-secret");
    expect(decodedJson).not.toContain("route-secret");
    expect(decodedJson).not.toContain("person@example.test");
    client.shutdown();
    window.history.pushState({}, "", "/");
  });

  it("honors capture.navigation false for teams that disable route collection", async () => {
    window.history.pushState({}, "", "/start?safe=ok");
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: false,
        console: false,
        errors: false,
      },
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    window.history.pushState({}, "", "/checkout?safe=visible");
    window.history.replaceState({}, "", "/review?safe=visible");

    const result = await client.flush("navigation-disabled");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    expect(decoded.session.events.some((event) => event.kind === "navigation")).toBe(false);
    client.shutdown();
    window.history.pushState({}, "", "/");
  });

  it("honors capture false for automatic collection categories while keeping lifecycle events", async () => {
    window.history.pushState({}, "", "/start?safe=ok");
    document.body.innerHTML = '<button id="pay">Pay</button><input id="name" />';
    const originalFetch = globalThis.fetch;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi.fn(async () => new Response(null, { status: 502 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: false,
        console: false,
        errors: false,
      },
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector("input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    window.history.pushState({}, "", "/checkout?safe=visible");
    console.error("payment failed");
    window.dispatchEvent(new Event("error"));
    await fetch("/api/fail");

    const result = await client.flush("all-auto-capture-disabled");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    expect(decoded.session.events.map((event) => event.kind)).toEqual(["lifecycle", "lifecycle"]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/fail");
    consoleSpy.mockRestore();
    globalThis.fetch = originalFetch;
    client.shutdown();
    window.history.pushState({}, "", "/");
  });

  it("captures only configured console levels", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: false,
        console: true,
        errors: false,
      },
      consoleLevels: ["warn", "error"],
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    console.log("safe noise");
    console.warn("checkout warning");

    const result = await client.flush("console-levels");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const consoleEvents = decoded.session.events.filter((event) => event.kind === "console");
    expect(consoleEvents).toHaveLength(1);
    expect(consoleEvents[0]).toMatchObject({ level: "warn", args: ["checkout warning"] });
    expect(logSpy).toHaveBeenCalledWith("safe noise");
    expect(warnSpy).toHaveBeenCalledWith("checkout warning");
    client.shutdown();
  });

  it("runs beforeSend before encoding and transport", async () => {
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      sessionId: "before-send-session",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: false,
        console: false,
        errors: false,
      },
      beforeSend: (session) => ({
        ...session,
        metadata: {
          ...session.metadata,
          userId: undefined,
        },
        events: session.events.filter((event) => event.kind !== "lifecycle" || event.name !== "init"),
      }),
      transport: (payload) => {
        payloads.push(payload);
      },
      userId: "user-should-be-removed",
    });

    const result = await client.flush("before-send");

    expect(result.ok).toBe(true);
    expect(payloads).toEqual([result.payload]);
    const decoded = await decodeReplayPayload(result.payload ?? "", "demo-passphrase");
    expect(decoded.session.metadata.userId).toBeUndefined();
    expect(decoded.session.metadata.sessionId).toBe("before-send-session");
    expect(decoded.session.events.map((event) => event.kind)).toEqual(["lifecycle"]);
    client.shutdown();
  });

  it("lets beforeSend drop a payload without calling transport", async () => {
    const transport = vi.fn();
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: false,
        console: false,
        errors: false,
      },
      beforeSend: () => null,
      transport,
    });

    const result = await client.flush("drop-before-send");

    expect(result).toEqual({ ok: true });
    expect(transport).not.toHaveBeenCalled();
    client.shutdown();
  });

  it("honors sampleRate 0 by skipping automatic and manual replay payloads", async () => {
    const transport = vi.fn();
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      sampleRate: 0,
      transport,
    });

    document.body.innerHTML = '<button id="pay">Pay</button>';
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    client.addEvent({
      id: "manual-click",
      kind: "click",
      timestamp: Date.now(),
      target: { strategy: "id", selector: "button#pay", tagName: "button" },
    });

    const result = await client.flush("sampled-out");

    expect(result).toEqual({ ok: true });
    expect(transport).not.toHaveBeenCalled();
    client.shutdown();
  });

  it("keeps sampled sessions when sampleRate is 1", async () => {
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      sampleRate: 1,
      capture: {
        clicks: false,
        keydown: false,
        network: false,
        navigation: false,
        console: false,
        errors: false,
      },
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    const result = await client.flush("sampled-in");

    expect(result.ok).toBe(true);
    expect(payloads).toEqual([result.payload]);
    const decoded = await decodeReplayPayload(result.payload ?? "", "demo-passphrase");
    expect(decoded.session.events.map((event) => event.kind)).toEqual(["lifecycle", "lifecycle"]);
    client.shutdown();
  });

  it("filters network events with networkStatusFilter after URL redaction", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 })) as unknown as typeof fetch;
    const payloads: string[] = [];
    const seenStatuses: Array<number | undefined> = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      capture: {
        clicks: false,
        keydown: false,
        network: true,
        navigation: false,
        console: false,
        errors: false,
      },
      networkStatusFilter(status, event) {
        seenStatuses.push(status);
        expect(event.url).toContain("token=%5Bredacted%5D");
        return status === undefined || status >= 400;
      },
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    await fetch("/api/ok?token=ok-secret");
    await fetch("/api/fail?token=fail-secret");
    const result = await client.flush("network-status-filter");

    expect(result.ok).toBe(true);
    expect(seenStatuses).toEqual([200, 502]);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const networkEvents = decoded.session.events.filter((event) => event.kind === "network");
    expect(networkEvents).toHaveLength(1);
    expect(networkEvents[0]).toMatchObject({ status: 502, ok: false });
    expect(JSON.stringify(decoded)).not.toContain("fail-secret");
    globalThis.fetch = originalFetch;
    client.shutdown();
  });

  it("redacts masked DOM target descriptors", () => {
    document.body.innerHTML = '<input type="password" id="password-token" value="secret" />';
    const input = document.querySelector("input");
    const descriptor = describeTarget(input);
    expect(descriptor.redacted).toBe(true);
    expect(descriptor.selector).not.toContain("password-token");
    expect(descriptor.selector).not.toContain("secret");
  });

  it("masks custom selectors and excludes denied selectors", () => {
    document.body.innerHTML = `
      <div data-replay-mask>
        <button id="billing-token">Pay</button>
      </div>
      <button data-private-action>Ignored</button>
    `;
    const masked = document.querySelector("#billing-token");
    const descriptor = describeTarget(masked, {
      maskSelectors: ["[data-replay-mask]"],
    });
    expect(descriptor.redacted).toBe(true);
    expect(descriptor.selector).not.toContain("billing-token");

    const excluded = document.querySelector("[data-private-action]");
    expect(
      isExcludedTarget(excluded, {
        excludeSelectors: ["[data-private-action]"],
      }),
    ).toBe(true);
  });

  it("redacts sensitive strings, object fields, and error stacks", () => {
    const redactions: string[] = [];
    expect(sanitizeString("request failed token=super-secret-token Authorization Bearer abcdef123456", redactions)).not.toContain(
      "super-secret-token",
    );
    expect(redactions.length).toBeGreaterThan(0);

    const sanitized = sanitizeUnknown(
      {
        safe: "ok",
        password: "do-not-collect",
        nested: { apiKey: "sk-test-secret-123456789" },
      },
      redactions,
    );
    const json = JSON.stringify(sanitized);
    expect(json).toContain("ok");
    expect(json).not.toContain("do-not-collect");
    expect(json).not.toContain("sk-test-secret");
  });

  it("applies caller-controlled string budget and internal object budget", () => {
    const sanitized = sanitizeUnknown(
      {
        first: "a".repeat(50),
        second: "visible",
        third: "should-be-dropped-by-key-budget",
      },
      [],
      0,
      { maxSanitizedStringLength: 8 },
    );

    const json = JSON.stringify(sanitized);
    expect(json).toContain("aaaaaaaa");
    expect(json).toContain("[truncated]");
    expect(json).toContain("visible");
    expect(json).toContain("third");
    expect(json).toContain("should-b");
  });
});

describe("sdk flush", () => {
  it("isolates capture install-time failures during initialization", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener").mockImplementation(() => {
      throw new Error("listener install failed");
    });

    expect(() =>
      initOpenSession({
        appId: "test-app",
        passphrase: "demo-passphrase",
        capture: {
          clicks: true,
          keydown: false,
          network: false,
          console: false,
          errors: false,
        },
      }),
    ).not.toThrow();
    expect(addEventListenerSpy).toHaveBeenCalled();
  });

  it("captures password keydown without key value and emits osr1 transport payload", async () => {
    document.body.innerHTML = '<input type="password" id="pw" /><button id="send">Send</button>';
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: (payload) => {
        payloads.push(payload);
      },
    });
    const input = document.querySelector("input");
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", bubbles: true }));
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    client.captureError(new Error("boom"), { componentStack: "at Demo" });

    const result = await client.flush("test");
    expect(result.ok).toBe(true);
    expect(payloads[0]?.startsWith("osr1:")).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const asJson = JSON.stringify(decoded.session);
    expect(asJson).not.toContain('"s"');
    expect(asJson).not.toContain("KeyS");
    expect(asJson).not.toContain("secret");
    expect(decoded.session.errors[0]?.kind).toBe("error");
    expect(decoded.session.events.every((event) => event.id.length <= 2)).toBe(true);
    expect(parseEnvelope(payloads[0] ?? "").compression.level).toBe(6);
    client.shutdown();
  });

  it("coalesces non-sensitive character keydowns into a single replay event", async () => {
    document.body.innerHTML = '<input id="search" name="search" />';
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: (payload) => {
        payloads.push(payload);
      },
    });
    const input = document.querySelector("input");
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", bubbles: true }));

    const result = await client.flush("typing");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const keydowns = decoded.session.events.filter((event) => event.kind === "keydown");
    expect(keydowns).toHaveLength(1);
    expect(keydowns[0]).toMatchObject({
      key: "[character]",
      count: 3,
    });
    expect(JSON.stringify(keydowns[0])).not.toContain("KeyA");
    client.shutdown();
  });

  it("uses a caller-provided flush worker when worker processing is enabled", async () => {
    const payloads: string[] = [];
    let worker: FakeFlushWorker | undefined;
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      processing: "worker",
      createFlushWorker: () => {
        worker = new FakeFlushWorker();
        return worker as unknown as Worker;
      },
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    const result = await client.flush("worker");

    expect(result.ok).toBe(true);
    expect(worker?.terminated).toBe(true);
    expect(parseEnvelope(payloads[0] ?? "").payloadFormat).toBe("compact-session-v1");
    await expect(decodeReplayPayload(payloads[0] ?? "", "demo-passphrase")).resolves.toMatchObject({
      session: { metadata: { appId: "test-app" } },
    });
    client.shutdown();
  });

  it("applies public string budget and internal console argument budget before payload encode", async () => {
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      maxSanitizedStringLength: 12,
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    console.warn("a".repeat(80), { safe: "ok" }, "dropped");
    const result = await client.flush("console-budget");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const event = decoded.session.events.find((item) => item.kind === "console");
    expect(event).toMatchObject({
      kind: "console",
      args: ["aaaaaaaaaaaa…[truncated]", { safe: "ok" }, "dropped"],
    });
    client.shutdown();
  });

  it("captures circular console values with bounded sanitization", async () => {
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: (payload) => {
        payloads.push(payload);
      },
    });
    const circular: Record<string, unknown> = { label: "circular" };
    circular.self = circular;

    expect(() => console.warn(circular)).not.toThrow();
    const result = await client.flush("circular-console");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const event = decoded.session.events.find((item) => item.kind === "console");
    expect(JSON.stringify(event)).toContain("[truncated-depth]");
    client.shutdown();
  });

  it("sanitizes captured error messages and component stacks before payload encode", async () => {
    const payloads: string[] = [];
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: (payload) => {
        payloads.push(payload);
      },
    });

    client.captureError(new Error("boom token=super-secret-token"), "at SecretForm password=do-not-collect");
    const result = await client.flush("privacy-test");

    expect(result.ok).toBe(true);
    const decoded = await decodeReplayPayload(payloads[0] ?? "", "demo-passphrase");
    const asJson = JSON.stringify(decoded.session);
    expect(asJson).not.toContain("super-secret-token");
    expect(asJson).not.toContain("do-not-collect");
    expect(asJson).toContain("[redacted]");
    client.shutdown();
  });

  it("isolates transport failures and restores monkey patches on shutdown", async () => {
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: () => {
        throw new Error("transport unavailable");
      },
    });

    expect(globalThis.fetch).not.toBe(originalFetch);
    expect(console.log).not.toBe(originalLog);

    const result = await client.flush("transport-failure");
    expect(result.ok).toBe(false);
    expect(() => console.log("host app still logs")).not.toThrow();

    client.shutdown();
    expect(globalThis.fetch).toBe(originalFetch);
    expect(console.log).toBe(originalLog);
  });

  it("deduplicates active init and releases it on shutdown", () => {
    const first = initOpenSession({
      appId: "first",
      passphrase: "demo-passphrase",
    });
    const second = initOpenSession({
      appId: "second",
      passphrase: "demo-passphrase",
    });

    expect(second).toBe(first);
    first.shutdown();

    const third = initOpenSession({
      appId: "third",
      passphrase: "demo-passphrase",
    });
    expect(third).not.toBe(first);
    third.shutdown();
  });

  it("keeps flush concurrent calls isolated to one in-flight payload", async () => {
    let transportCalls = 0;
    const client = initOpenSession({
      appId: "test-app",
      passphrase: "demo-passphrase",
      transport: async () => {
        transportCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
    });

    const [first, second] = await Promise.all([client.flush("one"), client.flush("two")]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.payload).toBe(second.payload);
    expect(transportCalls).toBe(1);
    client.shutdown();
  });
});
