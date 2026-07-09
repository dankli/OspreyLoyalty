# ADR-0010: In-app help as a localized "?" dialog

**Status:** accepted

## Context

The domain has concepts that are not self-evident from the UI — most sharply the difference between **spendable** points (what you can redeem) and **qualifying** points (what drives your tier), which a review flagged as genuinely confusing. Phase 6 adds an in-app help system so each page can explain itself, in all five languages, without shipping a separate docs site.

## Decision

**A reusable "?" trigger + focus-trapped modal per framework** (a React `HelpButton.tsx` in member-portal, a Vue `HelpButton.vue` in admin-portal), with an accessible dialog (`role="dialog"`, ESC/overlay close, focus trap). **Help content lives in the i18n catalogs under `help.*` keys**, so it is translated by the same mechanism as everything else (ADR-0009) and ships in all five languages for free — no separate content pipeline. Content covers the spendable-vs-qualifying distinction, the tier ladder and PANDION, earn/redeem, and the admin actions and partner rates.

## Alternatives considered

**A standalone documentation site.** More room to write, but it lives away from the task, goes stale, and needs its own hosting and its own translation flow. In-context help beats a separate site for a demo whose point is legibility.

**Tooltips only.** Good for a one-line hint, too small for the spendable-vs-qualifying explanation that motivated this. The dialog carries the longer copy; short inline hints still exist where a sentence suffices.

**Hard-coded English help.** Simplest, but it would be the one English island in a five-language app. Sourcing help from the i18n catalogs keeps it consistent.

## Consequences

- Each page registers a help topic; adding help to a new page is a catalog entry plus mounting the shared button.
- Help copy is now part of the translation surface — a new `help.*` key must be added in all five catalogs (English fallback if one is missing).
- The dialog is keyboard-accessible and tested for open/close and content keys, matching the a11y bar of the rest of the UI.
