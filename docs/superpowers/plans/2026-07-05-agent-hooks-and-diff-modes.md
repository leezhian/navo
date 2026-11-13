# Agent Hooks And Diff Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Agent hook collection, latest previous-session patch storage, and clear Git-backed compare modes.

**Architecture:** Keep Git commands in main-process services and expose only small IPC APIs to the renderer. Hook collection runs as a no-window main-process CLI path that reads stdin JSON, writes pending baselines, latest patch files, and lightweight local event metadata. Compare modes `unstaged`, `staged`, and `branch` stay real-time Git queries; `previous-session` reads the stored latest patch for the selected session.

**Tech Stack:** Electron main process, TypeScript, Node fs/path/os/child_process, Git CLI, existing React renderer.

## Global Constraints

- Do not add dependencies.
- Keep changes focused and readable.
- Use shadcn/Tailwind patterns for visible UI changes.
- Use Chinese for user-visible text.
- Verify with `npm run lint`, `npx tsc --noEmit`, and targeted manual hook collector checks where possible.

---

### Task 1: Local Review Store

**Files:**
- Create: `src/main-process/services/reviewStorage.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/shared/electronApi.ts`
- Modify: `src/main-process/services/gitReviewService.ts`

**Interfaces:**
- Produces: `ReviewSessionEvent`, `StoredReviewSession`, `getReviewStoragePaths()`, `readReviewEvents()`, `upsertReviewEvent()`, `readLatestPatch()`.
- Consumes: existing `ReviewSession`, `GitCommandOutput`, `LoadReviewDiffParams`.

- [ ] Add types for provider, event, pending baseline, stored session.
- [ ] Implement JSONL read/append and latest-session aggregation.
- [ ] Teach `runGitDiff` to read `previous-session` from `rawDiffPath`.
- [ ] Verify `previous-session` fails cleanly when no patch exists.

### Task 2: Git Snapshot And Hook Collector

**Files:**
- Create: `src/main-process/services/hookCollectorService.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `runHookCollectorFromStdin()`, `collectHookEvent(input)`.
- Consumes: `reviewStorage.ts` and Git CLI helpers.

- [ ] Parse Codex/Claude hook JSON with flexible field names.
- [ ] On `UserPromptSubmit`, write pending baseline.
- [ ] On `Stop` or `SessionEnd`, compute current tree, diff against pending, overwrite `latest.patch`, append event.
- [ ] Exit without writing events for invalid repos, missing pending baseline, or empty diff.

### Task 3: Integration Settings

**Files:**
- Create: `src/main-process/services/agentHookConfigService.ts`
- Modify: `src/shared/electronApi.ts`
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/main-process/ipc/reviewHandlers.ts`
- Modify: settings UI files under `src/components/settings`.

**Interfaces:**
- Produces: `setAgentIntegrationEnabled(provider, enabled)`, `loadAgentIntegrationStatuses()`.

- [ ] Add IPC for enabling/disabling Codex and Claude Code hooks.
- [ ] Merge in a Vibe Reviewer-marked hook entry when enabled.
- [ ] Remove only Vibe Reviewer-marked hook entries when disabled.
- [ ] Preserve user hooks and historical review data.

### Task 4: Session Loading And UI Refresh

**Files:**
- Modify: `src/main-process/ipc/reviewHandlers.ts`
- Modify: `src/services/reviewApi.ts`
- Modify: `src/hooks/useReviewData.ts`
- Modify: session/sidebar data flow as needed.

**Interfaces:**
- Produces: `loadReviewSessions()` renderer service.

- [ ] Load sessions from events plus stored session state.
- [ ] Use selected session ID for `previous-session` diff loading.
- [ ] Preserve mock fallback when Electron API is unavailable.

### Task 5: Verification

**Files:**
- No production files unless fixes are needed.

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run manual collector fixture checks in a temporary Git repo.
- [ ] Run `git diff --check`.
