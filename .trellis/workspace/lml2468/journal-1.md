# Journal - lml2468 (Part 1)

> AI development session journal
> Started: 2026-07-14

---

## Session 1: Codex runtime migration — Phase 6 (remove pi)

**Date**: 2026-07-15
**Task**: Codex runtime migration — Phase 6 (remove pi)
**Branch**: `main`

### Summary

Completed the pi->codex runtime migration by removing @mariozechner/pi outright across slices 6.3-6.8: repointed SubagentExtension onto codex child threads on a dedicated per-extension CodexClient with per-tool approval gating; detangled the custom-tool type into a local AgentRuntimeCustomTool interface; dropped the pi-ai model registry and the dead compaction extension; deleted pi-model-resolution/sdk-one-shot/shared-auth and obsolete pi-era tests; removed the pi packages/patch and updated vite bundling; retargeted .trellis/spec + CLAUDE.md to the codex runtime. Zero pi imports remain; tsc/lint clean, 1158 tests pass. Merged as PR #27; all codex-runtime phase branches deleted.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash      | Message       |
| --------- | ------------- |
| `fe1dba2` | (see git log) |
| `fd5c8b8` | (see git log) |
| `2e1828e` | (see git log) |
| `5844c56` | (see git log) |
| `d32b2a1` | (see git log) |
| `8d2ee42` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 2: Fix API config (Responses-only) + de-brand Claude UI

**Date**: 2026-07-15
**Task**: Fix API config (Responses-only) + de-brand Claude UI
**Branch**: `main`

### Summary

Fixed the post-migration API blocker: codex 0.142 only accepts wire_api=responses, so stale custom+anthropic configs hard-failed. Defaulted fresh installs to openai+openai, added a one-time load migration coercing custom+non-openai config sets to custom+openai (preserving endpoint/model/key), and made the unsupported-provider error actionable. De-branded Claude from the 4 user-facing i18n strings, default/fallback models (gpt-5.4), and OpenRouter presets. tsc/lint/vitest green (1160). Merged as PR #28.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash      | Message       |
| --------- | ------------- |
| `5f6fe3b` | (see git log) |
| `a1ac041` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 3: Codex-native MCP servers + elicitation approval

**Date**: 2026-07-15
**Task**: Codex-native MCP servers + elicitation approval
**Branch**: `main`

### Summary

Replaced the MCP dynamic_tools proxy (mcp\_\_ reserved collision) with codex-native mcp_servers registration; resolved spawn-ready specs, fixed native-JSON args typing, added app-server env-freshness respawn, and handled mcpServer/elicitation/request via the approve/deny UI. Verified live (Chrome DevTools MCP). Merged as PR #29.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash      | Message       |
| --------- | ------------- |
| `174f3a5` | (see git log) |
| `3443219` | (see git log) |
| `9e2cdd1` | (see git log) |
| `c661a86` | (see git log) |
| `3b66f3c` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete
