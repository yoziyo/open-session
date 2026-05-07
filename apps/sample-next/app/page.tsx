import { SamplePageContent } from "../components/SamplePageContent";
import { SampleI18nProvider } from "../lib/i18n";

export default function Page() {
  return (
    <SampleI18nProvider>
      <SamplePageContent />
    </SampleI18nProvider>
  );
}
