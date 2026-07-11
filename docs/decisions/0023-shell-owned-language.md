# ADR-0023: Shell-owned language switching

**Status:** accepted

## Context

ADR-0009 gave every frontend the same five catalogs and the shared `localStorage("lang")` key, but each portal owned its own switcher: member-portal and admin-portal rendered one apiece, route-explorer had none, and the shell just read the key at load. A change made in one portal reached the others only on their next full init — the shell's nav labels stayed stale while a portal was mounted, the sibling portals kept the old language until remounted, and a user inside route-explorer had no way to switch at all. Micro-frontend state that all remotes share belongs to the host, not to whichever remote happens to render a `<select>`.

## Decision

**The shell owns the single language switcher.** It renders a `select.shell-lang` in its chrome, and `setLocale` in the shell's `i18n.ts` does two things: persist to `localStorage("lang")` (unchanged key, so nothing else moves) and broadcast a `window` `CustomEvent("osprey:locale-changed", { detail: { locale } })` — the same host↔remote channel ADR-0004 established with `osprey:navigate`.

**Portals follow the broadcast, each in its own idiom.** member-portal's listener calls `i18n.changeLanguage`, admin-portal's sets `i18n.global.locale`, and route-explorer remounts itself — its strings already resolve per property access (ADR-0022), so a remount *is* its language switch, and its map/search state survives via the same persistence that covers a tab reload. The shell relabels its own chrome in place from the same event. The portal-local switchers are removed.

**Standalone dev keeps working.** Every portal still reads `localStorage("lang")` at init, so running a remote outside the shell renders in the stored language — it just has no switcher of its own anymore.

Number and date formatting rides along: the hard-coded `toLocaleString("sv-SE")` spots noted as a follow-up in ADR-0009 now format with the active locale.

## Alternatives considered

**Extend the mount contract with a locale parameter.** `mount(el, { locale })` would be explicit, but changes the ADR-0004 contract for every remote and still needs a change-notification channel; the event alone is enough and is already the established pattern.

**Keep per-portal switchers and sync via the `storage` event.** `storage` doesn't fire in the tab that wrote the value, so same-tab module federation — the only composition we have — would still need a custom event. Two mechanisms for one job.

## Consequences

- One switcher, one owner: portals can't drift apart on language, and the shell's own labels update live.
- A remote mounted by a future host that never broadcasts the event still works — it just stays in its init-time language, which is exactly the pre-ADR behavior.
- route-explorer's remount-on-switch trades a rebuild (WASM map re-init, restored from persisted view state) for zero i18n plumbing in Svelte components; if a switch ever needs to be state-preserving there, the store-based approach stays open.
