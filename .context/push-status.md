# GitHub Push Status

## Current Situation
Cannot push to GitHub - no authentication configured on this VM (`ethernet-fun`).

**The repo `jdgiles26/tactical-insight-stream` does NOT exist on GitHub yet** (returns 404).

## Active: gh CLI Device Auth Flow (in tmux session `ghauth`)

**To authenticate, the user needs to:**
1. Go to: **https://github.com/login/device**
2. Enter code: **C6B1-0ABA**
3. Authorize the GitHub CLI

Once authenticated, we can:
1. Create the repo: `gh repo create jdgiles26/tactical-insight-stream --public --source=.`
2. Push: `git push origin main`

The remote has been switched to HTTPS: `https://github.com/jdgiles26/tactical-insight-stream.git`

## Alternative: exe.dev GitHub Integration
The exe.dev account has GitHub connected ("jdgiles26 - Connection OK — 235 repos accessible") but **no integration is attached to this VM**. From outside the VM (exe.dev web UI or local machine), run:
```
ssh exe.dev integrations add github --name tis --repository jdgiles26/tactical-insight-stream --attach vm:ethernet-fun
```
Then on the VM:
```
git remote set-url origin https://tis.int.exe.xyz/jdgiles26/tactical-insight-stream.git
git push origin main
```

## Commits to push (7 ahead of origin/main)
```
1b1acd2 fix: Escape key and backdrop click dismiss alert without generating PDF
2fe39e1 fix: rewrite VLMAlertModal + reportGenerator to match actual hook types
deffe8a feat: integrate VLM monitoring into MediaPlayerPage
faa2b27 feat: add useVLMMonitor hook and HuggingFace service for live video VLM analysis
5ed8e52 feat: add VLM Alert Modal and PDF Commander's Report generator
(+ 2 more)
```
