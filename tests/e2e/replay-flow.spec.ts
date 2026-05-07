import { expect, test } from "@playwright/test";
import { decodeReplayPayload, encodeReplayPayload, type ReplaySession } from "../../packages/sdk/src";

const viewerUrl = "http://127.0.0.1:3101";
const passphrase = "demo-passphrase";
const forbiddenSecrets = ["e2e-super-secret-token", "super-secret-password-e2e", "person@example.test", "e2e-page-token", "page@example.test"];

const viewerFixtureSession: ReplaySession = {
  metadata: {
    sessionId: "viewer-wrong-key",
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
  privacy: { defaultRedactions: [], notes: [] },
};

function extractPayload(consoleText: string): string {
  const match = consoleText.match(/OPEN_SESSION_PAYLOAD\s+(osr1:\S+)/u);
  if (!match?.[1]) throw new Error(`Console message did not include payload: ${consoleText}`);
  return match[1];
}

test("sample app emits encrypted payload and viewer decodes it without leaking secrets", async ({ page }) => {
  await page.goto("/?lang=ko&token=e2e-page-token&email=page@example.test&safe=visible");
  await expect(
    page.getByRole("heading", {
      name: "결제 승인 중 장애 재현",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("sample-status")).toContainText("초기화됨");

  await page.getByTestId("safe-name").pressSequentially("Alice Example");
  await page.getByTestId("account-password").pressSequentially("super-secret-password-e2e");
  await page.getByTestId("console-log").click();
  await page.getByTestId("fetch-network").click();
  await expect(page.getByTestId("sample-status")).toContainText("승인 완료");

  const payloadMessagePromise = page.waitForEvent("console", {
    predicate: (message) => message.text().includes("OPEN_SESSION_PAYLOAD osr1:"),
  });
  await page.getByTestId("trigger-react-error").click();
  await expect(page.getByTestId("captured-error-message")).toContainText("결제 진행중 오류발생");

  const payload = extractPayload((await payloadMessagePromise).text());
  expect(payload.startsWith("osr1:")).toBe(true);
  await expect(page.getByTestId("payload-alert")).toBeVisible();
  await expect(page.getByTestId("payload-textarea")).toHaveValue(payload);
  await expect(page.getByTestId("copy-payload")).toBeVisible();
  await expect(page.getByTestId("open-viewer")).toHaveAttribute("href", `${viewerUrl}/?passphrase=${encodeURIComponent(passphrase)}`);

  for (const secret of forbiddenSecrets) expect(payload).not.toContain(secret);

  const decoded = await decodeReplayPayload(payload, passphrase);
  const decodedJson = JSON.stringify(decoded.session);
  for (const secret of forbiddenSecrets) expect(decodedJson).not.toContain(secret);

  expect(decoded.session.events.some((event) => event.kind === "click")).toBe(true);
  expect(decoded.session.events.some((event) => event.kind === "keydown")).toBe(true);
  expect(decoded.session.events.some((event) => event.kind === "console")).toBe(true);
  expect(decoded.session.events.some((event) => event.kind === "network")).toBe(true);
  expect(decoded.session.errors.some((event) => event.kind === "error")).toBe(true);
  expect(decodedJson).toContain("redacted");

  await page.goto(`${viewerUrl}?lang=ko`);
  await expect(page.getByRole("heading", { name: "Open Session Viewer" })).toBeVisible();
  await expect(page.getByTestId("viewer-safety-note")).toHaveCount(0);
  await expect(page.getByTestId("passphrase-input")).toHaveValue("");
  await page.getByTestId("payload-input").fill(payload);
  await page.getByTestId("passphrase-input").fill(passphrase);
  await page.getByTestId("decode-button").click();

  await expect(page.getByTestId("decoded-session")).toBeVisible();
  await expect(page.getByTestId("payload-input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import another" })).toBeVisible();
  await expect(page.getByTestId("failure-timeline")).toBeVisible();
  await expect(page.getByTestId("timeline-selection")).toBeVisible();
  const networkTimelinePoint = page.getByTestId("timeline-point-network").first();
  await networkTimelinePoint.click();
  await expect(networkTimelinePoint).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("timeline-selection")).toBeFocused();
  await expect(page.getByTestId("timeline-selection")).toContainText("network");
  await expect(page.getByText("Error summary", { exact: true })).toBeVisible();
  await expect(page.getByText("Compressed")).toHaveCount(0);
  await expect(page.getByText("이벤트 밀도")).toHaveCount(0);
  await page.getByTestId("tab-network").click();
  await expect(page.getByRole("heading", { name: "네트워크" })).toBeVisible();
  await expect(page.getByTestId("network-summary")).toContainText("실행 시간");
  await expect(page.getByTestId("network-summary")).toContainText("평균");
  await expect(page.getByTestId("network-detail-table")).toContainText("Duration");
  await page.getByTestId("tab-console").click();
  await expect(page.getByRole("heading", { name: "콘솔" })).toBeVisible();
  await expect(page.getByTestId("console-summary")).toContainText("warn/error");
  await expect(page.getByTestId("console-log-table")).toContainText("Message");
  await page.getByTestId("tab-timeline").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const stream = document.querySelector('[data-testid="event-stream-panel"]');
        if (!stream) return null;
        const styles = window.getComputedStyle(stream);
        return {
          maxHeight: styles.maxHeight,
          overflowY: styles.overflowY,
        };
      }),
    )
    .toEqual({ maxHeight: "760px", overflowY: "auto" });
  await expect(page.getByTestId("virtual-event-list")).toBeVisible();
  for (const filter of ["user", "network", "console", "errors"] as const) {
    await page.getByTestId("event-stream-panel").evaluate((element) => {
      element.scrollTop = 240;
    });
    await page
      .getByTestId("event-stream-panel")
      .getByRole("button", { name: new RegExp(`^${filter}\\b`, "i") })
      .click();
    await expect.poll(() => page.getByTestId("event-stream-panel").evaluate((element) => element.scrollTop)).toBe(0);
  }
  await page
    .getByTestId("event-stream-panel")
    .getByRole("button", { name: /^all\b/i })
    .click();
  await expect.poll(() => page.getByTestId("event-stream-panel").evaluate((element) => element.scrollTop)).toBe(0);
  const summaryBox = await page.getByText("Error summary", { exact: true }).boundingBox();
  const streamBox = await page.getByTestId("event-stream-panel").boundingBox();
  const failureFlowBox = await page.getByTestId("failure-timeline").boundingBox();
  expect(summaryBox?.y ?? 0).toBeLessThan(failureFlowBox?.y ?? Number.POSITIVE_INFINITY);
  expect(failureFlowBox?.y ?? 0).toBeLessThan(streamBox?.y ?? Number.POSITIVE_INFINITY);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const offenders = [...document.body.querySelectorAll("*")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === "string" ? element.className : "",
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          })
          .filter((rect) => rect.width > 0 && (rect.right > viewportWidth + 1 || rect.left < -1));
        return offenders.slice(0, 3);
      }),
    )
    .toEqual([]);
  await expect(page.getByTestId("event-click").first()).toBeVisible();
  await expect(page.getByTestId("event-keydown").first()).toBeVisible();
  await expect(page.getByTestId("event-network").first()).toBeVisible();
  await expect(page.getByTestId("event-console").first()).toBeVisible();
  await expect(page.getByTestId("error-summary")).toContainText("결제 진행중 오류발생");
  await expect(page.getByText("redacted").first()).toBeVisible();

  const pageText = await page.locator("body").innerText();
  for (const secret of forbiddenSecrets) expect(pageText).not.toContain(secret);
});

test("viewer preserves generated-id timeline anchors for compact payloads", async ({ page }) => {
  const errorEvent = {
    id: "uuid-error-event-00000000000000000000000000000001",
    kind: "error" as const,
    timestamp: 1_800_000_000_300,
    message: "Generated id anchor failure",
    name: "Error",
    stack: "Error: Generated id anchor failure\n at CheckoutPage (checkout.tsx:10:1)",
  };
  const payload = await encodeReplayPayload(
    {
      metadata: {
        sessionId: "generated-id-anchor",
        sdkVersion: "0.1.0",
        url: "https://example.test/checkout",
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      events: [
        {
          id: "uuid-click-event-00000000000000000000000000000001",
          kind: "click",
          timestamp: 1_800_000_000_000,
          target: { strategy: "id", selector: "#pay", tagName: "button" },
        },
        {
          id: "uuid-network-event-00000000000000000000000000000001",
          kind: "network",
          timestamp: 1_800_000_000_180,
          method: "POST",
          url: "https://api.example.test/pay",
          status: 502,
          durationMs: 180,
          ok: false,
          redactions: [],
        },
        errorEvent,
      ],
      errors: [errorEvent],
      stats: { eventCount: 3, droppedEvents: 0, truncatedEvents: 0, redactionCount: 0 },
      privacy: { defaultRedactions: [], notes: [] },
    },
    passphrase,
  );

  await page.goto(`${viewerUrl}?lang=en`);
  await page.getByTestId("payload-input").fill(payload);
  await page.getByTestId("passphrase-input").fill(passphrase);
  await page.getByTestId("decode-button").click();

  await expect(page.getByTestId("decoded-session")).toBeVisible();
  await expect(page.getByTestId("error-summary")).toContainText("Generated id anchor failure");
  const networkPoint = page.getByTestId("timeline-point-network").first();
  await networkPoint.click();
  await expect(networkPoint).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("timeline-selection")).toBeFocused();
  await expect(page.getByTestId("timeline-selection")).toContainText("POST 502 api.example.test/pay");
  const errorPoint = page.getByTestId("timeline-point-error").first();
  await errorPoint.click();
  await expect(errorPoint).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("timeline-selection")).toContainText("Generated id anchor failure");
  await expect(page.getByTestId("timeline-selection")).toContainText('"id": "2"');
});

test("viewer shows generic decrypt alert for missing passphrase", async ({ page }) => {
  await page.goto(`${viewerUrl}?lang=ko`);
  await page.getByTestId("payload-input").fill("osr1:bad-payload");
  await page.getByTestId("decode-button").click();

  await expect(page.getByRole("alert")).toContainText("Payload를 열 수 없습니다.");
  await expect(page.getByText("Passphrase is required to decrypt payloads.")).toHaveCount(0);
  const decodeButtonBox = await page.getByTestId("decode-button").boundingBox();
  const alertBox = await page.getByRole("alert").boundingBox();
  expect(alertBox?.y ?? 0).toBeGreaterThan(decodeButtonBox?.y ?? Number.POSITIVE_INFINITY);
});

test("viewer shows generic decrypt alert for wrong passphrase", async ({ page }) => {
  const payload = await encodeReplayPayload(viewerFixtureSession, passphrase);
  await page.goto(`${viewerUrl}?lang=ko`);
  await page.getByTestId("payload-input").fill(payload);
  await page.getByTestId("passphrase-input").fill("wrong");
  await page.getByTestId("decode-button").click();

  await expect(page.getByRole("alert")).toContainText("Payload를 열 수 없습니다.", {
    timeout: 12_000,
  });
});

test("viewer can prefill passphrase from query string", async ({ page }) => {
  await page.goto(`${viewerUrl}?passphrase=${encodeURIComponent(passphrase)}&lang=en`);

  await expect(page.getByTestId("passphrase-input")).toHaveValue(passphrase);
  await expect(page.getByLabel("Language")).toHaveValue("en");
});

test("viewer can switch viewer language", async ({ page }) => {
  await page.goto(`${viewerUrl}?lang=en`);

  await expect(page.getByLabel("Language")).toHaveValue("en");
  await expect(page.getByText("Paste an encrypted replay payload captured by open-session.")).toBeVisible();

  await page.getByLabel("Language").selectOption("ko");

  await expect(page.getByLabel("언어")).toHaveValue("ko");
  await expect(page.getByText("open-session 에서 측정된 암호화된 리플레이 payload를 붙여넣으세요.")).toBeVisible();
});

test("viewer opens bundled sample replay from import screen", async ({ page }) => {
  await page.goto(`${viewerUrl}?lang=ko`);

  await page.getByTestId("sample-view-button").click();

  await expect(page.getByTestId("decoded-session")).toBeVisible();
  await expect(page.getByText("Error summary", { exact: true })).toBeVisible();
  await expect(page.getByTestId("error-summary")).toContainText("결제 진행중 오류발생");
  await expect(page.getByTestId("user-journey-summary")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "오류 발생 흐름" })).toBeVisible();
  await expect(page.getByTestId("failure-timeline")).toBeVisible();
  await expect(page.getByTestId("timeline-point-click").first()).toBeVisible();
  await expect(page.getByTestId("timeline-point-network").first()).toBeVisible();
  await expect(page.getByTestId("timeline-point-error").first()).toBeVisible();
  await expect(page.getByText("×4").first()).toBeVisible();
  await expect(page.getByText("×12").first()).toBeVisible();
  await expect(page.getByTestId("event-navigation").first()).toBeVisible();
  await expect(page.getByTestId("event-network").first()).toBeVisible();
  await page.getByTestId("tab-network").click();
  await expect(page.getByRole("heading", { name: "네트워크" })).toBeVisible();
  await expect(page.getByTestId("network-detail-table")).toContainText("502");
  await expect(page.getByTestId("network-detail-table")).toContainText("×3");
  await expect(page.getByTestId("network-detail-table")).toContainText("522ms–642ms");
});

test("sample app can switch language", async ({ page }) => {
  await page.goto("/?lang=en");

  await expect(page.getByLabel("Language")).toHaveValue("en");
  await expect(page.getByRole("heading", { name: "Replay a payment approval failure" })).toBeVisible();
  await expect(page.getByTestId("sample-status")).toContainText("Initialized");

  await page.getByLabel("Language").selectOption("ko");

  await expect(page.getByLabel("언어")).toHaveValue("ko");
  await expect(page.getByRole("heading", { name: "결제 승인 중 장애 재현" })).toBeVisible();
  await expect(page.getByTestId("sample-status")).toContainText("초기화됨");
});
