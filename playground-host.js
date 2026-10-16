/* playground-host.js — host adapter for the Pet Playground package
 * (Rootling v17, Daniel 2026-10-15; adapter drafted during the v16
 * attempt and shipped on the rebased v16 tree). The package module
 * (pet-playground.js, an ES module by Daniel's design) is integrated,
 * not rewritten: this classic script dynamic-imports it and wires it
 * to the real app. Package changes: NONE — the shipped
 * pet-playground.js is byte-identical to playground-package/.
 *
 * What this adapter owns (per the package README's host duties):
 *   - Identity: the signed-in account (RootlingAccounts.current) and
 *     the ACTIVE pet, resolved the same way companions.js resolves
 *     the live companion (live key → main entry → activeId → first).
 *   - Artwork: renderPet builds a FRESH node on every call from the
 *     app's own pet-art pipeline — the exact painting the Home card
 *     shows (the live #pet-img src, which setPetImage resolved from
 *     stageFor/moodFile), with moodFile(stage/sleepy) for the paused
 *     context the module actually signals. The Home node is never
 *     moved, reparented, or modified. No asset path is invented:
 *     every src comes from the app's resolver or its rendered output.
 *   - Storage: the module's synchronous storage option, backed by ONE
 *     app key ('rootling-playground-v1', in accounts APP_KEYS so it
 *     lives inside each account's space, and in the memory backup's
 *     module-store list) holding { v, saves: {petId: save}, ledger }.
 *   - Rewards: onComplete ONLY (never the DOM event too). An applied-
 *     receipt ledger in the same store makes every receipt award its
 *     suggestedXp through RootlingApp.addExperience exactly once,
 *     including receipts reconciled from the save after a reload.
 *   - Recovery: a malformed save fails the mount (the module refuses
 *     to overwrite it); this adapter shows recovery UI — retry,
 *     download the saved games file, or an explicit user-chosen fresh
 *     start. Nothing is ever reset silently.
 *   - Lifecycle: destroy() + remount when the account or active pet
 *     changes; updatePet() on rename; both re-checked whenever the
 *     tab becomes visible again (pet switches in this app reload the
 *     page, which remounts naturally — the re-check covers the rest).
 */
(function (root) {
  'use strict';
  var STORE_KEY = 'rootling-playground-v1';
  var ITEMS = ['Soft rug', 'Reading lamp', 'Plant', 'Toy basket', 'Shell display', 'Star cushion'];
  var GAME_IDS = { treasure: true, says: true, home: true, puzzle: true, hide: true };

  /* ================= save validation (mirrors the module's own) ================= */
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function intIn(n, lo, hi) { return isInt(n) && n >= lo && n <= hi; }
  function validateSave(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    if (x.version !== 1) return false;
    if (!x.games || typeof x.games !== 'object' || Array.isArray(x.games)) return false;
    if (!Array.isArray(x.room) || x.room.length !== 6) return false;
    if (!Array.isArray(x.inventory) || !x.inventory.every(function (v) { return ITEMS.indexOf(v) !== -1; })) return false;
    if (!x.room.every(function (v) { return v === null || ITEMS.indexOf(v) !== -1; })) return false;
    if (!Array.isArray(x.rewards)) return false;
    for (var i = 0; i < x.rewards.length; i++) {
      var r = x.rewards[i];
      if (!r || typeof r.id !== 'string' || !GAME_IDS[r.game] || typeof r.suggestedXp !== 'number') return false;
    }
    var keys = Object.keys(x.games);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j], g = x.games[k];
      if (!GAME_IDS[k] || !g || typeof g !== 'object') return false;
      if (typeof g.id !== 'string' || typeof g.done !== 'boolean') return false;
      if (k === 'treasure' && !(Array.isArray(g.keys) && g.keys.length === 3 && g.keys.every(function (n) { return intIn(n, 0, 8); }) && Array.isArray(g.opened) && isInt(g.found))) return false;
      if (k === 'says' && !(Array.isArray(g.sequence) && g.sequence.length === 3 && g.sequence.every(function (n) { return intIn(n, 0, 3); }) && ['watch', 'repeat', 'create', 'echo'].indexOf(g.phase) !== -1 && Array.isArray(g.user) && g.user.every(function (n) { return intIn(n, 0, 3); }) && isInt(g.step) && isInt(g.echo))) return false;
      if (k === 'puzzle' && !(Array.isArray(g.switches) && g.switches.length === 3 && g.switches.every(function (v) { return typeof v === 'boolean'; }) && ['user', 'pet'].indexOf(g.turn) !== -1)) return false;
      if (k === 'hide' && !(intIn(g.position, 0, 8) && Array.isArray(g.opened) && ['find', 'toy', 'petSearch'].indexOf(g.phase) !== -1)) return false;
    }
    return true;
  }
  function validateStore(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.v !== 1) return false;
    if (!x.saves || typeof x.saves !== 'object' || Array.isArray(x.saves)) return false;
    if (!x.ledger || typeof x.ledger !== 'object' || Array.isArray(x.ledger)) return false;
    var pids = Object.keys(x.saves);
    for (var i = 0; i < pids.length; i++) if (!validateSave(x.saves[pids[i]])) return false;
    var rids = Object.keys(x.ledger);
    for (var j = 0; j < rids.length; j++) {
      var e = x.ledger[rids[j]];
      if (!e || typeof e !== 'object' || typeof e.xp !== 'number') return false;
    }
    return true;
  }

  /* ================= the store ================= */
  function blankStore() { return { v: 1, saves: {}, ledger: {} }; }
  function readStore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return blankStore(); }
    if (!raw) return blankStore();
    var d = JSON.parse(raw); /* throws on unreadable JSON — by design */
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1
        || !d.saves || typeof d.saves !== 'object' || Array.isArray(d.saves)
        || !d.ledger || typeof d.ledger !== 'object' || Array.isArray(d.ledger)) {
      throw new Error('Playground store is unreadable');
    }
    return d;
  }
  function writeStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* quota: the module keeps its own warning path */ }
  }
  function makeStorage(petId) {
    return {
      getItem: function (ignoredKey) {
        var store = readStore(); /* a throw here fails the mount — recovery, never a silent reset */
        var s = store.saves[petId];
        if (s === undefined || s === null) return null;
        return typeof s === 'string' ? s : JSON.stringify(s);
      },
      setItem: function (ignoredKey, value) {
        var store = readStore();
        try { store.saves[petId] = JSON.parse(value); } catch (e) { store.saves[petId] = value; }
        writeStore(store);
      }
    };
  }

  /* ================= identity (real app state) ================= */
  function accountId() {
    try {
      var a = (root.RootlingAccounts && root.RootlingAccounts.current) ? root.RootlingAccounts.current() : null;
      if (a && a.id) return String(a.id);
    } catch (e) { /* guest space */ }
    return 'guest';
  }
  function activePet() {
    var entry = null;
    try {
      var reg = (root.RootlingCompanions && root.RootlingCompanions.registry) ? root.RootlingCompanions.registry() : null;
      if (reg && reg.companions && reg.companions.length) {
        var live = null;
        try { live = localStorage.getItem('rootling-live-companion-v1'); } catch (e) { /* ignore */ }
        entry = (live && reg.companions.filter(function (c) { return String(c.id) === String(live); })[0])
          || reg.companions.filter(function (c) { return c.isMain; })[0]
          || (reg.activeId && reg.companions.filter(function (c) { return String(c.id) === String(reg.activeId); })[0])
          || reg.companions[0];
      }
    } catch (e) { entry = null; }
    var st = null;
    try { st = (root.RootlingApp && root.RootlingApp.getState) ? root.RootlingApp.getState() : null; } catch (e) { /* ignore */ }
    if (entry) {
      return { id: String(entry.id), name: entry.name || (st && st.petName) || 'Your pet',
        species: entry.species || (st && st.species) || '', category: entry.category || (st && st.category) || '',
        form: entry.form || (st && st.form) || 'plant' };
    }
    if (st && st.petName) {
      return { id: 'main-pet', name: st.petName, species: st.species || '', category: st.category || '', form: st.form || 'plant' };
    }
    return null;
  }

  /* ================= artwork (the app's real pet-art pipeline) ================= */
  function calmOn() {
    try { var st = root.RootlingApp.getState(); if (st && st.calmMode) return true; } catch (e) { /* ignore */ }
    try { if (document.documentElement.classList.contains('calm-motion')) return true; } catch (e) { /* ignore */ }
    try { if (document.body && document.body.classList.contains('calm')) return true; } catch (e) { /* ignore */ }
    try { if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) { /* ignore */ }
    return false;
  }
  /* The module signals only {game, paused}. Paused is a real state
   * change, so it maps to the app's real sleepy presentation: for a
   * painted species that is the species' own portrait (the same
   * painting Home shows, with its sleepy overlay); otherwise the
   * form's sleepy painting from the app's moodFile resolver. Every
   * other context shows the exact painting the Home card shows right
   * now. The module exposes no searching/carrying/hiding/celebrating
   * signal, so no action art is faked — the module's own dialogue
   * carries those moments. */
  function currentPainting(context) {
    var api = root.RootlingApp, st = null;
    try { st = api.getState(); } catch (e) { /* ignore */ }
    if (context && context.paused && st) {
      try {
        var SA = root.RootlingSpeciesArt;
        if (SA && SA.speciesOf && SA.src) {
          var sp = SA.speciesOf(st);
          var stageId = (api.stageFor ? api.stageFor(st.sunshine || 0, st.form || 'plant').id : 'grown');
          var painted = sp ? SA.src(sp, stageId, 'sleepy') : '';
          if (painted) return painted;
        }
      } catch (e) { /* fall through to the form's sleepy painting */ }
      if (api.moodFile) { try { return api.moodFile(st, 'sleepy'); } catch (e) { /* fall through */ } }
    }
    var home = document.getElementById('pet-img');
    if (home) { var src = home.getAttribute('src'); if (src) return src; }
    if (st && api.moodFile && api.petMood) { try { return api.moodFile(st, api.petMood(st)); } catch (e) { /* fall through */ } }
    if (st && api.stageFor) { try { return api.stageFor(st.sunshine || 0, st.form || 'plant').file; } catch (e) { /* fall through */ } }
    return 'assets/sprout-placeholder.svg';
  }
  function renderPet(pet, context) {
    var info = activePet() || {};
    var wrap = document.createElement('span');
    wrap.className = 'playground-pet';
    var img = document.createElement('img');
    img.src = currentPainting(context || {});
    img.alt = (pet && pet.name) || info.name || 'Your pet';
    if (context && context.paused) img.setAttribute('data-paused', '1');
    if (calmOn()) img.setAttribute('data-calm', '1');
    wrap.appendChild(img);
    /* The same species badge the Home portrait wears (v14): the emoji
     * comes from the companions roster entry for this exact species. */
    try {
      var roster = root.RootlingCompanions && root.RootlingCompanions.roster;
      var list = (roster && info.category) ? roster[info.category] : null;
      if (list && info.species) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].name === info.species && list[i].emoji) {
            var b = document.createElement('span');
            b.textContent = list[i].emoji;
            b.setAttribute('aria-hidden', 'true');
            b.style.cssText = 'position:absolute;right:2px;bottom:2px;background:#fff;border:1px solid #426e5a;border-radius:50%;padding:0 4px';
            wrap.style.cssText = 'position:relative;display:inline-block';
            wrap.appendChild(b);
            break;
          }
        }
      }
    } catch (e) { /* the painting alone is fine */ }
    return wrap;
  }

  /* ================= rewards: onComplete only, exactly once ================= */
  function applyReceipt(receipt) {
    if (!receipt || !receipt.id) return false;
    var store;
    try { store = readStore(); } catch (e) { return false; }
    if (store.ledger[receipt.id]) return false;
    var xpAmt = Math.max(0, Math.round(Number(receipt.suggestedXp) || 0));
    var awarded = xpAmt;
    try {
      if (root.RootlingApp && root.RootlingApp.addExperience) {
        var res = root.RootlingApp.addExperience(xpAmt, 'playground ' + (receipt.game || ''));
        if (res && typeof res.added === 'number') awarded = res.added; /* the ledger records what was actually awarded (daily cap) */
      }
    } catch (e) { /* the receipt is still recorded below — the game is never held hostage */ }
    try {
      store = readStore();
      store.ledger[receipt.id] = { xp: awarded, game: receipt.game || '', petId: String(receipt.petId || ''), at: new Date().toISOString() };
      writeStore(store);
    } catch (e) { /* storage trouble: reconcile will see it again next mount */ }
    return true;
  }
  function reconcile(instance) {
    try {
      var save = instance.exportSave();
      (save.rewards || []).forEach(applyReceipt);
    } catch (e) { /* nothing to reconcile */ }
  }

  /* ================= recovery UI (never a silent reset) ================= */
  function clearRecovery() {
    var old = document.getElementById('playground-recovery');
    if (old && old.parentElement) old.parentElement.removeChild(old);
  }
  function simpleBtn(label, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-soft'; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function downloadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY) || '';
      var blob = new Blob([raw], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'rootling-playground-saved-games.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { /* download is a courtesy; retry remains */ }
  }
  function showRecovery(pet) {
    var host = document.getElementById('pet-playground');
    if (!host || !host.parentElement) return;
    clearRecovery();
    var box = document.createElement('div');
    box.className = 'playground-recovery';
    box.id = 'playground-recovery';
    box.setAttribute('role', 'alert');
    var p = document.createElement('p');
    p.textContent = 'Your saved games could not be opened. Nothing was changed or erased.';
    box.appendChild(p);
    var row = document.createElement('div');
    row.className = 'choice-row play-controls';
    row.appendChild(simpleBtn('Try again', function () { tryMount(); }));
    row.appendChild(simpleBtn('Download the saved games file', function () { downloadStore(); }));
    row.appendChild(simpleBtn('Start fresh (deletes the saved games)', function () {
      var cleared = false;
      try {
        var store = readStore();
        if (pet) delete store.saves[pet.id];
        writeStore(store);
        cleared = true;
      } catch (e) { cleared = false; }
      if (!cleared) { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
      tryMount();
    }));
    box.appendChild(row);
    host.parentElement.appendChild(box);
  }

  /* ================= lifecycle ================= */
  var instance = null;
  var mountedFor = null;
  function destroyInstance() {
    if (instance) { try { instance.destroy(); } catch (e) { /* ignore */ } instance = null; }
    mountedFor = null;
  }
  function pruneRemovedPets() {
    try {
      var reg = (root.RootlingCompanions && root.RootlingCompanions.registry) ? root.RootlingCompanions.registry() : null;
      if (!reg || !reg.companions || !reg.companions.length) return;
      var keep = {};
      reg.companions.forEach(function (c) { keep[String(c.id)] = true; });
      var store = readStore();
      var changed = false;
      Object.keys(store.saves).forEach(function (pid) {
        if (!keep[pid]) { delete store.saves[pid]; changed = true; }
      });
      if (changed) writeStore(store);
    } catch (e) { /* pruning is housekeeping, never a blocker */ }
  }
  function loadModule() {
    if (typeof root.mountPlayground === 'function') {
      return Promise.resolve({ mountPlayground: root.mountPlayground });
    }
    return import('./pet-playground.js');
  }
  /* attachShadow can only ever be called once per element, and the
   * module's destroy() empties the shadow root but cannot detach it —
   * so a remount needs a FRESH mount element. The host owns the
   * container, so it swaps in a clean div (same id, same parent) for
   * every mount. This is what makes the README's "a destroyed
   * instance can be replaced on the same element" true in practice. */
  function freshHostEl() {
    var host = document.getElementById('pet-playground');
    if (!host) return null;
    if (!host.parentElement) return host;
    var fresh = document.createElement('div');
    fresh.id = 'pet-playground';
    host.parentElement.replaceChild(fresh, host);
    return fresh;
  }
  function tryMount() {
    var pet = activePet();
    if (!pet) { destroyInstance(); clearRecovery(); return Promise.resolve(false); }
    var acct = accountId();
    destroyInstance();
    clearRecovery();
    var host = freshHostEl();
    if (!host) return Promise.resolve(false);
    return loadModule().then(function (mod) {
      try {
        instance = mod.mountPlayground(host, {
          accountId: acct,
          pet: { id: pet.id, name: pet.name },
          renderPet: renderPet,
          storage: makeStorage(pet.id),
          onComplete: function (receipt) { applyReceipt(receipt); }
        });
        mountedFor = { accountId: acct, petId: pet.id, name: pet.name };
        pruneRemovedPets();
        reconcile(instance);
        return true;
      } catch (e) {
        instance = null; mountedFor = null;
        showRecovery(pet);
        return false;
      }
    }).catch(function () {
      showRecovery(pet);
      return false;
    });
  }
  function recheck() {
    if (!mountedFor) { tryMount(); return; }
    var pet = activePet();
    var acct = accountId();
    if (!pet) { destroyInstance(); clearRecovery(); return; }
    if (pet.id !== mountedFor.petId || acct !== mountedFor.accountId) { tryMount(); return; }
    if (pet.name !== mountedFor.name && instance && typeof instance.updatePet === 'function') {
      try { instance.updatePet({ id: pet.id, name: pet.name }); mountedFor.name = pet.name; }
      catch (e) { tryMount(); }
    }
  }
  try {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) recheck();
    });
  } catch (e) { /* ignore */ }

  var bootTries = 0;
  function boot() {
    tryMount().then(function (ok) {
      if (!ok && !mountedFor && bootTries < 5) {
        /* A showing recovery panel belongs to the user — auto-retries
         * must never clear and re-show it under their hands. */
        if (document.getElementById('playground-recovery')) return;
        bootTries++;
        setTimeout(boot, 400);
      }
    });
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } catch (e) { /* the playground is a bonus; never break boot */ }

  root.RootlingPlaygroundHost = {
    storeKey: STORE_KEY,
    mount: tryMount,
    destroy: destroyInstance,
    refresh: recheck,
    validateSave: validateSave,
    validateStore: validateStore,
    getStore: function () { try { return readStore(); } catch (e) { return null; } },
    exportStore: function () { try { return JSON.parse(JSON.stringify(readStore())); } catch (e) { return null; } },
    removePetSave: function (petId) {
      try { var s = readStore(); delete s.saves[String(petId)]; writeStore(s); } catch (e) { /* ignore */ }
    },
    appliedReceipt: function (id) { try { return !!readStore().ledger[id]; } catch (e) { return false; } },
    applyReceipt: applyReceipt,
    renderPet: renderPet,
    activePet: activePet,
    instance: function () { return instance; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
