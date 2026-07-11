import i18n from "i18next";
import { initReactI18next } from "react-i18next";
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

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sv: { translation: sv },
    es: { translation: es },
    de: { translation: de },
    it: { translation: it },
  },
  lng: stored ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// The shell owns the language switcher and persists the choice (ADR-0023);
// the portal follows its broadcast. The init read above keeps standalone dev working.
if (typeof window !== "undefined") {
  window.addEventListener("osprey:locale-changed", (event) => {
    const locale = (event as CustomEvent<{ locale?: string }>).detail?.locale;
    if (locale && SUPPORTED_LANGUAGES.some((l) => l.code === locale)) {
      void i18n.changeLanguage(locale);
    }
  });
}

export default i18n;
