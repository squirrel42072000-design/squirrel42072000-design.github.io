# Instructions for AI coding agents working on Rootling

Before doing anything in this repository, read and follow these files, in order:

1. `_agents/ONBOARDING.md` — who you are working with, where everything is, the rules, and how to take part.
2. `_agents/CHANNEL.md` — the shared log and task board. **Read all of it, and log every action you take there**
   (add only, at the bottom, in its message format, in the same pull request as your change).
3. `TEAM.md` — lanes, protected element ids, the pre-push checklist, and the app guardrails.

Key rules: never push to `main` (branch and pull request only; Computer or Daniel merges); pull the latest `main`
before uploading; run `node tools/check.js` and it must pass; never commit secrets or personal data; don't
change Supabase, Google Cloud, or GitHub settings without Daniel's OK in the channel.

This file is only a pointer. The rules live in the files above. If they differ, those files win.
