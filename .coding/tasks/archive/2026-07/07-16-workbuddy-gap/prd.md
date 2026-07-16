# PRD — Refactor open-cowork UI/UX toward WorkBuddy parity

## Goal

Study WorkBuddy (local Electron app) via screenshots, GAP-analyze against open-cowork across
UI visual design, interaction/information-architecture, and feature capability, then close the
GAPs in open-cowork with iterative screenshot-compare + self-test until the app runs cleanly.

## Constraints

- Learn from rendered UI only. NEVER read WorkBuddy source/asar/resources. No copied code.
- open-cowork stack unchanged: Electron + React + Zustand + Tailwind + i18next + codex-runtime.
- i18n parity (en + zh), Tailwind-only, lucide-react-only, TS strict no-any.

## Acceptance criteria

- [ ] `research/workbuddy-map.md` documents WorkBuddy's surfaces (features + UI + IA), evidence = screenshots.
- [ ] `research/gap-analysis.md` lists prioritized, testable GAP items in batches.
- [ ] Each planned GAP item is implemented in open-cowork or explicitly deferred with reason.
- [ ] After each batch: `npm run lint` + `npx tsc --noEmit` + `npx vitest run` all pass; app launches and change verified by screenshot.
- [ ] No WorkBuddy source was read; all code is original.
- [ ] Stage push + PR + auto-merge completed per batch.

## Out of scope

- Backend agent-loop rewrites unrelated to UX. Auth/provider changes. Anything requiring WorkBuddy code.
