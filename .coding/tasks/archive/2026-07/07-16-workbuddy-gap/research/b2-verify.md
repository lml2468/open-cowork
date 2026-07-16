# B2 ("Expressive composer") Visual Verification

Verified reachable surfaces without credentials (WelcomeView + no-regression); ChatView-only pills confirmed in source. Coordinate note: cliclick uses points (screen 1512x982); the recurring macOS character/emoji viewer during automated typing is an OS/cliclick artifact, not an app bug.

1. **WelcomeView renders cleanly (light + dark)** — PASS. No layout regression from B1; composer card above the fold; skill cards + quick actions intact in both themes. Form is `relative`-positioned (`order-3 relative rounded-4xl`, WelcomeView.tsx:641). Theme toggle cycles light/system/dark correctly. Evidence: b2-01-welcome-light.png, b2-02b-welcome-dark.png.

2. **@-mention in WelcomeView** — SOURCE-ONLY (expected no menu). Default workingDir (`~/Library/Application Support/open-cowork/default_working_dir`) is EMPTY (0 files), so `artifacts.listRecentFiles` returns nothing → `items.length===0` → menu renders null. This is correct behavior, not a defect. Wiring confirmed: WelcomeView passes `cwd={workingDir}` to `<ComposerAutocomplete>` (WelcomeView.tsx:645-652); `@` trigger loads files via `window.electronAPI.artifacts.listRecentFiles(cwd,0,200)` (ComposerAutocomplete.tsx:87); `detectTrigger` gates on token-start `@` (composer-autocomplete.ts:27). Textarea accepts input (typed text appeared, b2-04-textarea-input.png). Note: WelcomeView does NOT pass `enableCommands`, so only `@` (not `/`) is active there — by design.

3. **No console-fatal / white screen** — PASS. No red overlay, no crash; dev log has zero error/uncaught/fatal lines. App stayed responsive across all interactions.

4. **ChatView toolbar (source-confirm)** — PASS. ChatView.tsx renders `<ModelPicker/> <SkillPicker/> <ConnectorPicker/> <ModePicker/>` in the per-turn control row (823-831) plus `<ComposerAutocomplete enableCommands .../>` (760-768). `git diff HEAD` confirms the old read-only model span was removed: `- {appConfig?.model || t('chat.noModel')}` replaced by `+ <ModelPicker />`.

Regressions: none observed.

VERDICT: B2 VERIFY: PASS
