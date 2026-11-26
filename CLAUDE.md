# Claude Development Guidelines

> This file is auto-loaded by the Claude Code CLI (and similar agentic tools) when a session opens in this directory. It exists to **point at the real rules** — not to duplicate them.
>
> **Source of truth: [`.ai/rules.md`](.ai/rules.md).** If anything in this file ever contradicts `.ai/rules.md`, `.ai/rules.md` wins.

## Stack

- React + TypeScript (client), Node + Express (server)
- SDK: [`@rtsdk/topia`](https://metaversecloud-com.github.io/mc-sdk-js/index.html)
- Baseline repository: https://github.com/metaversecloud-com/sdk-ai-boilerplate

## Read these before making any change

1. **[`.ai/rules.md`](.ai/rules.md)** — architecture, SDK usage policy, shared types, data-object pattern, `getVisitor` utility, real-time updates (SSE), response schema, testing, workflow, deliverable format, definition of done. **Read this first.**
2. **[`.ai/sdk-fundamentals.md`](.ai/sdk-fundamentals.md)** — protocol-level reference: Interactive Keys, JWT signing, iframes vs webhooks, session credentials, dropped-asset operations, backend validation. Read once early; come back when something is unclear about *why* the SDK works the way it does.
3. **[`.ai/style-guide.md`](.ai/style-guide.md)** — CSS cascade-layer setup (`index.css` / `index.html` / `tailwind.config.js`), SDK class catalog, custom CSS conventions, component structure pattern, checklists.
4. **[`.ai/accessibility.md`](.ai/accessibility.md)** — WCAG 2.1 AA patterns required for every UI change: semantic elements, icon-button labeling, form labels, modal dialog contract, focus management, contrast, motion, testing flow.
5. **[`.ai/examples/`](.ai/examples/)** — specific patterns: badges, inventory cache, dropped assets, data-object scoping, locking, leaderboards, world activity, visitor interactions, analytics tracking, etc.
6. **[`.ai/templates/plan.md`](.ai/templates/plan.md)** — finalization checklist when wrapping up an app.

## Standard files & patterns — reuse them, keep their contracts

Not locked: change them when the app needs it, but keep each file's contract and don't replace it with a parallel mechanism. See `.ai/rules.md` → `STANDARD FILES & PATTERNS` (canonical: `../sdk-ai-boilerplate/.ai/rules.md`).

- `client/src/App.tsx` (interactive params, backend setup, one path route per drawer), `client/src/components/PageContainer.tsx` / `AdminIconButton.tsx` / `AdminView.tsx`, `client/src/utils/backendAPI.ts`, `client/src/utils/setErrorMessage.ts`, `server/utils/getCredentials.ts`, `server/utils/errorHandler.ts`.

`client/topiaInit.ts` must exist; its exports may be adjusted.

## Workflow (one-liner)

Plan → implement → test → validate styling + accessibility → finalize (cleanup, README, tests) → deliver. The full workflow with deliverable format is in `.ai/rules.md` under `WORKFLOW` and `DELIVERABLE FORMAT`.

## When blocked

Stop. Propose a minimal stub, list assumptions, ask one concise question. If no answer, proceed with the safest assumption and mark TODOs. See `.ai/rules.md` → `IF BLOCKED`.

---

## App-specific context

**Fishers & Forts**: Ice Fishing logic puzzle (drawer) + a world-built Snow Fort fed by every fish caught. Launch: Winter Wonderland, Dec 1, 2026.

Read **[`plan.md`](plan.md)** before any work. It holds the decisions (pre-placed fort pieces + image swap, data scoping, server-authoritative drilling), data models, required asset unique names, build phases, and open questions. Design source: Spec 0.2 + `ww-icefish-ui-*` mockups (kept outside the repo; ask Lina for the folder).
