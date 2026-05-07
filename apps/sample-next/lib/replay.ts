"use client";

import { captureError, type FlushResult, flushOpenSession, initOpenSession } from "@open-session/sdk";

const OPEN_APP_ID = "sample-next";
export const OPEN_PASSPHRASE = "demo-passphrase";

type ReplayProcessing = "main-thread" | "auto" | "worker";

let initialized = false;

function configuredProcessing(): ReplayProcessing | undefined {
  const value = process.env.NEXT_PUBLIC_OPEN_PROCESSING;
  return value === "main-thread" || value === "auto" || value === "worker" ? value : undefined;
}

function configuredCompressionLevel(): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  const value = Number(process.env.NEXT_PUBLIC_OPEN_COMPRESSION_LEVEL ?? 6);
  return Number.isInteger(value) && value >= 0 && value <= 9 ? (value as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) : 6;
}

function workerOptions() {
  const processing = configuredProcessing();
  if (!processing || processing === "main-thread" || typeof Worker === "undefined") return {};

  return {
    processing,
    createFlushWorker: () =>
      new Worker(new URL("@open-session/sdk/flush-worker", import.meta.url), {
        type: "module",
      }),
  } as const;
}

/**
 * Sample app용 SDK 초기화 예시입니다.
 *
 * 실제 서비스에서는 passphrase를 코드에 고정하지 말고, 운영 환경에 맞는
 * 안전한 설정/전달 방식으로 관리하세요.
 */
export function initSampleReplay(): void {
  if (initialized) return;

  initOpenSession({
    appId: OPEN_APP_ID,
    passphrase: OPEN_PASSPHRASE,

    // 예제에서 보기 좋은 크기를 유지하는 기본 버퍼/압축 설정입니다.
    maxEvents: 200,
    maxApproxBytes: 500_000,
    compressionLevel: configuredCompressionLevel(),
    // 결제/초대 링크처럼 서비스에만 존재하는 민감 query key를 추가로 마스킹합니다.
    additionalQueryKeys: ["invite", "coupon", "paymentToken"],
    maskSelectors: ["[data-replay-mask]"],
    excludeSelectors: ["[data-replay-exclude]"],

    // 운영에서는 NEXT_PUBLIC_OPEN_PROCESSING=auto 로 worker flush를 권장합니다.
    // 샘플은 설정이 없으면 호환성 높은 main-thread 기본값을 사용합니다.
    ...workerOptions(),

    // MVP에서는 hosted collector가 없으므로 transport를 직접 구현합니다.
    // 샘플은 Viewer에 붙여넣기 쉽도록 콘솔에 출력합니다.
    transport(payload) {
      console.log("OPEN_SESSION_PAYLOAD", payload);
    },
  });

  initialized = true;
}

export function captureSampleError(error: unknown, componentStack?: string): void {
  initSampleReplay();
  captureError(error, componentStack ? { componentStack } : undefined);
}

export function flushSampleReplay(reason = "manual-report"): Promise<FlushResult> {
  initSampleReplay();
  return flushOpenSession(reason);
}
