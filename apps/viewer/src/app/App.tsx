import type { DecodedReplayPayload } from "@open-session/sdk";
import { useRef, useState } from "react";
import { sampleDecodedReplay } from "../entities/replay/model/sample-decoded-replay";
import { type DecodeMessages, decodeFromText } from "../features/replay-import/model";
import { ImportReplayPage } from "../pages/import-replay";
import { SessionViewerPage } from "../pages/session-viewer";
import { useI18n } from "../shared/i18n";

const PASSPHRASE_QUERY_KEYS = ["passphrase", "Passphrase", "replayPassphrase"];

function waitForErrorClearFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function initialPassphraseFromQueryString() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  for (const key of PASSPHRASE_QUERY_KEYS) {
    const value = params.get(key);
    if (value) return value;
  }
  return "";
}

export function App() {
  const { t } = useI18n();
  const [payload, setPayload] = useState("");
  const initialPassphrase = initialPassphraseFromQueryString();
  const [passphrase, setPassphrase] = useState(initialPassphrase);
  const [decoded, setDecoded] = useState<DecodedReplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const payloadRef = useRef(payload);
  const passphraseRef = useRef(initialPassphrase);

  function updatePayload(value: string) {
    payloadRef.current = value;
    setPayload(value);
  }

  function updatePassphrase(value: string) {
    passphraseRef.current = value;
    setPassphrase(value);
  }

  function decodeMessages(): DecodeMessages {
    return {
      emptyPayload: t("decode.emptyPayload"),
      invalidPrefix: t("decode.invalidPrefix"),
      passphraseRequired: t("decode.passphraseRequired"),
      unableToDecrypt: t("decode.unableToDecrypt"),
      decryptFailed: t("decode.decryptFailed"),
      malformedPayload: (message) => t("decode.malformedPayload", { message }),
    };
  }

  async function onDecode() {
    setLoading(true);
    setError(null);
    await waitForErrorClearFrame();
    try {
      setDecoded(await decodeFromText(payloadRef.current, passphraseRef.current, decodeMessages()));
      setError(null);
    } catch (decodeError) {
      setDecoded(null);
      const message = (decodeError instanceof Error ? decodeError.message : String(decodeError)).trim();
      setError(message || t("decode.decryptFailed"));
    } finally {
      setLoading(false);
    }
  }

  function resetToImport() {
    setDecoded(null);
    setError(null);
  }

  function openSampleReplay() {
    setDecoded(sampleDecodedReplay);
    setError(null);
  }

  if (decoded) return <SessionViewerPage decoded={decoded} onReset={resetToImport} />;

  return (
    <ImportReplayPage
      payload={payload}
      passphrase={passphrase}
      error={error}
      loading={loading}
      onPayloadChange={updatePayload}
      onPassphraseChange={updatePassphrase}
      onDecode={onDecode}
      onOpenSample={openSampleReplay}
    />
  );
}
