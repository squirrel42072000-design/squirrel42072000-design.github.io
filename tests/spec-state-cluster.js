/* Rootling v18 — state cluster (USER TEST #1/#2/#6, Muse click-through
 * 2026-10-16 03:18 UTC). Per-person state wins over per-pet: adopting a
 * 2nd companion must not hide the person's check-ins / sunshine /
 * streak; "main companion" labels must agree; chat history keeps the
 * original pet's name. Harness mirrors tests/spec-collection.js. */
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

  /* Adopt Rooty (Bonsai), then do real check-ins and chat. */
  d.querySelector('[data-personality="friendly"]').click();
  d.querySelector('[data-category="plants"]').click();
  await tick(20);
  d.querySelector('[data-species="Bonsai"]').click();
  d.getElementById('pet-name-input').value = 'Rooty';
  d.getElementById('adopt-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  d.querySelector('.mood-btn[data-mood="4"]').click();
  await tick();
  d.getElementById('water-plus').click();
  await tick();
  d.getElementById('chat-input').value = 'Log 500 steps';
  d.getElementById('chat-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  store = dump(w);
  const before = stateOf(store.ls, p);
  const tk = todayKey();
  assert(before.sunshine > 0 && before.checkins[tk] && before.checkins[tk].mood && before.checkins[tk].water,
    'setup: Rooty has sunshine + mood/water check-ins today (sunshine=' + before.sunshine + ')');
  assert(before.careDays.indexOf(tk) !== -1, 'setup: today is a care day');
  const chatBefore = JSON.parse(store.ls[p + 'rootling-chat-v1']);
  const petLine = chatBefore.messages.filter(m => m.role === 'pet').pop();
  assert(petLine && petLine.petName === 'Rooty', '#6: pet chat line is stamped with the speaker name (Rooty)');

  /* Adopt a 2nd companion, Miso (Cat) — the USER TEST moment. */
  d.getElementById('adopt-another-btn').click();
  await tick();
  store = dump(w);
  dom = makeWindow(store); w = dom.window; d = w.document;
  await tick();
  assert(d.getElementById('adopt-view').hidden === false, 'adopt-another reopens adoption');
  d.querySelector('[data-personality="friendly"]').click();
  d.querySelector('[data-category="pets"]').click();
  await tick(20);
  d.querySelector('[data-species="Cat"]').click();
  d.getElementById('pet-name-input').value = 'Miso';
  d.getElementById('adopt-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  store = dump(w);
  const after = stateOf(store.ls, p);
  assert(after.petName === 'Miso', 'setup: Miso is the live companion now');
  assert(after.sunshine === before.sunshine, '#1: sunshine survives adopting a 2nd pet (' + before.sunshine + ' -> ' + after.sunshine + ')');
  assert(after.checkins[tk] && after.checkins[tk].mood && after.checkins[tk].water && after.checkins[tk].water.glasses === before.checkins[tk].water.glasses,
    '#1: today mood + water check-ins still show with the new pet');
  assert(after.careDays.indexOf(tk) !== -1, '#1: care-day streak record survives (careDays keeps today)');
  assert(d.getElementById('sunshine-count').textContent === String(before.sunshine), '#1: Home sunshine badge agrees');

  /* #2: main-companion labels agree in the SAME session (no reload). */
  const reg = registryOf(store.ls, p);
  const main = reg.companions.find(c => c.isMain);
  assert(main && main.name === 'Miso', '#2: registry main is the just-adopted Miso');
  assert(d.getElementById('pet-name-display').textContent === 'Miso', '#2: Home greets Miso');
  assert(d.getElementById('companion-manage-current').textContent.indexOf('Miso is your main companion') === 0,
    '#2: Settings manage card agrees — got: ' + d.getElementById('companion-manage-current').textContent);
  assert((d.getElementById('companions-list').textContent.match(/Main companion/g) || []).length === 1,
    '#2: shelf shows exactly one Main companion badge');

  /* #6: after a fresh reload, old chat lines still say Rooty. */
  store.ss = {};
  dom = makeWindow(store); w = dom.window; d = w.document;
  await tick();
  const logText = d.getElementById('chat-log').textContent;
  assert(logText.indexOf('Rooty:') !== -1, '#6: old chat line still labelled Rooty after adopting Miso');
  assert(logText.indexOf('Miso: Hello') === -1, '#6: history is not re-labelled with the new pet name');

  /* Swap back to Rooty: the person's day is still there too. */
  const rooty = registryOf(dump(w).ls, p).companions.find(c => c.name === 'Rooty');
  d.querySelector('[data-shelf-switch="' + rooty.id + '"]').click();
  await tick();
  store = dump(w);
  dom = makeWindow(store); w = dom.window; d = w.document;
  await tick();
  store = dump(w);
  const back = stateOf(store.ls, p);
  assert(back.petName === 'Rooty' && back.sunshine === before.sunshine && back.checkins[tk] && back.checkins[tk].mood,
    '#1: swapping back to Rooty keeps the same check-ins + sunshine');

  console.log(failures ? ('\n' + failures + ' FAILURES') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
