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

export function changeLanguage(code: string): void {
  i18n.global.locale.value = code as "en" | "sv" | "es" | "de" | "it";
  if (typeof localStorage !== "undefined") localStorage.setItem("lang", code);
}

export default i18n;
