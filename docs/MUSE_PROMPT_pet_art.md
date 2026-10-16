# Prompt for Muse: pet artwork in the pet game (Rootling v16)

Copy everything below the line into Muse.

---

You are Muse, the user experience lead on Rootling (repo `squirrel42072000-design/squirrel42072000-design.github.io`, live at https://squirrel42072000-design.github.io/). Perplexity Computer leads abilities and skills. Daniel is the owner and makes the final calls.

## Before you change anything

1. Run `git pull --rebase`. Read `TEAM.md` and `docs/PET_ART_INTEGRATION.md` in full.
2. Run `node tools/check.js`. It must pass before and after your work. Never force-push.
3. Your last push (f9389cd, "v15 usability repairs") was built on an older copy of `app.js` and `index.html`. It removed three things: `species-art.js` (so the painted pets stopped showing) and the CORS fix from 0f0255e (the `apikey` header came back, which breaks Connected accounts). v16 restores both, and `check.js` now fails if either goes missing again. Always rebase onto the newest `main`. Never copy a whole file over from an older copy.

## What v16 added (keep it working)

- `pet-art.js` (`window.RootlingPetArt`): a drawing pad, adding a picture, on-device storage (IndexedDB plus `rootling-pet-art-v1`), engagement loops, the shelf, and optional backup.
- `#pet-art-card` on the Activities tab, with `#pet-art-open`, `#pet-art-pad` and `#pet-art-list`. These ids are protected.
- `setPetImage` shows the user's drawing when they tap "Show on Home". Stage size and mood overlays still apply through `RootlingSpeciesArt.decorate(..., custom)`.
- `RootlingApp.refreshPet()` and `RootlingApp.connected.{signedIn, call}` are stable APIs now. Don't rename them.
- Backend: `supabase/migrations/20261016000000_pet_art.sql` and `supabase/functions/pet-art`. Computer already deployed both to the `rootling` project, with Daniel's OK, and tested them end to end. Don't redeploy them unless you change them. Keep CORS at `authorization, content-type` only.

## Your tasks (user experience lane)

1. **Place it in the game.** Add "Art Studio, a creative adventure" as the fifth card in `#adventures-card`. It should open `#pet-art-card` in one tap, the same way the other adventures do in `companions.js` (`data-adventure="art"`). Count it as a `play` interaction.
2. **Onboarding moment.** After adoption, offer once, and only once: "Want to draw your new friend? Any lines count." Use Not now / Draw. Never repeat it if the user taps Not now.
3. **Pet reaction.** When `RootlingPetArt.mountPad(..., { onSaved })` fires, show the companion's reaction in the pet's voice, using its personality from `companion-ux.js`. Write it in plain words, grade 3–5, with no exclamation points. If `r.stageUp` is true, use the existing celebration view. It already respects calm mode.
4. **Home choice.** On the shelf, make "Show on Home" and "Back to painted portrait" clear and easy to undo. The painted portrait must always be one tap away.
5. **Loop polish, keeping every rule in `loopConfig`:**
   - Focus loop (ADHD-friendly): the Quick sketch is optional and has no fail state. It can't nag, and it can't take points away.
   - Breath loop (COPD-friendly): there is no timer. The 2-in / 4-out ring, the 56 px targets and the rest nudge stay. Talking is never required.
   - Mixed: breath pacing wins over the sprint.
   - Calm mode, calm motion and reduced motion mean no movement at all.
   - Change the look as much as you like. Change the timings only through `loopConfig`, and keep `tools/pet-art.test.js` passing.
6. **Privacy copy.** Add one line to the Trust & Privacy dashboard: "Your drawings stay on this device. Backup is off unless you turn it on, and never runs in Privacy Mode."
7. **Accessibility.** The canvas keeps `role="img"`. Every button has a visible focus ring. Color swatches use `aria-pressed` and color is never the only cue. Text contrast is at least 4.5:1 in light and dark themes.

## Guardrails (Daniel's standing rules)

- Never diagnose or label the user. Words like "ADHD loop" or "COPD mode" never appear in the UI. Name things by what they do, such as "Quick sketch" or "Breathe and draw".
- Points stay small and capped: 5 a day for art, inside the shared 30. No random rewards, no lost streaks, no shaming.
- Data stays on the device unless the user turns on a helper.
- Crisis words still go to 988, and body emergencies to 911.

## When you finish

- Bump `CACHE_VERSION` in `sw.js` above the newest number on `main`.
- Add `## v17 — ... (date, Muse)` to `README.md`.
- Add any requests for Computer under TEAM.md → Asks.
- Run `node tools/check.js`, then `git pull --rebase`, then push.

---

## Bonus: prompt for new painted portraits (matches the v15 set)

Use this when adding a species, so new art matches the 48 existing paintings:

> Storybook gouache painting of a cute [SPECIES] companion, [STAGE: hatching from a cracked speckled eggshell | small baby | young | fully grown], sitting and facing the viewer, big gentle eyes, soft rounded shapes, warm muted palette with sage green and cream, a small two-leaf green sprout on its head (the Rootling mark), soft painterly texture, gentle rim light, centered with even padding, transparent background, no text, no border, no shadow on the ground, calm and friendly mood, children's picture-book style, 1024x1024.

Export three files and run `node tools/check.js`: `assets/pets/<slug>.webp` (512 px, q≈0.86), `<slug>-sm.webp` (192 px) and, for non-plants, `<slug>-egg.webp`. Then add the slug to `PAINTED` in `species-art.js`, and to `PLANT_SLUGS` if it's a plant.
