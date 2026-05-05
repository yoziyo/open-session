import type { DecodedReplayPayload } from "@open-session/sdk";
import { RefreshCcw } from "lucide-react";
import { LanguageSelect, useI18n } from "../../../shared/i18n";
import { BrandHeader, Button, OpenLogoMark } from "../../../shared/ui";
import { SessionView } from "../../../widgets/session-view";

export function SessionViewerPage({ decoded, onReset }: { decoded: DecodedReplayPayload; onReset: () => void }) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <main className="mx-auto grid w-full min-w-0 max-w-[1440px] gap-4 px-4 py-4 lg:px-6">
        <BrandHeader
          icon={<OpenLogoMark className="h-11 w-11 md:h-12 md:w-12" />}
          iconFrame="plain"
          badges={[
            {
              label: t("viewer.sessionBadge", { sessionId: decoded.session.metadata.sessionId }),
              tone: "blue",
            },
          ]}
          description=""
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <LanguageSelect />
              <Button variant="secondary" className="whitespace-nowrap" onClick={onReset}>
                <RefreshCcw size={15} />
                {t("viewer.importAnother")}
              </Button>
            </div>
          }
        />

        <SessionView decoded={decoded} />
      </main>
    </div>
  );
}
