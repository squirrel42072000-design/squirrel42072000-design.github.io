# Rootling team rules

Two AI builders work on this repo for Daniel (the owner, who makes the final calls):

- **Muse**
- **Perplexity Computer** ("Computer")

Both push to `main`, and pushing to `main` deploys the live site. On 2026-10-15, one push removed the other builder's cards. Daniel chose to merge them back. These rules keep that from happening again.

## Product focus

Rootling targets **abilities and skills** (what the pet can do for the user, and the skills it helps the user build) and **user experience** (how it feels to use).

| Lane | Lead | Files the lead owns |
|---|---|---|
| Abilities and skills: commands, research, health and fitness, mood care, Google connection, sign-in methods | Computer | `assistant.js`, `research.js`, `fitness.js`, `mood.js`, `config.js`, and the "easier sign-in" section of `accounts.js` |
| User experience: layout and Home order, look and motion, companion personality, onboarding, support-needs model, trust and privacy, connected backend | Muse | `app.js`, `companions.js`, `companion-ux.js`, `traits.js`, `trust.js`, `pet-brain.js`, `burnoutEngine.js`, `notifications.js` |
| Shared (careful edits) | both | `index.html`, `styles.css`, `sw.js`, `accounts.js`, `README.md`, `TEAM.md` |

A lead may add small hooks in the other lane, such as a store key, a VIEW_OF_ID entry, or a shared API call. A lead does not redesign, remove or rewrite the other lane's work. When that seems needed, write it under **Asks** below.

## Before every push

1. Run `git pull --rebase` when you start and again right before you push. Never force-push.
2. Run `node tools/check.js`. It must pass. A failure usually means a card, script, or store key from the other lane went missing.
3. Bump `CACHE_VERSION` in `sw.js` to the next number. If the other builder already used that number, take the higher one plus 1.
4. Add a `README.md` changelog section that starts with `## vN — ... (date, Muse|Computer)`.
5. A new localStorage key must be added to `accounts.js` APP_KEYS and to app.js `MODULE_STORE_KEYS`, `ALL_KEYS`, and `AREA_KEYS`. The check enforces this.

## Never remove or hide another lane's piece

The check protects these element ids. Change this list only with Daniel's OK.

- Computer: `ask-card`, `ask-log`, `ask-form`, `ask-input`, `ask-chips`, `ask-google-btn`, `ask-settings-card`, `fit-card`, `mood-card`, `mood-dots`, `mood-status`, `mood-watch`
- Muse: `pet-xp-line`, `connected-card`, `ai-access-card`, `privacy-mode-toggle`, `topics-card`, `topics-list`, `account-card`, `account-summary`, `today-card`, `brief-card`
- Hidden by Daniel's choice on 2026-10-15 ("merge, ours leads"): `chat-card`, `fitness-card`. Muse's simpler chat and steps cards stay in the code but are hidden, so Home shows one chat and one step tracker.

## Guardrails for both lanes (Daniel's standing rules)

- Never diagnose or label the user. Treatments are information to talk over with a doctor or therapist.
- Crisis words always go straight to 988 and the Support page. Body emergencies go to 911 first.
- Use plain words (grade 3–5 reading level), no shaming, and no exclamation points in pet lines.
- Data stays on the device unless the user turns on a connected helper. Connected helpers are off by default and clearly labeled.
- Privacy Mode (Muse's AI Access card) means on-device answers only. `assistant.js` turns its optional AI brain off while Privacy Mode is on.
- Show confidence as words, not numbers. The one exception is the PHQ-2/PHQ-9 score, because the user asks for it and it comes with "not a diagnosis" every time.

## How the lanes connect (stable APIs)

- `RootlingApp.addExperience(points, reason)` adds to growth points (`state.sunshine`) and pet XP (`state.petXp`), up to 30 bonus points a day.
- `RootlingAssistant.handle(text)` runs any pet command, as if the user had typed it.
- `RootlingMood.status()` returns `{ level: 'none'|'watch'|'concern', reasons }`. Never show `level` to the user.
- `RootlingFitness.summary()` returns today's and this week's steps, minutes, and goals.
- `state.topics` (Muse's "Things you live with") is read by `assistant.js` to offer matching abilities first. It never guesses topics.
- The `rootling-ai-access-v1` key's `privacyMode` setting is read by `assistant.js`.

## Asks

### For Muse (user experience)
1. **Home order and length.** Home now has Ask, Move, Mood care, Today, and more. Please design the order, and decide what collapses or moves to other tabs.
2. **The hidden `chat-card` and `fitness-card`.** Move their unique parts (for example, the connected email "What your pet noticed" list) into Ask your pet by calling `RootlingAssistant.handle`, or delete them once Daniel agrees.
3. **More "Things you live with" topics.** Add topics in `traits.js` that match the research ids: `adhd`, `autism`, `anxiety`, `lowmood` (depression), `asthma`, `diabetes`, `bp`, `pain`, `sleep`. Each one makes the pet offer matching abilities first.
4. **One pet-progress display.** Combine Muse's "Pet level · XP" line with the Ask card's growth-points line.
5. **Gate visuals.** Style the new sign-in buttons (face or fingerprint, voice phrase, password reminder) to match the welcome screen.

### For Computer (abilities and skills)
1. Use every new topic Muse adds to `state.topics`, in chips, research order, and workouts.
2. Let the pet answer Muse's `pet-brain.js` orders through one router, so no order gets two different answers.
3. Hand Muse's connected email "noticed" items into the email commands once Muse exposes them.

## Changes made in Muse's lane at Daniel's direct request (v14, Computer)
Daniel asked for these himself, so Computer built them. Muse, please keep them working, and restyle them as you like:
- `species-art.js`: the pet picture matches the species the user picked. There's a hand-drawn Kraken, and the other species use their emoji on a scene. Hooks are in `setPetImage`, the quiet screen, and the celebration screen.
- Support styles can be multi-picked (`buildSupportPicker`, `setSupportPicks`, `mergeProfiles`). Two or more picks become `state.profile = 'mixed'`, with the list in `state.profiles`. Use `primaryProfile(state)` where one id is needed. `notifications.js` uses `hasProfile(id)`.
- A Back bar on every page except Home, and the phone's Back button now steps through pages (`RootlingNav.back`).
- Password: Change or Reset in Settings → Account, "Forgot your password?" on the welcome screen, and the new password typed twice.

## Version log owner tags
- v7–v10 and the 2026-10-15 17:57 v12: Muse
- v11, v12 (first), v13, and v14: Computer

## v15 note for Muse (from Computer)
- Daniel asked for the pet pictures to be recreated, "more artistic and detailed". All 48 species now have painted portraits in `assets/pets/` (`<slug>.webp`, `<slug>-sm.webp`, and `<slug>-egg.webp` for non-plants).
- `species-art.js` is loaded before `companions.js` and `app.js`. Hooks: `setPetImage`, the quiet view, and the timer celebration use it; the adopt grid and the shelf show thumbnails instead of emoji. When a painting shows, `#pet-species-badge` is hidden. The old SVGs stay as the fallback.
- Your back bar (`.view-back-bar`), `readProfileGroup` multi-pick and gate password reset are kept as they are; `tools/check.js` now accepts them.
- Please do not drop `species-art.js` from `index.html` / `sw.js` again — the check fails if you do.
