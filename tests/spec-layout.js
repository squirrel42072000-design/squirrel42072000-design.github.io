/* Rootling layout + restructure suite (jsdom) — Daniel's 2026-10-15
 * directives: centered 480px column with letterbox + shadow, a fixed
 * centered bottom tab bar, five tabs (Home / Focus / Activities /
 * Companion / Settings & Support), the Train Me hub replacing the long
 * form cards, and the Defect-1 fix (the adopted companion is the one
 * that renders after a true new session).
 *
 * WHAT THE PROXY MEASURES (honest note): jsdom loads no external CSS
 * and does no layout, so CSS is verified as exact shipped stylesheet
 * text (the layout inputs a real browser consumes: max-width, auto
 * margins, letterbox, bounded tab region, fixed centered bar, 56px
 * targets), and behavior is verified on the real DOM with the real
 * scripts: tab membership, exactly-one-tab-visible, bottom-nav
 * switching, Train Me save round-trips against the real stores, and a
 * full-stack adopt → new-session reload for Defect 1.
 *
 * Run:  NODE_PATH=/tmp/rootling-domtest/node_modules node tests/spec-layout.js
 * Exit code 0 = all assertions passed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const src = {};
['accounts.js', 'companions.js', 'app.js', 'notifications.js'].forEach(f => {
  src[f] = fs.readFileSync(path.join(root, f), 'utf8');
});

let failures = 0;
let passes = 0;
function assert(cond, label) {
  if (cond) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 40));

const ADOPTED = JSON.stringify({
  version: 2, petName: 'Pip', form: 'plant', category: 'plants', species: 'Sprout',
  companionPersonality: '', identityLine: '', careStyle: 'balanced', profile: 'companion',
  learningEnabled: false, calmMode: false, pauseScreen: 'blank',
  toggles: { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null },
  createdDate: '2026-10-15', sunshine: 0, checkins: {}, careDays: [], learning: null
});

function makeWindow(seedLs) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  if (seedLs) for (const k of Object.keys(seedLs)) dom.window.localStorage.setItem(k, seedLs[k]);
  dom.window.eval(src['app.js']);
  return dom;
}
function makeFullWindow(seed) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (seed) {
    for (const k of Object.keys(seed.ls || {})) w.localStorage.setItem(k, seed.ls[k]);
    for (const k of Object.keys(seed.ss || {})) w.sessionStorage.setItem(k, seed.ss[k]);
  }
  w.eval(src['accounts.js']); w.eval(src['companions.js']); w.eval(src['app.js']); w.eval(src['notifications.js']);
  return dom;
}
function dump(w) {
  const ls = {}, ss = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); ls[k] = w.localStorage.getItem(k); }
  for (let i = 0; i < w.sessionStorage.length; i++) { const k = w.sessionStorage.key(i); ss[k] = w.sessionStorage.getItem(k); }
  return { ls, ss };
}
function gated(d, id) {
  const el = d.getElementById(id);
  return !!el && el.classList.contains('view-gated');
}
function visible(d, id) {
  const el = d.getElementById(id);
  return !!el && !el.classList.contains('view-gated') && !el.hidden;
}

(async function main() {
  /* ---------- CSS: the layout inputs ---------- */
  console.log('— CSS layout inputs —');
  assert(/main\s*\{[^}]*max-width:\s*480px/.test(css), 'container max-width is 480px in shipped CSS');
  assert(/main\s*\{[^}]*margin:\s*0 auto/.test(css), 'container is centered with margin 0 auto in shipped CSS');
  assert(/main\s*\{[^}]*box-shadow:\s*0 0 24px rgba\(0,0,0,0\.06\)/.test(css), 'container carries the soft frame shadow');
  assert(/body\s*\{[^}]*min-height:\s*100dvh/.test(css) && /body\s*\{[^}]*background-color:\s*var\(--cream\)/.test(css),
    'body letterboxes at min-height 100dvh in the app surface tone');
  assert(/#main-view\s*\{[^}]*max-height:\s*calc\(100dvh - 64px\)/.test(css) && /#main-view\s*\{[^}]*overflow-y:\s*auto/.test(css),
    'tab region is bounded to calc(100dvh - 64px) with internal scroll only');
  assert(/\.tab-bar\s*\{[^}]*position:\s*fixed/.test(css) && /\.tab-bar\s*\{[^}]*left:\s*50%/.test(css)
    && /\.tab-bar\s*\{[^}]*transform:\s*translateX\(-50%\)/.test(css) && /\.tab-bar\s*\{[^}]*max-width:\s*480px/.test(css),
    'bottom tab bar is fixed, centered with the column, max-width 480px');
  assert(/\.tab-btn\s*\{[^}]*min-height:\s*56px/.test(css), 'tab buttons are at least 56px tall');

  /* ---------- Tabs: membership, one visible, bottom-nav switching ---------- */
  console.log('— Tabs —');
  const dom = makeWindow({ 'sprout-state-v1': ADOPTED });
  const w = dom.window, d = w.document;
  await tick();
  const bar = d.getElementById('tab-bar');
  assert(!!bar, 'bottom tab bar exists');
  const btns = [...d.querySelectorAll('.tab-btn')];
  assert(btns.length === 5, 'exactly five tab buttons');
  assert(JSON.stringify(btns.map(b => b.getAttribute('data-nav-view'))) === JSON.stringify(['home', 'focus', 'activities', 'companion', 'support']),
    'tabs in Daniel’s order: Home, Focus, Activities, Companion, Settings');
  const labels = btns.map(b => b.textContent.trim());
  assert(labels[0].indexOf('Home') !== -1 && labels[1].indexOf('Focus') !== -1 && labels[2].indexOf('Activities') !== -1
    && labels[3].indexOf('Companion') !== -1 && labels[4].indexOf('Settings') !== -1,
    'every tab button carries a visible text label');
  assert(btns[1].getAttribute('aria-label') === 'Focus and Tasks' && btns[4].getAttribute('aria-label') === 'Settings and Support',
    'full tab names are the accessible labels');

  /* Membership per Daniel's map */
  const petCard = d.querySelector('.pet-card');
  assert(petCard.getAttribute('data-view') === 'home' && d.getElementById('today-card').getAttribute('data-view') === 'home'
    && d.querySelector('.checkins').getAttribute('data-view') === 'home', 'HOME holds pet card + Today’s one thing + check-ins only');
  assert(d.getElementById('exec-view').getAttribute('data-view') === 'focus' && d.getElementById('grounding-card').getAttribute('data-view') === 'focus',
    'FOCUS holds the timer/tasks view + grounding card');
  assert(d.getElementById('time-view').getAttribute('data-view') === 'activities' && d.getElementById('adventures-card').getAttribute('data-view') === 'activities',
    'ACTIVITIES holds the activity picker + adventures');
  assert(d.getElementById('companions-view').getAttribute('data-view') === 'companion'
    && d.getElementById('train-view').getAttribute('data-view') === 'companion',
    'COMPANION holds the collection + Train Me hub (daily gift resolves to it via its parent, checked below)');
  assert(d.getElementById('companions-view').contains(d.getElementById('daily-gift'))
    && d.getElementById('companions-view').contains(d.getElementById('growth-text')),
    'daily gift and the growth detail live inside the Companion tab');
  assert(petCard.contains(d.getElementById('streak-count')) && !petCard.contains(d.getElementById('growth-text')),
    'Home pet card keeps avatar, message and day streak; growth detail moved out');
  assert(d.getElementById('safety-view').getAttribute('data-view') === 'support'
    && d.getElementById('support-open-row').getAttribute('data-view') === 'support'
    && d.getElementById('account-card').getAttribute('data-view') === 'support',
    'SETTINGS & SUPPORT holds the safety view, its opener row and the settings block');
  /* DIRECTED EDIT (2026-10-15): Daniel removed the redundant support
   * bar card; only the opener button remains, with its id and wiring. */
  assert(!d.getElementById('well-safety-bar'), 'the redundant support bar card is gone');
  assert(!!d.getElementById('well-safety-open') && d.getElementById('support-open-row').contains(d.getElementById('well-safety-open')),
    'the “I need support now” opener survives, standing alone at the top of the tab');
  ['well-dayplan-card', 'well-routines-card', 'well-feelings-card', 'well-worry-card', 'well-journal-card',
   'well-unsent-card', 'well-sensory-card', 'well-mute-card', 'social-view', 'memory-about-name-input']
    .forEach(id => assert(!d.getElementById(id), 'removed from the page flow: #' + id));
  assert(!d.querySelector('.dash-actions') && !d.querySelector('.quick-actions'), 'the old stacked nav blocks stay removed');

  /* Exactly one tab visible; switching works from the bottom bar */
  const PRIMARY = { home: 'today-card', focus: 'exec-view', activities: 'adventures-card', companion: 'companions-view', support: 'support-open-row' };
  const ALL = Object.values(PRIMARY);
  function onlyShown(name) {
    return ALL.every(id => (id === PRIMARY[name]) === visible(d, id));
  }
  assert(onlyShown('home'), 'on load, only the Home tab’s primary block is shown');
  for (const name of ['focus', 'activities', 'companion', 'support', 'home']) {
    d.querySelector('[data-nav-view="' + name + '"]').click();
    assert(onlyShown(name), 'bottom-nav tap shows only the ' + name + ' tab');
    assert(d.querySelector('[data-nav-view="' + name + '"]').getAttribute('aria-current') === 'page',
      'aria-current marks the ' + name + ' tab');
    assert(w.RootlingNav.current() === name, 'RootlingNav.current() reports ' + name);
  }
  assert(bar.hidden === false, 'tab bar is visible once a companion is adopted');

  /* Support reach: 988 within 2 taps from any tab (bar tap + open) */
  d.querySelector('[data-nav-view="home"]').click();
  d.querySelector('[data-nav-view="support"]').click();
  d.getElementById('well-safety-open').click();
  assert(visible(d, 'safety-view') && d.getElementById('safety-view').textContent.indexOf('988') !== -1,
    'support tab + one tap opens the safety view with the 988 line');

  /* Reveal crosses tabs (Help "Show me" path). The grounding card keeps
   * its own hidden state until opened; reveal must un-gate it and land
   * on its tab. */
  d.querySelector('[data-nav-view="home"]').click();
  w.RootlingNav.reveal(d.getElementById('grounding-card'));
  assert(w.RootlingNav.current() === 'focus' && !gated(d, 'grounding-card'),
    'reveal() switches to the target’s tab and un-gates it (grounding → Focus)');

  /* ---------- Train Me: Q&A save round-trips ---------- */
  console.log('— Train Me —');
  assert(!!w.RootlingTrain && w.RootlingTrain.topics.length >= 12, 'Train Me exposes its topic cycle (' + (w.RootlingTrain ? w.RootlingTrain.topics.length : 0) + ' topics)');
  d.querySelector('[data-train-topic="worry"]').click();
  assert(d.getElementById('train-q').textContent.indexOf('worry') !== -1, 'the pet asks one small question');
  d.getElementById('train-answer').value = 'The dentist bill';
  d.getElementById('train-save').click();
  await tick();
  let well = JSON.parse(w.localStorage.getItem('rootling-well-v1'));
  assert(well.worries.length === 1 && well.worries[0].text === 'The dentist bill' && well.worries[0].state === 'parked'
    && well.worries[0].note === '' && typeof well.worries[0].parkedAt === 'string',
    'worry answer saves into rootling-well-v1 with the exact shape the old form wrote');
  d.querySelector('[data-train-show="worries"]').click();
  assert(d.getElementById('train-list').textContent.indexOf('The dentist bill') !== -1, 'Show my worries lists the saved worry');
  d.querySelector('[data-train-topic="journal"]').click();
  d.getElementById('train-answer').value = 'A quiet morning.';
  d.getElementById('train-save').click();
  well = JSON.parse(w.localStorage.getItem('rootling-well-v1'));
  assert(well.journal.length === 1 && well.journal[0].text === 'A quiet morning.'
    && JSON.stringify(Object.keys(well.journal[0]).sort()) === JSON.stringify(['date', 'id', 'text']),
    'journal answer saves with exactly the old entry keys (id, date, text)');
  d.querySelector('[data-train-show="journal"]').click();
  assert(d.getElementById('train-list').textContent.indexOf('A quiet morning.') !== -1, 'Show my journal lists the entry');
  /* Skipping everything is possible and costs nothing */
  let guard = 0;
  while (d.getElementById('train-q').textContent.indexOf('That is all for now') === -1 && guard < 40) {
    d.getElementById('train-skip').click(); guard++;
  }
  assert(d.getElementById('train-q').textContent.indexOf('That is all for now') !== -1,
    'skipping through every topic reaches the gentle end — nothing forced');
  d.querySelector('[data-train-topic="dayplan"]').click();
  d.getElementById('train-later').click();
  assert(d.getElementById('train-q').textContent.indexOf('We can stop here') !== -1, 'Later stops the questions at any point');

  /* ---------- Sensory + appearance settings: set → apply → persist ----------
   * Regression for Daniel's 2026-10-15 report ("sensory settings are
   * ignored"): every pick must write its store AND take effect in the
   * DOM at once, and still be in effect after a reload. The live fault
   * was a stale service-worker shell (cache-first forever); sw.js is
   * now network-first for the shell and bumped to rootling-v7 — the
   * last two assertions pin both. */
  console.log('— Sensory + appearance settings —');
  const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  var swVer = (swJs.match(/var CACHE_VERSION = 'rootling-v(\d+)'/) || [])[1];
  assert(swVer && +swVer >= 18, 'service worker cache is bumped to rootling-v18 or later (found v' + swVer + ')');
  assert(/req\.mode === 'navigate' \|\| SHELL_PATHS/.test(swJs), 'service worker serves page loads + shell files network-first (stale shells cannot stick)');
  const dS = d; /* the adopted window from the tab tests above */
  dS.getElementById('calm-checkbox').click();
  assert(dS.body.classList.contains('calm'), 'Sensory calm mode applies at once (body takes the calm palette class)');
  assert(JSON.parse(w.localStorage.getItem('sprout-state-v1')).calmMode === true, 'calm mode is written to the pet store');
  const themeSel = dS.getElementById('appearance-theme');
  themeSel.value = 'dark';
  themeSel.dispatchEvent(new w.Event('change', { bubbles: true }));
  const sizeSel = dS.getElementById('appearance-text-size');
  sizeSel.value = 'xlarge';
  sizeSel.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert(dS.documentElement.getAttribute('data-theme') === 'dark', 'Colours pick applies at once (html data-theme="dark")');
  assert(dS.documentElement.getAttribute('data-text-size') === 'xlarge', 'Word size pick applies at once (html data-text-size)');
  const appStore = JSON.parse(w.localStorage.getItem('rootling-appearance-v1'));
  assert(appStore.theme === 'dark' && appStore.textSize === 'xlarge', 'appearance picks are written to rootling-appearance-v1');
  const carryS = { 'sprout-state-v1': w.localStorage.getItem('sprout-state-v1'), 'rootling-appearance-v1': w.localStorage.getItem('rootling-appearance-v1') };
  const domS2 = makeWindow(carryS);
  const wS2 = domS2.window, dS2 = wS2.document;
  await tick();
  assert(dS2.body.classList.contains('calm') && dS2.getElementById('calm-checkbox').checked === true,
    'after reload: calm mode is still applied and the checkbox still shows it');
  assert(dS2.documentElement.getAttribute('data-theme') === 'dark' && dS2.documentElement.getAttribute('data-text-size') === 'xlarge',
    'after reload: colour + word size are still applied to the page');
  assert(dS2.getElementById('appearance-theme').value === 'dark' && dS2.getElementById('appearance-text-size').value === 'xlarge',
    'after reload: the settings controls show the saved picks');

  /* ---------- Defect 1: the adopted companion renders ---------- */
  console.log('— Defect 1 acceptance —');
  let fdom = makeFullWindow(null); let fw = fdom.window, fd = fw.document;
  await tick(80);
  [...fd.querySelectorAll('.gate-btn')].find(b => b.textContent === 'Create Account').click();
  await tick(30);
  fd.getElementById('gate-name').value = 'Daniel';
  fd.getElementById('gate-email').value = 'daniel@example.com';
  fd.getElementById('gate-password').value = 'hunter2x';
  [...fd.querySelectorAll('.gate-btn')].find(b => b.textContent === 'Create Account').click();
  await tick(150);
  let store = dump(fw);
  fdom = makeFullWindow(store); fw = fdom.window; fd = fw.document;
  await tick(80);
  fd.querySelector('[data-personality="friendly"]').click();
  fd.querySelector('[data-category="pets"]').click();
  await tick(30);
  fd.querySelector('[data-species="Dog"]').click();
  fd.getElementById('pet-name-input').value = 'launch';
  fd.getElementById('adopt-form').dispatchEvent(new fw.Event('submit', { bubbles: true, cancelable: true }));
  await tick(80);
  fd.getElementById('adopt-another-btn').click();
  await tick(30);
  store = dump(fw);
  fdom = makeFullWindow(store); fw = fdom.window; fd = fw.document;
  await tick(80);
  fd.querySelector('[data-personality="scholar"]').click();
  fd.querySelector('[data-category="plants"]').click();
  await tick(30);
  fd.querySelector('[data-species="Bonsai"]').click();
  fd.getElementById('pet-name-input').value = 'Real Friend';
  fd.getElementById('adopt-form').dispatchEvent(new fw.Event('submit', { bubbles: true, cancelable: true }));
  await tick(80);
  store = dump(fw);
  /* A TRUE new session: localStorage only, sessionStorage empty. */
  fdom = makeFullWindow({ ls: store.ls, ss: {} }); fw = fdom.window; fd = fw.document;
  await tick(80);
  assert(fd.getElementById('pet-name-display').textContent === 'Real Friend',
    'new session renders the adopted companion’s name, never the earlier test pet');
  assert(fd.getElementById('pet-identity-line').textContent.indexOf('bonsai') !== -1,
    'new session renders the adopted companion’s species + personality line');
  const stateKey = Object.keys(store.ls).find(k => k === 'sprout-state-v1' || k.indexOf(':sprout-state-v1') !== -1);
  const prefix = stateKey === 'sprout-state-v1' ? '' : stateKey.split(':').slice(0, 2).join(':') + ':';
  const reg = JSON.parse(store.ls[prefix + 'rootling-companions-v1']);
  const main = reg.companions.filter(c => c.isMain);
  assert(main.length === 1 && main[0].name === 'Real Friend', 'the registry holds exactly one main: the adopted companion');

  console.log('\nSPEC-LAYOUT: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
