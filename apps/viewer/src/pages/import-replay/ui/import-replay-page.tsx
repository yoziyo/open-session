import { AlertTriangle, ClipboardPaste, KeyRound, PlayCircle } from "lucide-react";
import { LanguageSelect, useI18n } from "../../../shared/i18n";
import { BrandHeader, Button, IconInputField, OpenLogoMark, Panel, TextareaField } from "../../../shared/ui";

function DecodeFailureMessage() {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900" role="alert">
      <div className="rounded-xl border border-rose-200 bg-white p-2 text-rose-600">
        <AlertTriangle size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-600">{t("import.decodeFailedEyebrow")}</p>
        <p className="mt-1 text-sm font-semibold leading-5">{t("import.decodeFailedMessage")}</p>
      </div>
    </div>
  );
}

export function ImportReplayPage({
  payload,
  passphrase,
  error,
  loading,
  onPayloadChange,
  onPassphraseChange,
  onDecode,
  onOpenSample,
}: {
  payload: string;
  passphrase: string;
  error: string | null;
  loading: boolean;
  onPayloadChange: (value: string) => void;
  onPassphraseChange: (value: string) => void;
  onDecode: () => void;
  onOpenSample: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <main className="mx-auto grid min-h-screen w-full min-w-0 max-w-5xl content-center gap-4 px-4 py-6 lg:px-6">
        <BrandHeader
          icon={<OpenLogoMark className="h-11 w-11 md:h-12 md:w-12" />}
          iconFrame="plain"
          description={
            <>
              {t("import.descriptionLine1")}
              <br /> {t("import.descriptionLine2")}
            </>
          }
          action={<LanguageSelect />}
        />

        <Panel title={t("import.payloadTitle")} eyebrow={t("import.payloadEyebrow")} icon={<ClipboardPaste size={17} />}>
          <div className="grid gap-3">
            <TextareaField
              data-testid="payload-input"
              value={payload}
              onChange={(event) => onPayloadChange(event.target.value)}
              placeholder={t("import.payloadPlaceholder")}
            />
            <IconInputField
              label={t("import.passphraseLabel")}
              icon={<KeyRound size={15} className="text-slate-400" />}
              data-testid="passphrase-input"
              type="password"
              value={passphrase}
              placeholder={t("import.passphrasePlaceholder")}
              onChange={(event) => onPassphraseChange(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <Button variant="primary" onClick={onDecode} data-testid="decode-button">
                <ClipboardPaste size={15} />
                {loading ? t("import.decodeButtonLoading") : t("import.decodeButtonIdle")}
              </Button>
              <Button variant="secondary" onClick={onOpenSample} data-testid="sample-view-button" className="justify-center">
                <PlayCircle size={15} />
                {t("import.sampleButton")}
              </Button>
            </div>
          </div>
        </Panel>
        {error ? <DecodeFailureMessage /> : null}
      </main>
    </div>
  );
}
