# Implement — WorkBuddy GAP Refresh (execution checklist)

## Ordered steps

1. [ ] P1 Capture+analyze WorkBuddy (sub-agent) → research/workbuddy-map.md
2. [ ] P2 Baseline open-cowork (sub-agent) → research/cowork-baseline.md
3. [ ] P3 Synthesize research/gap-analysis.md (batched backlog, prioritized)
4. [ ] P4+ For each batch B:
       a. implement (sub-agent, renderer-scoped)
       b. `npm run lint` && `npx tsc --noEmit` && `npx vitest run`
       c. launch app + screenshot (sub-agent) → verify vs intent
       d. commit (conventional) → push → `gh pr create` → merge (squash, auto)
       e. update mission-control.md progress log
5. [ ] Final full-scope check; confirm all planned GAPs closed & app clean.

## Validation commands

- Quick main build: `node scripts/bundle-mcp.js && npx vite build`
- Dev run: `npm run dev` (Vite + Electron)
- Gate: `npm run lint` ; `npx tsc --noEmit` ; `npx vitest run`

## Review gates / rollback

- Do not merge a batch whose gate fails. Rollback = `git revert` the batch's squash commit on main.
- Never read WorkBuddy source. If a GAP can't be closed without it, defer + document in gap-analysis.md.
