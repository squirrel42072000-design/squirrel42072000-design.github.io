/* Rootling — companion collection (2026-10-15 rebuild, Daniel's order).
 * Plain vanilla JS. No build step, no network.
 *
 * Rootling is a companion COLLECTION: one account can own many
 * companions. This file owns the collection layer:
 *  - the roster (six kinds of companions, every species as data),
 *  - the personality cards and the species + personality identity line,
 *  - the registry: every companion an account owns, which one is MAIN
 *    (the first companion adopted is main until the user picks another),
 *    and which one is live on this device right now,
 *  - the vault: the storage-layer swap that gives every companion its
 *    own pet state, check-ins, memory, and care history. The core app
 *    always works with the live companion's stores; this file moves
 *    stores in and out of the vault when the live companion changes.
 *    Home opens on the main companion; a shelf switch lasts for the
 *    visit (this browser session), then Home returns to main.
 *  - the adopt steps (cards, not forms), the collection shelf, the
 *    daily gift moment, and traits a companion grows into over time.
 *
 * Hard law, unchanged: a companion never suffers, never fades, never
 * punishes a missed day — in every care style. Care styles change
 * pacing and rewards only.
 */
(function () {
  'use strict';

  var REGISTRY_KEY = 'rootling-companions-v1';
  var VAULT_KEY = 'rootling-vault-v1';
  var LIVE_KEY = 'rootling-live-companion-v1';
  var PENDING_KEY = 'rootling-pending-adopt-v1';
  var OVERRIDE_KEY = 'rootling-active-override';
  var JUST_ADOPTED_KEY = 'rootling-just-adopted';
  var ADOPTING_KEY = 'rootling-adopting';
  var AS_MAIN_KEY = 'rootling-adopt-as-main';
  function ownerId() {
    try {
      var a = (window.RootlingAccounts && window.RootlingAccounts.current) ? window.RootlingAccounts.current() : null;
      return a ? a.id : 'this-device';
    } catch (e) { return 'this-device'; }
  }

  /* Stores that belong to one companion (moved by the vault). Account-
   * level stores (look and voice picks, reminders, consent) stay put. */
  var VAULT_KEYS = ['sprout-state-v1', 'rootling-exec-v1', 'rootling-well-v1',
    'rootling-social-v1', 'rootling-time-v1', 'rootling-memorybook-v1'];

  /* ---------------- roster data ---------------- */
  var CATEGORIES = [
    { id: 'plants', name: 'Plants', emoji: '🌱', form: 'plant' },
    { id: 'pets', name: 'Pets', emoji: '🐾', form: 'animal' },
    { id: 'mythical', name: 'Mythical Creatures', emoji: '🐉', form: 'animal' },
    { id: 'spirits', name: 'Spirits', emoji: '✨', form: 'animal' },
    { id: 'robots', name: 'Robots', emoji: '🤖', form: 'animal' },
    { id: 'aliens', name: 'Alien Lifeforms', emoji: '👽', form: 'animal' }
  ];
  function catById(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return CATEGORIES[0];
  }

  /* tier: 'Common' | 'Rare' | 'Legendary' (pets). lean: plants carry a
   * personality lean, shown on the card; the chosen personality card
   * still governs how the companion talks. premium: shown with a
   * ribbon and not adoptable in this on-device build — they arrive
   * with the connected version, and nothing here takes payment. */
  var ROSTER = {
    plants: [
      { name: 'Bonsai', emoji: '🎍', phrase: 'patient little bonsai tree', lean: 'Wise · slow growth · a mentor at heart' },
      { name: 'Cactus', emoji: '🌵', phrase: 'plucky cactus', lean: 'Hardy · patient · blooms when it is ready' },
      { name: 'Venus Flytrap', emoji: '🌿', phrase: 'sneaky venus flytrap', lean: 'Mischievous · playful · loves a friendly contest' },
      { name: 'Sunflower', emoji: '🌻', phrase: 'sun-chasing sunflower', lean: 'Cheerful · always turns toward the light' },
      { name: 'Oak Tree', emoji: '🌳', phrase: 'sturdy young oak tree', lean: 'Steady · strong · grows for the long run' },
      { name: 'Cherry Blossom', emoji: '🌸', phrase: 'soft cherry blossom', lean: 'Calm · tender · feels things deeply' },
      { name: 'Bamboo', emoji: '🎋', phrase: 'tall, bendy bamboo', lean: 'Flexible · fast growing · bends, never breaks' },
      { name: 'Rose', emoji: '🌹', phrase: 'graceful rose', lean: 'Graceful · proud · kind under the thorns' },
      { name: 'Orchid', emoji: '🌺', phrase: 'delicate orchid', lean: 'Delicate · rare · quietly stunning' },
      { name: 'Lavender', emoji: '💜', phrase: 'calm lavender', lean: 'Calm · soothing · helps everyone rest' },
      { name: 'Mystic Tree', emoji: '✨', phrase: 'old, whispering mystic tree', lean: 'Ancient · mysterious · full of old stories' },
      { name: 'Crystal Flower', emoji: '💎', phrase: 'sparkling crystal flower', lean: 'Rare · sparkling · catches every light', premium: true },
      { name: 'Moon Blossom', emoji: '🌙', phrase: 'moonlit blossom', lean: 'Gentle · blooms at night', premium: true },
      { name: 'Spirit Tree', emoji: '🌟', phrase: 'glowing spirit tree', lean: 'Wise · glowing · a keeper of memories', premium: true },
      { name: 'Fire Bloom', emoji: '🔥', phrase: 'warm fire bloom', lean: 'Bold · warm · glows with energy', premium: true }
    ],
    pets: [
      { name: 'Dog', emoji: '🐶', phrase: 'loyal dog', tier: 'Common' },
      { name: 'Cat', emoji: '🐱', phrase: 'curious cat', tier: 'Common' },
      { name: 'Rabbit', emoji: '🐰', phrase: 'gentle rabbit', tier: 'Common' },
      { name: 'Hamster', emoji: '🐹', phrase: 'busy little hamster', tier: 'Common' },
      { name: 'Fox', emoji: '🦊', phrase: 'clever fox', tier: 'Common' },
      { name: 'Owl', emoji: '🦉', phrase: 'watchful owl', tier: 'Common' },
      { name: 'Panda', emoji: '🐼', phrase: 'easy-going panda', tier: 'Common' },
      { name: 'Wolf', emoji: '🐺', phrase: 'wild-hearted wolf', tier: 'Rare' },
      { name: 'Tiger', emoji: '🐯', phrase: 'bold tiger', tier: 'Rare' },
      { name: 'Red Panda', emoji: '🔴', phrase: 'shy red panda', tier: 'Rare' },
      { name: 'Arctic Fox', emoji: '❄️', phrase: 'snow-white arctic fox', tier: 'Rare' }
    ],
    mythical: [
      { name: 'Dragon', emoji: '🐉', phrase: 'ancient dragon', tier: 'Legendary' },
      { name: 'Phoenix', emoji: '🔥', phrase: 'bright phoenix', tier: 'Legendary' },
      { name: 'Griffin', emoji: '🦅', phrase: 'proud griffin', tier: 'Legendary' },
      { name: 'Unicorn', emoji: '🦄', phrase: 'gentle unicorn', tier: 'Legendary' },
      { name: 'Kraken', emoji: '🐙', phrase: 'deep-sea kraken', tier: 'Rare' },
      { name: 'Fairy Dragon', emoji: '🧚', phrase: 'tiny fairy dragon', tier: 'Rare' },
      { name: 'Pegasus', emoji: '🐴', phrase: 'sky-galloping pegasus', tier: 'Rare' },
      { name: 'Shadow Dragon', emoji: '🌑', phrase: 'quiet shadow dragon', tier: 'Legendary' }
    ],
    spirits: [
      { name: 'Forest Spirit', emoji: '🌲', phrase: 'forest spirit' },
      { name: 'Guardian Spirit', emoji: '🛡️', phrase: 'guardian spirit' },
      { name: 'Water Spirit', emoji: '💧', phrase: 'water spirit' },
      { name: 'Fire Spirit', emoji: '🔥', phrase: 'fire spirit' },
      { name: 'Moon Spirit', emoji: '🌙', phrase: 'moon spirit' }
    ],
    robots: [
      { name: 'Assistant Bot', emoji: '🤖', phrase: 'helpful assistant bot' },
      { name: 'Exploration Bot', emoji: '🚀', phrase: 'curious exploration bot' },
      { name: 'Learning Bot', emoji: '🎓', phrase: 'eager learning bot' },
      { name: 'Builder Bot', emoji: '🛠️', phrase: 'handy builder bot' },
      { name: 'Research Bot', emoji: '🔬', phrase: 'careful research bot' }
    ],
    aliens: [
      { name: 'Glow Slime', emoji: '💚', phrase: 'glowing slime' },
      { name: 'Star Creature', emoji: '⭐', phrase: 'tiny star creature' },
      { name: 'Cosmic Bloom', emoji: '🌌', phrase: 'cosmic bloom' },
      { name: 'Nebula Pet', emoji: '🪐', phrase: 'dreamy nebula pet' }
    ]
  };
  function speciesEntry(categoryId, speciesName) {
    var list = ROSTER[categoryId] || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === speciesName) return list[i];
    return null;
  }

  var PERSONALITIES = [
    { id: 'friendly', emoji: '😊', name: 'Friendly', line: 'I’m happiest making new friends.', voice: 'Friendly', verb: 'loves meeting new friends and makes everyone feel welcome' },
    { id: 'scholar', emoji: '🧠', name: 'Scholar', line: 'I love learning new things.', voice: 'Professional', verb: 'loves learning new things and sharing what it learns' },
    { id: 'adventurer', emoji: '⚔️', name: 'Adventurer', line: 'Let’s explore the world together.', voice: 'Cheerful', verb: 'is always ready to explore somewhere new' },
    { id: 'comedian', emoji: '🎭', name: 'Comedian', line: 'I promise terrible jokes.', voice: 'Playful', verb: 'constantly jokes and can find the funny side of anything' },
    { id: 'guardian', emoji: '🛡️', name: 'Guardian', line: 'I’ll always have your back.', voice: 'Calm', verb: 'watches over the people it loves and keeps them safe' },
    { id: 'leader', emoji: '💎', name: 'Leader', line: 'Follow me — I know a good path.', voice: 'Motivational', verb: 'leads the way and lifts everyone around it' },
    { id: 'dreamer', emoji: '🌙', name: 'Dreamer', line: 'I dream in colours you have never seen.', voice: 'Calm', verb: 'dreams big gentle dreams and wonders about the stars' },
    { id: 'competitive', emoji: '🔥', name: 'Competitive', line: 'A friendly race? Always.', voice: 'Cheerful', verb: 'loves a friendly challenge and plays to win, kindly' },
    { id: 'empath', emoji: '❤️', name: 'Empath', line: 'I remember how you feel.', voice: 'Friendly', verb: 'remembers your feelings and always makes room for them' },
    { id: 'creative', emoji: '🎨', name: 'Creative', line: 'Give me a blank page and watch.', voice: 'Playful', verb: 'turns small moments into little works of art' },
    { id: 'custom', emoji: '🌟', name: 'Custom', line: 'A blend of everything — uniquely yours.', voice: 'Friendly', verb: 'is a one-of-a-kind blend, growing its own way' }
  ];
  function personalityById(id) {
    for (var i = 0; i < PERSONALITIES.length; i++) if (PERSONALITIES[i].id === id) return PERSONALITIES[i];
    return PERSONALITIES[0];
  }
  /* Daniel's showcased pairings, word for word. */
  var IDENTITY_OVERRIDES = {
    'Dragon|scholar': 'A wise ancient dragon that loves teaching.',
    'Fox|comedian': 'A mischievous fox that constantly jokes.',
    'Cherry Blossom|empath': 'A nurturing blossom that remembers your feelings.'
  };
  function identityLine(speciesName, personalityId, categoryId) {
    var key = speciesName + '|' + personalityId;
    if (IDENTITY_OVERRIDES[key]) return IDENTITY_OVERRIDES[key];
    var entry = speciesEntry(categoryId, speciesName);
    var phrase = entry ? entry.phrase : String(speciesName || 'companion').toLowerCase();
    var p = personalityById(personalityId);
    var article = /^[aeiou]/i.test(phrase) ? 'An ' : 'A ';
    return article + phrase + ' that ' + p.verb + '.';
  }

  var GIFT_LINES = [
    'I found a smooth pebble while you were away. I kept it for you.',
    'I saved you the warmest patch of sunlight.',
    'I practised a smile, for when you got back.',
    'I found a tiny leaf shaped like a heart.',
    'I hummed a little song and saved the best part for you.',
    'I watched the clouds and picked the softest one for you.',
    'I learned a new word today. It means “glad you are here”.'
  ];
  var TRAIT_WORDS = {
    chat: 'a warm talker', play: 'adventurous',
    focus: 'thoughtful and focused', care: 'gentle-hearted'
  };

  /* ---------------- storage helpers ---------------- */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage off */ } }
  function lsRemove(k) { try { window.localStorage.removeItem(k); } catch (e) { /* storage off */ } }
  function parseJson(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function dayKey(d) {
    d = d || new Date();
    function p(n) { return String(n).length < 2 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function uid() {
    return 'comp-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000000000).toString(36);
  }

  function loadRegistry() {
    var r = parseJson(lsGet(REGISTRY_KEY));
    if (r && Array.isArray(r.companions)) return r;
    return { companions: [], activeId: null };
  }
  function saveRegistry(r) { lsSet(REGISTRY_KEY, JSON.stringify(r)); }
  function loadVault() { return parseJson(lsGet(VAULT_KEY)) || {}; }
  function saveVault(v) { lsSet(VAULT_KEY, JSON.stringify(v)); }
  function liveId() { return lsGet(LIVE_KEY) || null; }
  function entryById(reg, id) {
    for (var i = 0; i < reg.companions.length; i++) if (reg.companions[i].id === id) return reg.companions[i];
    return null;
  }
  function mainEntry(reg) {
    for (var i = 0; i < reg.companions.length; i++) if (reg.companions[i].isMain) return reg.companions[i];
    return reg.companions[0] || null;
  }

  /* ---------------- the vault swap ---------------- */
  function snapshotLive() {
    var snap = {};
    VAULT_KEYS.forEach(function (k) {
      var v = lsGet(k);
      if (v !== null && v !== undefined) snap[k] = v;
    });
    return snap;
  }
  function restoreSnapshot(snap) {
    VAULT_KEYS.forEach(function (k) {
      if (snap && typeof snap[k] === 'string') lsSet(k, snap[k]);
      else lsRemove(k);
    });
  }
  function swapTo(companionId) {
    var reg = loadRegistry();
    var vault = loadVault();
    var live = liveId();
    if (live && live !== companionId) vault[live] = snapshotLive();
    if (live !== companionId) {
      restoreSnapshot(vault[companionId] || null);
      lsSet(LIVE_KEY, companionId);
    }
    reg.activeId = companionId;
    saveVault(vault);
    saveRegistry(reg);
  }
  function clearLiveForNewCompanion() {
    var vault = loadVault();
    var live = liveId();
    if (live) vault[live] = snapshotLive();
    restoreSnapshot(null);
    lsRemove(LIVE_KEY);
    saveVault(vault);
  }

  /* ---------------- seeding + home-opens-on-main ---------------- */
  function seedFromExistingPet() {
    var reg = loadRegistry();
    if (reg.companions.length) return reg;
    var state = parseJson(lsGet('sprout-state-v1'));
    if (!state || !state.petName) return reg;
    var form = state.form === 'animal' ? 'animal' : 'plant';
    var category = state.category || (form === 'plant' ? 'plants' : 'pets');
    var species = state.species || (form === 'plant' ? 'Sprout' : 'Companion Cub');
    var personalityId = state.companionPersonality || 'friendly';
    var entry = {
      id: uid(), ownerId: ownerId(),
      name: state.petName, category: category, species: species,
      form: form, personality: personalityId,
      identityLine: state.identityLine || identityLine(species, personalityId, category),
      isMain: true, createdAt: state.createdDate || dayKey(),
      interactions: { chat: 0, play: 0, focus: 0, care: 0, days: {} },
      traitWord: '', traitAnnounced: false, giftLastOpened: ''
    };
    reg.companions.push(entry);
    reg.activeId = entry.id;
    saveRegistry(reg);
    lsSet(LIVE_KEY, entry.id);
    return reg;
  }

  function ensureOnLoad() {
    var adopting = false;
    try { adopting = !!window.sessionStorage.getItem(ADOPTING_KEY); } catch (e) { adopting = false; }
    if (adopting) return; /* mid-adoption of another companion: leave the fresh stores alone */
    var reg = seedFromExistingPet();
    if (!reg.companions.length) return;
    /* Exactly one main. */
    var mains = reg.companions.filter(function (c) { return c.isMain; });
    if (mains.length !== 1) {
      reg.companions.forEach(function (c, i) { c.isMain = (i === 0); });
      saveRegistry(reg);
    }
    var live = liveId();
    /* If the live stores were wiped (for example the user deleted their
     * data in Privacy), the live companion's record goes with them when
     * it has no vault copy left. */
    if (live && !parseJson(lsGet('sprout-state-v1'))) {
      var vault = loadVault();
      if (vault[live]) { restoreSnapshot(vault[live]); }
      else {
        reg.companions = reg.companions.filter(function (c) { return c.id !== live; });
        lsRemove(LIVE_KEY);
        live = null;
        if (reg.companions.length && !mainEntry(reg).isMain) reg.companions[0].isMain = true;
        saveRegistry(reg);
      }
    }
    if (!reg.companions.length) return;
    var override = null;
    try { override = window.sessionStorage.getItem(OVERRIDE_KEY); } catch (e) { override = null; }
    var desired = (override && entryById(reg, override)) ? override : mainEntry(reg).id;
    if (liveId() !== desired) swapTo(desired);
    else { reg.activeId = desired; saveRegistry(reg); }
  }

  /* Called by the core adopt form when a companion is adopted. */
  function registerAdoption(info) {
    var reg = loadRegistry();
    var adoptAsMain = false;
    try {
      adoptAsMain = !!window.sessionStorage.getItem(AS_MAIN_KEY);
      window.sessionStorage.removeItem(AS_MAIN_KEY);
    } catch (e) { adoptAsMain = false; }
    if (adoptAsMain) reg.companions.forEach(function (c) { c.isMain = false; });
    var pending = parseJson(lsGet(PENDING_KEY)) || {};
    var category = info.category || pending.category || (info.form === 'plant' ? 'plants' : 'pets');
    var species = info.species || pending.species || (info.form === 'plant' ? 'Sprout' : 'Companion Cub');
    var personalityId = info.personality || pending.personalityId || 'friendly';
    var entry = {
      id: uid(), ownerId: ownerId(),
      name: info.name, category: category, species: species,
      form: info.form || catById(category).form,
      personality: personalityId,
      identityLine: info.identityLine || pending.identityLine || identityLine(species, personalityId, category),
      isMain: reg.companions.length === 0 || adoptAsMain,
      createdAt: dayKey(),
      interactions: { chat: 0, play: 0, focus: 0, care: 0, days: {} },
      traitWord: '', traitAnnounced: false, giftLastOpened: ''
    };
    reg.companions.push(entry);
    reg.activeId = entry.id;
    saveRegistry(reg);
    lsSet(LIVE_KEY, entry.id);
    lsRemove(PENDING_KEY);
    try {
      window.sessionStorage.setItem(OVERRIDE_KEY, entry.id);
      window.sessionStorage.setItem(JUST_ADOPTED_KEY, entry.id);
      window.sessionStorage.removeItem(ADOPTING_KEY);
    } catch (e) { /* ignore */ }
    /* The chosen personality also picks how the pet talks (the existing
     * voice bundles), through the same switch Settings uses. */
    try {
      var sel = document.getElementById('personality-select');
      var voice = personalityById(personalityId).voice;
      if (sel && voice && sel.value !== voice) {
        sel.value = voice;
        sel.dispatchEvent(new window.Event('change', { bubbles: true }));
      }
    } catch (e) { /* the pick still stands in the registry */ }
    return entry;
  }

  /* Rename any companion, free, any time. The name lives in the
   * registry AND in that companion's own pet state (live stores, or its
   * vault snapshot), so both are updated and the new name is used
   * everywhere at once. */
  function renameCompanion(id, newName) {
    newName = String(newName === null || newName === undefined ? '' : newName).trim().slice(0, 24);
    if (!newName) return false;
    var reg = loadRegistry();
    var entry = entryById(reg, id);
    if (!entry) return false;
    entry.name = newName;
    saveRegistry(reg);
    if (id === liveId()) {
      try {
        var api = (typeof window !== 'undefined' && (window.RootlingApp || window.SproutApp)) || null;
        if (api && typeof api.getState === 'function' && typeof api.saveState === 'function') {
          var st = api.getState();
          if (st) { st.petName = newName; api.saveState(st); }
        }
      } catch (e) { /* registry still carries the new name */ }
      var disp = document.getElementById('pet-name-display');
      if (disp) disp.textContent = newName;
    } else {
      var vault = loadVault();
      if (vault[id] && vault[id]['sprout-state-v1']) {
        var stv = parseJson(vault[id]['sprout-state-v1']);
        if (stv) { stv.petName = newName; vault[id]['sprout-state-v1'] = JSON.stringify(stv); saveVault(vault); }
      }
    }
    renderShelf();
    renderGift();
    fillManageCard();
    return true;
  }

  /* Choose a new main companion: the adoption steps reopen for the main
   * slot. The current main is vaulted like any companion — it keeps its
   * level, memory, and place in the collection. Nothing is deleted,
   * nothing is framed as leaving. */
  function chooseNewMain() {
    clearLiveForNewCompanion();
    try {
      window.sessionStorage.removeItem(OVERRIDE_KEY);
      window.sessionStorage.setItem(ADOPTING_KEY, '1');
      window.sessionStorage.setItem(AS_MAIN_KEY, '1');
    } catch (e) { /* ignore */ }
    window.location.reload();
  }

  window.RootlingCompanions = {
    registry: loadRegistry,
    registerAdoption: registerAdoption,
    rename: renameCompanion,
    chooseNewMain: chooseNewMain,
    identityLine: identityLine,
    roster: ROSTER,
    categories: CATEGORIES,
    personalities: PERSONALITIES,
    swapTo: function (id) {
      try { window.sessionStorage.setItem(OVERRIDE_KEY, id); } catch (e) { /* ignore */ }
      swapTo(id);
      window.location.reload();
    },
    makeMain: function (id) {
      var reg = loadRegistry();
      reg.companions.forEach(function (c) { c.isMain = (c.id === id); });
      saveRegistry(reg);
      try { window.sessionStorage.setItem(OVERRIDE_KEY, id); } catch (e) { /* ignore */ }
      swapTo(id);
      window.location.reload();
    },
    forgetLive: function () {
      var reg = loadRegistry();
      var live = liveId();
      if (!live) return;
      reg.companions = reg.companions.filter(function (c) { return c.id !== live; });
      var vault = loadVault();
      delete vault[live];
      saveVault(vault);
      lsRemove(LIVE_KEY);
      if (reg.companions.length) {
        if (!mainEntry(reg).isMain) reg.companions[0].isMain = true;
        reg.activeId = mainEntry(reg).id;
      } else reg.activeId = null;
      saveRegistry(reg);
      try { window.sessionStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* ignore */ }
    },
    adoptAnother: function () {
      clearLiveForNewCompanion();
      try {
        window.sessionStorage.removeItem(OVERRIDE_KEY);
        window.sessionStorage.setItem(ADOPTING_KEY, '1');
      } catch (e) { /* ignore */ }
      window.location.reload();
    }
  };

  ensureOnLoad();

  /* ---------------- DOM: adopt steps, shelf, home extras ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function scrollToId(id) {
    var t = $(id);
    if (t && t.scrollIntoView) { try { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { t.scrollIntoView(); } }
  }

  var pending = parseJson(lsGet(PENDING_KEY)) || {
    personalityId: 'friendly', category: 'plants', species: 'Bonsai'
  };
  function savePending() {
    pending.identityLine = identityLine(pending.species, pending.personalityId, pending.category);
    lsSet(PENDING_KEY, JSON.stringify(pending));
  }

  var step = 1;
  function showStep(n) {
    step = n;
    var panels = document.querySelectorAll('[data-adopt-step]');
    for (var i = 0; i < panels.length; i++) {
      panels[i].hidden = panels[i].getAttribute('data-adopt-step') !== String(n);
    }
    var back = $('adopt-back-btn'), next = $('adopt-next-btn');
    if (back) back.hidden = (n === 1);
    if (next) next.hidden = (n === 3);
    if (n === 3) fillIdentityPreview();
  }
  function fillIdentityPreview() {
    var p = $('adopt-identity-preview');
    if (p) p.textContent = 'Your companion: ' + identityLine(pending.species, pending.personalityId, pending.category);
  }

  function renderSpecies() {
    var grid = $('adopt-species-grid');
    if (!grid) return;
    var list = ROSTER[pending.category] || [];
    grid.innerHTML = list.map(function (s) {
      var sub = s.premium ? 'Premium — arrives with the connected version'
        : (s.lean || s.tier || '');
      return '<button type="button" class="pick-card species-card' +
        (pending.species === s.name ? ' selected' : '') + '"' +
        ' data-species="' + esc(s.name) + '" role="radio" aria-checked="' +
        (pending.species === s.name ? 'true' : 'false') + '"' +
        (s.premium ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="pick-emoji" aria-hidden="true">' + s.emoji + '</span>' +
        '<span class="pick-name">' + esc(s.name) + '</span>' +
        (sub ? '<span class="pick-sub">' + esc(sub) + '</span>' : '') +
        (s.premium ? '<span class="pick-ribbon">Premium</span>' : '') +
        '</button>';
    }).join('');
    var cards = grid.querySelectorAll('[data-species]');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        pending.species = this.getAttribute('data-species');
        savePending();
        renderSpecies();
        fillIdentityPreview();
      });
    }
  }

  function markTypeSelected() {
    var cards = document.querySelectorAll('[data-category]');
    for (var i = 0; i < cards.length; i++) {
      var on = cards[i].getAttribute('data-category') === pending.category;
      cards[i].classList.toggle('selected', on);
      cards[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }
  function markPersonalitySelected() {
    var cards = document.querySelectorAll('[data-personality]');
    for (var i = 0; i < cards.length; i++) {
      var on = cards[i].getAttribute('data-personality') === pending.personalityId;
      cards[i].classList.toggle('selected', on);
      cards[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }
  var syncingForm = false;
  function syncCoreForm() {
    /* Keep the core app's plant/animal form in step with the chosen
     * kind, through the same buttons the core already listens to. The
     * Plant/Pet type cards ARE those buttons, so guard the click: while
     * syncing, the type-card listener stands down and only the core's
     * form handler runs. */
    var want = catById(pending.category).form;
    var btn = document.querySelector('[data-form-choice="' + want + '"]');
    if (btn) {
      syncingForm = true;
      try { btn.click(); } catch (e) { /* ignore */ }
      syncingForm = false;
    }
    setTimeout(markTypeSelected, 30);
  }

  function initAdoptSteps() {
    var form = $('adopt-form');
    if (!form) return;
    savePending();
    markPersonalitySelected();
    markTypeSelected();
    renderSpecies();
    showStep(1);
    var pCards = document.querySelectorAll('[data-personality]');
    for (var i = 0; i < pCards.length; i++) {
      pCards[i].addEventListener('click', function () {
        pending.personalityId = this.getAttribute('data-personality');
        savePending();
        markPersonalitySelected();
        fillIdentityPreview();
      });
    }
    var tCards = document.querySelectorAll('[data-category]');
    for (var j = 0; j < tCards.length; j++) {
      tCards[j].addEventListener('click', function () {
        if (syncingForm) return; /* a form sync click, not a user choice */
        pending.category = this.getAttribute('data-category');
        var first = (ROSTER[pending.category] || []).filter(function (s) { return !s.premium; })[0];
        if (first) pending.species = first.name;
        savePending();
        markTypeSelected();
        renderSpecies();
        syncCoreForm();
        fillIdentityPreview();
      });
    }
    var next = $('adopt-next-btn'), back = $('adopt-back-btn');
    if (next) next.addEventListener('click', function () { if (step < 3) showStep(step + 1); });
    if (back) back.addEventListener('click', function () { if (step > 1) showStep(step - 1); });
  }

  /* ---------------- shelf ---------------- */
  var STAGE_NAMES = {
    plant: ['Seed', 'Sprout', 'Bud', 'Bloom'],
    animal: ['Egg', 'Nestling', 'Cub', 'Grown']
  };
  var STAGE_MINS = [0, 25, 70, 140];
  function stageForSunshine(sunshine, form) {
    var idx = 0;
    for (var i = 0; i < STAGE_MINS.length; i++) if (sunshine >= STAGE_MINS[i]) idx = i;
    return { level: idx + 1, name: (STAGE_NAMES[form] || STAGE_NAMES.animal)[idx] };
  }
  function sunshineOf(entry) {
    var raw = null;
    if (entry.id === liveId()) raw = lsGet('sprout-state-v1');
    else {
      var vault = loadVault();
      if (vault[entry.id]) raw = vault[entry.id]['sprout-state-v1'];
    }
    var st = parseJson(raw);
    return (st && typeof st.sunshine === 'number') ? st.sunshine : 0;
  }
  function speciesEmoji(entry) {
    var s = speciesEntry(entry.category, entry.species);
    if (s) return s.emoji;
    return entry.form === 'plant' ? '🌱' : '🐾';
  }
  function renderShelf() {
    var list = $('companions-list');
    if (!list) return;
    var reg = loadRegistry();
    var live = liveId();
    if (!reg.companions.length) {
      list.innerHTML = '<p class="gentle">No companions yet. Your first companion is waiting in the adoption steps above.</p>';
      return;
    }
    list.innerHTML = reg.companions.map(function (c) {
      var st = stageForSunshine(sunshineOf(c), c.form);
      var p = personalityById(c.personality);
      var badges = '';
      if (c.isMain) badges += '<span class="shelf-badge main">⭐ Main companion</span>';
      if (c.id === live) badges += '<span class="shelf-badge">On Home now</span>';
      if (c.traitWord) badges += '<span class="shelf-badge">Grown trait: ' + esc(c.traitWord) + '</span>';
      var actions = '';
      if (c.id !== live) actions += '<button type="button" class="btn btn-soft" data-shelf-switch="' + c.id + '">Bring to Home</button>';
      if (!c.isMain) actions += '<button type="button" class="btn btn-soft" data-shelf-main="' + c.id + '">Make main</button>';
      actions += '<button type="button" class="btn btn-soft" data-shelf-rename="' + c.id + '">Rename</button>';
      if (c.isMain) actions += '<button type="button" class="btn btn-soft" data-shelf-newmain="1">Choose a new main companion</button>';
      return '<div class="shelf-card">' +
        '<span class="pick-emoji" aria-hidden="true">' + speciesEmoji(c) + '</span>' +
        '<div class="shelf-words">' +
        '<strong>' + esc(c.name) + '</strong> — ' + esc(c.species) + ' · ' + p.emoji + ' ' + esc(p.name) + '<br>' +
        '<span class="gentle small">Level ' + st.level + ' · ' + esc(st.name) + ' stage</span><br>' +
        '<span class="gentle small">' + esc(c.identityLine || '') + '</span>' +
        (badges ? '<div class="shelf-badges">' + badges + '</div>' : '') +
        (actions ? '<div class="choice-row shelf-actions">' + actions + '</div>' : '') +
        '<div class="shelf-rename" id="rename-box-' + c.id + '" hidden>' +
        '<label for="rename-input-' + c.id + '">New name for ' + esc(c.name) + '</label>' +
        '<input type="text" id="rename-input-' + c.id + '" data-rename-input="' + c.id + '" maxlength="24" value="' + esc(c.name) + '" autocomplete="off">' +
        '<div class="choice-row">' +
        '<button type="button" class="btn btn-primary" data-rename-save="' + c.id + '">Save name</button>' +
        '<button type="button" class="btn btn-ghost" data-rename-cancel="' + c.id + '">Cancel</button>' +
        '</div></div>' +
        '</div></div>';
    }).join('');
    var sw = list.querySelectorAll('[data-shelf-switch]');
    for (var i = 0; i < sw.length; i++) sw[i].addEventListener('click', function () {
      window.RootlingCompanions.swapTo(this.getAttribute('data-shelf-switch'));
    });
    var mm = list.querySelectorAll('[data-shelf-main]');
    for (var j = 0; j < mm.length; j++) mm[j].addEventListener('click', function () {
      window.RootlingCompanions.makeMain(this.getAttribute('data-shelf-main'));
    });
    var rn = list.querySelectorAll('[data-shelf-rename]');
    for (var r = 0; r < rn.length; r++) rn[r].addEventListener('click', function () {
      var box = $('rename-box-' + this.getAttribute('data-shelf-rename'));
      if (box) {
        box.hidden = !box.hidden;
        var inp = box.querySelector('input');
        if (inp && !box.hidden && inp.focus) inp.focus();
      }
    });
    var sv = list.querySelectorAll('[data-rename-save]');
    for (var s2 = 0; s2 < sv.length; s2++) sv[s2].addEventListener('click', function () {
      var id = this.getAttribute('data-rename-save');
      var inp = list.querySelector('[data-rename-input="' + id + '"]');
      renameCompanion(id, inp ? inp.value : '');
    });
    var cc = list.querySelectorAll('[data-rename-cancel]');
    for (var c2 = 0; c2 < cc.length; c2++) cc[c2].addEventListener('click', function () {
      var box = $('rename-box-' + this.getAttribute('data-rename-cancel'));
      if (box) box.hidden = true;
    });
    var nm = list.querySelectorAll('[data-shelf-newmain]');
    for (var n2 = 0; n2 < nm.length; n2++) nm[n2].addEventListener('click', openChangeMain);
  }

  /* ---------------- rename + change-main (Settings + confirm) ------- */
  function fillManageCard() {
    var entry = liveEntry();
    var current = $('companion-manage-current');
    if (current) {
      var main = mainEntry(loadRegistry());
      current.textContent = entry
        ? (main && main.id === entry.id
          ? entry.name + ' is your main companion — the one who greets you on Home.'
          : 'You are visiting ' + entry.name + '. Your main companion is ' + (main ? main.name : 'not picked yet') + '.')
        : 'No companion yet.';
    }
    var input = $('rename-input');
    if (input && entry && document.activeElement !== input) input.value = entry.name;
  }
  function openChangeMain() {
    var card = $('change-main-confirm');
    if (!card) { chooseNewMain(); return; }
    var main = mainEntry(loadRegistry());
    var line = $('change-main-current');
    if (line) line.textContent = main
      ? 'Right now, ' + main.name + ' is your main companion. ' + main.name +
        ' stays in your collection with every level and every memory, whatever you choose. Your new companion simply becomes the one who greets you.'
      : 'Your new companion becomes the one who greets you on Home.';
    card.hidden = false;
    scrollToEl(card);
  }
  function bindManage() {
    var renameBtn = $('rename-btn');
    if (renameBtn) renameBtn.addEventListener('click', function () {
      var input = $('rename-input');
      var status = $('rename-status');
      var entry = liveEntry();
      if (!entry) { if (status) status.textContent = 'Adopt a companion first, then you can rename them here.'; return; }
      if (renameCompanion(entry.id, input ? input.value : '')) {
        if (status) status.textContent = 'Saved. Say hello to ' + (input ? input.value.trim() : '') + ' — the new name is used everywhere now.';
      } else if (status) status.textContent = 'Please write a name first.';
    });
    var changeBtn = $('change-main-btn');
    if (changeBtn) changeBtn.addEventListener('click', openChangeMain);
    var yes = $('change-main-yes-btn');
    if (yes) yes.addEventListener('click', chooseNewMain);
    var no = $('change-main-no-btn');
    if (no) no.addEventListener('click', function () { var c = $('change-main-confirm'); if (c) c.hidden = true; });
    var instead = $('change-main-rename-btn');
    if (instead) instead.addEventListener('click', function () {
      var c = $('change-main-confirm'); if (c) c.hidden = true;
      var input = $('rename-input');
      if (input) { scrollToEl(input); if (input.focus) input.focus(); }
    });
    fillManageCard();
  }
  function scrollToEl(elm) { if (elm && elm.scrollIntoView) { try { elm.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { elm.scrollIntoView(); } } }

  /* ---------------- home extras: gift, welcome, trait ---------------- */
  function liveEntry() {
    var reg = loadRegistry();
    return entryById(reg, liveId()) || mainEntry(reg);
  }
  function renderGift() {
    var box = $('daily-gift');
    if (!box) return;
    var entry = liveEntry();
    if (!entry) { box.innerHTML = ''; return; }
    if (entry.giftLastOpened === dayKey()) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="gentle">' + esc(entry.name) + ' found something while you were away.</p>' +
      '<button type="button" class="btn btn-soft" id="gift-open-btn">🎁 Open your gift</button>' +
      '<p class="gentle" id="gift-line" role="status"></p>';
    var btn = $('gift-open-btn');
    if (btn) btn.addEventListener('click', function () {
      var reg = loadRegistry();
      var e2 = entryById(reg, entry.id);
      if (e2) { e2.giftLastOpened = dayKey(); saveRegistry(reg); }
      var line = GIFT_LINES[Math.floor(Math.random() * GIFT_LINES.length)];
      var gl = $('gift-line');
      if (gl) gl.textContent = line;
      btn.hidden = true;
    });
  }

  function showWelcomeIfNew() {
    var flag = null;
    try { flag = window.sessionStorage.getItem(JUST_ADOPTED_KEY); } catch (e) { flag = null; }
    if (!flag) return;
    try { window.sessionStorage.removeItem(JUST_ADOPTED_KEY); } catch (e) { /* ignore */ }
    var main = $('main-view');
    var entry = liveEntry();
    if (!main || !entry || main.hidden) return;
    var account = (window.RootlingAccounts && window.RootlingAccounts.current) ? window.RootlingAccounts.current() : null;
    var userName = account ? account.name : 'friend';
    var card = document.createElement('section');
    card.className = 'card welcome-card';
    card.id = 'welcome-card';
    card.innerHTML =
      '<h3>' + esc(entry.name) + ' says hello</h3>' +
      '<p class="q">Hi ' + esc(userName) + '! I’m ' + esc(entry.name) + ', your ' + esc(entry.species) + '. ' +
      esc(entry.identityLine || '') + ' I’m excited to start growing with you.</p>' +
      '<p class="q">One last pick, only if you like: how would you like to care for ' + esc(entry.name) + '? You can change this any time in Settings.</p>' +
      '<div class="choice-row">' +
      '<button type="button" class="btn btn-choice" data-care-offer="casual">🌿 Casual — low upkeep</button>' +
      '<button type="button" class="btn btn-choice" data-care-offer="balanced">🌱 Balanced — standard</button>' +
      '<button type="button" class="btn btn-choice" data-care-offer="dedicated">🌟 Dedicated — faster growing</button>' +
      '<button type="button" class="btn btn-choice" data-care-offer="hardcore">🔥 Hardcore — daily care, fastest growing</button>' +
      '</div>' +
      '<p class="fineprint">In every style, ' + esc(entry.name) + ' never suffers, never fades, and never makes you feel bad about a missed day. Styles change pacing and rewards only.</p>' +
      '<button type="button" class="btn btn-ghost" id="welcome-done-btn">Start playing</button>';
    main.insertBefore(card, main.firstChild);
    var done = $('welcome-done-btn');
    if (done) done.addEventListener('click', function () { card.remove(); });
    var offers = card.querySelectorAll('[data-care-offer]');
    for (var i = 0; i < offers.length; i++) {
      offers[i].addEventListener('click', function () {
        var style = this.getAttribute('data-care-offer');
        var st = parseJson(lsGet('sprout-state-v1'));
        if (st) { st.careStyle = style; lsSet('sprout-state-v1', JSON.stringify(st)); }
        var radio = document.querySelector('input[name="care-style"][value="' + style + '"]');
        if (radio) radio.checked = true;
        var status = $('care-style-status');
        if (status) status.textContent = 'Care style saved: ' + style + '.';
        card.remove();
      });
    }
  }

  function showTraitBannerIfNew() {
    var entry = liveEntry();
    if (!entry || !entry.traitWord || entry.traitAnnounced) return;
    var main = $('main-view');
    if (!main || main.hidden) return;
    var card = document.createElement('section');
    card.className = 'card welcome-card';
    card.innerHTML = '<h3>Something new about ' + esc(entry.name) + '</h3>' +
      '<p class="q">Your companion seems ' + esc(entry.traitWord) + ' — a trait they have grown into, from all your time together.</p>' +
      '<button type="button" class="btn btn-soft" id="trait-ok-btn">Lovely</button>';
    main.insertBefore(card, main.firstChild);
    var btn = $('trait-ok-btn');
    if (btn) btn.addEventListener('click', function () {
      var reg = loadRegistry();
      var e2 = entryById(reg, entry.id);
      if (e2) { e2.traitAnnounced = true; saveRegistry(reg); }
      card.remove();
    });
  }

  function fillTraitLines() {
    var entry = liveEntry();
    var chosen = $('personality-chosen-line');
    if (chosen && entry) {
      var p = personalityById(entry.personality);
      chosen.textContent = 'Chosen at adoption: ' + p.emoji + ' ' + p.name + ' — “' + p.line + '” ' +
        (entry.identityLine || '');
    }
    var trait = $('trait-line');
    if (trait) {
      trait.textContent = entry && entry.traitWord
        ? 'Grown trait: your companion seems ' + entry.traitWord + '. Traits grow from time together; they are never picked for you and never taken away.'
        : 'Grown traits appear here after you and your companion have spent some time together.';
    }
  }

  /* Interaction counting (for grown traits). One delegated listener;
   * counts kinds of time together, never the person. */
  function countInteraction(kind) {
    var reg = loadRegistry();
    var entry = entryById(reg, liveId());
    if (!entry) return;
    if (!entry.interactions) entry.interactions = { chat: 0, play: 0, focus: 0, care: 0, days: {} };
    entry.interactions[kind] = (entry.interactions[kind] || 0) + 1;
    entry.interactions.days[dayKey()] = 1;
    if (!entry.traitWord) {
      var total = entry.interactions.chat + entry.interactions.play + entry.interactions.focus + entry.interactions.care;
      var days = Object.keys(entry.interactions.days).length;
      if (total >= 25 && days >= 3) {
        var best = 'care', bestN = -1;
        ['chat', 'play', 'focus', 'care'].forEach(function (k) {
          if (entry.interactions[k] > bestN) { bestN = entry.interactions[k]; best = k; }
        });
        entry.traitWord = TRAIT_WORDS[best];
        entry.traitAnnounced = false;
      }
    }
    saveRegistry(reg);
  }
  function bindInteractionCounting() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#social-view') || t.closest('#dash-chat-btn')) countInteraction('chat');
      else if (t.closest('#time-view') || t.closest('#dash-play-btn') || t.closest('[data-adventure]')) countInteraction('play');
      else if (t.closest('#exec-view') || t.closest('#today-focus-btn')) countInteraction('focus');
      else if (t.closest('.mood-btn') || t.closest('#water-plus') || t.closest('#move-little') || t.closest('#move-lot') || t.closest('#sleep-save')) countInteraction('care');
    });
  }

  function bindDashboard() {
    var adv = document.querySelectorAll('[data-adventure]');
    for (var i = 0; i < adv.length; i++) {
      adv[i].addEventListener('click', function () {
        var kind = this.getAttribute('data-adventure');
        if (kind === 'forest' || kind === 'mountain') scrollToId('checkins-heading');
        else if (kind === 'puzzle') scrollToId('time-view');
        else if (kind === 'library') scrollToId('exec-view');
      });
    }
    var adoptAnother = $('adopt-another-btn');
    if (adoptAnother) adoptAnother.addEventListener('click', function () {
      window.RootlingCompanions.adoptAnother();
    });
  }

  function initDom() {
    initAdoptSteps();
    renderShelf();
    renderGift();
    fillTraitLines();
    showWelcomeIfNew();
    showTraitBannerIfNew();
    bindDashboard();
    bindManage();
    bindInteractionCounting();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDom);
    else initDom();
  }
})();
