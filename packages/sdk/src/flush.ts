import { type EncodedReplayPayload, encodeReplayPayload, type ReplaySession } from "@open-session/protocol";
import { DEFAULT_REPLAY_LIMITS } from "./constants";
import { safeRandomId } from "./event-id";
import type { ReplayInitOptions } from "./types";

interface FlushWorkerRequest {
  id: string;
  session: ReplaySession;
  passphrase: string;
  compressionLevel?: ReplayInitOptions["compressionLevel"] | undefined;
}

interface FlushWorkerResponse {
  id: string;
  ok: boolean;
  payload?: EncodedReplayPayload | undefined;
  error?: string | undefined;
}

function encodeOnMainThread(session: ReplaySession, passphrase: string, options: ReplayInitOptions): Promise<EncodedReplayPayload> {
  return encodeReplayPayload(session, passphrase, {
    compression: { level: options.compressionLevel },
  });
}

async function encodeWithWorker(session: ReplaySession, passphrase: string, options: ReplayInitOptions): Promise<EncodedReplayPayload> {
  const worker = options.createFlushWorker?.();
  if (!worker) throw new Error("createFlushWorker is required");
  const requestId = safeRandomId("flush");
  const timeoutMs = options.flushWorkerTimeoutMs ?? DEFAULT_REPLAY_LIMITS.flushWorkerTimeoutMs;

  return await new Promise<EncodedReplayPayload>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Replay flush worker timed out"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Replay flush worker failed"));
    };
    const onMessage = (event: MessageEvent<FlushWorkerResponse>) => {
      if (event.data.id !== requestId) return;
      cleanup();
      if (event.data.ok && event.data.payload) {
        resolve(event.data.payload);
      } else {
        reject(new Error(event.data.error ?? "Replay flush worker failed"));
      }
    };

    try {
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({
        id: requestId,
        session,
        passphrase,
        compressionLevel: options.compressionLevel,
      } satisfies FlushWorkerRequest);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function encodeReplaySession(session: ReplaySession, passphrase: string, options: ReplayInitOptions): Promise<EncodedReplayPayload> {
  if (options.processing === "main-thread" || options.processing === undefined) {
    return encodeOnMainThread(session, passphrase, options);
  }

  if (!options.createFlushWorker) {
    if (options.processing === "worker") throw new Error("createFlushWorker is required for worker processing");
    return encodeOnMainThread(session, passphrase, options);
  }

  try {
    return await encodeWithWorker(session, passphrase, options);
  } catch (error) {
    if (options.processing === "worker") throw error;
    return encodeOnMainThread(session, passphrase, options);
  }
}
