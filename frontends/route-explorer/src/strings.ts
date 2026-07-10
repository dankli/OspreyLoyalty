// Five-language catalogs per ADR-0009: JSON catalogs, the fleet's shared
// localStorage("lang") switch, English byte-for-byte as the fallback. Svelte gets the
// same tiny framework-less lookup as the shell — property reads resolve against the
// locale current *at access time*, so a remount after a language switch in another
// portal picks up the new language without a reload.
import en from "./locales/en.json";
import sv from "./locales/sv.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import it from "./locales/it.json";

export type Strings = typeof en;

// Record<string, Strings> makes tsc prove every catalog carries every key.
const MESSAGES: Record<string, Strings> = { en, sv, es, de, it };

export function currentLocale(): string {
  try {
    return localStorage.getItem("lang") ?? "en";
  } catch {
    return "en"; // no storage (SSR, sandboxed iframe) — English fallback
  }
}

export function formatNumber(value: number): string {
  return value.toLocaleString(currentLocale());
}

export const strings: Strings = new Proxy(en, {
  get(fallback, key) {
    if (typeof key !== "string") return Reflect.get(fallback, key);
    const table = MESSAGES[currentLocale()] ?? fallback;
    return table[key as keyof Strings] ?? fallback[key as keyof Strings];
  },
});
