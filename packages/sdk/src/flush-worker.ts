import { encodeReplayPayload, type ReplaySession } from "@open-session/protocol";
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
  payload?: string | undefined;
  error?: string | undefined;
}

self.addEventListener("message", (event: MessageEvent<FlushWorkerRequest>) => {
  void (async () => {
    const { id, session, passphrase, compressionLevel } = event.data;
    try {
      const payload = await encodeReplayPayload(session, passphrase, {
        compression: { level: compressionLevel },
      });
      self.postMessage({ id, ok: true, payload } satisfies FlushWorkerResponse);
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies FlushWorkerResponse);
    }
  })();
});
