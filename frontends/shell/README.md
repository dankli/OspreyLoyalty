# Shell

The micro-frontend host: one framework-less page composing the React member portal and the Vue admin portal via module federation ([ADR-0004](../../docs/decisions/0004-micro-frontend-tradeoff.md)). The shell owns navigation and nothing else.

**Mount contract:** each remote exposes a `mount(el: HTMLElement) => unmount` function. The shell loads a remote on demand, tears down the previous one, and mounts the new one into its outlet. A loader or mount failure renders a visible message instead of a blank page.

**Remote URLs are baked at build time** — a limitation of `@originjs/vite-plugin-federation` that ADR-0004 accepts for the demo. Defaults point at localhost:5173/5174; override with `MEMBER_PORTAL_URL` / `ADMIN_PORTAL_URL` (full URLs to `remoteEntry.js`) when building for anything else.

```bash
npm run dev     # standalone on :5170 (remotes must be built and served)
npm test        # vitest, against fake remotes — no federation involved
npm run build
```
