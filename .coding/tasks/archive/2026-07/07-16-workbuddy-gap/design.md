# Design — WorkBuddy GAP Refresh

## Approach

Research-then-iterate. All screenshot capture + image analysis is delegated to sub-agents so
raw images never enter the main loop context; sub-agents persist TEXT findings to `research/`.

## Workstreams

1. Capture+analyze WorkBuddy → `research/workbuddy-map.md` (+ shots in /tmp/workbuddy-study).
2. Baseline open-cowork UI → `research/cowork-baseline.md` (+ shots in /tmp/cowork-study).
3. Synthesize `research/gap-analysis.md`: each GAP = {area, current, target, files, test, priority, batch}.
4. Implement per batch in the renderer (`src/renderer/`): components/, store/, i18n/, styles/.
   Follow `.coding/spec/frontend/*` (state-management = single Zustand store + selectors;
   ipc-electron = window.electronAPI single-listener; components = Tailwind tokens + lucide + memo;
   i18n = en+zh parity).

## Boundaries / data flow

- Changes are renderer-first (UI/IA/visual). Cross-boundary features extend ClientEvent/ServerEvent
  unions per `.coding/spec/backend/ipc-protocol.md` only when a GAP truly needs new main-process data.
- No new heavy deps without checking vite externals rules.

## Compatibility / rollback

- Each batch is an isolated PR merged to main; revert = revert the squash commit.
- Keep changes additive where possible; preserve existing IPC contract.

## Verification

- Self-test: launch app, screencapture our screen, sub-agent compares against target intent.
- Quality gate per batch: lint + tsc + vitest.
