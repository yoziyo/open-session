import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { I18nProvider } from "./shared/i18n";
import "./styles/global.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
