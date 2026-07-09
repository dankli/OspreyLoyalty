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

export function changeLanguage(code: string): void {
  void i18n.changeLanguage(code);
  if (typeof localStorage !== "undefined") localStorage.setItem("lang", code);
}

export default i18n;
