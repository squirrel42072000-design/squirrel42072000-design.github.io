# Sprout — DEVLOG

**Product:** Sprout — your tiny self-care friend (Live Well)
**Type:** Self-care pet PWA · plain static files · no build step · on-device accounts (2026-10-15; no server) · no paid services · zero external network dependencies
**Built:** 2026-10-12 (Worker 3, BUILD)
**Dir:** `~/workspace/goals/make-me-money/files/self-care-pet-app/`

## What was built

| File | Purpose |
|---|---|
| `index.html` | App shell: adopt screen + main view (pet, growth bar, stats, 4 check-in cards) |
| `styles.css` | Warm wellness palette (cream/leaf/sun), mobile-first, system font stack only, reduced-motion support |
| `app.js` | All logic in dependency-free vanilla JS; exposes `window.SproutApp` core API for tests |
| `manifest.webmanifest` | PWA manifest (standalone, portrait, theme `#2e7d5b`), SVG icons |
| `sw.js` | Service worker: precaches the app shell, cache-first runtime caching for same-origin GETs, offline navigation fallback |
| `icon.svg` | App icon (sprout in a pot on leaf-green rounded square) |
| `assets/sprout-placeholder.svg` | Placeholder character drawn by Worker 3 (see Assets note) |
| `tests/dom-smoke.js` | jsdom DOM smoke test (37 assertions) |
| `DEVLOG.md` | This file |

## Core loop (as specced, nothing more)

1. **Adopt** — first run shows a naming screen; name (≤24 chars, defaults to "Sprout" if blank) + created date stored in localStorage. A "Start over" button (with confirm) clears state on-device.
2. **Daily check-ins** — four cards, each earnable once per day:
   - **Mood** — 5-face scale (Rough/Low/Okay/Good/Great) → **+10 sunshine**. Re-tapping updates the answer, earns nothing extra.
   - **Water** — glass counter (🥛 row, 0–8) → **+2 per glass** (max +16/day). Removing glasses reconciles points back down; 0 glasses = not done.
   - **Movement** — "moved a little" **+10** / "moved a lot" **+15**. Switching the answer later updates the record only.
   - **Sleep** — 0–14h slider (0.5 steps) + 3 rough-pick chips (5h/7h/9h) + Save → **+10**.
3. **Pet reacts & grows** — stages **Seed (0) → Sprout (25) → Bud (70) → Bloom (140)** cumulative sunshine, with a progress bar to the next stage. Displayed state: `celebrate` (6s after a stage-up or a 4/4 day) > `happy` (any check-in today) > `sleepy` (21:00–05:00) > `low` (after 17:00 with nothing logged) > stage image. **All copy is gentle encouragement only — no guilt language anywhere** (checked in the copy itself; e.g. low state says "No rush at all… I'll be right here").
4. **Gentle streaks** — current streak (consecutive care days ending today/yesterday) **and** total care days are both shown. A gap never erases total care days; after a ≥1 full missed day the app shows a "rest day" note ("Yesterday was a rest day — plants rest too… Your total days of care are all still here") and the next care day simply starts a fresh streak of 1.

## State

localStorage key **`sprout-state-v1`**: `{ version, petName, createdDate, sunshine, checkins: { 'YYYY-MM-DD': { mood, water, movement, sleep } }, careDays: [dates] }`. Dates are device-local `YYYY-MM-DD`. localStorage read/write is try/catch-wrapped (private-mode safe; app still works in-session).

## Assets note (Worker 2 SVG set)

At build start `assets/` did not exist, so per the brief Worker 3 created ONE placeholder (`assets/sprout-placeholder.svg`) and referenced the character set purely by filename. **During the build (02:25–02:26), Worker 2 delivered the full set** — `sprout-seed/sprout-sprout/sprout-bud/sprout-bloom/sprout-happy/sprout-sleepy/sprout-low/sprout-celebrate.svg` (plus a `sprout-concept.png`) — and the app picked them up with **zero code changes**. All 8 verified: valid XML, no external references (only the xmlns namespace), HTTP 200. Image loading has a fallback chain (mood file → stage file → placeholder) so a missing/renamed asset can never break the UI. The placeholder stays as the terminal fallback and as the manifest's second icon.

## Decisions

- **Service worker precache list contains only files that ship in this folder.** The character SVGs are deliberately NOT in `cache.addAll` (a 404 there would fail the whole install); they're runtime-cached on first successful load instead. Bump `CACHE_VERSION` in `sw.js` on any shell change.
- **No audio in the MVP** (per brief). Any future sound must be warm/uplifting only (Daniel's standing audio direction) — noted here as the constraint for whoever adds it.
- **No CDN anything** — system font stack, emoji for faces/glasses (renders offline on-device), SVG art. Verified: no `http(s)://` references in HTML/CSS/JS outside SVG namespaces.
- `window.SproutApp` exposes the pure core (state, applyCheckin, streak math, stage/mood logic) — this is what makes the DOM test and future debugging cheap.
- Pet image swap uses an `onerror` fallback chain rather than preloading checks — simplest robust option for a file-drop asset workflow.

## Test results (all run 2026-10-12, this build)

**Syntax:** `node --check app.js` → OK · `node --check sw.js` → OK · `node --check tests/dom-smoke.js` → OK · manifest parses as JSON → OK.

**DOM smoke test** (jsdom installed for the test only, in `/tmp/sprout-domtest`; app itself has zero dependencies):
`NODE_PATH=/tmp/sprout-domtest/node_modules node tests/dom-smoke.js` → **exit 0, ALL 37 ASSERTIONS PASSED**, covering: first-run adopt screen state → adopt submit (name "Pico" displayed + persisted, createdDate set) → mood +10 → water ×2 glasses +4 (counter shows 2) → movement +10 → sleep +10 (8h recorded) → UI sunshine badge matches stored total (34) → today 4/4, all-done note, streak 1, total care days 1, careDays persisted → re-tapping mood/movement/sleep earns 0 extra but answers still update → rest-day logic (streak 0 after 2 rest days, total care days preserved, fresh streak of 1 on return, history grows) → stage thresholds 0/25/70/140 = Seed/Sprout/Bud/Bloom.
Re-run note: `npm i jsdom` anywhere, then run with `NODE_PATH` pointing at that `node_modules` (see test header).

**Serve test:** `python3 -m http.server` in the app folder + curl — **HTTP 200 for all 15 app files**: index.html (8616B), styles.css (6895B), app.js (17938B), manifest.webmanifest (516B), sw.js (1897B), icon.svg (591B), assets/sprout-placeholder.svg (1954B), and all 8 character SVGs (1018–1591B each).

**Known test-env quirk:** the sandbox VM clock is UTC, so the test's `createdDate` read `2026-10-13` while local EDT was still Oct 12 — expected; the app uses device-local dates, which is correct on a user's phone.

## Stubbed / TODO (explicitly NOT in MVP)

- No audio (see Decisions — future, warm/uplifting only).
- No notifications/reminders, no accounts/sync, no analytics, no sharing — all out of scope for MVP by design.
- No history/calendar view of past check-ins (state already stores per-date records, so this is a pure UI add later).
- Service worker only exercised via syntax check + code review in this sandbox (no real browser here); first live-device load should confirm SW registration in DevTools → Application.
- `sprout-concept.png` (Worker 2) is not referenced by the app — available for store/listing art.
- Manual QA still worth doing on a real phone: install prompt ("Add to Home Screen"), offline reload after first visit, slider feel on iOS Safari.

---

## 2026-10-15 — Collection rebuild: Adopt-First + on-device accounts (Daniel's freeze exception)

Per Daniel's directives (build-docs/UX-ADOPT-FIRST-DIRECTIVE.md, AUTH-ACCOUNTS-DIRECTIVE.md, COMPANION-SELECTION-DIRECTIVE.md, COLLECTION-PLATFORM-DIRECTIVE.md + the main-companion clarification):

**New files**
- `accounts.js` — on-device accounts. Create / sign in / sign out / delete / device-only password reset (email + account name). Passwords stored as a salted SHA-256 hash (WebCrypto; iterated FNV-1a fallback), never plaintext. All app storage keys are namespaced per account (`acct:<id>:`) by a Storage wrapper installed before anything else loads; signed-out-with-accounts uses a `guest:` space; a device with no accounts keeps legacy behavior untouched. The FIRST account created on a device with an existing pet moves that pet's data into the account, whole, exactly once. The landing gate ("Welcome to Rootling" → Create Account / Sign In) states plainly that accounts live on this device only and cloud accounts (Google/Apple/Microsoft) arrive with the connected version. No social sign-in buttons exist.
- `companions.js` — the collection platform layer. Six kinds (Plants, Pets, Mythical Creatures, Spirits, Robots, Alien Lifeforms) with full rosters (premium plants shown on disabled "Premium" cards — no payment exists in a local build); 11 personality cards with voice lines; species × personality identity lines (template + hand-written overrides, incl. Daniel's three examples verbatim); per-companion state vaulting so every companion keeps its own name/level/XP/memory/care state; exactly one MAIN companion per account (first adoption sets it; Home opens on it; a shelf "Bring to Home" visit lasts one session); rename everywhere (Settings + shelf card, live or vaulted); "Choose a new main companion" (warm confirm; the old main keeps everything); grown-trait discovery (≥25 interactions across ≥3 days, one gentle banner + badge); daily gift moment; one-time care-style offer after adoption.
- `tests/spec-collection.js` — 46-assertion jsdom scenario suite for all of the above (migration, card adoption, identity lines, pacing math, vault swaps, rename, make-main, reset, two-account isolation, wrong-password refusal).

**Changed**
- `index.html` — adoption is now card steps inside the same form (1 personality cards → 2 kind cards → species cards → 3 name + support profile + learning consent); Home gains the identity line, daily gift, and four giant buttons (Chat · Play · Adventure · Home); Adventures card (Forest Run / Puzzle Cave / Mountain Climb / Library Quest scroll to the real check-in, activity, and focus systems); Companions shelf section; Settings gains care-style radios, rename + choose-new-main card, and your-account card; privacy copy updated for honesty (the old "no account, no password" lines replaced — accounts are on-device now; nothing is claimed that doesn't exist).
- `app.js` — state gains category/species/personality/identityLine/careStyle; adoption consumes the card-step choices via a pending note and registers the companion; care styles scale growth pace only (Balanced 1× · Dedicated 1.25× · Hardcore 1.5× · Casual 1× calmer) and NEVER punish — no decay, sickness, death, or guilt in any style; Home stage label shows the level; Start Over also clears the collection's live slot.
- `sw.js` — shell adds accounts.js + companions.js; cache bumped to `rootling-v5`.
- `styles.css` — card pickers, dashboard buttons, shelf, gate overlay, welcome/confirm cards.
- `tests/qa-safety.js` — two assertions updated with a dated comment: they pinned the pre-accounts honesty copy ("no account, no password, nothing to sign in to" / "FUTURE accounts section"), which Daniel's accounts directive supersedes; they now pin the new honest copy ("Your account, and what changes with the connected version" / "Your Rootling account lives on this device only").

**Verification** — full suite green: dom-smoke, notify-smoke, spec-a11y 48, spec-collection 46, spec-exec 84, spec-memory 56, spec-privacy 50, spec-social 199, spec-time 103, spec-wellbeing 144, qa-safety 233/0. `deploy/` re-mirrored and cmp-verified byte-identical; staged root now includes accounts.js + companions.js.

**Divergences from the frozen spec (recorded, spec docs untouched)** — the consent wizard still precedes the card steps on the very first run (frozen 5-screen flow); the support-profile select remains in the name step (frozen profile system, test-bound); Chat maps to the Social Coach (no live chat exists in the static build, per the spec's own honesty note); non-plant/non-pet species ride the creature art line — identity carried by emoji, name, and identity line, no fabricated art.

## 2026-10-15 (EDT) — v9: support-needs model installed (Daniel's research briefs)

Daniel supplied three research/architecture documents with "Install this into Root":
(1) neurodivergent traits & support-needs research, (2) a condition→intervention
evidence library, (3) an Evidence Collector + Profile + Alert Engine architecture
spec. All three are filed verbatim in build-docs/ (NEURODIVERGENT-TRAITS-RESEARCH.md,
EVIDENCE-LIBRARY-SOURCE.md, ARCHITECTURE-SOURCE.md) with headers recording what
shipped, what was translated, and what was deliberately not built.

Shipped in v9:
- traits.js — the support-needs model: six dimensions (executive, attention,
  sensory, feelings, routine, social) in plain words; 14 evidence-noted supports,
  each mapped to a feature Rootling already has; a pure scorer (0–100, null =
  silent without evidence) and a weighted support ranker; one gated escalation
  signpost line. Four-criteria gate recorded in the file header (passes all four).
- app.js — computeSupportNeeds() runs inside computeAdaptations (same learning-off
  guard discipline); scores + top supports live in state.learning.supportNeeds
  (visible + wipeable via the Learned view / resetLearning); a top-support change
  writes a plain-language learnLog entry; learnedFacts() surfaces "Ways your pet
  helps most" + the honesty line ("ways to help — not labels about you") and the
  escalation line only when feelings-need ≥70 across ≥7 observed days.
- index.html loads traits.js before app.js; sw.js precaches it; cache rootling-v9.

Translated, on purpose (Rootling guardrails: never diagnose, wellness not medical
care, patterns describe tasks/days — never the person): no condition names, no
symptom→condition matching, no "risk scores" or detection labels shown to the
user, no clinician therapies (CBT-I, sleep restriction, psychotherapy) as app
features, no medication tracking, no auto-contacting support people (the pet
suggests; the user taps). Full block-by-block mapping: build-docs/ARCHITECTURE-MAP.md.

Honest limits of v9: attention + social scores stay null — their richest signals
(focus sessions, coach use) live in the exec/social stores; wiring those stores
into the scorer is the named v10 follow-up. Their supports still rank whenever a
scored dimension weights them.

Tests: NEW tests/spec-traits.js — 170 assertions (dataset integrity, evidence
on every support, banned-language sweep over every user-facing string, scorer
bounds/determinism/silence, wiring pins). Full battery green: qa-safety 240/0
(+1 vs v8 — the sweep now covers the new Learned-view strings), spec-layout 72/0
(pin bumped to rootling-v9), collection/wellbeing/social/memory/privacy/exec/
time/a11y all pass.

## 2026-10-15 (EDT) — v10: Companion Experience Upgrade (Daniel's UX prompt)

Daniel redirected v10 from architecture to experience: "companion beats tool."
Built his three highest-impact features plus the prompt's celebrations and
What Would Help Right Now button. Sources filed verbatim: build-docs/UX-SOURCE.md
(9th document) and ARCHITECT-PRIORITIES-SOURCE.md (8th).

Shipped:
- companion-ux.js (pure helpers, his patches adapted): greeting, momentum
  (source formula 50 + 5/finish − 2/open loop, clamped), micro-step generator,
  recovery trigger + suggestions, companion messages, whatWouldHelp (exactly
  one suggestion + why), checkCelebrations.
- burnoutEngine.js (Priority 4): +25 per negative signal, bands at 25/50/75,
  plain-word triggers, supportive per-band response lines.
- trust.js (architecture P1–P3, P5–P8 as a pure module): permission matrix
  (default-deny externals; CRITICAL class un-grantable to externals),
  confidence engine (source formula + bands), insight factory, memory aging
  score, crisis ladder (level 4 = the existing 988 surface), classification
  registry, reflection builder. WIRING (Settings matrix UI, Learned-view
  reasons/confidence lines, Ask Memory, pet-growth card) lands in v11 —
  the module ships tested but is not precached in v10.
- app.js: Today Brief card (first thing under the pet — greeting, momentum in
  words, going-well count, may-need-attention, Next Best Thing + Start Here,
  Your Pet Noticed, celebrations, Recovery block); I Can't Start flow (task
  from the anchor or typed, existing breakdown steps or generated micro-steps,
  easiest-step radio pick, usage + preferred styles recorded in state.cantStart);
  Recovery Mode (auto at orange/red via computeBurnout inside computeAdaptations,
  or the "Make today gentle" tap; effectiveConfig forces demand micro + gentle
  reminders for the day; band rises explain themselves in the learn log);
  celebration detection (first-sight seen-set, silently seeded on first v10
  render; first finish, ≥7-day put-off finish, 3+ finishes/day, 5/7-day streaks).
- index.html: Brief + Can't Start cards; scripts burnoutEngine + companion-ux
  before app.js. sw.js: both precached, cache rootling-v10.

Translations (Daniel's standing rules over the pasted prompt): momentum shows
as WORDS, never a percentage; the burnout band is internal — users see "tired
pattern" + triggers + more support, never a risk label/score; confidence is
stored numeric, displayed as words only; memory aging ranks surfacing order
and never deletes. Social trend input stays null (no honest signal yet).

Tests: NEW tests/spec-ux.js — 81 assertions (module behavior incl. source
formula edges, banned-language sweep incl. the word "risk", trust module,
wiring pins). Full battery green: qa-safety 242/0 (+2 vs v9), layout 72/0
(pin rootling-v10), traits 170/0, all other suites pass.

## 2026-10-15 (evening) — v14: Daniel's four fixes (built on adopted v13)
- ADOPTED live v13 as the working source (v12 tree archived at archive-v12-source/). Local == production lineage again.
- Pet mismatch DIAGNOSED: Daniel's pick (Squidward, Kraken, mythical) was saved correctly — name, identity line, animal form + creature art all consistent. The gap: species share their kind's stage art, so the chosen species was invisible. Fix: species emoji badge on the pet portrait (pet-species-badge) + identity line. companions.js syncCoreForm already keeps form↔kind in step at adoption.
- REAL BUG FOUND + FIXED: v13's gate "I forgot my password" button was DEAD — showReset() sat OUTSIDE buildGate() in accounts.js and threw on its closure references (card/clear/heading). Moved inside buildGate; reset now opens + completes (spec-accounts 16/0 incl. end-to-end reset; spec-v14 regression pin).
- Password reset PROMOTED (Daniel's order): btn-soft "Forgot your password? Reset it" directly under Sign In.
- Back button on every page: JS-injected "← Back" bar on the first card of focus/activities/companion/support views; safety + learned overlay pages got data-close-view Back buttons (privacy + quiet already had them).
- Support styles are MULTI-PICK (Daniel's order): <select> → checkbox groups at adoption + Settings; state.profiles[] (primary kept in state.profile); mergedProfile blends — features union, gentlest demand wins, fixed wording wins; effectiveConfig consumes the merge.
- spec-accounts/spec-collection harnesses updated for v13's REQUIRED password-reminder hint at account creation (product behavior intended).
- qa-safety shell-URL pin amended to an enumerated allowlist (app's own URL, CDC guidelines link, BYO-AI placeholder) — any new URL still fails.
- FULL BATTERY: 18 suites, 1,264 counted assertions, 0 failures (incl. new spec-v14 22/0).
- Deploy: 5 files (index.html app.js accounts.js styles.css sw.js) via GitHub web UI; sw CACHE_VERSION rootling-v14.

## 2026-10-15 (late evening) — v15: usability repair (live tap-through fixes)

Origin: Daniel's live report — "so glitchy... it doesn't interact... there is no send buttons... the pages are way too long." A live-browser tap-through of production v14 confirmed the defects below; each fix names its tap-through finding. Built + tested locally; deploy is the parent agent's step.

- CHAT CARD WAS DEAD (tap-through: the Send button exists in the page HTML but is unreachable): #chat-card shipped with a static `hidden` attribute in v11 and NO JavaScript anywhere referenced 'chat-card' — view gating never mapped it, nothing ever unhid it. Fix: removed the static hidden (index.html) and mapped 'chat-card' → home in VIEW_OF_ID (app.js), so the Talk-to-your-pet card is a normal Home card, gated like every other.
- PAGES TOO LONG, PART 1 (tap-through: every tab 8–15 phone-screens; the same four sections repeated at the bottom of all five tabs): #connected-card, #ai-access-card, #topics-card and #ask-memory-card sat outside view gating. All four are now mapped to 'support' in VIEW_OF_ID — they live on the Settings & Support tab only.
- PAGES TOO LONG, PART 2: secondary cards start FOLDED on every fresh page load (never persisted): welcome-card, preview-card, fit-card, mood-card (home), adventures-card (activities), daily-gift (companion), install-card (support). A generic fold mechanism in app.js inserts a real "▸ Open" / "▾ Close" button (aria-expanded, aria-controls) after each card's heading; folding hides the card's other children via the hidden property and tags exactly which children it hid (data-fold-hidden), so unfolding never stomps a child's own hidden state (install button, gift line, mood-best stay as their modules set them). MutationObservers + timed retries catch late arrivals (welcome card injected post-adoption; companions.js re-renders #daily-gift's insides, which carries the toggle away — the fold re-applies idempotently). daily-gift has no heading: its first line stays up as its intro.
- ASK MEMORY LOOKED BROKEN (tap-through: typed a word, tapped Search memory, the page RELOADED with '?' in the URL and no results ever showed): the submit binding sat inline inside initV11 AFTER renderAiAccess/renderChat/initConnected/initV12 — any throw earlier in that chain (the connected init is the fragile one in a real browser) starved the binding, and the browser fell back to a native form submit. There is exactly one #ask-memory-form in the shell; the failure was ordering, not duplication. Fix: the binding is now bindAskMemoryForm() in app.js — bound from its own isolated try/catch step at section load (DOMContentLoaded or immediately), re-called inside initV11 as a second chance, no-op once bound via a __rootlingBound flag; the handler guards ev.preventDefault().
- REPLIES MUST BE SEEN (tap-through companion finding: actions answered off-screen): pushChat now scrolls #chat-log to the bottom and scrollIntoView({block:'nearest'})s the newest message after every send; assistant.js reply() does the same for the Ask card's #ask-log row. Both guarded (typeof + try/catch; jsdom has no layout).
- LISTEN BUTTON GAVE NO VISIBLE FEEDBACK (tap-through: "Listen to your pet" flipped its pressed state and nothing on screen changed): speech itself is the existing toggle behaviour; the pet line now also says it in words — "You can hear my voice now. Tap Listen again to turn it off." on start, "My voice is off now." on stop (app.js addListenButton, pet-message target only; the spoken text is captured before the line changes).
- sw.js CACHE_VERSION → rootling-v15.
- TESTS: NEW tests/spec-v15.js, 72 assertions (chat-card reachable on Home/gated on Focus; the four shared cards Support-only across Home/Support/Activities; all seven fold cards start folded + toggle round-trip + own-hidden-state preservation + late-content folding for daily-gift and welcome-card; Ask Memory submit defaultPrevented + hit renders + miss renders the honest empty line; chat send lands a reply and scrolls it into view; Ask reply appended + scrolled; Listen toggle speaks + shows both status lines with mocked speech). FLAGGED PIN UPDATE: tests/spec-layout.js cache-version pin rootling-v14 → rootling-v15 (the standing per-release bump pin; assertion count unchanged, nothing weakened). No other pre-existing pin needed changes — qa-safety's URL allowlist and reachability pins hold as-is.
- FULL BATTERY: 19 suites, 1,336 counted assertions, 0 failures (1,264 v14 total + 72 new spec-v15; dom-smoke / notify-smoke / spec-collection all-passed unnumbered as before).
- NOT touched, per scope: accounts/gate logic, traits/mood/fitness logic, connected OAuth flows, pricing/copy outside the fixes.

## 2026-10-15 (late night) — v16: Pet Playground, integrated from Daniel's official package (NOT deployed — awaiting Daniel's approval)

Daniel delivered the official Pet Playground PACKAGE (playground-package/: pet-playground.js + README) and it REPLACED the from-scratch v16 build that was in progress. The from-scratch playground.js, its spec-playground suite, and its .play-* CSS were removed; nothing of that implementation ships. One Tiny Quest is NOT in the package and is deferred out of v16.

WHAT SHIPPED IN THE TREE:
- pet-playground.js — the package module, copied byte-identical (sha256 0d151748… matches playground-package/ exactly). Verified before integrating: zero network surface (no http/fetch/XHR/WebSocket/sendBeacon strings). Package code changes: NONE.
- playground-host.js (NEW, classic script, loads last) — the host adapter the README demands. It dynamic-imports the ES module and wires the REAL app, all names inspected, none invented:
  - Identity: RootlingAccounts.current() for the account; the active pet resolved exactly as companions.js resolves the live companion (rootling-live-companion-v1 → registry main → activeId → first; registry = RootlingCompanions.registry()).
  - Storage: the module's synchronous storage option over ONE app key, 'rootling-playground-v1', holding { v:1, saves: {petId: save}, ledger: {receiptId: entry} }. The key was added to accounts.js APP_KEYS (so it lives inside each account's space and account deletion removes it — removeAccountEverywhere sweeps the prefix) and was already in app.js MODULE_STORE_KEYS (memory backup) + the privacy ALL_KEYS/AREA_KEYS lists (delete-my-data).
  - Rewards: onComplete ONLY (never the rootling:playground-complete event as well). applyReceipt awards receipt.suggestedXp through RootlingApp.addExperience exactly once per receipt id (ledger in the same store); on mount, reconcile() replays the save's rewards[] through the same ledger, so a receipt whose award was lost to a crash lands exactly once after reload, and an applied one never double-awards. Pinned both directions in tests.
  - Malformed saves: the module refuses to load them; the adapter catches the mount failure and shows recovery UI in the card (Try again / Download the saved games file / Start fresh — the fresh start is an explicit user choice, never automatic). Stored bytes are left untouched; pinned byte-for-byte.
  - Backup/restore: memory export includes the store automatically (MODULE_STORE_KEYS). Restore is VALIDATED: app.js parseMemoryExport now calls RootlingPlaygroundHost.validateStore (version + full nested shape, mirroring the module's own valid(), incl. per-game checks and the 6-space room / item allowlist) when the host is present; an invalid playground section throws during parsing — before a single key is written — with a clear message. Host also exposes exportStore/removePetSave for tooling.
  - Lifecycle: pet switches in this app reload the page (companions swapTo/makeMain), so remount is natural; a visibilitychange re-check additionally destroys+remounts on any account/pet change that did not reload, and calls updatePet on rename. Saves for pets no longer in a non-empty registry are pruned at mount.
- index.html: the card is now "Play Together" on Activities ('playground-card' → activities in VIEW_OF_ID, unchanged from the v16 wiring) with the module's mount point <div id="pet-playground">; playground-host.js script tag after assistant.js. pet-playground.js is NOT a script tag (ES module; the host imports it).
- sw.js: CACHE_VERSION rootling-v16 (pin in spec-layout updated v15→v16, flagged); APP_SHELL swaps the removed from-scratch file for './pet-playground.js' + './playground-host.js'.
- styles.css: the module is shadow-DOM isolated; the host themes it via its own CSS variables on #pet-playground (--playground-text/bg/border ← var(--ink)/var(--paper)/var(--leaf)), which follow the app theme variables through light/dark/high-contrast. Focus outlines inside the shadow tree are the module's own (incl. its forced-colors rule).

ARTWORK (renderPet) — Daniel's binding rules applied:
- Every call builds a FRESH node (a span wrapping a new <img>); the Home portrait node is never moved, reparented, or modified (pinned: Home element + parent identical after mount + a full round).
- The painting is the app's own resolved artwork: primarily the exact src the Home card currently shows (#pet-img, resolved by setPetImage from stageFor/moodFile), so species + growth stage match Home exactly; fallbacks use the exported SproutApp.moodFile(state, SproutApp.petMood(state)) and stageFor. app.js gained ONE line: moodFile added to the SproutApp exports (it existed; it just was not exported). The species emoji badge from the companions roster rides along, mirroring the Home portrait's v14 badge.
- Reaction mapping, honestly: the module's render context carries ONLY {game, paused}. Exactly one context signal maps to a real asset: paused → the app's real sleepy painting for the pet's form (moodFile(state,'sleepy')). The module exposes NO searching/carrying/hiding/finding-treasure/celebrating signal and the app has NO per-action paintings, so those moments use the correct current painting + the module's own dialogue — nothing was faked and no path was invented. Celebrating likewise cannot be distinguished by the renderer (a post-completion render looks like any other); the module's completion dialogue carries it.
- Calm/reduced-motion (state.calmMode, appearance calm-motion, body.calm, or OS reduced-motion) marks the artwork node data-calm; the artwork is a static painting and no animated class is ever applied (pinned).

TESTS: NEW tests/spec-playground-integration.js — 54 assertions (module text pins incl. zero-network; mount + five games; the artwork contract above; XP exactly-once + reload reconcile both directions; per-pet room saves + switch remount in-window and via the reload flow; malformed-save recovery with bytes untouched + explicit fresh start; export includes store, validated import restores, corrupted import refuses and writes nothing; account deletion removes the key; the raw module receipt contract — one receipt per round, destroy empties the shadow root). jsdom cannot run module script tags, so the harness evals the shipped module text with only its `export` keyword stripped; the code under test is the shipped code.
FLAGGED PIN UPDATES: tests/spec-layout.js cache pin rootling-v15 → rootling-v16 (the standing per-release bump). qa-safety gained +2 assertions (252→254) from its existing per-key loops now covering rootling-playground-v1 — no pin was edited there.
FULL BATTERY: 20 suites, 1,392 counted assertions, 0 failures (1,336 v15 + 54 new + 2 qa-safety per-key), dom-smoke / notify-smoke / spec-collection all-passed.

DEPLOYMENT PROPOSAL (NOT executed — Daniel approves first):
- Upload exactly 7 files via the GitHub web UI route: index.html, app.js, accounts.js, styles.css, sw.js, pet-playground.js (new), playground-host.js (new).
- Cache bump already in tree: rootling-v16; verify live after upload by sha256 per file + the version string in sw.js, same as v14/v15.
- Rollback: redeploy the v15 file set (the 5 files at commit f9389cd); the playground store key is inert under v15 code.
- Playground-package/ stays in the repo tree as provenance; it is not referenced by the app and not in APP_SHELL.
- Local preview (this build): python3 -m http.server 8901 in the app folder → http://127.0.0.1:8901/ (the package demo.html was a 110-byte error stub and is not used; the preview is the real app page).

---

## v17 — Pet Playground integration (on the rebased v16 tree) + Connected-accounts connect honesty (2026-10-16, Muse)

CONTEXT: while the first Playground integration was being built, Daniel merged PR #1 (Draw your pet + drawing backup toggle + painted species portraits, labeled rootling-v16, main @ ceb2f96) directly. This tree was rebased onto the live v16 files (snapshot: live-v16-snapshot/; the first attempt's partial edits: archive-pre-rebase-v16/). Everything PR #1 shipped is preserved: the drawing card and its save flow, "Show on Home", painted portraits, the drawing backup, and the backend CORS fix (callFunction sends NO apikey header — check.js pins this).

BASELINE (rebased tree, before any v17 edit): tests/ battery = 20 suites, 1,338 counted assertions, 0 failures across the pre-existing suites (qa-safety 254, traits 191, wellbeing 118, time 103, v11 84, exec 84, ux 81, layout 72, v15 72, memory 56, v12 53, privacy 50, a11y 48, social 34, v14 22, accounts 16; dom-smoke / notify-smoke / spec-collection all-passed). The salvaged tests/spec-playground-integration.js errored at its host-mount section — expected: the rebased tree had no playground wiring. v14/v15 behaviors spot-verified present in the live files (chat-card unhidden + gated to Home, fold code, bindAskMemoryForm, species badge, mergedProfile) and covered by the green spec-v14/spec-v15.
DISCREPANCY FLAGGED for Daniel: TEAM.md (fetched into the tree mid-build by the Computer lane) lists chat-card and fitness-card as "Hidden by Daniel's choice" in the merge. The live snapshot and the passing battery show chat-card VISIBLE on Home (spec-v15 pins exactly that). The tree + battery were treated as authoritative; no hiding was applied or restored by this build. TEAM.md should be reconciled with the shipped tree.

PLAYGROUND INTEGRATION (design salvaged from the first attempt, re-applied ADDITIVELY onto the v16 files — the pet-art entries in every shared list were kept, never swapped):
- pet-playground.js — the package module, byte-identical to playground-package/ (sha256 verified again at the end of this build). Zero network surface. Package code changes: NONE.
- playground-host.js — the host adapter (classic script, loads last). Identity from RootlingAccounts.current() + the companions.js live-pet resolution (live key → main → activeId → first). Storage: the module's sync storage option over ONE app key 'rootling-playground-v1' = { v:1, saves:{petId:save}, ledger:{receiptId:entry} }; the key was added to accounts.js APP_KEYS and app.js MODULE_STORE_KEYS, ALL_KEYS, AREA_KEYS (TEAM.md rule 5 — tools/check.js now enforces the playground key in all of them). Rewards: onComplete ONLY; applyReceipt awards through RootlingApp.addExperience exactly once per receipt id (ledger); reconcile() on mount replays save receipts through the same ledger (crash-gap safe both directions — pinned). Malformed save → mount fails → recovery UI (Try again / Download saved games file / explicit Start fresh); stored bytes never touched silently (pinned byte-for-byte). Restore is validated in app.js parseMemoryExport via RootlingPlaygroundHost.validateStore BEFORE any key is written; a corrupted playground section refuses the whole import with a clear message (pinned). Lifecycle: destroy() needs a FRESH mount element every remount (attachShadow is once-per-element — the host swaps in a clean #pet-playground div, same parent); visibilitychange re-check destroys+remounts on account/pet change and calls updatePet on rename. Host refinements made in this pass (3): (1) the paused painting now prefers the species' own painted portrait (see Artwork); (2) the ledger records the XP actually awarded (addExperience's returned `added`, so the daily cap is reflected honestly); (3) boot auto-retries never clear a showing recovery panel.
- index.html: "Play Together" card ('playground-card' → 'activities' in VIEW_OF_ID) with <div id="pet-playground">, placed right after the drawing card; playground-host.js script tag after assistant.js. pet-playground.js is NOT a script tag (ES module; the host dynamic-imports it).
- styles.css: #pet-playground theme variables mapped from the app theme (--playground-text/bg/border ← --ink/--paper/--leaf) + recovery panel + pet node sizing.
- sw.js: CACHE_VERSION rootling-v17; APP_SHELL += './pet-playground.js', './playground-host.js'. NOTE (audit-verified): there is NO version string anywhere in app.js (grep across this tree and both archives) — sw.js is the only version carrier; none was invented.

ARTWORK (renderPet) — Daniel's binding rules:
- FRESH node per call (span + new img); the Home portrait element is never moved/reparented/modified (pinned across mount + a full round).
- The painting is the exact src the Home card currently shows (#pet-img, resolved by setPetImage through species-art + pet-art), so species + growth stage match Home exactly; fallbacks: moodFile(state, petMood(state)) → stageFor file → placeholder. app.js exports moodFile (it existed unexported). The companions-roster species emoji badge rides along, mirroring Home's v14 badge.
- Reaction mapping (honest): the module's render context carries ONLY {game, paused}. Mapped to a real asset: paused → the species' own painted portrait (assets/pets/<slug>.webp — Home's sleepy presentation for painted species is that portrait plus its overlay), else the form's sleepy painting via moodFile. NOT signalled by the module (no event exists): searching, carrying, hiding, finding-treasure, celebrating → the correct current painting + the module's accessible dialogue + the game's own object visuals carry those moments. No generic-pet substitution, no invented paths.
- Calm/reduced-motion (state.calmMode / calm-motion class / body.calm / OS preference) marks the node data-calm; the artwork is static; no animated class is ever applied (pinned).

CONNECT HONESTY (fixes A–E, Connected-accounts card only):
- The two "connect" buttons are DIFFERENT paths — do not conflate them when debugging: (1) the Connected-accounts card button (#connected-connect-btn, app.js) → backend oauth-start via callFunction, full-page redirect; (2) the Ask card's Google button (assistant.js) → direct Google GIS flow. This release fixes (1) only; (2) is untouched (separate failure mode, pending product ruling).
- Fix A: the handler now branches explicitly — tap → "Opening Google…"; no usable session → "Your sign-in expired. Sign in again on this card, then tap Connect." + renderConnected(); HTTP not-OK → "Connect failed (HTTP <status>)" + the backend's JSON error text when present (the branch is on res.ok BEFORE the url check — an audit found the old flow died SILENTLY on HTTP 401/500, because res.json() parsed fine and only the url check failed); OK but no url → "Google link did not come back. Try again."; network-level rejection → "Could not reach Rootling's server (network/CORS).". The 'no session' throw from callFunction (app.js, when sbJwt() is null — sbClient never loaded OR getSession has no session) is discriminated in the catch. The old generic "Could not start the connection" line is gone (pinned absent).
- Fix B: ensureFreshSession() runs before oauth-start — getSession() with no session or expires_at within 60 s triggers sbClient.auth.refreshSession() first (the tree's real supabase-js APIs; nothing invented).
- Fix C: inEmbeddedBrowser() (FBAN|FBAV|FB_IAB|Instagram|Line/|Twitter|Snapchat|TikTok|; wv)) — inside an in-app browser the tap never redirects (Google refuses with disallowed_useragent); it shows "Google blocks sign-in inside the Facebook/Instagram browser. Tap ⋮ → Open in Chrome, then connect there." and adds a one-time "Copy link" button (clipboard, with a plain-text fallback).
- Fix D tests live in tools/check.js §4b (source pins: generic line absent, all five honest strings present, refreshSession present, embedded guard present) PLUS tests/spec-connect.js (behavioral: no-session tap lands on the expired message; FBAV-UA tap shows the guidance + Copy link button). tools/check.js did not exist in this tree when the build started (it landed mid-build from the Computer lane); the spec-connect suite is the belt-and-braces sibling, kept.
- Fix E: sw.js → rootling-v17 (above). No Google Cloud settings, Supabase secrets, or the pet-art edge function were touched; nothing was disconnected.
- DELETED: connected.js at the app root — it was a GitHub Pages 404 HTML page saved by the snapshot curl, never loaded by index.html; all real connected logic lives in app.js.

TESTS + GATES:
- node tools/check.js → PASSED (all sections: parse, protected ids, script/shell integrity, store-key registration, painted-species assets — the last assets/pets files landed from the Computer lane during this build — pet-art unit tests, guardrails, research library, and the new §4b v17 pins). Changes made to check.js in this build (flagged): §1 parse now tolerates the tree's one ES module (pet-playground.js) by neutralizing import/export statements on a script-goal parse failure and retrying — without it the gate can never pass with the package shipped; §4 store-key lists extended with 'rootling-playground-v1'; §4b added (playground wiring + connect honesty pins).
- Full battery (final): 21 suites, 1,404 counted assertions, 0 failures (baseline 1,338 + spec-playground-integration 58 + spec-connect 6 + qa-safety +2 from its per-key loops over the new store key); dom-smoke / notify-smoke / spec-collection all-passed.
- FLAGGED PIN UPDATES: (1) tests/spec-layout.js cache pin rootling-v16 → rootling-v17 (standing per-release bump). (2) tests/qa-safety.js loss-copy scan gained a NARROW exemption (LOSS_EXEMPT = the exact approved sentence "Your sign-in expired" + Supabase's expires_at field name) — auth sessions genuinely end; the ban's target is progress/streak expiry framing, and every other expiry wording still fails the scan. (3) tests/spec-playground-integration.js (salvaged draft) corrections: its harness STACK omitted species-art.js + pet-art.js, so it silently tested the v15 fallback art — the stack now mirrors index.html order; artwork expectations moved from the v15 SVG sets (creature-*/sprout-*) to the painted portraits (assets/pets/kraken.webp, bonsai.webp); new §9 pins the PR #1 drawing card intact (the full drawing save flow needs IndexedDB, absent in jsdom — its 5-points-once-a-day award policy is pinned by tools/pet-art.test.js, run by check.js).

DEPLOYMENT PROPOSAL (NOT executed — the parent deploys on Daniel's "tests green → ship"):
- Upload via the GitHub web UI route: index.html, app.js, accounts.js, styles.css, sw.js, pet-playground.js (new), playground-host.js (new). tools/check.js + tests/ updates are repo hygiene and can ride along or follow.
- Verify live afterwards: sha256 per file == local, and sw.js shows rootling-v17.
- Rollback: redeploy the live-v16-snapshot file set; the 'rootling-playground-v1' store key is inert under v16 code.
- Local preview (this build): python3 -m http.server 8931 in the app folder → http://localhost:8931/ (verified HTTP 200 for index.html, pet-playground.js, playground-host.js during the build; the package demo.html is not used — the preview is the real app page).

BROWSER-ONLY / NOT VERIFIED HERE: real-browser ESM dynamic import + shadow-DOM rendering and focus/screen-reader behavior (jsdom evals the shipped module text with only its `export` keyword stripped, via the host's window.mountPlayground seam — the code under test is the shipped code, but a real-browser pass is still owed); multi-tab whole-save writes (README caveat — the host adds no locking, same posture as the app's other stores); the live OAuth redirect round-trip (needs Daniel's real session — fixes verified at handler level + Supabase-log-derived causes only); PR #1 backup stays OFF per user until enabled — untouched by design.

ADDENDUM (v17): BUILDER-CHAT.md now sits at the project root — a builders-only coordination log (Muse / Computer / future builders), readable by anyone with repo access, append-only, never linked or rendered by the app, deliberately NOT in sw.js APP_SHELL. It is part of the v17 commit-ready file list for repo hygiene only; no app code, test, or check.js rule references or objects to it (check.js re-verified green with it present).
