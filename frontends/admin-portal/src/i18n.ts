import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import sv from "./locales/sv.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import it from "./locales/it.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sv", label: "Svenska" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
] as const;

const stored = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: stored ?? "en",
  fallbackLocale: "en",
  messages: { en, sv, es, de, it },
});

// The shell owns the language switcher and persists the choice (ADR-0023);
// the portal follows its broadcast. The init read above keeps standalone dev working.
if (typeof window !== "undefined") {
  window.addEventListener("osprey:locale-changed", (event) => {
    const locale = (event as CustomEvent<{ locale?: string }>).detail?.locale;
    if (locale && SUPPORTED_LANGUAGES.some((l) => l.code === locale)) {
      i18n.global.locale.value = locale as "en" | "sv" | "es" | "de" | "it";
    }
  });
}

export default i18n;
