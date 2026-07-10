// Tiny framework-less i18n for the shell. The portals own the language switcher and
// persist the choice in localStorage("lang"); the shell reads it on load so its nav
// labels match. English stays the default (and the exact test-asserted output).
type Locale = "en" | "sv" | "es" | "de" | "it";

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    brand: "Osprey Loyalty",
    memberPortal: "Member portal",
    adminPortal: "Admin portal",
    routeExplorer: "Route explorer",
    signOut: "Sign out",
    loadFailedRunning: "Failed to load {label}. Is its server running?",
    loadFailed: "Failed to load {label}.",
  },
  sv: {
    brand: "Osprey Loyalty",
    memberPortal: "Medlemsportal",
    adminPortal: "Adminportal",
    routeExplorer: "Ruttutforskare",
    signOut: "Logga ut",
    loadFailedRunning: "Kunde inte ladda {label}. Körs dess server?",
    loadFailed: "Kunde inte ladda {label}.",
  },
  es: {
    brand: "Osprey Loyalty",
    memberPortal: "Portal del miembro",
    adminPortal: "Portal de administración",
    routeExplorer: "Explorador de rutas",
    signOut: "Cerrar sesión",
    loadFailedRunning: "No se pudo cargar {label}. ¿Está su servidor en marcha?",
    loadFailed: "No se pudo cargar {label}.",
  },
  de: {
    brand: "Osprey Loyalty",
    memberPortal: "Mitgliederportal",
    adminPortal: "Admin-Portal",
    routeExplorer: "Routen-Explorer",
    signOut: "Abmelden",
    loadFailedRunning: "{label} konnte nicht geladen werden. Läuft der Server?",
    loadFailed: "{label} konnte nicht geladen werden.",
  },
  it: {
    brand: "Osprey Loyalty",
    memberPortal: "Portale membri",
    adminPortal: "Portale admin",
    routeExplorer: "Esplora rotte",
    signOut: "Esci",
    loadFailedRunning: "Impossibile caricare {label}. Il suo server è in esecuzione?",
    loadFailed: "Impossibile caricare {label}.",
  },
};

function currentLocale(): Locale {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
  return stored && stored in MESSAGES ? (stored as Locale) : "en";
}

export function t(key: string, params?: Record<string, string>): string {
  const locale = currentLocale();
  let text = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
  }
  return text;
}
