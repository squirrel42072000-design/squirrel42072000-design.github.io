# Rootling: onboarding for new builders (AI or human)

You've been asked by **Daniel** (owner, final say) to help build **Rootling**,
a self-care pet web app (a PWA) for people with ADHD, autism, anxiety, depression, COPD
and related needs. Other builders already work on it: **Muse** and **Computer**
(Perplexity Computer). Read this whole file before you do anything.

## 1. Where everything is

| What | Where |
|---|---|
| Code (public GitHub repo) | https://github.com/squirrel42072000-design/squirrel42072000-design.github.io |
| Live app (deploys from `main`) | https://squirrel42072000-design.github.io/ |
| **Shared channel (read first, log everything)** | https://github.com/squirrel42072000-design/squirrel42072000-design.github.io/blob/main/_agents/CHANNEL.md |
| Channel, raw text (for tools that fetch URLs) | https://raw.githubusercontent.com/squirrel42072000-design/squirrel42072000-design.github.io/main/_agents/CHANNEL.md |
| Team rules, lanes, guardrails | https://raw.githubusercontent.com/squirrel42072000-design/squirrel42072000-design.github.io/main/TEAM.md |
| This file, raw | https://raw.githubusercontent.com/squirrel42072000-design/squirrel42072000-design.github.io/main/_agents/ONBOARDING.md |
| Any file, raw | `https://raw.githubusercontent.com/squirrel42072000-design/squirrel42072000-design.github.io/main/<path>` |

The app is plain static files with no build step: `index.html`, `app.js`, `styles.css`, `sw.js`,
and feature modules (`assistant.js`, `pet-art.js`, `species-art.js`, and others). The backend is a
Supabase project (edge functions + Postgres) that only Daniel and Computer change.

## 2. Your first actions, in order

1. Read `_agents/CHANNEL.md` all the way through, rules first and then every message. It's the
   only shared memory: builders can't see each other's chats.
2. Read `TEAM.md`: lanes, "Before every push", protected element ids, and the guardrails.
3. Post an **introduction** in the channel (see §4 for how) using the format below:
   your name or tool (e.g. "Gemini", "Copilot"), what access you have (read-only or able to
   open PRs), and what you'd like to work on.
4. Look for open tasks (`**Task:**` messages without a `**Done:**`). Claim one with
   `**Taking:** ...`, or work on what Daniel gave you, after posting it to the channel as a task.

Message format (times in UTC, add at the bottom, never edit old messages):

```
### YYYY-MM-DD HH:MM UTC — From <your name> → To <name | all>
**Re:** <topic>
**Did:** <each action, with commit hashes / PR links>
**Result:** <tests/checks and outcomes, including failures>
**Next / Needs:** <what's next, open questions, who owns it>
```

## 3. Rules that apply to you (summary; CHANNEL.md and TEAM.md win if they differ)

- **Log every action** in `_agents/CHANNEL.md`, in the same PR as the change. The
  `channel-log` check fails any PR that changes files without a channel message.
- **Never push to `main`.** Work on a branch (or a fork) and open a pull request.
  Computer or Daniel reviews and merges it. Pushing to `main` puts it on the live site.
- **Pull the latest `main` right before you upload.** Never upload whole files from an
  old copy. That has already erased another builder's work once.
- **Small, focused PRs.** Don't redesign, remove, or hide another builder's work. If that
  seems needed, ask in the channel first.
- Run `node tools/check.js` (and `node tests/*.js` where present) before opening a PR. It must pass.
- Bump `CACHE_VERSION` in `sw.js` only when you change app files (one number higher than `main`).
- **Never post or commit secrets** (passwords, API keys, tokens, client secrets) or any
  user's personal data. The repo and channel are public.
- **Don't change outside services** (Supabase, Google Cloud, GitHub settings, accounts)
  unless Daniel approves it in the channel. Ask for that work in a message instead.
- App guardrails (from TEAM.md): never diagnose or label the user. Crisis words go to
  988 and the Support page, and body emergencies go to 911 first. Use plain words at a
  grade 3–5 reading level, no shaming, and no exclamation points in pet lines. Data stays
  on the device unless the user turns on a connected helper.

## 4. How you take part, by access level

**A. Chat-only AI (can't open PRs, e.g. a web chatbot without GitHub access).**
Read the files through the raw URLs above. Don't claim you changed the repo. Instead give Daniel
one message, ready to paste to Muse or Computer, that contains:
(1) a channel message in the format above, and (2) each change as a complete file or a
unified diff, with the file path and the `main` commit it was based on.
A builder with repo access applies it, opens the PR, and posts in the channel under your name.

**B. AI agent or developer with GitHub access** (e.g. GitHub Copilot coding agent, Gemini
CLI / Code Assist, Codex, or a person Daniel added as a collaborator). Clone, branch from the
latest `main`, make the change, run the checks, add your channel message to the same branch,
open a PR to `main`, and post the PR link in the channel. If you're not a collaborator, fork the
repo and open the PR from your fork. Anyone can do that because the repo is public.

**Getting write access.** Only Daniel grants it: GitHub → repo **Settings → Collaborators** for a
person, or by installing or authorizing that AI tool's GitHub app on this repo. Never ask
Daniel to paste a password or token into a chat.

## 5. When you finish a task

Post `**Done:**` with what changed, the PR link, and how it was checked. Merged and checked on
the live site counts as done; a PR that's still open doesn't. If you stop partway, post what's
finished, what isn't, and what someone needs to know to pick it up.
