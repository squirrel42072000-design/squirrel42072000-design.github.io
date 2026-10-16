/* Rootling v17 — Pet Playground INTEGRATION suite (2026-10-15/16).
 * The package module (pet-playground.js, Daniel's official starter,
 * shipped byte-identical) is integrated by playground-host.js.
 * Salvage note (v17 rebase): the artwork pins below were rewritten
 * for the merged v16 tree, where PR #1's painted species portraits
 * (species-art.js) lead the Home portrait — the contract is unchanged
 * (playground art === the Home painting, same species + stage); only
 * the expected asset paths moved from the v15 SVG sets to the
 * painted assets/pets/*.webp portraits.
 * jsdom cannot execute ES-module script tags, so the harness evals
 * the module text with only its `export` keyword stripped — the code
 * that runs is the shipped code — and the host adapter picks it up
 * through the same window.mountPlayground seam it falls back to
 * before dynamic import. Everything else is the real app stack.
 *
 * Pins:
 *  - module text: exports mountPlayground, five games, zero network;
 *  - host mounts with real-shaped state; all five games listed;
 *  - renderPet: fresh node, never the Home element; Home portrait
 *    untouched by mount + a full round; playground art == Home art
 *    (same species + stage); paused context keeps the species
 *    painting (Home's sleepy presentation); calm mode marks the
 *    node calm with no animated class;
 *  - rewards: a completion awards suggestedXp exactly once through
 *    RootlingApp.addExperience; the same receipt reconciled again
 *    after a simulated reload awards nothing more; an unapplied
 *    receipt found in a save IS applied once by reconcile;
 *  - saves are per-pet: two pets never share a room save;
 *  - pet switch (the app's reload flow) remounts with the new pet;
 *  - malformed save -> mount fails, recovery UI shows, the stored
 *    bytes are untouched; explicit Start fresh recovers;
 *  - memory export includes the playground store; a validated import
 *    restores it; a corrupted playground section refuses the import
 *    and writes nothing;
 *  - account deletion removes the account's playground key.
 *
 * Run:  NODE_PATH=<jsdom node_modules> node tests/spec-playground-integration.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const moduleSrc = fs.readFileSync(path.join(root, 'pet-playground.js'), 'utf8');
/* Script order mirrors index.html (v17 salvage fix: the first
 * builder's stack omitted species-art.js + pet-art.js, so the harness
 * rendered the v15 fallback art and the painted-portrait pins could
 * never see the real v16 pipeline). */
const STACK = ['accounts.js', 'species-art.js', 'pet-art.js', 'companions.js', 'traits.js', 'burnoutEngine.js', 'companion-ux.js',
  'trust.js', 'pet-brain.js', 'config.js', 'research.js', 'app.js',
  'notifications.js', 'fitness.js', 'mood.js', 'assistant.js', 'playground-host.js'];
const src = {};
STACK.forEach(f => { src[f] = fs.readFileSync(path.join(root, f), 'utf8'); });
const moduleEval = moduleSrc.replace('export function mountPlayground', 'function mountPlayground')
  + '\n;window.mountPlayground = mountPlayground;';

let failures = 0, passes = 0;
function assert(cond, label) {
  if (cond) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));
function lcg(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function stateSeed(petName, form, category, species, extra) {
  return JSON.stringify(Object.assign({
    version: 2, petName: petName, form: form, category: category, species: species,
    companionPersonality: 'adventurer', identityLine: '', careStyle: 'balanced', profile: 'companion',
    learningEnabled: false, calmMode: false, pauseScreen: 'blank',
    toggles: { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null },
    createdDate: '2026-10-15', sunshine: 200, petXp: 0, checkins: {}, careDays: [], learning: null
  }, extra || {}));
}
function registrySeed(entries, activeId) {
  return JSON.stringify({ companions: entries, activeId: activeId });
}
function entry(id, name, species, category, form, isMain) {
  return { id: id, ownerId: 'this-device', name: name, category: category, species: species, form: form,
    personality: 'adventurer', identityLine: '', isMain: !!isMain, createdAt: '2026-10-15',
    interactions: { chat: 0, play: 0, focus: 0, care: 0, days: {} }, traitWord: '', traitAnnounced: false, giftLastOpened: '' };
}
const KRAKEN_ENTRY = entry('pet-kraken-1', 'Squidward', 'Kraken', 'mythical', 'animal', true);
const BONSAI_ENTRY = entry('pet-bonsai-1', 'Pip', 'Bonsai', 'plants', 'plant', false);

function makeApp(seed) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (seed) for (const k of Object.keys(seed)) w.localStorage.setItem(k, seed[k]);
  w.Math.random = lcg(1234);
  STACK.forEach(f => { if (f === 'playground-host.js') w.eval(moduleEval); w.eval(src[f]); });
  return dom;
}
function krakenSeed(extra) {
  return Object.assign({
    'sprout-state-v1': stateSeed('Squidward', 'animal', 'mythical', 'Kraken'),
    'rootling-companions-v1': registrySeed([KRAKEN_ENTRY, BONSAI_ENTRY], 'pet-kraken-1'),
    'rootling-live-companion-v1': 'pet-kraken-1'
  }, extra || {});
}
function carryAll(w) {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); out[k] = w.localStorage.getItem(k); }
  return out;
}
function shadowBtn(w, action, value) {
  const host = w.document.getElementById('pet-playground');
  if (!host || !host.shadowRoot) return null;
  return Array.from(host.shadowRoot.querySelectorAll('button')).find(b =>
    b.getAttribute('data-action') === action && (value === undefined || b.getAttribute('data-value') === String(value)));
}
function shadowText(w) {
  const host = w.document.getElementById('pet-playground');
  return host && host.shadowRoot ? host.shadowRoot.textContent : '';
}
async function mountHost(w) {
  await w.RootlingPlaygroundHost.mount();
  await tick(30);
  return w.RootlingPlaygroundHost.instance();
}
async function completeTreasure(w) {
  const inst = w.RootlingPlaygroundHost.instance();
  shadowBtn(w, 'open', 'treasure').click();
  await tick(30);
  const save = inst.exportSave();
  for (const pos of save.games.treasure.keys) { shadowBtn(w, 'treasure', pos).click(); await tick(10); }
  shadowBtn(w, 'chest').click();
  await tick(120); /* onComplete is delivered on a microtask + award path */
  return inst;
}

(async function main() {
  /* ---------- 0. Module text pins ---------- */
  console.log('— 0. Package module: shape and hygiene —');
  assert(/export function mountPlayground/.test(moduleSrc), 'module exports mountPlayground');
  for (const t of ['Treasure Buddies', 'Pet Says', 'Build Our Home', 'Puzzle Partners', 'Hide-and-Seek']) {
    assert(moduleSrc.indexOf(t) !== -1, 'module carries the game: ' + t);
  }
  assert(!/https?:\/\/|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(moduleSrc), 'module makes zero network calls');
  assert(moduleSrc.indexOf('rootling:playground:v1:') !== -1, 'module scopes its own save key by account + pet');

  /* ---------- 1. Mount with real-shaped state; five games ---------- */
  console.log('— 1. Host mount + menu —');
  {
    const dom = makeApp(krakenSeed()); const w = dom.window, d = w.document;
    await tick(300);
    const inst = await mountHost(w);
    assert(!!inst, 'host mounts the playground for the active pet');
    for (const t of ['Treasure Buddies', 'Pet Says', 'Build Our Home', 'Puzzle Partners', 'Hide-and-Seek']) {
      assert(shadowText(w).indexOf(t) !== -1, 'menu lists: ' + t);
    }
    const card = d.getElementById('playground-card');
    assert(card.getAttribute('data-view') === 'activities', 'the Play Together card lives on Activities');
  }

  /* ---------- 2. Artwork: fresh node, same painting, Home untouched ---------- */
  console.log('— 2. renderPet artwork contract —');
  {
    const dom = makeApp(krakenSeed()); const w = dom.window, d = w.document;
    await tick(300);
    await mountHost(w);
    const H = w.RootlingPlaygroundHost;
    const homeImg = d.getElementById('pet-img');
    const homeParent = homeImg.parentElement;
    const homeSrc = homeImg.getAttribute('src');
    assert(homeSrc === 'assets/pets/kraken.webp', 'Home portrait shows the kraken’s painted species portrait (v16 art pipeline)');
    const node1 = H.renderPet({ id: 'pet-kraken-1', name: 'Squidward' }, { game: null, paused: false });
    const node2 = H.renderPet({ id: 'pet-kraken-1', name: 'Squidward' }, { game: null, paused: false });
    assert(node1 !== homeImg && node2 !== homeImg && node1 !== node2, 'renderPet returns a FRESH node every call — never the Home element');
    const img1 = node1.querySelector('img');
    assert(img1.getAttribute('src') === homeSrc, 'playground artwork is the SAME painting as the Home portrait (species + stage preserved)');
    assert(node1.textContent.indexOf('🐙') !== -1, 'the kraken species badge rides along, from the roster');
    const pausedNode = H.renderPet({ id: 'pet-kraken-1', name: 'Squidward' }, { game: 'treasure', paused: true });
    const pausedImg = pausedNode.querySelector('img');
    assert(pausedImg.getAttribute('src') === 'assets/pets/kraken.webp' && pausedImg.getAttribute('data-paused') === '1',
      'paused context keeps the species’ own painting (Home’s sleepy presentation) and marks the pause');
    await completeTreasure(w);
    assert(d.getElementById('pet-img') === homeImg && homeImg.parentElement === homeParent,
      'the Home portrait element is unmoved and unmodified after mount + a full round');
  }
  {
    /* Calm mode: node is marked calm; no animated class anywhere. */
    const seed = krakenSeed();
    seed['sprout-state-v1'] = stateSeed('Squidward', 'animal', 'mythical', 'Kraken', { calmMode: true });
    const dom = makeApp(seed); const w = dom.window;
    await tick(300);
    const node = w.RootlingPlaygroundHost.renderPet({ id: 'pet-kraken-1', name: 'Squidward' }, { game: 'treasure', paused: false });
    const img = node.querySelector('img');
    assert(img.getAttribute('data-calm') === '1', 'calm mode is detected from state and marked on the artwork');
    assert(!/anim/.test(node.className + ' ' + img.className), 'no animated artwork class is used when calm/reduced-motion is on');
  }

  /* ---------- 3. Rewards: exactly once, reconcile-safe ---------- */
  console.log('— 3. Rewards idempotency —');
  let carriedAfterWin;
  {
    const dom = makeApp(krakenSeed()); const w = dom.window;
    await tick(300);
    await mountHost(w);
    const inst = await completeTreasure(w);
    const st = JSON.parse(w.localStorage.getItem('sprout-state-v1'));
    assert(st.petXp === 5 && st.sunshine === 205, 'one completion awards the suggested 5 XP exactly once (petXp 5, sunshine +5)');
    const save = inst.exportSave();
    assert(save.rewards.length === 1, 'the save holds exactly one receipt');
    const receipt = save.rewards[0];
    assert(w.RootlingPlaygroundHost.appliedReceipt(receipt.id), 'the receipt is in the applied ledger');
    assert(w.RootlingPlaygroundHost.applyReceipt(receipt) === false, 're-applying the same receipt is refused by the ledger');
    const st2 = JSON.parse(w.localStorage.getItem('sprout-state-v1'));
    assert(st2.petXp === 5, 'XP does not move on a duplicate receipt');
    carriedAfterWin = carryAll(w);
  }
  {
    /* Simulated reload: reconcile must NOT award the same receipt again. */
    const dom = makeApp(carriedAfterWin); const w = dom.window;
    await tick(300);
    await mountHost(w);
    await tick(60);
    const st = JSON.parse(w.localStorage.getItem('sprout-state-v1'));
    assert(st.petXp === 5, 'after a reload, reconcile leaves the awarded XP alone (no double award)');
  }
  {
    /* Crash-gap: receipt saved, ledger entry lost -> reconcile awards once. */
    const seed = carriedAfterWin;
    const store = JSON.parse(seed['rootling-playground-v1']);
    store.ledger = {};
    seed['rootling-playground-v1'] = JSON.stringify(store);
    const stBefore = JSON.parse(seed['sprout-state-v1']);
    stBefore.petXp = 0; stBefore.sunshine = 200; /* as if the award never landed */
    seed['sprout-state-v1'] = JSON.stringify(stBefore);
    const dom = makeApp(seed); const w = dom.window;
    await tick(300);
    await mountHost(w);
    await tick(60);
    const st = JSON.parse(w.localStorage.getItem('sprout-state-v1'));
    assert(st.petXp === 5, 'reconcile finds the unapplied receipt in the save and awards it once');
    const rid = Object.keys(JSON.parse(w.localStorage.getItem('rootling-playground-v1')).ledger)[0];
    assert(!!rid, 'the reconciled receipt is written into the ledger');
  }

  /* ---------- 4. Per-pet saves + switch remount ---------- */
  console.log('— 4. Per-pet saves —');
  {
    const dom = makeApp(krakenSeed()); const w = dom.window, d = w.document;
    await tick(300);
    await mountHost(w);
    /* Place the default decoration in room space 1 for the kraken. */
    shadowBtn(w, 'open', 'home').click(); await tick(30);
    shadowBtn(w, 'place', 0).click(); await tick(30);
    let store = JSON.parse(w.localStorage.getItem('rootling-playground-v1'));
    assert(store.saves['pet-kraken-1'].room[0] === 'Soft rug', 'the kraken’s room save records the placed rug');
    /* Switch the live pet in-window: refresh must destroy + remount. */
    w.localStorage.setItem('rootling-live-companion-v1', 'pet-bonsai-1');
    w.RootlingPlaygroundHost.refresh();
    await tick(120);
    const inst2 = w.RootlingPlaygroundHost.instance();
    assert(!!inst2 && inst2.exportSave().room[0] === null, 'after the switch, the bonsai’s room is its own (empty) save');
    store = JSON.parse(w.localStorage.getItem('rootling-playground-v1'));
    assert(store.saves['pet-kraken-1'].room[0] === 'Soft rug', 'the kraken’s room save is untouched by the switch');
    assert(shadowText(w).indexOf('Pip is here with you') !== -1, 'the remounted playground greets the new pet by name');
  }
  {
    /* The app's real switch flow reloads: a fresh window whose main
     * pet is the bonsai mounts with plant artwork. */
    const seed = {
      'sprout-state-v1': stateSeed('Pip', 'plant', 'plants', 'Bonsai'),
      'rootling-companions-v1': registrySeed([entry('pet-bonsai-1', 'Pip', 'Bonsai', 'plants', 'plant', true)], 'pet-bonsai-1'),
      'rootling-live-companion-v1': 'pet-bonsai-1'
    };
    const dom = makeApp(seed); const w = dom.window, d = w.document;
    await tick(300);
    await mountHost(w);
    const node = w.RootlingPlaygroundHost.renderPet({ id: 'pet-bonsai-1', name: 'Pip' }, { game: null, paused: false });
    const src = node.querySelector('img').getAttribute('src');
    assert(src === d.getElementById('pet-img').getAttribute('src') && src === 'assets/pets/bonsai.webp',
      'after a pet switch, playground artwork is the new pet’s own painted portrait');
  }

  /* ---------- 5. Malformed save: fail loud, touch nothing ---------- */
  console.log('— 5. Malformed save recovery —');
  {
    const badStore = JSON.stringify({ v: 1, saves: { 'pet-kraken-1': { version: 2, games: {} } }, ledger: {} });
    const dom = makeApp(krakenSeed({ 'rootling-playground-v1': badStore })); const w = dom.window, d = w.document;
    await tick(300);
    const ok = await w.RootlingPlaygroundHost.mount();
    await tick(30);
    assert(ok === false && !w.RootlingPlaygroundHost.instance(), 'a malformed save fails the mount instead of being reset');
    const rec = d.getElementById('playground-recovery');
    assert(!!rec && rec.textContent.indexOf('could not be opened') !== -1, 'recovery UI explains, in plain words');
    assert(w.localStorage.getItem('rootling-playground-v1') === badStore, 'the malformed save bytes are left exactly as they were');
    const freshBtn = Array.from(rec.querySelectorAll('button')).find(b => b.textContent.indexOf('Start fresh') !== -1);
    freshBtn.click();
    await tick(200);
    assert(!!w.RootlingPlaygroundHost.instance(), 'an explicit Start fresh (the user’s choice) mounts a clean game');
    assert(JSON.parse(w.localStorage.getItem('rootling-playground-v1')).saves['pet-kraken-1'] === undefined,
      'fresh start removed only the broken pet save');
  }
  {
    const dom = makeApp(krakenSeed({ 'rootling-playground-v1': '{not json' })); const w = dom.window, d = w.document;
    await tick(300);
    const ok = await w.RootlingPlaygroundHost.mount();
    await tick(30);
    assert(ok === false && !!d.getElementById('playground-recovery'), 'unreadable JSON also lands on recovery, never a silent wipe');
    assert(w.localStorage.getItem('rootling-playground-v1') === '{not json', 'the unreadable bytes are preserved for export');
  }

  /* ---------- 6. Backup: export includes, validated import restores ---------- */
  console.log('— 6. Backup / restore —');
  let exportText;
  {
    const dom = makeApp(carriedAfterWin); const w = dom.window;
    await tick(300);
    await mountHost(w);
    const api = w.SproutApp;
    exportText = api.serializeMemoryExport(api.getState(), null);
    const parsed = JSON.parse(exportText);
    assert(!!parsed.storage['rootling-playground-v1'] && !!parsed.storage['rootling-playground-v1'].saves['pet-kraken-1'],
      'the memory export includes the playground store with the pet’s save');
  }
  {
    const dom = makeApp(krakenSeed()); const w = dom.window;
    await tick(300);
    await mountHost(w);
    w.SproutApp.applyMemoryImport(exportText);
    const restored = JSON.parse(w.localStorage.getItem('rootling-playground-v1'));
    assert(restored.saves['pet-kraken-1'].rewards.length === 1, 'a validated import restores the playground save');
    assert(w.RootlingPlaygroundHost.validateStore(restored), 'the restored store passes the host validator');
  }
  {
    const dom = makeApp(carriedAfterWin); const w = dom.window;
    await tick(300);
    await mountHost(w);
    const before = w.localStorage.getItem('rootling-playground-v1');
    const bad = JSON.parse(exportText);
    bad.storage['rootling-playground-v1'].saves['pet-kraken-1'].room = [null, null]; /* room must hold 6 spaces */
    let threw = null;
    try { w.SproutApp.applyMemoryImport(JSON.stringify(bad)); } catch (e) { threw = e; }
    assert(!!threw && /playground/i.test(threw.message), 'a corrupted playground section refuses the import with a clear message');
    assert(w.localStorage.getItem('rootling-playground-v1') === before, 'the refused import wrote nothing — existing saves untouched');
  }

  /* ---------- 7. Account deletion removes playground keys ---------- */
  console.log('— 7. Account deletion —');
  {
    const seed = krakenSeed({
      'rootling-accounts-v1': JSON.stringify({ accounts: [{ id: 'acct-test-1', name: 'Test', email: 't@example.com' }], migratedTo: null })
    });
    const dom = makeApp(seed); const w = dom.window;
    await tick(300);
    w.localStorage.setItem('acct:acct-test-1:rootling-playground-v1', JSON.stringify({ v: 1, saves: {}, ledger: {} }));
    assert(w.localStorage.getItem('acct:acct-test-1:rootling-playground-v1') !== null, 'seeded: playground key sits inside the account space');
    assert(w.RootlingAccounts.appKeys.indexOf('rootling-playground-v1') !== -1, 'the playground key is registered in APP_KEYS');
    try { w.RootlingAccounts.deleteAccount('acct-test-1'); } catch (e) { /* jsdom cannot reload; deletion already ran */ }
    await tick(30);
    assert(w.localStorage.getItem('acct:acct-test-1:rootling-playground-v1') === null,
      'deleting the account removes its playground key');
  }

  /* ---------- 8. The module contract, raw: one receipt per round ---------- */
  console.log('— 8. Raw module receipt contract —');
  {
    const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.Math.random = lcg(77);
    w.eval(moduleEval);
    const target = d.createElement('div');
    d.body.appendChild(target);
    const receipts = [];
    const inst = w.mountPlayground(target, {
      accountId: 'acct-raw', pet: { id: 'pet-raw', name: 'Raw' },
      onComplete: r => receipts.push(r)
    });
    const btn = (action, value) => Array.from(target.shadowRoot.querySelectorAll('button')).find(b =>
      b.getAttribute('data-action') === action && (value === undefined || b.getAttribute('data-value') === String(value)));
    btn('open', 'treasure').click();
    const save = inst.exportSave();
    for (const pos of save.games.treasure.keys) btn('treasure', pos).click();
    btn('chest').click();
    await tick(60);
    assert(receipts.length === 1 && receipts[0].game === 'treasure' && receipts[0].suggestedXp === 5,
      'one completed round emits exactly one receipt via onComplete');
    btn('chest').click(); /* already done: no second receipt for the same round */
    await tick(60);
    assert(receipts.length === 1, 'replaying the finished round emits no second receipt');
    inst.destroy();
    assert(target.shadowRoot.childNodes.length === 0, 'destroy() empties the shadow root');
  }

  /* ---------- 9. PR #1 drawing feature survives the integration ----------
   * The full drawing save flow needs IndexedDB (absent in jsdom);
   * its award policy (5 growth points once a day via addExperience)
   * is pinned by tools/pet-art.test.js, which tools/check.js runs.
   * Here we pin the DOM side: the card, its controls, its view. */
  console.log('— 9. Drawing feature (PR #1) intact —');
  {
    const dom = makeApp(krakenSeed()); const w = dom.window, d = w.document;
    await tick(300);
    const card = d.getElementById('pet-art-card');
    assert(!!card && !card.hidden, 'the Draw your pet card still renders');
    assert(card.getAttribute('data-view') === 'activities', 'the drawing card still lives on Activities');
    assert(!!d.getElementById('pet-art-open') && !!d.getElementById('pet-art-list'), 'drawing pad button + shelf are present');
    assert(!!w.RootlingPetArt, 'the pet-art module still loads alongside the playground');
  }

  console.log('\nSPEC-PLAYGROUND-INTEGRATION: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
