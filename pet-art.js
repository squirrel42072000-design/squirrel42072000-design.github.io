/* pet-art.js — "Draw your pet": user-made pet artwork (v16, Computer).
 *
 * Daniel asked for pet artwork to plug into the pet game. This module lets
 * a person draw their companion (or add a picture they made), keeps it on
 * this device, and can show it as the companion's portrait on Home. The 48
 * painted portraits in assets/pets/ stay the default and the fallback.
 *
 * Pipeline:  input (drawing pad or picture file)
 *              -> check (type by magic bytes, size, dimensions)
 *              -> normalize (re-encode: 512px portrait + 192px thumbnail,
 *                 WebP when the browser can, else PNG; this also strips
 *                 photo metadata such as GPS)
 *              -> store (IndexedDB blobs per account + small index in
 *                 localStorage key rootling-pet-art-v1)
 *              -> game state (RootlingApp.addExperience, once a day)
 *              -> render (RootlingSpeciesArt / setPetImage use portraitSrc)
 *              -> optional sync (Supabase function "pet-art"; off by
 *                 default, never while Privacy Mode is on)
 *
 * Engagement loops (picked from the user's support styles and "Things you
 * live with"; never a label shown to the user):
 *   focus   (ADHD-friendly)  optional 90-second sketch sprint, quick wins,
 *                            instant pet reaction, stop any time, no fail.
 *   breath  (COPD-friendly)  no timer, a slow breathing ring paces lines
 *                            ("draw while you breathe out"), rest nudges,
 *                            big buttons, no talking needed, autosave.
 *   steady  everyone else.   When both apply, breath pacing wins and the
 *                            focus loop keeps its short steps (gentler wins).
 *
 * API (window.RootlingPetArt):
 *   init()                          load index, warm the active portrait
 *   save(input, opts) -> Promise    input: Blob | File | HTMLCanvasElement
 *   list() / get(id) / remove(id)
 *   setActive(id, asPortrait)       choose which drawing Home shows
 *   portraitSrc(species, stageId)   sync URL for setPetImage, or ''
 *   thumbSrc(id)                    sync URL (after warm) or ''
 *   loopFor(state, topics)          'focus' | 'breath' | 'steady' | 'mixed'
 *   loopConfig(loop)                timings + rules for the pad
 *   mountPad(container, opts)       the drawing pad UI
 *   sync(id) -> Promise             optional upload (connected helper)
 * No network unless the user turns on "Back up my drawings".
 */
(function (root) {
  'use strict';

  var STORE_KEY = 'rootling-pet-art-v1';
  var DB_NAME = 'rootling-pet-art';
  var DB_STORE = 'blobs';

  /* ---------- format rules (keep in step with supabase/functions/pet-art) ---------- */
  var FORMAT = {
    accept: ['image/png', 'image/jpeg', 'image/webp'],  /* no SVG (scripts), no GIF (motion) */
    maxInputBytes: 8 * 1024 * 1024,
    minInputSide: 64,
    maxInputSide: 4096,
    fullSide: 512,           /* same frame as assets/pets/<slug>.webp */
    thumbSide: 192,          /* same as assets/pets/<slug>-sm.webp */
    quality: 0.86,
    maxFullBytes: 600 * 1024,
    maxThumbBytes: 120 * 1024,
    maxItems: 48,
    padBackground: null      /* transparent, like the painted set */
  };

  /* ---------- small pure helpers (unit tested in tools/pet-art.test.js) ---------- */
  function sniffType(bytes) {
    if (!bytes || bytes.length < 12) return '';
    var b = bytes;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return '';
  }

  /* Plain-words reasons; no exclamation points (TEAM.md). */
  function checkInput(meta) {
    meta = meta || {};
    if (FORMAT.accept.indexOf(meta.type) === -1) return { ok: false, reason: 'That file type will not work. Try a PNG, JPG, or WebP picture.' };
    if (!(meta.size > 0)) return { ok: false, reason: 'That picture looks empty.' };
    if (meta.size > FORMAT.maxInputBytes) return { ok: false, reason: 'That picture is too big. Try one under 8 MB.' };
    if (meta.width && meta.height) {
      var lo = Math.min(meta.width, meta.height), hi = Math.max(meta.width, meta.height);
      if (lo < FORMAT.minInputSide) return { ok: false, reason: 'That picture is very small. Try a bigger one.' };
      if (hi > FORMAT.maxInputSide) return { ok: false, reason: 'That picture is very large. Try one under 4000 pixels wide.' };
    }
    return { ok: true };
  }

  /* Fit w x h inside a square of side s, centered (object-fit: contain). */
  function fitRect(w, h, s) {
    var k = Math.min(s / w, s / h);
    var dw = Math.round(w * k), dh = Math.round(h * k);
    return { x: Math.round((s - dw) / 2), y: Math.round((s - dh) / 2), w: dw, h: dh };
  }

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function newId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) { /* fall through */ }
    return 'art-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- engagement loops ---------- */
  function profileIds(state) {
    if (!state) return [];
    if (state.profiles && state.profiles.length) return state.profiles.slice();
    return state.profile ? [state.profile] : [];
  }
  function topicIds(state, topics) {
    var t = topics || (state && state.topics) || [];
    return t.map(function (x) { return typeof x === 'string' ? x : (x && x.id) || ''; });
  }
  /* Support styles in app.js PROFILES that mean "short, quick wins". */
  var FOCUS_PROFILES = ['focus', 'adhd', 'start', 'momentum'];
  var BREATH_TOPICS = ['copd', 'asthma', 'heart', 'cardiac'];
  var FOCUS_TOPICS = ['adhd', 'attention'];

  function loopFor(state, topics) {
    var p = profileIds(state), t = topicIds(state, topics);
    var focus = p.some(function (x) { return FOCUS_PROFILES.indexOf(x) !== -1; }) ||
                t.some(function (x) { return FOCUS_TOPICS.indexOf(x) !== -1; });
    var breath = t.some(function (x) { return BREATH_TOPICS.indexOf(x) !== -1; });
    if (focus && breath) return 'mixed';
    if (breath) return 'breath';
    if (focus) return 'focus';
    return 'steady';
  }

  /* All pacing lives here so the UI never hard-codes it. */
  function loopConfig(loop, opts) {
    opts = opts || {};
    var calm = !!opts.calm;
    var base = {
      loop: loop,
      sprintSec: 0,            /* 0 = no timer at all */
      milestoneSec: 0,
      breathInSec: 0, breathOutSec: 0,
      restNudgeSec: 0,         /* gentle "rest your arms and breath" line */
      autosave: true,          /* every stroke, so stopping never loses work */
      minTarget: 48,           /* px, touch targets */
      brushes: [6, 12, 22],
      palette: ['#3c5f4c', '#F6C344', '#FF8FA3', '#7EC8E3', '#8a5a3b', '#2b2b2b'],
      motion: !calm,
      xpFirstToday: 5,         /* through addExperience, which caps at 30/day */
      xpLine: 'Your companion loves it.'
    };
    if (loop === 'focus' || loop === 'mixed') {
      base.sprintSec = 90;     /* optional; the user starts it, and can stop it */
      base.milestoneSec = 30;  /* a small "nice line" cheer, never a countdown alarm */
      base.palette = base.palette.slice(0, 4); /* fewer choices to start faster */
    }
    if (loop === 'breath' || loop === 'mixed') {
      base.sprintSec = 0;      /* breath pacing beats any timer */
      base.milestoneSec = 0;
      base.breathInSec = 2;    /* pursed-lip rhythm: in 2, out 4 (same as fitness.js) */
      base.breathOutSec = 4;
      base.restNudgeSec = 180;
      base.minTarget = 56;
      base.brushes = [10, 18, 28]; /* bigger brushes, less fine arm work */
    }
    return base;
  }

  /* Points for this save: once per day, only for a real drawing. */
  function awardFor(index, item, now) {
    var key = todayKey(now);
    if (!item || !(item.strokes > 2 || item.source === 'upload')) return 0;
    if (index && index.lastAwardDay === key) return 0;
    return 5;
  }

  /* ---------- index in localStorage (account-scoped by accounts.js) ---------- */
  function emptyIndex() { return { version: 1, items: [], activeId: '', asPortrait: false, lastAwardDay: '', syncOn: false }; }
  function loadIndex() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORE_KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && v.version === 1 && Array.isArray(v.items)) return v;
    } catch (e) { /* start fresh */ }
    return emptyIndex();
  }
  function saveIndex(ix) { try { root.localStorage.setItem(STORE_KEY, JSON.stringify(ix)); } catch (e) { /* storage full: blobs still saved */ } }
  var index = emptyIndex();

  /* ---------- IndexedDB blobs, namespaced by account ---------- */
  function ownerKey() {
    try { var a = root.RootlingAccounts && root.RootlingAccounts.current && root.RootlingAccounts.current(); if (a && a.id) return String(a.id); } catch (e) { /* device */ }
    return 'device';
  }
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!root.indexedDB) { rej(new Error('no indexedDB')); return; }
      var rq = root.indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(DB_STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(DB_STORE, mode), s = t.objectStore(DB_STORE), out;
        out = fn(s);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function blobKey(id, kind) { return ownerKey() + ':' + id + ':' + kind; }
  function putBlob(id, kind, blob) { return tx('readwrite', function (s) { return s.put(blob, blobKey(id, kind)); }); }
  function getBlob(id, kind) { return tx('readonly', function (s) { return s.get(blobKey(id, kind)); }); }
  function delBlob(id, kind) { return tx('readwrite', function (s) { return s.delete(blobKey(id, kind)); }); }
  /* Delete-my-data removes the localStorage index; this sweeps the blobs
   * that no longer have an index entry for this account. */
  function sweepOrphans() {
    var keep = {}, prefix = ownerKey() + ':';
    index.items.forEach(function (it) { keep[it.id] = 1; });
    return tx('readwrite', function (s) {
      var rq = s.openCursor();
      rq.onsuccess = function () {
        var c = rq.result; if (!c) return;
        var k = String(c.key);
        if (k.indexOf(prefix) === 0 && !keep[k.slice(prefix.length).split(':')[0]]) c.delete();
        c.continue();
      };
      return rq;
    }).catch(function () { /* fine */ });
  }

  /* ---------- object URL cache (sync lookups for render) ---------- */
  var urls = {};
  function cacheUrl(id, kind, blob) {
    var k = id + ':' + kind;
    if (urls[k]) { try { URL.revokeObjectURL(urls[k]); } catch (e) { /* fine */ } }
    urls[k] = blob ? URL.createObjectURL(blob) : '';
    return urls[k];
  }
  function warm(id) {
    if (!id) return Promise.resolve();
    return Promise.all([getBlob(id, 'full'), getBlob(id, 'thumb')]).then(function (b) {
      if (b[0]) cacheUrl(id, 'full', b[0]);
      if (b[1]) cacheUrl(id, 'thumb', b[1]);
    }).catch(function () { /* fallback art shows */ });
  }

  /* ---------- normalize: decode, fit, re-encode ---------- */
  function readHead(blob) {
    return blob.slice(0, 16).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  function decode(blob) {
    if (root.createImageBitmap) {
      return root.createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return root.createImageBitmap(blob); });
    }
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('decode')); };
      im.src = u;
    });
  }
  function encode(canvas, quality) {
    return new Promise(function (res) {
      canvas.toBlob(function (b) {
        /* Some browsers (notably older Safari) return PNG for webp. Keep it. */
        if (b && (b.type === 'image/webp' || b.type === 'image/png')) return res(b);
        canvas.toBlob(function (p) { res(p); }, 'image/png');
      }, 'image/webp', quality);
    });
  }
  function drawTo(src, side) {
    var c = root.document.createElement('canvas');
    c.width = side; c.height = side;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    var w = src.width, h = src.height, r = fitRect(w, h, side);
    g.drawImage(src, r.x, r.y, r.w, r.h);
    return c;
  }
  function normalize(input) {
    var isCanvas = input && typeof input.getContext === 'function';
    var srcP;
    if (isCanvas) srcP = Promise.resolve(input);
    else {
      srcP = readHead(input).then(function (head) {
        var type = sniffType(head);                 /* trust bytes, not the file name */
        var chk = checkInput({ type: type, size: input.size });
        if (!chk.ok) throw new Error(chk.reason);
        return decode(input);
      }).then(function (bmp) {
        var chk = checkInput({ type: 'image/png', size: 1, width: bmp.width, height: bmp.height });
        if (!chk.ok) throw new Error(chk.reason);
        return bmp;
      });
    }
    return srcP.then(function (src) {
      var full = drawTo(src, FORMAT.fullSide), thumb = drawTo(src, FORMAT.thumbSide);
      return Promise.all([encode(full, FORMAT.quality), encode(thumb, 0.8)]).then(function (b) {
        if (!b[0] || b[0].size > FORMAT.maxFullBytes) throw new Error('That picture could not be made small enough. Try a simpler one.');
        return { full: b[0], thumb: b[1], type: b[0].type, w: FORMAT.fullSide, h: FORMAT.fullSide };
      });
    });
  }

  /* ---------- game-state glue ---------- */
  function app() { return root.RootlingApp || root.SproutApp || null; }
  function speciesNow() {
    var A = app(), st = A && A.getState ? A.getState() : null;
    var SA = root.RootlingSpeciesArt;
    return SA ? SA.speciesOf(st) : (st && st.species) || '';
  }
  function refreshPet() {
    var A = app();
    try { if (A && A.refreshPet) A.refreshPet(); } catch (e) { /* the picture updates on next render */ }
    try { root.dispatchEvent(new CustomEvent('rootling:pet-art', { detail: { activeId: index.activeId, asPortrait: index.asPortrait } })); } catch (e) { /* fine */ }
  }

  /* ---------- public actions ---------- */
  function save(input, opts) {
    opts = opts || {};
    if (index.items.length >= FORMAT.maxItems) return Promise.reject(new Error('Your art shelf is full. Remove one to add a new one.'));
    return normalize(input).then(function (n) {
      var item = {
        id: newId(), species: opts.species || speciesNow() || '', label: String(opts.label || '').slice(0, 40),
        source: opts.source === 'upload' ? 'upload' : 'drawn', strokes: Number(opts.strokes) || 0,
        loop: opts.loop || '', createdAt: Date.now(), type: n.type, w: n.w, h: n.h,
        bytes: n.full.size, synced: false, remoteId: ''
      };
      return Promise.all([putBlob(item.id, 'full', n.full), putBlob(item.id, 'thumb', n.thumb)]).then(function () {
        cacheUrl(item.id, 'full', n.full); cacheUrl(item.id, 'thumb', n.thumb);
        var pts = awardFor(index, item);
        index.items.push(item);
        if (!index.activeId) index.activeId = item.id;
        var res = { item: item, added: 0 };
        if (pts) {
          var A = app(), out = A && A.addExperience ? A.addExperience(pts, 'drew your pet') : null;
          if (out && out.added) { index.lastAwardDay = todayKey(); res.added = out.added; res.stageUp = !!out.stageUp; }
        }
        saveIndex(index);
        refreshPet();
        if (index.syncOn) sync(item.id).catch(function () { /* stays on device */ });
        return res;
      });
    });
  }
  function list() { return index.items.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }); }
  function get(id) { return index.items.filter(function (i) { return i.id === id; })[0] || null; }
  function remove(id) {
    index.items = index.items.filter(function (i) { return i.id !== id; });
    if (index.activeId === id) { index.activeId = index.items.length ? index.items[index.items.length - 1].id : ''; if (!index.activeId) index.asPortrait = false; }
    saveIndex(index); cacheUrl(id, 'full', null); cacheUrl(id, 'thumb', null);
    refreshPet();
    return Promise.all([delBlob(id, 'full'), delBlob(id, 'thumb')]).catch(function () { /* swept later */ });
  }
  function setActive(id, asPortrait) {
    if (id && !get(id)) return Promise.resolve(false);
    index.activeId = id || ''; index.asPortrait = !!asPortrait && !!id; saveIndex(index);
    return warm(index.activeId).then(function () { refreshPet(); return true; });
  }
  function setSync(on) { index.syncOn = !!on; saveIndex(index); }

  /* Sync lookup for setPetImage. Shows the user's drawing when they
   * chose "Use as my companion's picture". v18 (USER TEST #7): the pick
   * is the person's choice, so it stays on Home after adopting another
   * companion — even one of a different kind — until the person picks
   * a different picture or turns it off. Stage still shows through size. */
  function portraitSrc(species, stageId) {
    if (!index.asPortrait || !index.activeId) return '';
    var it = get(index.activeId);
    if (!it) return '';
    return urls[it.id + ':full'] || '';
  }
  function thumbSrc(id) { return urls[id + ':thumb'] || ''; }

  /* ---------- optional backup (connected helper, off by default) ---------- */
  function privacyMode() {
    try { var a = JSON.parse(root.localStorage.getItem('rootling-ai-access-v1') || '{}'); return !!a.privacyMode; } catch (e) { return true; }
  }
  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function sync(id) {
    var it = get(id), A = app(), conn = A && A.connected;
    if (!it) return Promise.reject(new Error('missing'));
    if (privacyMode()) return Promise.reject(new Error('Privacy Mode is on, so drawings stay on this device.'));
    if (!index.syncOn) return Promise.reject(new Error('Backup is off.'));
    if (!conn || !conn.signedIn || !conn.signedIn()) return Promise.reject(new Error('Sign in to Connected accounts first.'));
    return Promise.all([getBlob(id, 'full'), getBlob(id, 'thumb')]).then(function (b) {
      return Promise.all([toBase64(b[0]), toBase64(b[1])]);
    }).then(function (b64) {
      return conn.call('pet-art', { action: 'save', clientId: it.id, species: it.species, label: it.label, source: it.source, mime: it.type, image: b64[0], thumb: b64[1] });
    }).then(function (res) {
      if (!res.ok) throw new Error('Backup did not finish. Your drawing is still safe here.');
      return res.json();
    }).then(function (out) {
      it.synced = true; it.remoteId = out && out.id || ''; saveIndex(index); return out;
    });
  }

  /* ---------- the drawing pad ---------- */
  function mountPad(container, opts) {
    opts = opts || {};
    var doc = root.document;
    var A = app(), st = A && A.getState ? A.getState() : null;
    var calm = doc.body.classList.contains('calm') || doc.documentElement.classList.contains('calm-motion') ||
      (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var loop = opts.loop || loopFor(st);
    var cfg = loopConfig(loop, { calm: calm });
    var species = speciesNow();
    container.innerHTML = '';
    container.classList.add('art-pad', 'art-loop-' + loop);
    container.style.setProperty('--art-target', cfg.minTarget + 'px');

    var prompt = doc.createElement('p'); prompt.className = 'art-prompt'; prompt.setAttribute('aria-live', 'polite');
    prompt.textContent = species ? 'Draw your ' + species + '. Any lines count.' : 'Draw your companion. Any lines count.';
    var canvas = doc.createElement('canvas'); canvas.width = FORMAT.fullSide; canvas.height = FORMAT.fullSide;
    canvas.className = 'art-canvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Drawing space');
    var g = canvas.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';

    var tools = doc.createElement('div'); tools.className = 'art-tools';
    var color = cfg.palette[0], size = cfg.brushes[1], strokes = [], cur = null, startedAt = 0, lastNudge = Date.now();
    cfg.palette.forEach(function (c, i) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'art-swatch'; b.style.background = c;
      b.setAttribute('aria-label', 'Color ' + (i + 1)); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { color = c; [].forEach.call(tools.querySelectorAll('.art-swatch'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); });
      tools.appendChild(b);
    });
    ['Thin', 'Medium', 'Thick'].forEach(function (n, i) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'art-btn'; b.textContent = n;
      b.addEventListener('click', function () { size = cfg.brushes[i]; });
      tools.appendChild(b);
    });
    function btn(label, fn, cls) { var b = doc.createElement('button'); b.type = 'button'; b.className = 'art-btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); tools.appendChild(b); return b; }

    function redraw() {
      g.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(function (s) {
        g.strokeStyle = s.c; g.lineWidth = s.w; g.beginPath();
        s.p.forEach(function (pt, i) { if (i) g.lineTo(pt[0], pt[1]); else g.moveTo(pt[0], pt[1]); });
        if (s.p.length === 1) g.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
        g.stroke();
      });
    }
    var DRAFT = 'rootling-pet-art-draft';
    function draftSave() { if (!cfg.autosave) return; try { root.sessionStorage.setItem(DRAFT, JSON.stringify(strokes.slice(-400))); } catch (e) { /* fine */ } }
    try { var d = JSON.parse(root.sessionStorage.getItem(DRAFT) || '[]'); if (Array.isArray(d)) { strokes = d; redraw(); } } catch (e) { /* fine */ }

    function pos(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; }
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); cur = { c: color, w: size, p: [pos(e)] }; strokes.push(cur); if (!startedAt) startedAt = Date.now(); redraw(); });
    canvas.addEventListener('pointermove', function (e) { if (!cur) return; cur.p.push(pos(e)); redraw(); });
    function end() {
      if (!cur) return; cur = null; draftSave();
      if (cfg.restNudgeSec && Date.now() - lastNudge > cfg.restNudgeSec * 1000) { lastNudge = Date.now(); prompt.textContent = 'Nice work. Rest your arm and take a slow breath. Your drawing waits for you.'; }
      if (opts.onStroke) opts.onStroke(strokes.length);
    }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', end);

    btn('Undo', function () { strokes.pop(); redraw(); draftSave(); });
    btn('Clear', function () { strokes = []; redraw(); draftSave(); });

    /* Focus loop: optional sprint; the user starts it and can stop it. */
    var sprintEl = null, sprintTimer = null;
    if (cfg.sprintSec) {
      sprintEl = doc.createElement('div'); sprintEl.className = 'art-sprint'; sprintEl.hidden = true;
      sprintEl.innerHTML = '<span class="art-sprint-fill"></span>';
      btn('Quick sketch (' + Math.round(cfg.sprintSec / 60 * 10) / 10 + ' min)', function () {
        if (sprintTimer) { clearInterval(sprintTimer); sprintTimer = null; sprintEl.hidden = true; prompt.textContent = 'Sketch stopped. Keep going, or save it.'; return; }
        var t0 = Date.now(), lastMile = 0; sprintEl.hidden = false;
        prompt.textContent = 'Quick sketch. Draw anything about your companion.';
        sprintTimer = setInterval(function () {
          var s = (Date.now() - t0) / 1000, fill = sprintEl.firstChild;
          fill.style.width = Math.min(100, s / cfg.sprintSec * 100) + '%';
          if (cfg.milestoneSec && Math.floor(s / cfg.milestoneSec) > lastMile) { lastMile = Math.floor(s / cfg.milestoneSec); prompt.textContent = ['Nice line.', 'Looking good.', 'Done. Save it if you like.'][Math.min(2, lastMile - 1)]; }
          if (s >= cfg.sprintSec) { clearInterval(sprintTimer); sprintTimer = null; }
        }, 250);
      }, 'art-sprint-btn');
    }

    /* Breath loop: a slow ring that grows on the breath in and shrinks on
     * the breath out. Static words in calm mode. No sound, no talking. */
    var ring = null, ringTimer = null;
    if (cfg.breathInSec) {
      ring = doc.createElement('div'); ring.className = 'art-breath'; ring.setAttribute('aria-live', 'off');
      ring.innerHTML = '<span class="art-breath-ring" aria-hidden="true"></span><span class="art-breath-word">Breathe in 2, out 4. Draw on the breath out.</span>';
      if (cfg.motion) {
        var phase = 'in', word = ring.querySelector('.art-breath-word'), r = ring.querySelector('.art-breath-ring');
        var tick = function () {
          phase = phase === 'in' ? 'out' : 'in';
          r.style.transitionDuration = (phase === 'in' ? cfg.breathInSec : cfg.breathOutSec) + 's';
          r.classList.toggle('is-in', phase === 'in');
          word.textContent = phase === 'in' ? 'Breathe in through your nose' : 'Breathe out slowly and draw';
          ringTimer = setTimeout(tick, (phase === 'in' ? cfg.breathInSec : cfg.breathOutSec) * 1000);
        };
        tick();
      }
    }

    var status = doc.createElement('p'); status.className = 'art-status'; status.setAttribute('role', 'status');
    btn('Save drawing', function () {
      if (!strokes.length) { status.textContent = 'Draw a line or two first.'; return; }
      status.textContent = 'Saving';
      save(canvas, { species: species, source: 'drawn', strokes: strokes.length, loop: loop }).then(function (r) {
        try { root.sessionStorage.removeItem(DRAFT); } catch (e) { /* fine */ }
        status.textContent = 'Saved. ' + cfg.xpLine + (r.added ? ' It grew a little (+' + r.added + ').' : '');
        if (opts.onSaved) opts.onSaved(r);
      }).catch(function (e) { status.textContent = (e && e.message) || 'That did not save. Your lines are still here.'; });
    }, 'art-save');

    var file = doc.createElement('label'); file.className = 'art-btn art-upload';
    file.innerHTML = 'Add a picture I made<input type="file" accept="image/png,image/jpeg,image/webp" hidden>';
    file.querySelector('input').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      status.textContent = 'Adding';
      save(f, { species: species, source: 'upload', loop: loop }).then(function (r) {
        status.textContent = 'Added. ' + cfg.xpLine + (r.added ? ' It grew a little (+' + r.added + ').' : '');
        if (opts.onSaved) opts.onSaved(r);
      }).catch(function (e) { status.textContent = (e && e.message) || 'That picture did not work. Try another.'; });
      this.value = '';
    });
    tools.appendChild(file);

    container.appendChild(prompt);
    if (ring) container.appendChild(ring);
    if (sprintEl) container.appendChild(sprintEl);
    container.appendChild(canvas);
    container.appendChild(tools);
    container.appendChild(status);

    return {
      loop: loop, config: cfg, canvas: canvas,
      strokes: function () { return strokes.length; },
      destroy: function () { if (sprintTimer) clearInterval(sprintTimer); if (ringTimer) clearTimeout(ringTimer); container.innerHTML = ''; }
    };
  }

  /* ---------- shelf (gallery) ---------- */
  function renderShelf(listEl) {
    if (!listEl) return;
    var items = list();
    if (!items.length) { listEl.innerHTML = '<li class="art-empty">No drawings yet.</li>'; return; }
    Promise.all(items.map(function (it) { return urls[it.id + ':thumb'] ? null : warm(it.id); })).then(function () {
      listEl.innerHTML = '';
      items.forEach(function (it) {
        var li = root.document.createElement('li'); li.className = 'art-item';
        var on = index.activeId === it.id && index.asPortrait;
        li.innerHTML = '<img alt="" width="96" height="96" loading="lazy">' +
          '<button type="button" class="art-btn art-use" aria-pressed="' + on + '">' + (on ? 'On Home' : 'Show on Home') + '</button>' +
          '<button type="button" class="art-btn art-del">Remove</button>';
        li.querySelector('img').src = urls[it.id + ':thumb'] || '';
        li.querySelector('img').alt = 'Your drawing' + (it.species ? ' of your ' + it.species : '');
        li.querySelector('.art-use').addEventListener('click', function () { setActive(it.id, !on).then(function () { renderShelf(listEl); }); });
        li.querySelector('.art-del').addEventListener('click', function () { remove(it.id).then(function () { renderShelf(listEl); }); });
        listEl.appendChild(li);
      });
    });
  }

  /* ---------- boot ---------- */
  var ready = null;
  function init() {
    if (ready) return ready;
    index = loadIndex();
    ready = warm(index.activeId).then(function () { refreshPet(); return sweepOrphans(); }).then(function () { return index; });
    return ready;
  }
  function wireCard() {
    var doc = root.document; if (!doc) return;
    var open = doc.getElementById('pet-art-open'), pad = doc.getElementById('pet-art-pad'), shelf = doc.getElementById('pet-art-list');
    var syncT = doc.getElementById('pet-art-sync');
    var handle = null;
    if (open && pad) open.addEventListener('click', function () {
      if (handle) { handle.destroy(); handle = null; pad.hidden = true; open.textContent = 'Draw your pet'; return; }
      pad.hidden = false; open.textContent = 'Close drawing';
      handle = mountPad(pad, { onSaved: function () { renderShelf(shelf); } });
    });
    if (syncT) { syncT.checked = !!index.syncOn; syncT.addEventListener('change', function () { setSync(syncT.checked); }); }
    renderShelf(shelf);
  }

  var api = {
    FORMAT: FORMAT, STORE_KEY: STORE_KEY,
    sniffType: sniffType, checkInput: checkInput, fitRect: fitRect, loopFor: loopFor, loopConfig: loopConfig, awardFor: awardFor, todayKey: todayKey,
    init: init, save: save, list: list, get: get, remove: remove, setActive: setActive, setSync: setSync,
    portraitSrc: portraitSrc, thumbSrc: thumbSrc, sync: sync, mountPad: mountPad, renderShelf: renderShelf,
    _setIndex: function (ix) { index = ix; }, _urls: urls
  };
  root.RootlingPetArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (root.document && root.document.addEventListener) {
    var go = function () { init().then(wireCard, wireCard); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
