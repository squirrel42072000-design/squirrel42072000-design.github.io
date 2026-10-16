/* Rootling v18 — B2: "Start over with a new companion" (USER TEST queue
 * B2, Muse click-through 2026-10-16). The footer button must work
 * without a native confirm dialog (suppressed in in-app browsers and
 * automation, which is why testers saw "does nothing"), and the clear
 * must be honest: after Start Over, a new adoption must NOT resurrect
 * the cleared sunshine / check-ins / care days from another companion's
 * saved snapshot or the per-person stash (the v18 B1 carry). Other
 * companions stay in the collection. Harness mirrors spec-state-cluster. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = {};
['accounts.js', 'companions.js', 'pet-brain.js', 'app.js', 'notifications.js'].forEach(f => {
  src[f] = fs.readFileSync(path.join(root, f), 'utf8');
});
let failures = 0;
function assert(cond, label) {
  if (cond) console.log('  PASS  ' + label);
  else { failures++; console.log('  FAIL  ' + label); }
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));
function makeWindow(seed) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (seed) {
    for (const k of Object.keys(seed.ls)) w.localStorage.setItem(k, seed.ls[k]);
    for (const k of Object.keys(seed.ss)) w.sessionStorage.setItem(k, seed.ss[k]);
  }
  w.eval(src['accounts.js']); w.eval(src['companions.js']); w.eval(src['pet-brain.js']); w.eval(src['app.js']); w.eval(src['notifications.js']);
  /* Trap: if any code in the start-over flow leans on the native dialog,
   * record it and answer "cancel" — the flow must still work. */
  w.__confirmUsed = false;
  w.confirm = function () { w.__confirmUsed = true; return false; };
  return dom;
}
function dump(w) {
  const ls = {}, ss = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); ls[k] = w.localStorage.getItem(k); }
  for (let i = 0; i < w.sessionStorage.length; i++) { const k = w.sessionStorage.key(i); ss[k] = w.sessionStorage.getItem(k); }
  return { ls, ss };
}
function prefix(ls) {
  const a = JSON.parse(ls['rootling-accounts-v1']);
  return 'acct:' + a.accounts[0].id + ':';
}
function stateOf(ls, p) { return JSON.parse(ls[p + 'sprout-state-v1']); }
function registryOf(ls, p) { return JSON.parse(ls[p + 'rootling-companions-v1']); }
function todayKey() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
async function adopt(d, w, personality, category, species, name) {
  d.querySelector('[data-personality="' + personality + '"]').click();
  d.querySelector('[data-category="' + category + '"]').click();
  await tick(20);
  d.querySelector('[data-species="' + species + '"]').click();
  d.getElementById('pet-name-input').value = name;
  d.getElementById('adopt-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
}

(async function main() {
  let dom = makeWindow(null); let w = dom.window, d = w.document;
  await tick();
  [...d.querySelectorAll('.gate-btn')].find(b => b.textContent === 'Create Account').click();
  await tick(20);
  d.getElementById('gate-name').value = 'Sam';
  d.getElementById('gate-email').value = 'sam@example.com';
  d.getElementById('gate-password').value = 'sunshine1';
  d.getElementById('gate-hint').value = 'a clue only I know';
  [...d.querySelectorAll('.gate-btn')].find(b => b.textContent === 'Create Account').click();
  await tick(120);
  let store = dump(w); const p = prefix(store.ls);
  dom = makeWindow(store); w = dom.window; d = w.document;
  await tick();

  /* Rooty + real progress, then a 2nd companion (the B1 carry setup). */
  await adopt(d, w, 'friendly', 'plants', 'Bonsai', 'Rooty');
  d.querySelector('.mood-btn[data-mood="4"]').click();
  await tick();
  d.getElementById('water-plus').click();
  await tick();
  const tk = todayKey();
  const before = stateOf(dump(w).ls, p);
  assert(before.sunshine > 0 && before.checkins[tk], 'setup: Rooty has sunshine + check-ins (sunshine=' + before.sunshine + ')');
  d.getElementById('adopt-another-btn').click();
  await tick();
  store = dump(w);
  dom = makeWindow(store); w = dom.window; d = w.document;
  await tick();
  await adopt(d, w, 'friendly', 'pets', 'Cat', 'Miso');
  store = dump(w);
  assert(stateOf(store.ls, p).petName === 'Miso' && stateOf(store.ls, p).sunshine === before.sunshine,
    'setup: Miso is live and carries the person progress (B1)');

  /* B2-1: tapping Start over opens an in-app confirm card; nothing is
   * cleared yet, and no native dialog is used. */
  const card = d.getElementById('reset-confirm');
  assert(!!card, 'B2: an in-app start-over confirm card exists (#reset-confirm)');
  assert(card && card.hidden === true, 'B2: confirm card starts hidden');
  d.getElementById('reset-btn').click();
  await tick();
  assert(card && card.hidden === false, 'B2: tapping "Start over with a new companion" opens the confirm card');
  assert(w.__confirmUsed === false, 'B2: opening the confirm card does not use window.confirm');
  assert(stateOf(dump(w).ls, p).sunshine === before.sunshine, 'B2: nothing is cleared before the user chooses');

  /* B2-2: "Keep my companion" closes the card and changes nothing. */
  d.getElementById('reset-confirm-no').click();
  await tick();
  assert(card.hidden === true, 'B2: "Keep my companion" closes the card');
  const kept = stateOf(dump(w).ls, p);
  assert(kept.petName === 'Miso' && kept.sunshine === before.sunshine, 'B2: keeping the companion leaves state untouched');

  /* B2-3: "Yes, start over" runs the reset with no native dialog. */
  d.getElementById('reset-btn').click();
  await tick();
  d.getElementById('reset-confirm-yes').click();
  await tick();
  assert(w.__confirmUsed === false, 'B2: the whole start-over flow never uses window.confirm');
  assert(d.getElementById('adopt-view').hidden === false, 'B2: after Yes, the adoption view is showing');
  store = dump(w);
  const cleared = stateOf(store.ls, p);
  assert(!cleared.petName && cleared.sunshine === 0 && !cleared.checkins[tk],
    'B2: live state is cleared (no name, no sunshine, no today check-ins)');
  assert(store.ls[p + 'rootling-person-state-v1'] === undefined, 'B2: the per-person stash is gone');
  assert(store.ls[p + 'rootling-startover-pending-v1'] === '1', 'B2: the start-over is marked pending until a new adoption');
  const regAfter = registryOf(store.ls, p);
  assert(!regAfter.companions.some(c => c.name === 'Miso'), 'B2: the live companion (Miso) leaves the collection');
  assert(regAfter.companions.some(c => c.name === 'Rooty'), 'B2: the other companion (Rooty) stays in the collection');

  /* B2-4: the clear survives a reload, and a fresh adoption does NOT
   * resurrect the cleared progress from Rooty's saved snapshot. */
  store.ss = {};
  dom = makeWindow(store); w = dom.window; d = w.document;
  await tick();
  assert(d.getElementById('adopt-view').hidden === false, 'B2: after reload, still on the adoption view');
  await adopt(d, w, 'friendly', 'plants', 'Bonsai', 'Newby');
  store = dump(w);
  const fresh = stateOf(store.ls, p);
  assert(fresh.petName === 'Newby', 'B2: the new companion is adopted');
  assert(fresh.sunshine === 0, 'B2: cleared sunshine does NOT come back on the next adoption (got ' + fresh.sunshine + ')');
  assert(!fresh.checkins[tk], 'B2: cleared check-ins do NOT come back on the next adoption');
  assert(fresh.careDays.indexOf(tk) === -1, 'B2: cleared care days do NOT come back on the next adoption');
  assert(store.ls[p + 'rootling-startover-pending-v1'] === undefined, 'B2: adopting the new companion clears the pending mark');

  console.log(failures === 0 ? 'spec-startover: ALL PASS' : 'spec-startover: ' + failures + ' FAILURE(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.log('  FAIL  harness error: ' + (e && e.stack || e)); process.exit(1); });
