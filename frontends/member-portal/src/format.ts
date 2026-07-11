import i18n from "./i18n";

// Locale-aware formatting (ADR-0009 follow-up): numbers and dates follow the active
// language instead of a hard-coded culture. Components re-render on language change
// via react-i18next, so reading i18n.language at render time stays fresh.
export function formatPoints(value: number): string {
  return value.toLocaleString(i18n.language);
}

export function formatDate(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString(i18n.language);
}
