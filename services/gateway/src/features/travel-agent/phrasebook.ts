// The (fake) agent's narration, localised per the repo convention that each service localises its
// own output. Destination names come from the catalogue and are NOT translated. Keep to a few
// short sentence templates — the structured suggestion cards carry the specifics.
// Reuse the gateway's single source of truth for the supported-language list (i18n.ts) so the two
// never diverge; `Lang` stays a local alias so the rest of the slice keeps importing it from here.
import { SUPPORTED, type Language } from "../../i18n.js";

export type Lang = Language;

export function normalizeLang(value: string | null): Lang {
  return (SUPPORTED as readonly string[]).includes(value ?? "") ? (value as Lang) : "en";
}

const BCP47: Record<Lang, string> = { sv: "sv-SE", en: "en-GB", es: "es-ES", de: "de-DE", it: "it-IT" };
export const formatPoints = (points: number, lang: Lang): string => points.toLocaleString(BCP47[lang]);

type Phrases = {
  intro: (points: string) => string;
  affordable: (n: number) => string;
  none: () => string;
  goal: (gap: string, destination: string) => string;
};

export const phrasebook: Record<Lang, Phrases> = {
  en: {
    intro: (p) => `Looking at your ${p} points for two travellers…`,
    affordable: (n) => ` I found ${n} getaway${n === 1 ? "" : "s"} you can book right now.`,
    none: () => ` Nothing's in budget yet — but here's one to aim for.`,
    goal: (gap, d) => ` Save ${gap} more points and ${d} is yours.`,
  },
  sv: {
    intro: (p) => `Tittar på dina ${p} poäng för två resenärer…`,
    affordable: (n) => ` Jag hittade ${n} ${n === 1 ? "resa" : "resor"} du kan boka direkt.`,
    none: () => ` Inget ryms i budgeten än — men här är ett att sikta mot.`,
    goal: (gap, d) => ` Spara ${gap} poäng till så är ${d} ditt.`,
  },
  es: {
    intro: (p) => `Mirando tus ${p} puntos para dos viajeros…`,
    affordable: (n) => ` Encontré ${n} escapada${n === 1 ? "" : "s"} que puedes reservar ahora.`,
    none: () => ` Aún nada entra en tu presupuesto, pero aquí tienes una meta.`,
    goal: (gap, d) => ` Ahorra ${gap} puntos más y ${d} será tuyo.`,
  },
  de: {
    intro: (p) => `Ich sehe deine ${p} Punkte für zwei Reisende…`,
    affordable: (n) => ` Ich habe ${n} Reise${n === 1 ? "" : "n"} gefunden, die du sofort buchen kannst.`,
    none: () => ` Noch nichts im Budget — aber hier ist ein Ziel zum Draufsparen.`,
    goal: (gap, d) => ` Spare ${gap} weitere Punkte und ${d} gehört dir.`,
  },
  it: {
    intro: (p) => `Guardo i tuoi ${p} punti per due viaggiatori…`,
    affordable: (n) => ` Ho trovato ${n} ${n === 1 ? "viaggio" : "viaggi"} che puoi prenotare subito.`,
    none: () => ` Ancora niente nel budget, ma ecco un obiettivo.`,
    goal: (gap, d) => ` Risparmia altri ${gap} punti e ${d} è tua.`,
  },
};
