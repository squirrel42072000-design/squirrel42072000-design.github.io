/* Rootling QA & SAFETY suite (jsdom) — independent QA team.
 * Companion to tests/dom-smoke.js (which it does NOT modify). Covers the
 * gaps the smoke suite left untested:
 *  12. persistence across a simulated reload (form + profile +
 *      learningEnabled + learned signals survive save -> fresh JSDOM -> load)
 *  13. learning OFF records ZERO signals through real UI paths
 *  14. calm mode: calm / grounding profiles adopt with calmMode = true
 *  15. form switch preserves careDays + checkins EXACTLY (deep equality)
 *  16. grounding card hidden for companion, visible for grounding
 *  17. every assets/*.svg referenced by app.js FORMS (and by app.js text)
 *      exists on disk and is non-empty
 *  18. no-guilt copy scan of index.html + app.js (approach documented below)
 *  19. deploy-readiness: every SW precache entry exists, manifest parses
 *      and its icons/start_url resolve to real files
 *
 * Assertions target BEHAVIOUR and stored state, not exact copy strings,
 * except where the string itself is a guardrail requirement.
 *
 * Run:  NODE_PATH=/tmp/rootling-domtest/node_modules node tests/qa-safety.js
 * Exit code 0 = all assertions passed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const os = require('os');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const notifJs = fs.readFileSync(path.join(root, 'notifications.js'), 'utf8');
const KEY = 'sprout-state-v1';

let failures = 0;
let passes = 0;
function assert(cond, label) {
  if (cond) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}

/* Fresh JSDOM; when seedRaw is given it is planted in localStorage BEFORE
 * app.js is evaluated — that is a simulated reload: the app must rebuild
 * its whole world from the stored record alone. */
function makeDom(seedRaw) {
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  if (seedRaw) dom.window.localStorage.setItem(KEY, seedRaw);
  dom.window.eval(appJs);
  return dom;
}
const stored = (dom) => JSON.parse(dom.window.localStorage.getItem(KEY));
const tick = () => new Promise(r => setTimeout(r, 30));

function adopt(dom, opts) {
  opts = opts || {};
  const w = dom.window, d = w.document;
  if (opts.form) d.querySelector('[data-form-choice="' + opts.form + '"]').click();
  if (opts.profile) { d.querySelectorAll('#adopt-profile-group input[type="checkbox"]').forEach(b => { b.checked = b.value === opts.profile; }); }
  if (opts.learn) d.getElementById('adopt-learn-checkbox').checked = true;
  d.getElementById('pet-name-input').value = opts.name || 'Testy';
  d.getElementById('adopt-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}

(async function main() {
  /* ---------- 12. Persistence across a simulated reload ---------- */
  console.log('— 12. Persistence across simulated reload —');
  const domA = makeDom();
  await tick();
  adopt(domA, { form: 'animal', profile: 'focus', learn: true, name: 'Pip' });
  domA.window.document.querySelector('[data-mood="4"]').click();
  const seedRaw = domA.window.localStorage.getItem(KEY);
  const seed = JSON.parse(seedRaw);
  assert(seed.form === 'animal', 'seed: form persisted at save (animal)');
  assert(seed.profile === 'focus', 'seed: profile persisted at save (focus)');
  assert(seed.learningEnabled === true, 'seed: learningEnabled persisted at save (true)');
  assert(seed.learning && seed.learning.signals.byType.mood && seed.learning.signals.byType.mood.done === 1,
    'seed: learned signal persisted at save (mood done=1)');
  assert(Object.keys(seed.learning.signals.byHour).length >= 1,
    'seed: learned byHour signal present at save');

  const domB = makeDom(seedRaw); /* the reload */
  await tick();
  const dB = domB.window.document;
  const sB = stored(domB);
  assert(sB.petName === 'Pip', 'reload: pet name survives (Pip)');
  assert(sB.form === 'animal', 'reload: form survives (animal)');
  assert(sB.profile === 'focus', 'reload: profile survives (focus)');
  assert(sB.learningEnabled === true, 'reload: learningEnabled survives (true)');
  assert(sB.sunshine === seed.sunshine && seed.sunshine === 10, 'reload: sunshine survives exactly (' + sB.sunshine + ')');
  assert(sB.learning.signals.byType.mood.done === 1, 'reload: learned mood signal survives (done=1, not reset, not doubled)');
  assert(Object.keys(sB.learning.signals.byHour).length >= 1, 'reload: learned byHour signal survives');
  assert(dB.getElementById('main-view').hidden === false && dB.getElementById('adopt-view').hidden === true,
    'reload: returning user lands on main view, not adopt');
  assert(dB.getElementById('pet-img').getAttribute('src').indexOf('creature-') !== -1,
    'reload: animal art renders from persisted form');
  assert(dB.querySelector('#profile-group input[value="focus"]').checked === true && dB.querySelector('#profile-group input[value="companion"]').checked === false, 'reload: settings profile control reflects persisted profile');
  assert(dB.getElementById('learn-checkbox').checked === true, 'reload: settings learning checkbox reflects persisted opt-in');

  /* ---------- 13. Learning OFF records zero signals (UI paths) ---------- */
  console.log('— 13. Learning OFF: zero signals through UI paths —');
  const domC = makeDom();
  await tick();
  adopt(domC, { name: 'NoLearn' }); /* companion profile, learn checkbox left unchecked */
  let sC = stored(domC);
  assert(sC.learningEnabled === false, 'learning is disabled at adoption (checkbox untouched)');
  const dC = domC.window.document;
  dC.querySelector('[data-mood="3"]').click();
  dC.getElementById('water-plus').click();
  dC.getElementById('move-little').click();
  dC.getElementById('sleep-slider').value = '7';
  dC.getElementById('sleep-save').click();
  sC = stored(domC);
  assert(sC.sunshine === 32, 'check-ins really happened via UI (sunshine=32), so a zero-signal result is meaningful');
  const sigC = sC.learning.signals;
  assert(Object.keys(sigC.byType).length === 0, 'learning OFF: byType signals stay empty after 4 UI check-ins');
  assert(Object.keys(sigC.byHour).length === 0, 'learning OFF: byHour signals stay empty');
  assert(sigC.daysObserved === 0 && sigC.careDaysSeen === 0 && sigC.restDays === 0,
    'learning OFF: day counters stay at 0');
  assert(sigC.groundingUsed === 0 && sigC.calmUsed === 0, 'learning OFF: tool-use counters stay at 0');
  assert(sC.learning.adaptations.demandLevel === null && Object.keys(sC.learning.adaptations.microTypes).length === 0,
    'learning OFF: no adaptations are computed');
  assert(sC.learning.log.length === 0, 'learning OFF: adaptation log stays empty');

  /* ---------- 14. Calm mode at adoption ---------- */
  console.log('— 14. Calm mode from calmDefault profiles —');
  const domCalm = makeDom(); await tick();
  adopt(domCalm, { profile: 'calm', name: 'Still' });
  assert(stored(domCalm).calmMode === true, 'adopting with calm profile stores calmMode=true');
  assert(domCalm.window.document.body.classList.contains('calm'), 'calm profile: body carries the calm (muted/no-motion) class after adopt');
  const domGnd = makeDom(); await tick();
  adopt(domGnd, { profile: 'grounding', name: 'Anchor' });
  assert(stored(domGnd).calmMode === true, 'adopting with grounding profile stores calmMode=true');
  const domCtl = makeDom(); await tick();
  adopt(domCtl, { profile: 'companion', name: 'Plain' });
  assert(stored(domCtl).calmMode === false, 'control: companion profile adopts with calmMode=false (calm is profile-driven, not a default)');

  /* ---------- 15. Form switch preserves careDays / checkins exactly ---------- */
  console.log('— 15. Form switch: careDays + checkins preserved exactly —');
  const domF = makeDom(); await tick();
  adopt(domF, { name: 'Fern' });
  const dF = domF.window.document;
  dF.querySelector('[data-mood="5"]').click();
  dF.getElementById('water-plus').click();
  dF.getElementById('water-plus').click();
  dF.getElementById('move-little').click();
  const beforeF = stored(domF);
  const careBefore = JSON.stringify(beforeF.careDays);
  const checkBefore = JSON.stringify(beforeF.checkins);
  assert(beforeF.careDays.length === 1 && Object.keys(beforeF.checkins).length === 1,
    'precondition: 1 care day and 1 check-in day recorded before switch');
  dF.querySelector('[data-form-switch="animal"]').click();
  const afterF = stored(domF);
  assert(afterF.form === 'animal', 'form switch actually changed the form (plant -> animal)');
  assert(JSON.stringify(afterF.careDays) === careBefore, 'form switch: careDays identical (deep equality)');
  assert(JSON.stringify(afterF.checkins) === checkBefore, 'form switch: checkins identical (deep equality)');
  assert(afterF.sunshine === beforeF.sunshine && afterF.petName === beforeF.petName,
    'form switch: sunshine + name unchanged');
  dF.querySelector('[data-form-switch="plant"]').click();
  const backF = stored(domF);
  assert(backF.form === 'plant' && JSON.stringify(backF.careDays) === careBefore && JSON.stringify(backF.checkins) === checkBefore,
    'form switch round-trip (animal -> plant): careDays + checkins still identical');

  /* ---------- 16. Grounding card visibility by profile ---------- */
  console.log('— 16. Grounding card visibility —');
  assert(domCtl.window.document.getElementById('grounding-card').hidden === true,
    'companion profile: grounding card is hidden');
  assert(domGnd.window.document.getElementById('grounding-card').hidden === false,
    'grounding profile: grounding card is visible');
  const dCtl = domCtl.window.document;
  dCtl.querySelectorAll('#profile-group input[type="checkbox"]').forEach(b => { b.checked = b.value === 'grounding'; });
  dCtl.querySelector('#profile-group input[value="grounding"]').dispatchEvent(new domCtl.window.Event('change', { bubbles: true }));
  assert(dCtl.getElementById('grounding-card').hidden === false,
    'switching to grounding in settings surfaces the card');
  dCtl.querySelectorAll('#profile-group input[type="checkbox"]').forEach(b => { b.checked = b.value === 'companion'; });
  dCtl.querySelector('#profile-group input[value="companion"]').dispatchEvent(new domCtl.window.Event('change', { bubbles: true }));
  assert(dCtl.getElementById('grounding-card').hidden === true,
    'switching back to companion hides the card again');

  /* ---------- 17. FORMS assets exist on disk ---------- */
  console.log('— 17. Referenced creature/plant assets exist on disk —');
  const A = domB.window.SproutApp;
  const formFiles = new Set();
  for (const fName of Object.keys(A.FORMS)) {
    const f = A.FORMS[fName];
    f.stages.forEach(st => formFiles.add(st.file));
    Object.keys(f.moods).forEach(m => formFiles.add(f.moods[m]));
    formFiles.add(f.firstFile);
  }
  assert(formFiles.size >= 16, 'FORMS reference set is non-trivial (' + formFiles.size + ' unique files across both forms)');
  for (const rel of [...formFiles].sort()) {
    const p = path.join(root, rel);
    assert(fs.existsSync(p) && fs.statSync(p).size > 0, 'FORMS asset exists on disk: ' + rel);
  }
  /* Belt-and-braces: every assets/*.svg path mentioned anywhere in app.js
   * (this also catches PLACEHOLDER, which FORMS does not carry). */
  const textRefs = new Set((appJs.match(/assets\/[a-z0-9-]+\.svg/g) || []));
  for (const rel of [...textRefs].sort()) {
    const p = path.join(root, rel);
    assert(fs.existsSync(p) && fs.statSync(p).size > 0, 'app.js asset reference exists on disk: ' + rel);
  }

  /* ---------- 18. No-guilt copy scan ----------
   * Approach (documented to keep false positives at zero):
   * - Scope: the two shipped user-facing copy sources, index.html + app.js.
   * - Forbidden shaming concepts, matched case-insensitively with word
   *   boundaries: 'you failed', 'streak lost', 'broke your streak',
   *   'you lost your streak', 'died', 'wilting', 'shame on',
   *   'you should be ashamed'.
   * - A hit is EXCUSED only when it sits on the same line as an explicit
   *   negation guard (never / not / no / nothing / n't) — i.e. the copy is
   *   stating the pet does NOT do that ("never wilts", "not a medical
   *   device"-style disclaimer contexts). This mirrors how the guardrail
   *   copy itself is legitimately written. Any other hit fails.
   * - The scanner is self-tested below against a synthetic shaming string
   *   (must flag) and a synthetic negated string (must excuse), so a
   *   silently-broken/vacuous scan cannot pass. */
  console.log('— 18. No-guilt copy scan —');
  const FORBIDDEN = [
    /you failed/i, /streak lost/i, /broke your streak/i, /you lost your streak/i,
    /\bdied\b/i, /\bwilting\b/i, /shame on/i, /you should be ashamed/i
  ];
  const NEGATION = /\b(never|not|no|nothing)\b|n't/i;
  function unexcusedHits(text) {
    const hits = [];
    text.split('\n').forEach((line, i) => {
      for (const pat of FORBIDDEN) {
        if (pat.test(line) && !NEGATION.test(line)) hits.push('line ' + (i + 1) + ': ' + line.trim().slice(0, 90));
      }
    });
    return hits;
  }
  assert(FORBIDDEN.length >= 8, 'scan is armed with ' + FORBIDDEN.length + ' forbidden shaming patterns');
  assert(unexcusedHits('Your streak lost! You failed today.').length >= 1, 'scan self-test: flags a synthetic shaming line');
  assert(unexcusedHits('Your companion never died, never wilting — it simply waits.').length === 0,
    'scan self-test: excuses the same words inside an explicit negation');
  const htmlHits = unexcusedHits(html);
  const jsHits = unexcusedHits(appJs);
  assert(html.length + appJs.length > 15000, 'scan actually read both copy sources (' + (html.length + appJs.length) + ' chars)');
  assert(htmlHits.length === 0, 'no unexcused shaming copy in index.html' + (htmlHits.length ? ' — HITS: ' + htmlHits.join(' | ') : ''));
  assert(jsHits.length === 0, 'no unexcused shaming copy in app.js' + (jsHits.length ? ' — HITS: ' + jsHits.join(' | ') : ''));

  /* ---------- 19. Deploy-readiness (folder completeness) ---------- */
  console.log('— 19. Deploy-readiness: precache + manifest resolve —');
  const shellBlock = (swJs.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
  const shellEntries = [...shellBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert(shellEntries.length >= 5, 'SW precache list parsed (' + shellEntries.length + ' entries)');
  for (const entry of shellEntries) {
    const rel = entry === './' ? 'index.html' : entry.replace(/^\.\//, '');
    assert(fs.existsSync(path.join(root, rel)), 'SW precache file exists: ' + entry + ' -> ' + rel);
  }
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8')); } catch (e) { /* asserted below */ }
  assert(!!manifest, 'manifest.webmanifest parses as JSON');
  if (manifest) {
    assert(!!manifest.name && !!manifest.short_name && manifest.display === 'standalone',
      'manifest carries name, short_name and standalone display');
    const startRel = (manifest.start_url || '').replace(/^\.\//, '');
    assert(!!startRel && fs.existsSync(path.join(root, startRel)), 'manifest start_url resolves to a real file: ' + manifest.start_url);
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 1, 'manifest declares at least one icon');
    for (const icon of manifest.icons) {
      const rel = icon.src.replace(/^\.\//, '');
      assert(fs.existsSync(path.join(root, rel)), 'manifest icon exists: ' + icon.src);
    }
    assert(fs.existsSync(path.join(root, 'icon.svg')) && fs.existsSync(path.join(root, 'styles.css')),
      'shell companions referenced by index.html exist (icon.svg, styles.css)');
  }

  /* ================================================================
   * RESEARCH CHECKLIST (pet-app-condition-deep-dive-20261015-1130)
   * Sections 20-26 map 1:1 to the forwarded research pitfalls 1-7.
   * Several assertions below are EXPECTED TO FAIL on the current build;
   * they encode the research requirement, not the current behaviour.
   * A red assertion here is a filed defect, never a reason to edit the
   * assertion. (QA team does not fix app code.)
   * ================================================================ */

  /* ---------- 20. [Research 1] Loss-mechanics sweep ---------- */
  console.log('— 20. Loss mechanics: no resets, deductions, expiry, rankings —');
  const A20 = domB.window.SproutApp;
  const gap = A20.defaultState(); gap.petName = 'Gap';
  const mon = new Date(2026, 9, 12, 10), thu = new Date(2026, 9, 15, 10);
  A20.applyCheckin(gap, 'mood', { value: 3 }, mon);
  const sunBeforeGap = gap.sunshine, daysBeforeGap = gap.careDays.length;
  assert(A20.hadRestDay(gap, thu) === true, 'precondition: a real rest gap exists in this scenario');
  assert(gap.sunshine === sunBeforeGap && gap.careDays.length === daysBeforeGap,
    'rest gap deducts NOTHING: sunshine and total care days identical after missed days');
  assert(A20.currentStreak(gap, thu) === 0 && gap.careDays.length === 1,
    'streak is a count only: it reads 0 after a gap while total progress (careDays) is untouched');
  let monotonic = true, prevIdx = -1;
  const stageIds = A20.stagesFor('plant').map(s => s.id);
  for (let pts = 0; pts <= 200; pts += 5) {
    const idx = stageIds.indexOf(A20.stageFor(pts).id);
    if (idx < prevIdx) monotonic = false;
    prevIdx = idx;
  }
  assert(monotonic, 'growth stage is monotonic in sunshine (code-verified: progress can never regress)');
  assert(A20.petMood(gap, thu) === 'stage', 'returning after a gap, the pet is in its neutral stage state — not a punished/low state');
  const LOSS_PATTERNS = [/leaderboard/i, /\brank(ing|ed)?\b/i, /penalt/i, /deduct/i, /points (removed|taken|lost)/i,
    /expir(e|es|ing|ation)/i, /report card/i, /weekly report/i, /week in review/i, /you (lost|lose) (your|the)/i];
  const lossHits = [];
  /* v17 exemption, deliberately narrow: auth sessions genuinely end.
   * Fix A's approved sign-in message ("Your sign-in expired…") and
   * Supabase's expires_at field name are facts about a login, not
   * progress/streak expiry framing — the ban's actual target. Any
   * other expiry wording anywhere still fails this scan. */
  const LOSS_EXEMPT = /Your sign-in expired|expires_at/;
  [['index.html', html], ['app.js', appJs]].forEach(([name, text]) => {
    text.split('\n').forEach((line, i) => {
      for (const p of LOSS_PATTERNS) if (p.test(line) && !NEGATION.test(line) && !LOSS_EXEMPT.test(line)) lossHits.push(name + ':' + (i + 1));
    });
  });
  assert(lossHits.length === 0, 'no leaderboard/expiry/deduction/report-card copy in shipped copy' + (lossHits.length ? ' — HITS: ' + lossHits.join(', ') : ''));

  /* ---------- 21. [Research 2] Banned copy: certification / RSD / diagnosis ---------- */
  console.log('— 21. Banned copy: outcome certification, RSD, diagnosis language —');
  const CERT_PATTERNS = [/you'?re definitely okay/i, /you are definitely okay/i, /everything will be fine/i,
    /it will all be fine/i, /you are safe now/i, /you'?re safe now/i, /you will be okay/i, /you'?ll be fine/i,
    /definitely (fine|okay|safe)/i, /will make you feel/i, /guaranteed to/i,
    /gets you there with room to spare/i];
  const certHits = [];
  [['index.html', html], ['app.js', appJs]].forEach(([name, text]) => {
    text.split('\n').forEach((line, i) => {
      for (const p of CERT_PATTERNS) if (p.test(line)) certHits.push(name + ':' + (i + 1) + ' ' + line.trim().slice(0, 70));
    });
  });
  assert(certHits.length === 0, 'pet never certifies outcomes (no "definitely okay / will be fine / you are safe now")' + (certHits.length ? ' — HITS: ' + certHits.join(' | ') : ''));
  assert(CERT_PATTERNS.some(p => p.test("Don't worry — you're definitely okay, everything will be fine!")),
    'certification scan self-test: flags a synthetic outcome guarantee');
  assert(CERT_PATTERNS.some(p => p.test('leaving at 8 gets you there with room to spare')),
    'certification scan self-test: flags the retired leave-by outcome guarantee');
  const groundingText = A20.GROUNDING_STEPS.join(' ');
  assert(!CERT_PATTERNS.some(p => p.test(groundingText)),
    'grounding copy stays present-tense orientation (allowed) and contains no outcome guarantee');
  const rsdHits = (html + appJs + swJs).match(/\bRSD\b|rejection[- ]sensitive|rejection sensitivity/gi) || [];
  assert(rsdHits.length === 0, '"RSD" / rejection-sensitive-dysphoria language appears NOWHERE in the shipped app');
  const CONDITION = /\b(ADHD|autism|autistic|PTSD|anxiety|depression)\b/i;
  const promptStrings = [];
  for (const t of Object.keys(A20.PROMPTS)) {
    const set = A20.PROMPTS[t];
    for (const k of Object.keys(set)) {
      if (Array.isArray(set[k])) promptStrings.push(...set[k]); else promptStrings.push(set[k]);
    }
  }
  assert(!promptStrings.some(s => CONDITION.test(s)), 'no check-in prompt names a condition (prompts are style, not diagnosis)');
  assert(!A20.GROUNDING_STEPS.concat(A20.BREATHING_STEPS).some(s => CONDITION.test(s)),
    'grounding/breathing copy names no condition');
  const taglines = Object.keys(A20.PROFILES).map(k => A20.PROFILES[k].tagline).join(' ');
  assert(!CONDITION.test(taglines), 'profile taglines describe support style without condition labels');
  const learnedState = A20.defaultState(); learnedState.petName = 'L'; learnedState.profile = 'calm';
  A20.setLearningEnabled(learnedState, true);
  A20.recordExposure(learnedState, mon); A20.applyCheckin(learnedState, 'mood', { value: 3 }, mon);
  assert(!A20.learnedFacts(learnedState).some(f => CONDITION.test(f)),
    'learned view never labels the user with a condition (facts are usage counts only)');
  assert(!domB.window.document.getElementById('pet-message').textContent.match(CONDITION),
    'rendered pet message names no condition');

  /* ---------- 22. [Research 3] PTSD / safety specifics ---------- */
  console.log('— 22. PTSD/safety: exits, grounding menu, sleep verdicts, notifications —');
  const dG = domGnd.window.document;
  dG.getElementById('breath-start').click();
  assert(dG.getElementById('breathing-panel').hidden === false && !!dG.getElementById('breath-stop'),
    'breathing exercise opens with its stop control present');
  dG.getElementById('breath-stop').click();
  assert(dG.getElementById('breathing-panel').hidden === true, 'breathing stop is instant: one click, panel closed, no confirmation');
  dG.getElementById('ground-start').click();
  dG.getElementById('ground-next').click();
  dG.getElementById('ground-next').click();
  assert(dG.getElementById('grounding-panel').hidden === false && !!dG.getElementById('ground-stop'),
    'grounding exercise: exit control still present mid-exercise (step 3 of 6)');
  dG.getElementById('ground-stop').click();
  assert(dG.getElementById('grounding-panel').hidden === true, 'grounding exit closes the exercise in one click at any step');
  const pauseCandidates = [...dG.querySelectorAll('button, a')].filter(el =>
    /pause|leave quietly/i.test(el.textContent) &&
    !el.closest('#grounding-panel') && !el.closest('#breathing-panel'));
  assert(pauseCandidates.length >= 1,
    'a persistent app-wide Pause / Leave control exists outside the exercise panels (research §118)');
  const toolBtns = [...dG.getElementById('grounding-card').querySelectorAll('button')].filter(b => b.id === 'ground-start' || b.id === 'breath-start' || /ground|breathe|cold|orient|feet|move/i.test(b.textContent));
  assert(toolBtns.length >= 3,
    'grounding is a MENU of >=3 distinct tools (research §121), not only 5-4-3-2-1 + breathing — found ' + toolBtns.length);
  const sleepVerdicts = (html + appJs).match(/slept badly|bad sleep|poor sleep|slept poorly|terrible sleep|sleep failed/gi) || [];
  assert(sleepVerdicts.length === 0, 'no "slept badly"-style verdict copy anywhere');
  const sleepChipLabels = [...dG.querySelectorAll('[data-sleep]')].map(el => el.textContent.trim());
  assert(JSON.stringify(sleepChipLabels) === JSON.stringify(['~5 hours', '~7 hours', '~9 hours']),
    'sleep quick-pick chips use plain hour amounts only: ' + sleepChipLabels.join(' / '));
  assert(!/rough|okay|restful/i.test(sleepChipLabels.join(' ')),
    'sleep quick-pick chip text carries no verdict labels');
  assert(html.indexOf('If sleep problems keep going, a professional can help — CBT-I is the recommended treatment for ongoing insomnia. Rootling does not provide it.') !== -1,
    'CBT-I professional-help signpost is present verbatim in the support box');
  /* Notifications — SUPERSESSION NOTE (QA, 2026-10-15): the research
   * checklist as forwarded assumed "the app has none". Daniel's Phase 3
   * order (same day) directed opt-in notifications, so the audit target
   * changed from absence to the Phase 3 guardrails themselves: OFF by
   * default, permission requested ONLY from a user gesture (never at
   * load/init), silent, quiet hours, per-routine opt-outs, gentle copy.
   * The original absence assertion was replaced — not weakened: every
   * guardrail below would fail on an unprompted-prompt implementation. */
  const domN = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  domN.window.eval(appJs);
  domN.window.eval(notifJs);
  await tick();
  const N = domN.window.RootlingNotify;
  assert(!!N, 'notifications module loads and exposes its API');
  if (N) {
    const nDef = N.defaults();
    assert(nDef.enabled === false, 'Phase 3 guardrail: notifications are OFF by default');
    assert(Object.keys(N.ROUTINES).every(id => N.blockReason(nDef, id, new Date(2026, 9, 15, 12)) === 'off'),
      'Phase 3 guardrail: with the master switch off, every routine is blocked (reason: off)');
    assert(N.isQuiet(nDef, new Date(2026, 9, 15, 22, 30)) === true && N.isQuiet(nDef, new Date(2026, 9, 15, 12, 0)) === false,
      'Phase 3 guardrail: quiet hours (21:00-08:00) actually suppress firing');
    const notifCopy = Object.keys(N.ROUTINES).map(id => N.ROUTINES[id].message).join(' ');
    assert(!CERT_PATTERNS.some(p => p.test(notifCopy)) && !/missed|behind|shame|failed|hurry/i.test(notifCopy),
      'Phase 3 guardrail: reminder message copy is gentle — no certification, guilt or urgency');
  }
  const initBody = (notifJs.match(/function init\(\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
  assert(initBody.length > 0 && initBody.indexOf('requestPermission') === -1,
    'Phase 3 guardrail: permission is NEVER requested at load/init (user gesture only)');
  const masterToggle = domN.window.document.getElementById('notify-master');
  assert(!!masterToggle && masterToggle.checked === false,
    'Phase 3 guardrail: the alerts master toggle renders unchecked (off) on first run');
  assert(!/alerts? (work|fire|arrive|still work) (even )?(while|when) (the app is )?closed/i.test(html + appJs + notifJs),
    'truth-in-UI (PHASE3-DESIGN §2.1/§5): no copy anywhere claims alerts work while the app is closed');
  assert(N.pushStatus().connected === false && /not connected yet/.test(N.pushStatus().text),
    'truth-in-UI: pushStatus() reports not-connected with no VAPID configured (ROOTLING_PUSH unset)');

  /* ---------- 23. [Research 4] Anxiety specifics ---------- */
  console.log('— 23. Anxiety: done stays done, no symptom scores, no FOMO —');
  const domX = makeDom(); await tick();
  adopt(domX, { name: 'Once' });
  const dX = domX.window.document;
  dX.querySelector('[data-mood="2"]').click();
  dX.getElementById('water-plus').click();
  dX.getElementById('move-little').click();
  dX.getElementById('sleep-save').click();
  assert(dX.getElementById('today-count').textContent === '4', 'all four check-ins done (4/4)');
  dX.querySelector('[data-mood="5"]').click(); /* anxious re-check / answer change */
  assert(dX.getElementById('done-mood').hidden === false && dX.getElementById('today-count').textContent === '4',
    're-tapping a completed check-in updates the answer but the day still reads DONE — no re-prompting');
  assert(dX.querySelectorAll('canvas, [id*="chart" i], [id*="graph" i], [id*="score" i], [class*="chart" i], [class*="graph" i]').length === 0,
    'no symptom graphs, charts or scores are rendered');
  const FOMO = [/don'?t miss/i, /limited time/i, /last chance/i, /countdown/i, /before it'?s too late/i,
    /hurry up/i, /you still need/i, /don'?t forget/i, /act now/i, /only today/i];
  const fomoHits = [];
  [['index.html', html], ['app.js', appJs]].forEach(([name, text]) => {
    text.split('\n').forEach((line, i) => {
      for (const p of FOMO) if (p.test(line) && !NEGATION.test(line)) fomoHits.push(name + ':' + (i + 1));
    });
  });
  assert(fomoHits.length === 0, 'no FOMO / countdown / urgency / re-prompt copy' + (fomoHits.length ? ' — HITS: ' + fomoHits.join(', ') : ''));

  /* ---------- 24. [Research 5] Depression specifics ---------- */
  console.log('— 24. Depression: no completion-%, no failure reports, kind return —');
  const mainText = domX.window.document.getElementById('main-view').textContent;
  assert(!/%/.test(mainText), 'no percentage figure is rendered in the main view (no completion-%)');
  assert(!/weekly|report card|you missed|backlog|catch up|falling behind/i.test(mainText),
    'no weekly/failure-report or backlog language in the rendered main view');
  for (const fName of Object.keys(A20.FORMS)) {
    const rt = A20.FORMS[fName].restText;
    /* Sentence-level check with the same negation rule as §18/§20: a
     * backlog word inside an explicit negation ("Nothing to catch up
     * on") is the OPPOSITE of a backlog report and is excused; the same
     * word asserted positively would fail. */
    const badSentences = rt.split(/[.!?]\s*/).filter(sent =>
      /missed|behind|backlog|catch up|lost/i.test(sent) && !/\b(nothing|no|never|not)\b|n't/i.test(sent));
    assert(/rest/i.test(rt) && /still here/i.test(rt) && badSentences.length === 0,
      fName + ' rest-day copy: pet is fine, progress "still here", zero backlog/shame wording outside negations');
  }

  /* ---------- 25. [Research 6] Crisis signposting + privacy re-verify ---------- */
  console.log('— 25. Crisis signposting clarity + privacy (zero network) —');
  function chainVisible(el) {
    let n = el;
    while (n && n !== el.ownerDocument.documentElement) {
      if (n.hidden === true) return false;
      n = n.parentElement;
    }
    return true;
  }
  const supportBox = domX.window.document.querySelector('.support-box');
  assert(!!supportBox, 'support box exists in the DOM');
  assert(supportBox && supportBox.textContent.indexOf('988') !== -1, 'support box contains 988');
  assert(supportBox && /not a medical device/i.test(supportBox.textContent), 'support box states the not-a-medical-device disclaimer unambiguously');
  assert(supportBox && chainVisible(supportBox), 'adopted view: 988 box is visible without opening settings or any collapsed panel');
  assert(supportBox && !supportBox.closest('#learned-view'), '988 box is not buried inside the learned/settings view');
  const domFresh = makeDom(); await tick();
  const fresh988 = [...domFresh.window.document.querySelectorAll('p, div, section, footer')].filter(el =>
    el.textContent.indexOf('988') !== -1 && chainVisible(el) && el.querySelectorAll('p, div, section').length === 0);
  assert(fresh988.length >= 1, 'first run (adopt screen): crisis line 988 is visible before adoption, not locked behind sign-up');
  /* v11 spec evolution (Daniel's connected-layer order, 2026-10-15): the
   * zero-network invariant now reads — the CORE app (everything before
   * the v11 connected section) makes zero network calls, and the only
   * network code in app.js lives in that section, behind the
   * configured + signed-in + not-Privacy-Mode gates. The on-device app
   * remains fully functional with the connected layer absent. */
  const v11Marker = appJs.indexOf('v11: AI access, pet chat');
  assert(v11Marker !== -1, 'privacy re-verify: the v11 connected section exists and is marked');
  const coreJs = v11Marker === -1 ? appJs : appJs.slice(0, v11Marker);
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(coreJs),
    'privacy re-verify: core app.js (pre-connected-layer) contains zero network calls');
  assert(appJs.includes('function connectedConfigured') && appJs.includes('if (a.privacyMode || !connectedConfigured()'),
    'privacy re-verify: AI calls are gated on config + not-Privacy-Mode');
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|pushManager\.subscribe/.test(notifJs),
    'privacy re-verify: notifications.js makes zero network calls and creates no push subscription (Tier 2 inert)');
  const appUrls = appJs.match(/https?:\/\/[^\s'")]+/g) || [];
  assert(appUrls.every(u => u.indexOf('https://esm.sh/@supabase/supabase-js') === 0 || u.indexOf('https://gfjrzqlmtqzimgjgeacv.supabase.co') === 0),
    'privacy re-verify: the only external URL literals in app.js are the Supabase client module + the project\u2019s own backend');
  /* v13/v14 amendment (documented, enumerated): index.html carries
   * exactly three URLs, all user-visible content choices of the v13
   * build — the app's own address (password-reset return), the CDC
   * adult activity-guidelines page linked from the fitness card, and
   * the bring-your-own-AI endpoint shown as the assistant settings
   * placeholder (inert until a user enters their own key). Any OTHER
   * URL in the shell files still fails this pin. */
  const shellUrls = (html + notifJs + fs.readFileSync(path.join(root, 'styles.css'), 'utf8')).match(/https?:\/\/[^\s'")]+/g) || [];
  const SHELL_URL_ALLOWLIST = ['https://api.openai.com/v1', 'https://squirrel42072000-design.github.io', 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html'];
  assert(shellUrls.every(u => SHELL_URL_ALLOWLIST.some(a => u.indexOf(a) === 0)),
    'privacy re-verify: index.html / notifications.js / styles.css reference only the enumerated v13 shell URLs');

  /* ---------- 26. [Research 7] Toggle-system law ---------- */
  console.log('— 26. Toggle law: user-chosen, previewable, ≤2 taps, never auto-reset —');
  const dT = domX.window.document;
  for (const id of ['profile-group', 'learn-checkbox', 'calm-checkbox']) {
    const el = dT.getElementById(id);
    assert(!!el && chainVisible(el), 'support control is present and reachable on the main view (no menu-diving): #' + id);
  }
  assert(!!dT.getElementById('profile-tagline') && dT.getElementById('profile-tagline').textContent.length > 10,
    'chosen profile is previewable: its plain-language tagline is shown in settings');
  const calmBefore = stored(domX).calmMode;
  dT.getElementById('calm-checkbox').click();
  assert(stored(domX).calmMode === !calmBefore, 'calm mode flips with a single tap on its checkbox');
  dT.getElementById('calm-checkbox').click();
  /* calmMode + profile + learningEnabled must survive a reload untouched */
  const seedT = (() => {
    const st = A20.defaultState(); st.petName = 'Keep'; st.profile = 'calm'; st.calmMode = true; st.learningEnabled = false;
    A20.saveState(st);
    return domB.window.localStorage.getItem(KEY);
  })();
  const domKeep = makeDom(seedT); await tick();
  const sKeep = stored(domKeep);
  assert(sKeep.profile === 'calm' && sKeep.calmMode === true && sKeep.learningEnabled === false,
    'reload never auto-resets user settings (profile, calmMode, learningEnabled all preserved)');
  /* Learning may soften, never override: demand direction + previews + calm */
  const soft = A20.defaultState(); soft.petName = 'S'; soft.profile = 'lowdemand';
  A20.setLearningEnabled(soft, true);
  soft.learning.adaptations.demandLevel = 'low';
  assert(A20.effectiveConfig(soft).demand === 'low', 'learning never RAISES demand above the chosen profile');
  const calmLearn = A20.defaultState(); calmLearn.petName = 'C'; calmLearn.profile = 'calm'; calmLearn.calmMode = true;
  A20.setLearningEnabled(calmLearn, true);
  calmLearn.learning.adaptations.promptStyle = 'varied';
  calmLearn.learning.adaptations.demandLevel = 'low';
  const cfgCalmLearn = A20.effectiveConfig(calmLearn);
  assert(cfgCalmLearn.previews === true, 'learning never removes a user-chosen preview (calm previews stay on)');
  assert(calmLearn.calmMode === true, 'learning never touches calm mode itself');
  assert(cfgCalmLearn.promptStyle === 'fixed',
    'TOGGLE LAW: learning must not override the calm profile\'s user-chosen FIXED prompt style with learned "varied" wording');

  /* ---------- 27. Overseer fix regressions (D2/D6/D7/D8/D10/D11) ---------- */
  console.log('— 27. Overseer fix regressions —');
  /* D2: the persistent Pause / Leave-quietly control is behavior, not just
   * a labelled button: one click hides both app views, shows the user's
   * chosen neutral screen, records nothing, and Resume restores the app. */
  const pauseSeed = A20.defaultState();
  pauseSeed.petName = 'PauseTest'; pauseSeed.profile = 'companion'; pauseSeed.pauseScreen = 'blank';
  const domPause = makeDom(JSON.stringify(pauseSeed)); await tick();
  const dPause = domPause.window.document;
  dPause.getElementById('pause-screen-select').value = 'companion';
  dPause.getElementById('pause-screen-select').dispatchEvent(new domPause.window.Event('change', { bubbles: true }));
  const pauseSnapshot = domPause.window.localStorage.getItem(KEY);
  dPause.getElementById('pause-btn').click();
  assert(dPause.getElementById('quiet-view').hidden === false && dPause.getElementById('main-view').hidden === true && dPause.getElementById('adopt-view').hidden === true,
    'D2 regression: Pause instantly leaves the app views for the quiet view');
  assert(dPause.getElementById('quiet-art').hidden === false && dPause.getElementById('quiet-art').getAttribute('src').indexOf('sleepy') !== -1,
    'D2 regression: Pause shows the user-chosen companion-asleep screen');
  assert(domPause.window.localStorage.getItem(KEY) === pauseSnapshot,
    'D2 regression: pausing records nothing and changes no saved state');
  dPause.getElementById('quiet-resume-btn').click();
  assert(dPause.getElementById('quiet-view').hidden === true && dPause.getElementById('main-view').hidden === false,
    'D2 regression: Resume restores the main view from the quiet view');

  /* D6: the dormant executive leave-by copy must state a plan with buffer,
   * never certify arrival. */
  assert(A20.EXEC_COPY.eventLeaveBy === 'For {event}: leaving at {leaveBy} is the plan — it builds in buffer.',
    'D6 regression: EXEC_COPY.eventLeaveBy is the non-certifying plan/buffer wording');
  assert(appJs.indexOf('gets you there with room to spare') === -1,
    'D6 regression: the retired outcome-certifying leave-by phrase is absent from app.js');

  /* D7: scoped privacy copy + a guard against a connected configuration
   * coexisting with unscoped "everything/nothing" privacy claims. */
  const manifestText = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
  const UNSCOPED_PRIVACY = [/everything (in Rootling )?stays on (your|this) device/i,
    /everything stays on your device/i, /nothing is sent anywhere/i, /nothing leaves your phone/i];
  const unscopedPrivacyHits = (html + manifestText).split('\n').filter(line => UNSCOPED_PRIVACY.some(p => p.test(line)));
  assert(unscopedPrivacyHits.length === 0,
    'D7 regression: footer/meta/manifest contain no unscoped everything-on-device privacy claim');
  assert(/your pet, check-ins, and anything it learns live on your device/i.test(html) && /optional connected helpers/i.test(html),
    'D7 regression: shipped privacy copy scopes the offline core and labels connected helpers as optional');
  function connectedConfigured(texts) {
    return texts.some(text => {
      const m = text.match(/ROOTLING_PUSH\s*=\s*\{([\s\S]*?)\}/);
      return !!m && /(vapidPublicKey|endpoint)\s*:\s*['"][^'"]+['"]/.test(m[1]);
    });
  }
  assert(connectedConfigured(['window.ROOTLING_PUSH = { vapidPublicKey: "", endpoint: "" };']) === false,
    'D7 guard self-test: an empty push config is not treated as connected');
  assert(connectedConfigured(['window.ROOTLING_PUSH = { vapidPublicKey: "key", endpoint: "https://example.invalid" };']) === true,
    'D7 guard self-test: a populated push config is treated as connected');
  assert(!(connectedConfigured([html, appJs, notifJs]) && unscopedPrivacyHits.length > 0),
    'D7 regression: no connected push configuration coexists with unscoped privacy wording');

  /* D10: the formerly orphan calm-celebrate plant art is wired through
   * moodFile when calm mode is on; normal celebration art remains in use
   * when calm mode is off. */
  const calmCelebSeed = A20.defaultState();
  calmCelebSeed.petName = 'CalmCeleb'; calmCelebSeed.form = 'plant'; calmCelebSeed.profile = 'focus'; calmCelebSeed.calmMode = true;
  const domCalmCeleb = makeDom(JSON.stringify(calmCelebSeed)); await tick();
  domCalmCeleb.window.document.querySelector('[data-mood="5"]').click();
  assert(domCalmCeleb.window.document.getElementById('pet-img').getAttribute('src').indexOf('sprout-celebrate-calm.svg') !== -1,
    'D10 regression: calm mode renders the wired sprout-celebrate-calm art');
  const loudCelebSeed = A20.defaultState();
  loudCelebSeed.petName = 'LoudCeleb'; loudCelebSeed.form = 'plant'; loudCelebSeed.profile = 'focus'; loudCelebSeed.calmMode = false;
  const domLoudCeleb = makeDom(JSON.stringify(loudCelebSeed)); await tick();
  domLoudCeleb.window.document.querySelector('[data-mood="5"]').click();
  assert(domLoudCeleb.window.document.getElementById('pet-img').getAttribute('src').indexOf('assets/sprout-celebrate.svg') !== -1,
    'D10 regression: calm mode off keeps the standard celebration art');
  const genSource = fs.readFileSync(path.join(root, 'tests', 'gen-creature.py'), 'utf8');
  assert(genSource.indexOf("LOW_CHEEK = '#FFB3BA'") !== -1,
    'D10 regression: creature generator names the shipped low-state cheek palette correction explicitly');
  const genTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rootling-gen-'));
  fs.mkdirSync(path.join(genTmp, 'tests')); fs.mkdirSync(path.join(genTmp, 'assets'));
  fs.copyFileSync(path.join(root, 'tests', 'gen-creature.py'), path.join(genTmp, 'tests', 'gen-creature.py'));
  childProcess.execFileSync('python3', [path.join(genTmp, 'tests', 'gen-creature.py')], { stdio: 'pipe' });
  const generatedCreatureFiles = fs.readdirSync(path.join(genTmp, 'assets')).filter(f => f.indexOf('creature-') === 0).sort();
  assert(generatedCreatureFiles.length === 8, 'D10 regression: creature generator produces all 8 creature files');
  for (const f of generatedCreatureFiles) {
    assert(fs.readFileSync(path.join(genTmp, 'assets', f), 'utf8') === fs.readFileSync(path.join(root, 'assets', f), 'utf8'),
      'D10 regression: regenerated file is byte-identical to shipped art: ' + f);
  }
  const generatedLow = fs.readFileSync(path.join(genTmp, 'assets', 'creature-low.svg'), 'utf8');
  assert(generatedLow.indexOf('#E8A0A8') === -1 && generatedLow.indexOf('#FFB3BA') !== -1,
    'D10 regression: regenerated creature-low uses the corrected cheek palette, never the retired hex');
  /* D11: when the adaptive style disables the learning checkbox, the
   * actual off path (switch styles) is explained at that control. */
  const adaptiveSeed = A20.defaultState();
  adaptiveSeed.petName = 'AdaptiveNote'; adaptiveSeed.profile = 'adaptive'; adaptiveSeed.learningEnabled = true;
  const domAdaptiveNote = makeDom(JSON.stringify(adaptiveSeed)); await tick();
  const dAdaptiveNote = domAdaptiveNote.window.document;
  assert(dAdaptiveNote.getElementById('learn-checkbox').disabled === true,
    'D11 regression: adaptive style disables the learning checkbox');
  assert(dAdaptiveNote.getElementById('learn-disabled-note').hidden === false &&
    dAdaptiveNote.getElementById('learn-disabled-note').textContent.indexOf('switch styles to turn learning off') !== -1,
    'D11 regression: disabled learning control explains that switching styles turns learning off');
  dAdaptiveNote.querySelectorAll('#profile-group input[type="checkbox"]').forEach(b => { b.checked = b.value === 'companion'; });
  dAdaptiveNote.querySelector('#profile-group input[value="companion"]').dispatchEvent(new domAdaptiveNote.window.Event('change', { bubbles: true }));
  assert(dAdaptiveNote.getElementById('learn-checkbox').disabled === false && dAdaptiveNote.getElementById('learn-disabled-note').hidden === true,
    'D11 regression: switching away from the learning-by-design style restores the checkbox and hides the note');

  /* ---------- 28. Pet memory guarantees (Daniel 2026-10-15) ---------- */
  console.log('— 28. Pet memory: plenty, durable, never silently lossy —');
  assert(appJs.indexOf('log.length > 30') === -1 && appJs.indexOf('shiftKey(key, -90)') === -1,
    'memory guarantee: app.js contains no learning-log cap and no 90-day pattern prune');
  assert(notifJs.indexOf('settings.log.splice') === -1 && notifJs.indexOf('capped 30') === -1,
    'memory guarantee: notifications.js contains no alert-log cap');
  assert(appJs.indexOf('navigator.storage.persist') !== -1 && appJs.indexOf('requestPersistentStorage(false)') !== -1,
    'memory guarantee: persistent storage is requested at first run, guarded');
  assert(html.indexOf('id="export-memory-btn"') !== -1 && html.indexOf('id="import-memory-input"') !== -1 && html.indexOf('id="memory-stats"') !== -1,
    'memory guarantee: export, import and memory-stats surfaces are shipped in the learned view');
  assert(/browser can still clear site data/i.test(html),
    'memory honesty: the learned view states the platform eviction reality instead of promising permanence');
  /* Large store through a REAL new-DOM reload (fresh window, seeded
   * storage): 600 check-in days + full pattern detail must all survive. */
  const bigSeed = A20.defaultState();
  bigSeed.petName = 'MemoryReload'; bigSeed.learningEnabled = true; bigSeed.sunshine = 9999;
  for (let i = 0; i < 600; i++) {
    const kd = A20.todayKey(new Date(2023, 0, 1 + i));
    bigSeed.checkins[kd] = { mood: { value: 4, points: 10 }, water: { glasses: 2, points: 4 } };
    bigSeed.careDays.push(kd);
    bigSeed.learning.signals.countedDone[kd + '|mood'] = 1;
    bigSeed.learning.signals.settledDays[kd] = 1;
  }
  bigSeed.careDays.sort();
  for (let j = 0; j < 50; j++) bigSeed.learning.log.push({ date: '2024-06-01', text: 'Reload memory entry ' + j });
  const domBig = makeDom(JSON.stringify(bigSeed)); await tick();
  const ABig = domBig.window.SproutApp;
  const reloadedBig = ABig.getState();
  assert(reloadedBig.petName === 'MemoryReload' && Object.keys(reloadedBig.checkins).length === 600 && reloadedBig.careDays.length === 600,
    'memory guarantee: large store (600 days) survives a real reload with no loss');
  assert(reloadedBig.learning.log.length === 50 && Object.keys(reloadedBig.learning.signals.countedDone).length === 600,
    'memory guarantee: learned log (50) and pattern detail (600) survive a real reload with no loss');
  domBig.window.document.getElementById('learned-toggle').click();
  assert(domBig.window.document.getElementById('memory-stats').textContent.indexOf('600 check-in day(s)') !== -1,
    'memory guarantee: transparency view reports the large store size to the user');
  /* Round-trip in the fresh DOM: export -> wipe storage -> import -> the
   * same pet, byte-faithful, including the alerts store. */
  const notifSeed = { enabled: false, cap: 3, quietStart: '21:00', quietEnd: '08:00', plans: {}, fired: {}, marks: {}, log: [{ ts: '2026-01-01T00:00:00.000Z', kind: 'held', text: 'Water reminder held (quiet hours).' }] };
  const bigExport = ABig.serializeMemoryExport(reloadedBig, notifSeed, new Date('2026-10-15T12:00:00.000Z'));
  domBig.window.localStorage.removeItem('sprout-state-v1');
  domBig.window.localStorage.removeItem('rootling-notifications-v1');
  ABig.applyMemoryImport(bigExport);
  assert(JSON.stringify(ABig.getState()) === JSON.stringify(reloadedBig),
    'memory guarantee: import restores the exact pet state after storage was wiped');
  assert(domBig.window.localStorage.getItem('rootling-notifications-v1') === JSON.stringify(notifSeed),
    'memory guarantee: import restores the exact alerts store after storage was wiped');

  /* ---------- 29. Privacy, consent & data controls (Worker 4) ---------- */
  console.log('— 29. Privacy: consent defaults, policy reachability, delete-my-data —');
  const domP = makeDom(); await tick();
  const dP = domP.window.document;
  assert(dP.getElementById('adopt-learn-checkbox').checked === false,
    'consent default: learning checkbox is OFF at adoption (unchecked)');
  assert(!!dP.getElementById('consent-wizard') && dP.getElementById('consent-wizard').hidden === false,
    'first run: the consent wizard is shown before the adoption form completes');
  assert(dP.getElementById('adopt-form').hidden === true,
    'first run: the adoption form waits behind the wizard (confirmation reveals it)');
  const confirmBoxP = dP.getElementById('consent-confirm-checkbox');
  assert(!!confirmBoxP && confirmBoxP.checked === false,
    'consent default: the confirmation checkbox starts UNCHECKED (never pre-checked)');
  assert(dP.getElementById('consent-accept-btn').disabled === true,
    'consent default: "Accept and meet my Rootling" is disabled until the user confirms');
  const gateEnable = dP.getElementById('memory-gate-enable');
  const gateNotNow = dP.getElementById('memory-gate-notnow');
  assert(!!gateEnable && !!gateNotNow, 'memory gate: both choice buttons exist');
  assert(!gateEnable.hasAttribute('autofocus') && !gateNotNow.hasAttribute('autofocus'),
    'memory gate: NEITHER choice button carries autofocus (no preselected answer)');
  assert(!gateEnable.classList.contains('btn-primary') && !gateNotNow.classList.contains('btn-primary'),
    'memory gate: NEITHER choice button carries the primary/recommended highlight');
  assert(dP.getElementById('memory-gate-heading').textContent.indexOf('remembering') !== -1 &&
    !/cloud|AI companion/i.test(dP.getElementById('memory-gate-heading').textContent),
    'memory gate: heading does not claim the pet is a cloud AI');
  assert(dP.getElementById('memory-gate').textContent.indexOf('The AI can remember details you choose to share in order to provide better support. You remain in control and can view or delete memories at any time.') !== -1,
    'memory gate: Daniel\'s consent sentence appears verbatim');
  /* Policy reachability from all three current surfaces */
  dP.getElementById('privacy-adopt-btn').click();
  assert(dP.getElementById('privacy-view').hidden === false,
    'policy reachable: the adoption-view button opens the Privacy view before adoption');
  dP.getElementById('privacy-close-btn').click();
  assert(dP.getElementById('privacy-view').hidden === true && dP.getElementById('adopt-view').hidden === false,
    'policy reachable: Back returns to the adoption view');
  const dX2 = domX.window.document;
  dX2.getElementById('privacy-toggle').click();
  assert(dX2.getElementById('privacy-view').hidden === false,
    'policy reachable: the Settings "Privacy & your data" button opens the view');
  dX2.getElementById('privacy-close-btn').click();
  assert(dX2.getElementById('privacy-view').hidden === true && dX2.getElementById('main-view').hidden === false,
    'policy reachable: Back from Settings returns to the main view');
  dX2.getElementById('privacy-footer-btn').click();
  assert(dX2.getElementById('privacy-view').hidden === false,
    'policy reachable: the footer support-area button opens the view');
  dX2.getElementById('privacy-close-btn').click();
  /* Policy content: scoped claims only, age line, FUTURE section, 988, placeholders */
  const policyText = dX2.getElementById('privacy-view').textContent;
  assert(/sends nothing from this device/i.test(policyText),
    'policy copy: the no-sending claim is present in its scoped form (this device, as it works today)');
  assert(!UNSCOPED_PRIVACY.some(p => p.test(policyText)),
    'policy copy: no unscoped "everything stays / nothing is sent anywhere" claim in the new policy text');
  assert(policyText.indexOf('Rootling is made for adults and older teens. If you are under 18, please use it with a parent or guardian who knows you are using it.') !== -1,
    'policy copy: the age/guardian line is stated plainly, without pretending a guardian-account system exists');
  /* 2026-10-15 collection rebuild: accounts now exist (Daniel's order) —
   * on this device only. The old FUTURE/optional assertion described the
   * pre-accounts build and was replaced with the new honest wording. */
  assert(/Your account, and what changes with the connected version/.test(policyText) && /lives on this device only/i.test(policyText),
    'policy copy: the accounts section describes on-device accounts honestly, with connected sign-in as a future choice');
  assert(policyText.indexOf('988') !== -1 && /not a medical device/i.test(policyText),
    'policy copy: safety note carries 988 and the not-a-medical-device line');
  assert(policyText.indexOf('Support contact details will appear here once they are set up.') !== -1,
    'policy/dashboard: Contact Support is an honest placeholder — no invented support address');
  assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(policyText),
    'policy/dashboard: no email address (invented or otherwise) appears in the privacy surfaces');
  assert(policyText.indexOf('Your Rootling account lives on this device only') !== -1,
    'dashboard: the honest security line is present (account lives on this device only, never sent anywhere)');
  assert(policyText.indexOf('Analytics: Rootling collects none') !== -1 || dP.getElementById('consent-wizard').textContent.indexOf('Analytics: Rootling collects none. There is no switch, because there is nothing to switch off.') !== -1,
    'consent honesty: analytics is stated as absent (text), never offered as a placebo toggle');
  /* Delete-my-data removes every known key */
  const ALL_DATA_KEYS = ['sprout-state-v1', 'rootling-notifications-v1', 'rootling-persist-requested-v1',
    'rootling-appearance-v1', 'rootling-exec-v1', 'rootling-well-v1', 'rootling-consent-v1'];
  for (const k of ALL_DATA_KEYS) domX.window.localStorage.setItem(k, '{"seeded":true}');
  dX2.getElementById('privacy-toggle').click();
  dX2.getElementById('delete-my-data-btn').click();
  assert(dX2.getElementById('delete-confirm').hidden === false,
    'delete: a plain-words confirm step appears before anything is deleted');
  assert(/cannot be undone/i.test(dX2.getElementById('delete-confirm').textContent),
    'delete: the confirm step says plainly that it cannot be undone');
  dX2.getElementById('delete-confirm-btn').click();
  for (const k of ALL_DATA_KEYS) {
    assert(domX.window.localStorage.getItem(k) === null, 'delete: key removed — ' + k);
  }

  /* ---------- 30. Jargon scan (Daniel usability §§22–36) ----------
   * Scans the shipped UI copy sources (index.html + app.js +
   * notifications.js, whole-file like §18/§20) for banned jargon, with
   * word boundaries so near-misses ("configured") do not false-positive.
   * "leverage" is banned as a verb; the scan flags the word itself —
   * scoping note: no legitimate shipped use of "leverage" exists in
   * this app (checked 2026-10-15), so a bare-word match is safe here. */
  console.log('— 30. Jargon scan: plain words only in shipped copy —');
  const JARGON = [/\bauthentication\b/i, /\bconfiguration\b/i, /\bsynchronization\b/i, /\bsynchronisation\b/i,
    /\bsynchronize[sd]?\b/i, /\bsynchronise[sd]?\b/i, /\boptimization\b/i, /\boptimisation\b/i,
    /\binfrastructure\b/i, /\butilize[sd]?\b/i, /\butilise[sd]?\b/i, /\bleverage[sd]?\b/i, /\bfunctionality\b/i];
  assert(JARGON.some(p => p.test('Please utilize this functionality after configuration and synchronization.')),
    'jargon scan self-test: flags a synthetic jargon sentence');
  assert(!JARGON.some(p => p.test('Your settings are saved. The app is configured the way you chose.')),
    'jargon scan self-test: plain near-miss words (settings/saved/configured) do not false-positive');
  const jargonHits = [];
  [['index.html', html], ['app.js', appJs], ['notifications.js', notifJs]].forEach(([name, text]) => {
    text.split('\n').forEach((line, i) => {
      for (const p of JARGON) if (p.test(line)) jargonHits.push(name + ':' + (i + 1) + ' ' + line.trim().slice(0, 70));
    });
  });
  assert(jargonHits.length === 0, 'no banned jargon in shipped UI copy' + (jargonHits.length ? ' — HITS: ' + jargonHits.join(' | ') : ''));

  console.log('\nQA-SAFETY: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
