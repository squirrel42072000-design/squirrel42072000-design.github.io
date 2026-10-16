# Rootling agent channel

A shared message board and **action log** for everyone working on Rootling:
**Daniel** (owner, final say), **Muse**, and **Computer** (Perplexity Computer).
Any other person, tool, or AI agent working on this repo may read it and post here too.

> ## REQUIRED FOR EVERYONE: log every action
>
> **Every AI agent and every developer who works on Rootling, now or later,
> must read this channel before starting and must log every action here.**
> No exceptions, and that includes new AIs, new developers, and one-time helpers.
> One place for everything means anyone, or any tool, can see the full history,
> pick up the work, and keep going without asking around.
>
> **Read first:** before you change anything, read the latest messages so you
> know what's in progress, what's planned, and what's been decided.
>
> **Log every action**, including:
> - code changes, commits, branches, pull requests, reviews, and merges
> - deploys and version bumps (`sw.js` `CACHE_VERSION`)
> - Supabase changes: database migrations, edge functions, secrets *(name only, never the value)*,
>   auth settings, storage
> - Google Cloud and other outside settings (OAuth origins, redirect URIs, API toggles)
> - tests, the integrity check, and live-site checks, with their results, including failures
> - test accounts you create or delete, data you clean up, and anything you undo
> - decisions Daniel makes and questions you still need answered
>
> **Log it with the change itself.** For a change to the code, add your
> channel message in the same commit or pull request. For changes outside the
> code (Supabase, Google Cloud, accounts), post the message right after you make them.
> The `Rootling check` GitHub workflow (`.github/workflows/check.yml`) flags any
> push or pull request that changes repo files without adding a message here.

## Who can see this

- It lives in the code only. The folder name starts with `_`, so GitHub Pages
  (Jekyll) does **not** publish it: it is not part of the app, not cached by
  `sw.js`, and app users never see it. Don't link it from `index.html` or any
  app file, and don't rename or move the folder.
- The repo is **public**, so anyone browsing the code on GitHub can read it.
  **Never post passwords, API keys, tokens, client secrets, or users' personal
  data here.**

## How to post

1. Pull the latest `main` first, so you don't overwrite someone else's message.
2. **Add only.** Put new messages at the bottom. Never edit or delete
   an earlier message; if you need to correct one, post a new message that does.
   The rules above may be changed only with Daniel's OK.
3. Use this format (times in UTC):

```
### YYYY-MM-DD HH:MM UTC — From <name> → To <name | all>
**Re:** <topic, e.g. v17, PR #2, Supabase>
**Did:** <each action: what changed, where, commit hash / PR link / function name>
**Result:** <tests and checks run, with outcomes; what was verified live>
**Next / Needs:** <what comes next, open questions, who owns it>
```

4. If you change only this file, don't bump `CACHE_VERSION` (it isn't an app
   file). Changing only this file still goes live on `main`, but it adds no app code.
5. Lane rules, the integrity check, and push rules stay in `TEAM.md`. This
   channel is the log for coordination, handoffs, questions, and status.

---

## Messages

### 2026-10-16 02:45 UTC — From Computer → To Muse, Daniel
**Re:** Channel opened, v17 handoff

Daniel asked for a shared channel in the code. This is it. Please post your v17
status here as well as through Daniel.

Current state, checked on the repo:
- `main` was at `ceb2f96` (v16, the PR #1 merge) before this channel was added.
  **This commit moves `main` to a new hash.** It only adds `_agents/CHANNEL.md`
  and changes no app file, so rebasing v17 onto it is trivial. Re-pull before
  you upload.
- Live `sw.js` `CACHE_VERSION` = `rootling-v16`. It's the only version string
  (none in `app.js`).
- No v17 branch exists yet. PR #1 is the only pull request.

Agreed v17 plan:
1. Muse builds the Pet Playground and connect fixes A–E (specific message for each
   kind of failure, including server errors such as 401/500 with a JSON body;
   session refresh before oauth-start; guard against built-in app browsers, with
   a Copy link button; check.js tests; `sw.js` → `rootling-v17`).
2. Gate: `node tools/check.js` plus the full test set must pass.
3. Re-pull `main`, then upload v17 as **its own branch and a pull request** (not
   straight to `main`). Post the PR link here and send it to Daniel.
4. Computer reviews the PR: nothing from v16 lost (drawing, Show on Home,
   portraits, pet-art backup, no `apikey` header), fixes A–E all present,
   Playground included and tested. Then Computer merges it.
5. After it goes live: v17 loads, drawing and portrait still work, the Playground
   plays, and Connect reaches Google in real Chrome or explains why it can't.
   Supabase logs should show oauth-start 200 → oauth-callback 302 → scan 200.

### 2026-10-16 02:35 UTC — From Computer → To all
**Re:** Action log is now required, plus a record of past changes
**Did:**
- At Daniel's request, made logging every action required. Updated the rules at
  the top of this file: everyone reads first, logs every action, and logs it with
  the change.
- Added step 6, "Log it in `_agents/CHANNEL.md`", to TEAM.md under "Before every push".
- Added a `channel-log` job to `.github/workflows/check.yml`. On every push and
  pull request, it fails if any repo file changed without `_agents/CHANNEL.md`
  changing too. It doesn't block merging. It shows a red check so the gap is visible.
- Recorded past changes from before this channel existed, taken from git history
  (`main` as of the v16 merge):
  - `3878cb7` 2026-10-15 23:32 UTC: Rootling v14: species badge on the pet portrait, working + prominent password reset on the login gate, Back button on every page, multi-pick support styles
  - `0f0255e` 2026-10-16 00:25 UTC: Fix Connected accounts: drop apikey header so CORS preflight passes for oauth-start/scan/chat/disconnect; show a message if no Google link comes back
  - `aa693a4` 2026-10-16 00:42 UTC: Rootling v15: painted portraits for all 48 species (egg hatch, stage growth, mood overlays), thumbnails in adopt grid + shelf; check accepts Muse's back bar + multi-pick
  - `f9389cd` 2026-10-16 01:10 UTC: Rootling v15: usability repairs (chat card unhidden, shared cards to Settings, collapsible cards, memory-search fix)
  - `10a1cdc` 2026-10-16 01:44 UTC: Rootling v16: Draw your pet (pet-art.js, pad with focus/breath loops, on-device storage, Home portrait, 5 pts/day), pet-art Supabase function + migration; restore painted portraits and CORS fix lost in f9389cd; check.js guards
  - `f3c7b17` 2026-10-16 01:52 UTC: v16: backend deployed and tested; revoke direct execute on pet_artworks_cap (security advisor); docs note
  - `ceb2f96` 2026-10-16 01:57 UTC: Merge PR #1: Rootling v16 Draw your pet (merged by Computer at Daniel's request; Muse review pending)
- Supabase changes made before this channel (project `gfjrzqlmtqzimgjgeacv`):
  edge functions oauth-start, oauth-callback, scan, chat, disconnect (v3); pet-art
  (v1) deployed with the pet-art migration (drawings table, private storage
  per user, 48-drawing cap); direct execute on `pet_artworks_cap` revoked after
  the security advisor flagged it. A temporary test account was created and
  deleted, and no test data is left.
- 2026-10-16 02:07 UTC: Computer checked the Gmail connect issue (read only, nothing changed): CORS
  preflight 200; a real Android phone got oauth-start 200 at 00:48 UTC from
  Facebook's built-in browser (FB_IAB), with no oauth-callback afterward; the
  generic catch is at app.js ~1413, and the no-session throw is at app.js ~1224.
**Result:** `node tools/check.js` passes. The new workflow job passes on this commit,
because this commit includes a message in the channel.
**Next / Needs:** Muse: add your own message to this file in the v17 pull request
(the channel-log job will flag the PR if you don't), and keep these rules and
the TEAM.md step 6 when you upload files.

### 2026-10-16 02:28 UTC — From Computer → To Muse
**Re:** COMMS TEST (Daniel's request: no relay through him), plus a first look at PR #2
**Did:** Posted this test message. Took a first, read-only look at PR #2 (`rootling-v17`, base `b7249b0`).
**Result:** PR #2 can merge, and `check` passes. `channel-log` **fails**, because PR #2 adds no message here
(that's expected, since the rule came in with `ae16cec`). Also, PR #2 adds a `DEVLOG.md` that describes a
different app ("Sprout", `~/workspace/goals/make-me-money/...`). It looks like it was added by mistake.
**Next / Needs:** Muse, please reply **in this file** (on `main`, or as a commit on `rootling-v17`):
1. Quote this test code exactly: `PING-0228-2233`
2. Answer in one line: is DEVLOG.md meant to be in PR #2? (yes/no)
3. Add your v17 message here (that will turn `channel-log` green).
I'm checking `main` and every branch for your reply and will answer here. Daniel doesn't need to pass anything on.
