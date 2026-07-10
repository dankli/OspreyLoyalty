# ADR-0009: Five-language i18n — frontends and backend messages

**Status:** accepted

## Context

Through phase 5 the platform was English-only. Phase 6 makes it multilingual in five languages (Swedish, English, Spanish, German, Italian) across both the frontends **and** the messages the backends produce — a validation error should read in the user's language, not just the button labels. The stack is polyglot (React, Vue, a framework-less shell, .NET, Java, Node, Rust), so there is no single i18n library to reach for; the decision is really about a consistent *pattern* per tier, and about doing it without breaking the many tests that assert exact English strings.

## Decision

**Frontends use each framework's idiomatic library, one shared set of catalogs.** member-portal uses `react-i18next`, admin-portal uses `vue-i18n`, and the shell uses a tiny framework-less lookup; route-explorer (added later, ADR-0022) reuses the shell's tiny-lookup approach rather than adding a Svelte i18n dependency, resolving the locale per property access so a remount after a language switch picks up the change. Each app ships JSON catalogs `locales/{sv,en,es,de,it}.json`; a language switcher persists the choice in `localStorage("lang")` so the shell and the remotes agree.

**Backends localize their own messages off `Accept-Language`.** Each service keeps a small in-process catalog keyed by a stable message key, with English matching the original hard-coded wording verbatim:

- **members (.NET)** — validation throws a `LocalizedArgumentException` carrying a key + args; the HTTP error edge renders it in the request's `Accept-Language` culture.
- **partners (Java)** — a `LocalizedBadRequest` carries a code + args; `ApiErrorHandler` resolves it against `messages_*.properties` via Spring's `MessageSource` and the default `AcceptHeaderLocaleResolver`.
- **gateway (Node)** — a small `i18n.ts` localizes the few gateway-owned messages and forwards `Accept-Language` downstream so members/partners localize their own.
- **points-engine (Rust)** — an `i18n.rs` maps each `CalcError` variant to a per-language string chosen from the `Accept-Language` header.

**English stays byte-for-byte identical.** Every catalog's English column reproduces the previous hard-coded strings, so the existing suites that assert English text keep passing; only new tests exercise the other languages. The kill-switch philosophy from ADR-0007 has an analogue here: the default (no/`en` `Accept-Language`) path is unchanged.

## Alternatives considered

**One shared translation service.** A central message service the others call would remove duplication but add a network hop on every error, a new failure mode, and cross-service coupling — wrong for a set of otherwise-independent services.

**Message-as-key (translate the English string at the edge).** Simple, but the interpolated values (`"at most {0} characters"`) make the English sentence an unstable key; a stable key + args is cleaner and survives wording changes.

**Frontend-only i18n.** Cheaper, but a Swedish user hitting a validation error would still see English — the plan explicitly wanted backend messages too.

## Consequences

- Five small catalogs per surface to keep in sync; a missing key falls back to English rather than erroring.
- The `security` service has **no first-party human-facing messages** (its output is standard OAuth2 error codes and the framework login page), so it deliberately gets no catalog — adding one would be unused code.
- Number/date formatting in the frontends is still `toLocaleString("sv-SE")` in places to avoid churning test regexes; fully locale-aware `Intl` formatting is a noted follow-up.
- `vue-i18n` treats a literal `@` as a linked-message marker, so email placeholders in the admin catalogs are escaped as `{'@'}`.
