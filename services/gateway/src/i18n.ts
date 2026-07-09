// Localization for the few user-facing messages the gateway itself generates (the rest come
// from downstream services, which localize their own responses when we forward Accept-Language).
// Keep this list tiny and in lockstep with the frontend catalogs' shared vocabulary.

export const SUPPORTED = ["en", "sv", "es", "de", "it"] as const;
export type Language = (typeof SUPPORTED)[number];

type MessageKey = "member_not_found" | "redemption_rejected";

const CATALOG: Record<Language, Record<MessageKey, string>> = {
  en: { member_not_found: "Member not found.", redemption_rejected: "Redemption rejected." },
  sv: { member_not_found: "Medlemmen hittades inte.", redemption_rejected: "Inlösen nekades." },
  es: { member_not_found: "Miembro no encontrado.", redemption_rejected: "Canje rechazado." },
  de: { member_not_found: "Mitglied nicht gefunden.", redemption_rejected: "Einlösung abgelehnt." },
  it: { member_not_found: "Membro non trovato.", redemption_rejected: "Riscatto rifiutato." },
};

/** Picks the best supported language from an Accept-Language header; defaults to English. */
export function pickLanguage(acceptLanguage?: string): Language {
  if (!acceptLanguage) return "en";
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const primary = tag.split("-")[0] as Language;
    if (SUPPORTED.includes(primary)) return primary;
  }
  return "en";
}

/** Translates a gateway-owned message key into the given language (English fallback). */
export function t(key: MessageKey, acceptLanguage?: string): string {
  const lang = pickLanguage(acceptLanguage);
  return CATALOG[lang][key] ?? CATALOG.en[key];
}
