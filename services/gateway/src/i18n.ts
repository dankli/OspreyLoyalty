// Localization for the few user-facing messages the gateway itself generates (the rest come
// from downstream services, which localize their own responses when we forward Accept-Language).
// Keep this list tiny and in lockstep with the frontend catalogs' shared vocabulary.

export const SUPPORTED = ["en", "sv", "es", "de", "it"] as const;
export type Language = (typeof SUPPORTED)[number];

type MessageKey = "member_not_found" | "redemption_rejected" | "trip_no_route" | "trip_no_estimate" | "benefit_rejected";

const CATALOG: Record<Language, Record<MessageKey, string>> = {
  en: {
    member_not_found: "Member not found.",
    redemption_rejected: "Redemption rejected.",
    trip_no_route: "No route found between those airports.",
    trip_no_estimate: "No points estimate is available for that route right now.",
    benefit_rejected: "Benefit activation rejected.",
  },
  sv: {
    member_not_found: "Medlemmen hittades inte.",
    redemption_rejected: "Inlösen nekades.",
    trip_no_route: "Ingen rutt hittades mellan de flygplatserna.",
    trip_no_estimate: "Ingen poänguppskattning är tillgänglig för den rutten just nu.",
    benefit_rejected: "Aktiveringen av förmånen nekades.",
  },
  es: {
    member_not_found: "Miembro no encontrado.",
    redemption_rejected: "Canje rechazado.",
    trip_no_route: "No se encontró ninguna ruta entre esos aeropuertos.",
    trip_no_estimate: "No hay una estimación de puntos disponible para esa ruta en este momento.",
    benefit_rejected: "Activación del beneficio rechazada.",
  },
  de: {
    member_not_found: "Mitglied nicht gefunden.",
    redemption_rejected: "Einlösung abgelehnt.",
    trip_no_route: "Zwischen diesen Flughäfen wurde keine Route gefunden.",
    trip_no_estimate: "Für diese Route ist derzeit keine Punkteschätzung verfügbar.",
    benefit_rejected: "Aktivierung des Vorteils abgelehnt.",
  },
  it: {
    member_not_found: "Membro non trovato.",
    redemption_rejected: "Riscatto rifiutato.",
    trip_no_route: "Nessuna rotta trovata tra questi aeroporti.",
    trip_no_estimate: "Al momento non è disponibile una stima dei punti per questa rotta.",
    benefit_rejected: "Attivazione del vantaggio rifiutata.",
  },
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
