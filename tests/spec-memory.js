/* Rootling SPEC-MEMORY suite (jsdom) — Memory & Personalization worker.
 * Covers the Memory Book: the consent-aware shell, the memories
 * dashboard (what / why / updated, importance in plain words, the
 * 30-day fade notice for 'right now' items), the noticed-vs-kept
 * split, keepsakes filed only from real data, gentle notes backed by
 * real counts, About-you words with full user control, tidy
 * suggestions that wait for the user's tap, pet personalities that
 * apply once at pick time, and the date/type index.
 *
 * Run:  NODE_PATH=/tmp/rootling-domtest/node_modules node tests/spec-memory.js
 * Exit code 0 = all assertions passed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
/* B4: pin both clocks (Node + each jsdom window) to a safe local
 * midday before anything reads the time — see tests/test-clock.js.
 * The day-relative helpers below (daysAgo, dayKey(new Date()), the
 * ISO "updated" stamps) then mean the same thing at any hour the
 * suite runs, without weakening any assertion. */
const testClock = require('./test-clock');
testClock.installNode();

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CORE_KEY = 'sprout-state-v1';
const CONSENT_KEY = 'rootling-consent-v1';
const MB_KEY = 'rootling-memorybook-v1';
const EXEC_KEY = 'rootling-exec-v1';
const TIME_KEY = 'rootling-time-v1';
const SOCIAL_KEY = 'rootling-social-v1';

let failures = 0;
let passes = 0;
function assert(cond, label) {
  if (cond) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}
const tick = () => new Promise(r => setTimeout(r, 40));

function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }
function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); }
function freshLearning(log) {
  return {
    signals: { byType: {}, byHour: {}, restDays: 0, careDaysSeen: 0, calmUsed: 0, groundingUsed: 0, daysObserved: 0, countedShown: {}, countedDone: {}, skippedDays: {}, settledDays: {}, lastObservedDate: '' },
    adaptations: { demandLevel: null, microTypes: {}, promptStyle: null, bestHour: null, suggestGrounding: false, celebrateBoost: false },
    log: log || []
  };
}
function coreSeed(extra) {
  const base = { petName: 'Pip', form: 'plant', profile: 'companion', learningEnabled: true, createdDate: '', checkins: {}, careDays: [], learning: freshLearning() };
  return JSON.stringify(Object.assign(base, extra || {}));
}
function consentOn() { return JSON.stringify({ version: 1, date: new Date().toISOString(), completed: true, memoryConsent: true, choices: {} }); }
function makeDom(seed) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  if (seed) for (const k of Object.keys(seed)) dom.window.localStorage.setItem(k, seed[k]);
  testClock.installWindow(dom.window);
  dom.window.eval(appJs);
  return dom;
}
const mb = (dom) => JSON.parse(dom.window.localStorage.getItem(MB_KEY));
const bookText = (dom) => dom.window.document.getElementById('memory-book').textContent;
function findRow(dom, text) {
  const lis = dom.window.document.querySelectorAll('#memory-book li');
  for (let i = 0; i < lis.length; i++) if (lis[i].textContent.indexOf(text) !== -1) return lis[i];
  return null;
}
function snapshot(dom) {
  const out = {};
  const ls = dom.window.localStorage;
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); out[k] = ls.getItem(k); }
  return out;
}

(async function main() {
  /* ---------- 1. Consent off: honest shell, zero personalised content ---------- */
  console.log('— 1. Consent off —');
  const seededBook = JSON.stringify({ version: 1, personality: 'Friendly', about: [{ id: 'a1', kind: 'interest', text: 'Secret hobby words', why: 'So your pet can pick things you like.', updated: daysAgo(1), importance: 4, scope: 'later' }], keepsakes: [], kept: [], index: [] });
  const domOff = makeDom({
    [CORE_KEY]: coreSeed(),
    [MB_KEY]: seededBook,
    [TIME_KEY]: JSON.stringify({ prefs: [{ kind: 'preference', what: 'Hidden pref words', why: 'You picked this often', updated: new Date().toISOString() }] }),
    [EXEC_KEY]: JSON.stringify({ priority: 'Hidden pin words', focusHistory: Array.from({ length: 10 }, () => ({ startedAt: Date.now() })) }),
    [SOCIAL_KEY]: JSON.stringify({ brave: [{ id: 'b1', day: daysAgo(2), text: 'Hidden brave words' }] })
    /* no consent record at all */
  });
  await tick();
  const dOff = domOff.window.document;
  assert(dOff.getElementById('memory-off-panel').hidden === false, 'consent off: the off panel shows');
  assert(dOff.getElementById('memory-on-panel').hidden === true, 'consent off: the book panel stays hidden');
  assert(bookText(domOff).indexOf("Your pet's memory is off. When you turn memory on, this book will keep your keepsakes and the things your pet remembers, where you can see them.") !== -1,
    'consent off: the plain off words show, word for word');
  assert(bookText(domOff).indexOf('Secret hobby words') === -1 && bookText(domOff).indexOf('Hidden pref words') === -1 &&
    bookText(domOff).indexOf('Hidden pin words') === -1 && bookText(domOff).indexOf('Hidden brave words') === -1,
    'consent off: no memory, pick, pin or keepsake renders even though other stores hold data');
  assert(mb(domOff).keepsakes.length === 0, 'consent off: no keepsake is filed in the background');
  assert(!!dOff.getElementById('memory-how-btn') && dOff.getElementById('memory-how-btn').textContent === 'How memory works',
    'consent off: the How memory works button is there');

  /* ---------- 2. Consent on: rows carry what / why / updated ---------- */
  console.log('— 2. Consent on: dashboard rows —');
  const dom = makeDom({
    [CORE_KEY]: coreSeed({ learning: freshLearning([{ date: daysAgo(3), text: 'Prompts now use the same clear wording each day.' }]) }),
    [CONSENT_KEY]: consentOn(),
    [TIME_KEY]: JSON.stringify({ prefs: [
      { kind: 'preference', what: 'Likes long walks', why: 'You picked this often', updated: new Date().toISOString() },
      /* USER TEST #9 regression (B4): a timestamp is an instant, so
       * its day label must be the user's LOCAL day for that instant.
       * This stamp's string date (2026-10-14, at -04:00) is NOT its
       * local day in a UTC-run harness (2026-10-15) — the old
       * slice-the-string rendering showed the string date. */
      { kind: 'preference', what: 'Likes early walks', why: 'You picked this often', updated: '2026-10-14T23:30:00-04:00' },
      /* Paired stamp (QA follow-up): a small-hours UTC stamp, whose
       * local day in timezones west of UTC is the day BEFORE its
       * string date. One of this pair discriminates in every
       * timezone; the other is non-discriminating but still true. */
      { kind: 'preference', what: 'Likes quiet mornings', why: 'You picked this often', updated: '2026-10-15T03:30:00.000Z' }
    ] }),
    [EXEC_KEY]: JSON.stringify({ priority: 'Book the dentist', parked: [], events: [], breakdowns: [] })
  });
  await tick();
  const d = dom.window.document;
  assert(d.getElementById('memory-off-panel').hidden === true && d.getElementById('memory-on-panel').hidden === false,
    'consent on: the book opens and the off panel hides');
  const prefRow = findRow(dom, 'Likes long walks');
  assert(!!prefRow, 'consent on: the pick from the time store shows as a row');
  assert(prefRow && prefRow.textContent.indexOf('You picked this often') !== -1, 'the pick row says why it is here');
  assert(prefRow && prefRow.textContent.indexOf(dayKey(new Date())) !== -1, 'the pick row shows its updated date');
  const earlyRow = findRow(dom, 'Likes early walks');
  const earlyLocalDay = dayKey(new Date('2026-10-14T23:30:00-04:00'));
  assert(!!earlyRow && earlyRow.textContent.indexOf(earlyLocalDay) !== -1,
    'a timestamp row shows the local day for that instant, not the date written in the stamp (USER TEST #9)');
  const quietRow = findRow(dom, 'Likes quiet mornings');
  const quietLocalDay = dayKey(new Date('2026-10-15T03:30:00.000Z'));
  assert(!!quietRow && quietRow.textContent.indexOf(quietLocalDay) !== -1,
    'a small-hours UTC stamp also shows its local day, not its string date (USER TEST #9, paired stamp)');
  assert(d.getElementById('memory-noticed-list').textContent.indexOf('Likes long walks') !== -1,
    'picks sit in the Your pet noticed these group');
  assert(d.getElementById('memory-noticed-list').textContent.indexOf('Prompts now use the same clear wording') !== -1,
    'a learning fact shows in the noticed group too');
  const factRow = findRow(dom, 'Prompts now use the same clear wording');
  assert(factRow && factRow.textContent.indexOf('Your pet noticed this from your check-ins') !== -1 && factRow.textContent.indexOf(daysAgo(3)) !== -1,
    'the fact row carries its fixed why line and its own date');
  assert(factRow && !!factRow.querySelector('[data-mb-forget-learned]') &&
    factRow.querySelector('[data-mb-forget-learned]').textContent === 'Forget in What your companion has learned',
    'the fact row routes Forget to the Learned view controls');
  assert(d.getElementById('memory-now-list').textContent.indexOf('Book the dentist') !== -1 &&
    d.getElementById('memory-now-list').textContent.indexOf('You pinned this') !== -1,
    'the pinned one thing shows in Right now with its why line');

  /* ---------- 3. Importance: plain words, changeable in Edit ---------- */
  console.log('— 3. Importance in plain words —');
  const domImp = makeDom({
    [CORE_KEY]: coreSeed(),
    [CONSENT_KEY]: consentOn(),
    [MB_KEY]: JSON.stringify({ version: 1, personality: 'Friendly', about: [{ id: 'imp1', kind: 'interest', text: 'Board games', why: 'So your pet can pick things you like.', updated: daysAgo(2), importance: 4, scope: 'later' }], keepsakes: [], kept: [], index: [] })
  });
  await tick();
  const impRow = findRow(domImp, 'Board games');
  assert(impRow && impRow.textContent.indexOf('How much it matters: Important') !== -1,
    'importance 4 renders as the word Important');
  assert(impRow && !/How much it matters: \d/.test(impRow.textContent),
    'no bare number is shown as the importance label');
  impRow.querySelector('[data-mb-edit]').click();
  await tick();
  const impRow2 = findRow(domImp, 'Board games');
  const impSel = impRow2.querySelector('[data-mb-edit-importance]');
  assert(!!impSel && [...impSel.options].every(o => Number.isNaN(Number(o.textContent)) || o.textContent.trim() === ''),
    'the Edit importance choices are words, not numbers');
  impSel.value = '2';
  impRow2.querySelector('[data-mb-edit-save]').click();
  await tick();
  assert(mb(domImp).about[0].importance === 2, 'Edit saves the new importance level');
  assert(findRow(domImp, 'Board games').textContent.indexOf('How much it matters: Small') !== -1,
    'the row now reads Small');

  /* ---------- 4. About-you: add, edit, delete, reload ---------- */
  console.log('— 4. About-you words —');
  const domA = makeDom({ [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn() });
  await tick();
  const dA = domA.window.document;
  /* DIRECTED EDIT (2026-10-15 restructure): the About-you form left the
   * memory book; the pet now asks in the Train Me hub (Companion tab).
   * The answers write the same store with the same shape, and the book
   * still lists, edits, and deletes them below. */
  dA.querySelector('[data-train-topic="about-name"]').click();
  dA.getElementById('train-answer').value = 'Sunny';
  dA.getElementById('train-save').click();
  await tick();
  assert(mb(domA).about.length === 1 && mb(domA).about[0].kind === 'name' && mb(domA).about[0].text === 'Sunny',
    'the name you like is saved in the book store');
  assert(mb(domA).about[0].importance === 4 && mb(domA).about[0].why === 'So your pet can use the name you like.',
    'a name starts at Important with its fixed why line');
  assert(dA.getElementById('memory-book-heading').textContent === "Sunny's Memory Book",
    'the liked name heads this book, and only this book');
  dA.querySelector('[data-train-topic="about-interest"]').click();
  dA.getElementById('train-answer').value = 'Drawing cats';
  dA.getElementById('train-save').click();
  await tick();
  const idxAfterAdds = mb(domA).index;
  assert(idxAfterAdds.length >= 2 && idxAfterAdds.every(e => e.d === dayKey(new Date()) && (e.t === 'memory' || e.t === 'keepsake')),
    'index entries are added with a date and a type on each add');
  const catRow = findRow(domA, 'Drawing cats');
  catRow.querySelector('[data-mb-edit]').click();
  await tick();
  const catRow2 = findRow(domA, 'Drawing cats');
  catRow2.querySelector('[data-mb-edit-text]').value = 'Drawing dogs';
  catRow2.querySelector('[data-mb-edit-save]').click();
  await tick();
  assert(mb(domA).about.some(i => i.text === 'Drawing dogs') && !mb(domA).about.some(i => i.text === 'Drawing cats'),
    'Edit changes the saved words');
  const domA2 = makeDom(snapshot(domA));
  await tick();
  assert(findRow(domA2, 'Drawing dogs') !== null, 'the edited words are still there after a reload');
  const dogRow = findRow(domA2, 'Drawing dogs');
  dogRow.querySelector('[data-mb-del]').click();
  await tick();
  findRow(domA2, 'Drawing dogs').querySelector('[data-mb-del-yes]').click();
  await tick();
  assert(!mb(domA2).about.some(i => i.text === 'Drawing dogs'), 'Delete, with its plain confirm, takes the words out');

  /* ---------- 5. Keepsakes from real data only ---------- */
  console.log('— 5. Keepsakes —');
  const focusHist = Array.from({ length: 10 }, (_, i) => ({ startedAt: new Date(2026, 9, 10, 14, i).getTime() }));
  const domK = makeDom({
    [CORE_KEY]: coreSeed({ createdDate: daysAgo(9) }),
    [CONSENT_KEY]: consentOn(),
    [EXEC_KEY]: JSON.stringify({ priority: '', parked: [], events: [], breakdowns: [], focusHistory: focusHist })
  });
  await tick();
  const keeps = mb(domK).keepsakes;
  const focusKeep = keeps.find(k => k.kind === 'focus-10');
  assert(!!focusKeep && focusKeep.text.indexOf('10') !== -1, 'ten focus times in the store file the 10 keepsake, with the true count in its words');
  assert(keeps.some(k => k.kind === 'first-day' && k.text.indexOf('Your first day with Pip') !== -1 && k.date === daysAgo(9)),
    'the first day keepsake uses the real first date and the pet name');
  assert(domK.window.document.getElementById('memory-keepsakes-list').textContent.indexOf('You finished 10 focus times.') !== -1,
    'the keepsake shows in the book');
  const domNone = makeDom({ [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn(), [EXEC_KEY]: JSON.stringify({ priority: '', parked: [], events: [], breakdowns: [] }) });
  await tick();
  const noneRaw = domNone.window.localStorage.getItem(MB_KEY);
  assert((!noneRaw || JSON.parse(noneRaw).keepsakes.length === 0) && domNone.window.document.getElementById('memory-keepsakes-list').textContent === '',
    'no keepsake is filed when the data does not back one up');
  const dK = domK.window.document;
  dK.getElementById('memory-keepsake-input').value = 'The sun came out at lunch.';
  dK.getElementById('memory-keepsake-add').click();
  await tick();
  const userKeep = mb(domK).keepsakes.find(k => k.source === 'user');
  assert(!!userKeep && userKeep.text === 'The sun came out at lunch.', 'a good moment you add is kept in your own words');
  assert(domK.window.document.getElementById('memory-keepsakes-list').textContent.indexOf('Your words') !== -1,
    'your keepsake is labelled as your words');
  assert(mb(domK).index.some(e => e.t === 'keepsake' && e.d === dayKey(new Date())), 'the index gains a keepsake entry with date and type');

  /* ---------- 6. Gentle notes: real counts, shown with their source ---------- */
  console.log('— 6. Gentle notes —');
  const domBelow = makeDom({
    [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn(),
    [TIME_KEY]: JSON.stringify({ categoryCounts: { Nature: 2 }, actions: [], prefs: [] })
  });
  await tick();
  assert(domBelow.window.document.getElementById('memory-obs-list').textContent === '' &&
    domBelow.window.document.getElementById('memory-obs-empty').hidden === false,
    'below the count, no note shows and the plain empty line shows');
  const domObs = makeDom({
    [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn(),
    [TIME_KEY]: JSON.stringify({
      categoryCounts: { Nature: 6 },
      actions: [{ date: daysAgo(20), category: 'Nature' }, { date: daysAgo(4), category: 'Nature' }],
      prefs: []
    })
  });
  await tick();
  const dObs = domObs.window.document;
  assert(dObs.getElementById('memory-obs-list').textContent.indexOf('I noticed you enjoy being outside.') !== -1,
    'at the count, the note shows, in plain words');
  const obsLi = dObs.querySelector('#memory-obs-list li');
  obsLi.querySelector('[data-mb-obs-src]').click();
  await tick();
  const src = dObs.querySelector('[data-mb-obs-source]');
  assert(!!src && src.textContent.indexOf('6') !== -1 && src.textContent.indexOf(daysAgo(20)) !== -1,
    'See where this comes from shows the true count and the first date');
  assert(bookText(domObs).indexOf('Your pet only says these when your own book backs them up.') !== -1,
    'the fixed line under the notes is there');

  /* ---------- 7. No growth verdicts in the book ---------- */
  console.log('— 7. No verdicts about the person —');
  const moduleSrc = appJs.slice(appJs.indexOf('Memory Book module'), appJs.indexOf('RootlingMemory'));
  const lowText = (bookText(domObs) + ' ' + moduleSrc).toLowerCase();
  assert(lowText.indexOf('more confident') === -1 && lowText.indexOf('you have grown') === -1 && lowText.indexOf('improved yourself') === -1,
    'no growth verdict words appear in the rendered book or the module words');

  /* ---------- 8. Personalities: bundle once, your later pick wins ---------- */
  console.log('— 8. Pet personalities —');
  const domP = makeDom({ [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn() });
  await tick();
  const dP = domP.window.document;
  assert(!!dP.getElementById('personality-fieldset') && !!dP.getElementById('personality-select'),
    'the personality pick sits in the settings card');
  assert(bookText(domP).indexOf('%') === -1 && dP.getElementById('memory-book').textContent.indexOf('%') === -1,
    'no percent sign renders in the book');
  const calls = [];
  const stubState = { toggles: { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null } };
  domP.window.RootlingApp = {
    getState: () => stubState,
    setToggle: (st, axis, value) => { calls.push([axis, value]); st.toggles[axis] = value; return true; },
    effectiveConfig: () => ({})
  };
  const sel = dP.getElementById('personality-select');
  sel.value = 'Calm';
  sel.dispatchEvent(new domP.window.Event('change', { bubbles: true }));
  await tick();
  assert(JSON.stringify(calls) === JSON.stringify([['celebration', 'quiet'], ['promptVariety', 'fixed'], ['petEnergy', 'still']]),
    'picking Calm sets its three tone picks through the app pick helper');
  assert(mb(domP).personality === 'Calm', 'the pick is saved in the book store');
  domP.window.RootlingApp.setToggle(stubState, 'celebration', 'full');
  const callsBefore = calls.length;
  domP.window.RootlingMemory.render();
  await tick();
  assert(stubState.toggles.celebration === 'full' && calls.length === callsBefore,
    'a later pick of your own still wins after the book draws again — the bundle runs only at pick time');

  /* ---------- 9. Tidy: old items wait for your tap ---------- */
  console.log('— 9. Tidy ideas —');
  const domT = makeDom({
    [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn(),
    [MB_KEY]: JSON.stringify({ version: 1, personality: 'Friendly', about: [
      { id: 'old1', kind: 'interest', text: 'Very old hobby', why: 'So your pet can pick things you like.', updated: daysAgo(200), importance: 4, scope: 'later' },
      { id: 'new1', kind: 'interest', text: 'Fresh hobby', why: 'So your pet can pick things you like.', updated: daysAgo(10), importance: 4, scope: 'later' }
    ], keepsakes: [], kept: [], index: [] })
  });
  await tick();
  const dT = domT.window.document;
  assert(dT.getElementById('memory-tidy-wrap').hidden === false, 'the tidy group shows when an item is old');
  const tidyText = dT.getElementById('memory-tidy-list').textContent;
  assert(tidyText.indexOf('Very old hobby') !== -1 && tidyText.indexOf('Fresh hobby') === -1,
    'only the old item is in the tidy group');
  assert(mb(domT).about.length === 2, 'nothing is taken away on its own — the old item is still in the store');
  const tidyRow = findRow(domT, 'Very old hobby');
  const tidyLi = [...dT.querySelectorAll('#memory-tidy-list li')].find(li => li.textContent.indexOf('Very old hobby') !== -1);
  assert(!!tidyLi, 'the tidy row is there to tap');
  tidyLi.querySelector('[data-mb-tidy-forget]').click();
  await tick();
  assert(mb(domT).about.length === 1 && mb(domT).about[0].text === 'Fresh hobby',
    'Forget in the tidy group takes out only that item, on your tap');

  /* ---------- 10. The 30-day fade for Right now items ---------- */
  console.log('— 10. Right now fade —');
  const domF = makeDom({
    [CORE_KEY]: coreSeed(), [CONSENT_KEY]: consentOn(),
    [MB_KEY]: JSON.stringify({ version: 1, personality: 'Friendly', about: [
      { id: 'now1', kind: 'interest', text: 'Short term thing', why: 'So your pet can pick things you like.', updated: daysAgo(31), importance: 3, scope: 'now' }
    ], keepsakes: [], kept: [], index: [] })
  });
  await tick();
  const dF = domF.window.document;
  assert(mb(domF).about.length === 1, 'a 31-day-old Right now item is still there on load — nothing fades away on its own');
  const fade = dF.querySelector('[data-mb-fade]');
  assert(!!fade && fade.textContent.indexOf('This was a \'right now\' memory from ' + daysAgo(31)) !== -1 &&
    fade.textContent.indexOf('It fades after 30 days unless you keep it.') !== -1,
    'the fade note shows with the true date');
  assert(bookText(domF).indexOf("'Right now' memories fade after 30 days unless you keep them. 'Kept for later' memories stay until you delete them.") !== -1,
    'the book carries the fade rule in plain words');
  fade.querySelector('[data-mb-fade-keep]').click();
  await tick();
  const promoted = mb(domF).about[0];
  assert(promoted.scope === 'later' && promoted.updated === dayKey(new Date()),
    'Keep for later files it for later and sets its date to today');
  assert(dF.getElementById('memory-kept-list').textContent.indexOf('Short term thing') !== -1 && !dF.querySelector('[data-mb-fade]'),
    'the item now sits in Kept for later and the fade note is gone');

  /* ---------- 11. Noticed Keep files a kept record ---------- */
  console.log('— 11. Noticed to kept —');
  const prefRowK = findRow(dom, 'Likes long walks');
  prefRowK.querySelector('[data-mb-keep]').click();
  await tick();
  assert(mb(dom).kept.length === 1 && mb(dom).kept[0].text === 'Likes long walks' && !!mb(dom).kept[0].ref,
    'Keep files the noticed pick as a kept record in the book store');
  assert(d.getElementById('memory-kept-list').textContent.indexOf('Likes long walks') !== -1 &&
    d.getElementById('memory-noticed-list').textContent.indexOf('Likes long walks') === -1,
    'the kept pick shows with kept memories, not with noticed ones');

  console.log('\nSPEC-MEMORY: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
