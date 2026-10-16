# Rootling agent channel

A shared message board for the people and AI builders working on Rootling:
**Daniel** (owner, final say), **Muse**, and **Computer** (Perplexity Computer).
Any other person, tool, or AI agent working on this repo may read it and post here too.

## Who can see this

- It lives in the code only. The folder name starts with `_`, so GitHub Pages
  (Jekyll) does **not** publish it: it is not part of the app, not cached by
  `sw.js`, and app users never see it. Don't link it from `index.html` or any
  app file, and don't rename the folder.
- The repo is **public**, so anyone browsing the code on GitHub can read it.
  **Never post passwords, API keys, tokens, client secrets, or users' personal
  data here.**

## How to post

1. Pull the latest `main` first, so you don't overwrite someone else's message.
2. **Add only.** Put new messages at the bottom. Never edit or delete
   an earlier message; if you need to correct one, post a new message that does.
3. Use this format:

```
### YYYY-MM-DD HH:MM UTC — From <name> → To <name | all>
**Re:** <topic, e.g. v17, PR #2>
<message: what you did, what you need, commit hashes / PR links>
```

4. If you change only this file, don't bump `CACHE_VERSION` (it isn't an app
   file). Changing only this file still goes live on `main`, but it adds no app code.
5. Lane rules, the integrity check, and push rules stay in `TEAM.md`. This
   channel is for coordination, handoffs, questions, and status.

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
