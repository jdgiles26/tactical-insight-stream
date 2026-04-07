# Revert Analysis — tactical-insight-stream

Generated: 2026-03-30

---

## 1. Git Log (last 20 commits, all branches)

```
f15b96c 2026-03-30 19:20:48 fix: restore real Supabase client, fix alerts/pipeline/error handling        ← HEAD
b1a29d3 2026-03-30 19:20:31 fix: upload lat/lng, pipeline event creation, client-side correlation matching
5091ab6 2026-03-30 19:19:03 fix: add lat/lng to source config, pipeline event creation on ingestion
c962f31 2026-03-30 18:42:48 feat: geo-correlation engine, VLM monitoring, full system improvements
ff7db5d 2026-03-30 14:49:24 feat: add geo-correlation visualization to Map, Discovery, and DataProductTable
539367e 2026-03-30 14:45:23 feat: add geographic correlation engine with DBSCAN clustering
1b1acd2 2026-03-25 23:47:24 fix: Escape key and backdrop click dismiss alert without generating PDF
2fe39e1 2026-03-25 23:45:27 fix: rewrite VLMAlertModal + reportGenerator to match actual hook types
deffe8a 2026-03-25 23:44:24 feat: integrate VLM monitoring into MediaPlayerPage
faa2b27 2026-03-25 23:38:21 feat: add useVLMMonitor hook and HuggingFace service for live video VLM analysis
5ed8e52 2026-03-25 23:37:42 feat: add VLM Alert Modal and PDF Commander's Report generator
fe6129d 2026-03-25 23:37:00 feat: add HuggingFace Inference API service layer
771103f 2026-03-25 22:59:18 Fix upload ingestion: local processing for doc/video, in-memory data store, fix skeleton loaders
fe06df7 2026-03-25 18:27:03 yeaaaa buddy
a629229 2026-03-25 18:23:24 Merge pull request #4 from jdgiles26/copilot/install-supabase-js-package
918f4e4 2026-03-25 18:17:34 Merge branch 'main' into copilot/install-supabase-js-package
06093cb 2026-03-25 18:04:52 Update Supabase credentials in .env file
1421bd5 2026-03-25 21:58:18 Add Supabase client setup: new project URL, publishable key, DB connection string, and utils/supabase.ts
ff434b3 2026-03-25 21:51:51 Initial plan
b6158a4 2026-03-25 17:50:13 Update project_id in config.toml
```

---

## 2. Git Status

```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  .context/
  .shelley-orchestrator/

nothing added to commit but untracked files present
```

**Working tree is clean** (no staged/unstaged changes to tracked files).

---

## 3. Diff Stats (HEAD vs recent ancestors)

### HEAD vs HEAD~1 (f15b96c vs b1a29d3) — 1 commit back

```
 src/hooks/useCommanderIntents.ts    |  5 +++-
 src/hooks/useCorrelationAlerts.ts   | 17 ++++++++++----
 src/hooks/useDataProducts.ts        | 46 ++++++++++++++++++++++++++++++++-----
 src/hooks/useDataSources.ts         |  5 +++-
 src/hooks/useDetectionResults.ts    |  5 +++-
 src/hooks/useEmergencyTriggers.ts   | 20 ++++++++++++----
 src/hooks/useEventBus.ts            | 37 ++++++++++++++++++++++++-----
 src/hooks/useStormHistory.ts        |  5 +++-
 src/integrations/supabase/client.ts | 31 +++++++++++++++++++------
 9 files changed, 140 insertions, 31 deletions
```

### HEAD vs HEAD~2 (f15b96c vs 5091ab6) — 2 commits back

```
 11 files changed, 342 insertions, 65 deletions
 (same 9 as above + localVideoProcessor.ts + UploadPage.tsx)
```

### HEAD vs HEAD~3 (f15b96c vs c962f31) — 3 commits back

```
 14 files changed, 392 insertions, 68 deletions
 (same 11 as above + LiveDataPanel.tsx, SourceCard.tsx, SourceForm.tsx)
```

---

## 4. App Runtime Status

### Dev server: ✅ RUNNING
- Vite dev server running in tmux session `devserver` on port 8080
- `curl http://localhost:8080` returns HTML successfully
- Also: `serve.cjs` running on a separate node process (port unclear)

### TypeScript check: ✅ PASSES (no errors)
- `npx tsc --noEmit` → zero output (clean)

### Vite build: ✅ SUCCEEDS
- `npx vite build` → **built in 30.71s**, 3295 modules transformed
- Output:
  - `dist/index.html` (1.22 kB)
  - `dist/assets/index-BwC3o6bm.js` (2,337.80 kB) ⚠️ large chunk warning
  - CSS + other chunks OK
- Only warning: chunk size > 500 kB (code-splitting suggestion)

---

## 5. Analysis Summary

### Current state (HEAD = `f15b96c`)
- **Build passes**, **TypeScript passes**, **dev server is running and serving HTML**
- Working tree is clean; no uncommitted changes
- The app appears to be in a **functional state** from a build perspective

### Recent commit pattern (top 3 commits, all within ~2 minutes on 2026-03-30)
| Commit | SHA | Changed files | Net lines |
|--------|-----|---------------|-----------|
| HEAD   | `f15b96c` | 9 files (hooks + supabase client) | +140 / -31 |
| HEAD~1 | `b1a29d3` | 2 more files (upload + video processor) | +202 / -34 cumulative |
| HEAD~2 | `5091ab6` | 3 more files (source UI components) | +50 / -3 cumulative |

### Key revert candidates

| Target | SHA | What you lose | What you gain |
|--------|-----|---------------|---------------|
| **HEAD~1** (`b1a29d3`) | Undo supabase client restore + hook error handling fixes | Revert only 9 hook/client files |
| **HEAD~2** (`5091ab6`) | Also undo upload lat/lng + pipeline event creation + correlation matching | Revert 11 files |
| **HEAD~3** (`c962f31`) | Also undo lat/lng source config + pipeline ingestion | Revert 14 files |
| **HEAD~6** (`1b1acd2`) | Undo entire geo-correlation + DBSCAN + visualization features (Mar 30 work) | Return to stable Mar 25 VLM state |
| **HEAD~7** (`2fe39e1`) | Also undo VLM alert modal dismiss fix | Return to VLM rewrite state |
| **HEAD~12** (`771103f`) | Undo all VLM features, keep upload ingestion fix | Pre-VLM, working upload |
| **HEAD~13** (`fe06df7`) | Return to "yeaaaa buddy" — base functional state before upload fix | Original working baseline |

### Recommendation context
- Since **TypeScript and build both pass cleanly**, the current HEAD is compilable.
- If there are **runtime errors** (Supabase connection failures, broken UI), the issue is likely in the supabase client configuration or hook logic — not type errors.
- The 3 most recent commits (`f15b96c`, `b1a29d3`, `5091ab6`) were all made within 2 minutes and focus on fixing the supabase client + hooks + upload pipeline.
- If those fixes introduced regressions, reverting to `c962f31` (HEAD~3) removes them while keeping the geo-correlation feature.
- For a known-good baseline, `771103f` (HEAD~12) is the upload ingestion fix commit before VLM features were added.
