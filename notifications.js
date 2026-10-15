/* Rootling — Alerts & reminders (Phase 3, Tier 1: local notifications).
 * Self-contained module: own localStorage key, never reads or writes the
 * core pet state. OFF by default. Silent by default (silent:true, no
 * vibration, no renotify). Per-routine plans + global daily cap + quiet
 * hours (sleep mode). Every fire/hold is logged in "What your pet sent you".
 * Tier 2 (Web Push while the app is closed) needs the push backend in
 * PHASE3-DESIGN.md §2.3 — until window.ROOTLING_PUSH is configured, the UI
 * says so plainly and nothing pretends otherwise.
 */
(function () {
  'use strict';

  var KEY = 'rootling-notifications-v1';

  var ROUTINES = {
    morning:  { label: 'Morning check-in', time: '09:00', message: 'Good morning. One tiny check-in is a lovely place to start — whenever you are ready.' },
    water:    { label: 'Water',            time: '13:00', message: 'Water is waiting whenever you are. One glass is plenty.' },
    movement: { label: 'Movement',         time: '16:00', message: 'A short stretch or a walk to the mailbox counts. Your companion is right here with you.' },
    winddown: { label: 'Wind-down',        time: '20:30', message: 'The day can start winding down now. Rest is care, too.' }
  };

  function defaults() {
    var plans = {};
    /* Escalation ladder (Phase 3 addition): level 1 silent (default for
     * everything), level 2 persistent gentle re-reminders, level 3 ring +
     * vibrate — per-routine opt-in only, never a default. evenAtNight is
     * the user's per-item override of quiet hours for level 3 only. */
    for (var id in ROUTINES) plans[id] = { on: true, time: ROUTINES[id].time, level: 1, evenAtNight: false, l3Confirmed: false };
    return {
      enabled: false,
      cap: 3,
      quietStart: '21:00',
      quietEnd: '08:00',
      plans: plans,
      fired: {},  /* 'YYYY-MM-DD' -> { routineId: countFiredTodayTotal } — fired[date] is a NUMBER total + fired[date+'|'+id] marks */
      marks: {},  /* 'YYYY-MM-DD|routineId' -> 1 */
      log: []     /* { ts, kind: 'sent'|'held', text } newest last — never capped or auto-pruned; the user clears it */
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var s = JSON.parse(raw);
      var d = defaults();
      for (var k in d) { if (s[k] === undefined) s[k] = d[k]; }
      for (var id in d.plans) {
        if (!s.plans[id]) s.plans[id] = d.plans[id];
        for (var f in d.plans[id]) { if (s.plans[id][f] === undefined) s.plans[id][f] = d.plans[id][f]; }
      }
      return s;
    } catch (e) { return defaults(); }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function dateKey(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function minutesOf(t) { /* 'HH:MM' -> minutes since midnight */
    var p = String(t).split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function nowMinutes(d) { return d.getHours() * 60 + d.getMinutes(); }

  /* Quiet hours may wrap midnight (21:00–08:00). */
  function isQuiet(settings, d) {
    var qs = minutesOf(settings.quietStart), qe = minutesOf(settings.quietEnd);
    var n = nowMinutes(d);
    if (qs === qe) return false;
    if (qs < qe) return n >= qs && n < qe;
    return n >= qs || n < qe;
  }
  function firedToday(settings, d) {
    return settings.fired[dateKey(d)] || 0;
  }
  /* Why a routine cannot fire right now, or null if it can.
   * Reasons: 'off' | 'quiet' | 'cap' | 'not-due' | 'already' */
  /* A reminder is "near its time" for 90 minutes after the planned time.
   * Past that it is stale: it is held and logged, never fired late — and
   * several stale reminders never burst-fire together (QA defect D2). */
  var MAX_LATE_MINUTES = 90;
  function blockReason(settings, id, d) {
    if (!settings.enabled) return 'off';
    var plan = settings.plans[id];
    if (!plan || !plan.on) return 'off';
    if (settings.marks[dateKey(d) + '|' + id]) return 'already';
    /* Quiet hours suppress everything — except a level-3 item the user
     * explicitly marked "even at night". Startle protection is the rule;
     * the exception exists only where the user built it themselves. */
    if (isQuiet(settings, d) && !(plan.level === 3 && plan.evenAtNight)) return 'quiet';
    if (nowMinutes(d) < minutesOf(plan.time)) return 'not-due';
    if (nowMinutes(d) > minutesOf(plan.time) + MAX_LATE_MINUTES) return 'late';
    if (firedToday(settings, d) >= settings.cap) return 'cap';
    return null;
  }
  function dueRoutines(settings, d) {
    var out = [];
    for (var id in ROUTINES) { if (blockReason(settings, id, d) === null) out.push(id); }
    return out;
  }
  function logEntry(settings, kind, text, d) {
    settings.log.push({ ts: (d || new Date()).toISOString(), kind: kind, text: text });
    /* No cap: this log is part of the pet's memory of the user (Daniel
     * 2026-10-15 — plenty of memory, never silently lossy). The user can
     * clear it from the alerts card; nothing trims it automatically. */
  }
  function markFired(settings, id, d) {
    var k = dateKey(d);
    settings.marks[k + '|' + id] = 1;
    settings.fired[k] = (settings.fired[k] || 0) + 1;
    logEntry(settings, 'sent', ROUTINES[id].label + ' reminder sent at ' + planTimeLabel(d) + '.', d);
  }
  function planTimeLabel(d) {
    var h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    var ap = h >= 12 ? 'pm' : 'am'; var h12 = h % 12 || 12;
    return h12 + ':' + m + ap;
  }

  /* ---------- delivery ---------- */
  var settings = load();

  function showNotification(id, isRefire) {
    var plan = settings.plans[id] || { level: 1 };
    var title = 'Rootling';
    /* Level 3 (user-designated critical only): sound on + vibration
     * pattern. This uses the device's normal notification sound — a web
     * app cannot attach a custom ringtone, override silent mode / Do Not
     * Disturb, or ring like a phone call (PHASE3-DESIGN §2.5). Android
     * honors the vibration pattern; iOS ignores programmatic vibration. */
    var loud = plan.level === 3;
    var opts = {
      body: ROUTINES[id].message + (isRefire ? ' (Gentle reminder — this is still waiting whenever you are ready.)' : ''),
      silent: !loud,          /* levels 1–2 stay silent — research hard rule */
      tag: 'rootling-' + id,  /* replace rather than stack */
      renotify: false,
      icon: 'icon.svg'
    };
    if (loud) opts.vibrate = [200, 100, 200, 100, 400];
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      return navigator.serviceWorker.ready.then(function (reg) {
        if (reg && reg.showNotification) return reg.showNotification(title, opts);
        throw new Error('no sw registration');
      }).catch(function () { fallback(); });
    }
    fallback();
    return Promise.resolve();
    function fallback() {
      try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, opts); } catch (e) { /* in-app only */ }
    }
  }

  var REFIRE_GAP_MINUTES = 25;   /* level-2 re-reminders: at plan+25 and plan+50, inside the 90-min window */
  var REFIRE_MAX = 2;
  function refireSlot(settings, id, d) {
    var plan = settings.plans[id];
    if (!plan || plan.level !== 2) return null;
    var base = minutesOf(plan.time);
    for (var n = 1; n <= REFIRE_MAX; n++) {
      if (nowMinutes(d) >= base + n * REFIRE_GAP_MINUTES && !settings.marks['refire|' + dateKey(d) + '|' + id + '|' + n]) return n;
    }
    return null;
  }
  function markRefired(settings, id, d, slot) {
    var k = dateKey(d);
    settings.marks['refire|' + k + '|' + id + '|' + slot] = 1;
    settings.fired[k] = (settings.fired[k] || 0) + 1;
    logEntry(settings, 'sent', ROUTINES[id].label + ' reminder sent again at ' + planTimeLabel(d) + ' (level 2 — it stays gentle).', d);
  }

  function tick(now) {
    now = now || new Date();
    if (!settings.enabled) return [];
    var firedNow = [];
    /* Log holds once per day per routine for quiet/cap, so the log stays honest without spamming itself. */
    for (var id in ROUTINES) {
      var reason = blockReason(settings, id, now);
      if (reason === null) {
        markFired(settings, id, now);
        showNotification(id);
        firedNow.push(id);
      } else if (reason === 'already') {
        /* Level 2: persistent gentle re-reminders until the window ends.
         * Each re-fire counts toward the same daily cap; quiet hours and
         * the master switch still suppress them. When event/open-loop
         * modules land, their completion state gates this instead. */
        var slot = refireSlot(settings, id, now);
        if (slot !== null && !isQuiet(settings, now) && nowMinutes(now) <= minutesOf(settings.plans[id].time) + MAX_LATE_MINUTES) {
          if (firedToday(settings, now) < settings.cap) {
            markRefired(settings, id, now, slot);
            showNotification(id, true);
            firedNow.push(id + '#refire' + slot);
          } else {
            var rk = 'hold|' + dateKey(now) + '|' + id + '|cap';
            if (!settings.marks[rk]) { settings.marks[rk] = 1; logEntry(settings, 'held', ROUTINES[id].label + ' re-reminder held (daily cap reached).', now); }
          }
        }
      } else if ((reason === 'quiet' || reason === 'cap' || reason === 'late')) {
        var holdKey = 'hold|' + dateKey(now) + '|' + id + '|' + reason;
        if (!settings.marks[holdKey]) {
          settings.marks[holdKey] = 1;
          var why = reason === 'quiet' ? 'quiet hours' : (reason === 'cap' ? 'daily cap reached' : 'its time passed while Rootling was closed — reminders are never sent late');
          logEntry(settings, 'held', ROUTINES[id].label + ' reminder held (' + why + ').', now);
        }
      }
    }
    if (firedNow.length) save(settings);
    else save(settings);
    return firedNow;
  }

  /* ---------- push (Tier 2 plumbing — inert until configured) ---------- */
  function pushStatus() {
    var cfg = (typeof window !== 'undefined' && window.ROOTLING_PUSH) || null;
    if (!cfg || !cfg.vapidPublicKey || !cfg.endpoint) {
      return { connected: false, text: 'Closed-app alerts: not connected yet. Reminders fire while Rootling is open.' };
    }
    try {
      var sub = localStorage.getItem(KEY + '-push-sub');
      if (sub) return { connected: true, text: 'Closed-app alerts: connected.' };
    } catch (e) { /* ignore */ }
    return { connected: false, text: 'Closed-app alerts: ready to connect.' };
  }

  /* ---------- settings UI (injected card; keeps index.html edits to one script tag) ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildCard() {
    var main = document.getElementById('main-view');
    var anchor = document.getElementById('learned-view');
    if (!main || !anchor || document.getElementById('notifications-card')) return;
    var card = el('section', 'card');
    card.id = 'notifications-card';
    card.setAttribute('aria-labelledby', 'notifications-heading');

    var h = el('h3', null, '🔔 Alerts & reminders'); h.id = 'notifications-heading';
    card.appendChild(h);
    card.appendChild(el('p', 'q', 'Reminders are gentle and silent — no sound, no buzz. They fire while Rootling is open, or when you next open it near the time you chose. You can preview every message below before it is ever sent.'));
    var tier = el('p', 'fineprint', pushStatus().text); tier.id = 'push-status';
    card.appendChild(tier);
    card.appendChild(el('p', 'fineprint', 'Alert levels: level 1 is silent. Level 2 is silent and gently reminds again (up to twice). Level 3 rings and vibrates — only for routines you choose, never a default. Level 3 uses the normal notification sound of your phone and its vibration pattern where your phone allows it; on iPhone, web apps cannot vibrate, and no web app can ring through silent mode or Do Not Disturb. Level 3 is the strongest alert a web app can honestly offer.'));

    var masterRow = el('label', 'check-row');
    var master = document.createElement('input');
    master.type = 'checkbox'; master.id = 'notify-master';
    master.checked = !!settings.enabled;
    masterRow.appendChild(master);
    masterRow.appendChild(el('span', null, 'Turn on alerts'));
    card.appendChild(masterRow);
    master.addEventListener('change', function () {
      if (master.checked) {
        requestPermission(function (granted) {
          settings.enabled = granted;
          if (!granted) { master.checked = false; setStatus('Alerts are blocked by your browser. You can allow them later in the site settings of your browser for this page — Rootling will not ask again on its own.'); }
          save(settings); renderLog();
        });
      } else {
        settings.enabled = false; save(settings); renderLog();
      }
    });

    for (var id in ROUTINES) { card.appendChild(planRow(id)); }

    var capRow = el('label', null, 'Most alerts per day');
    var capSel = document.createElement('select'); capSel.id = 'notify-cap';
    [1, 2, 3, 4, 5].forEach(function (n) {
      var o = document.createElement('option'); o.value = String(n); o.textContent = String(n);
      if (settings.cap === n) o.selected = true;
      capSel.appendChild(o);
    });
    capSel.addEventListener('change', function () { settings.cap = Number(capSel.value); save(settings); });
    capRow.appendChild(capSel);
    card.appendChild(capRow);

    var quietWrap = el('div', 'choice-row');
    quietWrap.appendChild(timeField('Quiet hours start', 'notify-quiet-start', settings.quietStart, function (v) { settings.quietStart = v; save(settings); }));
    quietWrap.appendChild(timeField('Quiet hours end', 'notify-quiet-end', settings.quietEnd, function (v) { settings.quietEnd = v; save(settings); }));
    card.appendChild(quietWrap);
    card.appendChild(el('p', 'fineprint', 'Nothing is ever sent during quiet hours — sleep is protected. Held reminders are listed below, never sent late in a burst.'));

    var status = el('p', 'fineprint', ''); status.id = 'notify-status';
    card.appendChild(status);

    var testBtn = el('button', 'btn btn-soft', 'Send a test alert now');
    testBtn.type = 'button'; testBtn.id = 'notify-test';
    testBtn.addEventListener('click', function () {
      requestPermission(function (granted) {
        if (!granted) { setStatus('Alerts are blocked by your browser. You can allow them later in the site settings of your browser for this page — Rootling will not ask again on its own.'); return; }
        showNotification('morning');
        setStatus('Test alert sent — you asked for this one, so it sends even during quiet hours. It used the Morning check-in message, silently.');
      });
    });
    card.appendChild(testBtn);

    card.appendChild(el('h4', null, 'What your pet sent you'));
    var list = el('ul', 'learned-list'); list.id = 'notify-log';
    card.appendChild(list);
    var clearBtn = el('button', 'btn btn-ghost', 'Clear this log');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', function () { settings.log = []; save(settings); renderLog(); });
    card.appendChild(clearBtn);

    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    renderLog();

    function setStatus(t) { status.textContent = t; }
    function renderLog() {
      var items = settings.log.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) { return '<li>' + e.text + '</li>'; }).join('')
        : '<li>Nothing sent yet. Anything your pet sends — or holds back, and why — will be listed here.</li>';
    }
    card._renderLog = renderLog;
  }

  /* Read-only peek at the core profile, used ONLY to set protective
   * defaults in this card (PTSD startle guard, ADHD level-3 hint). This
   * module never writes core state. */
  function coreProfile() {
    try {
      var s = JSON.parse(localStorage.getItem('sprout-state-v1'));
      return s && s.profile ? s.profile : null;
    } catch (e) { return null; }
  }

  function planRow(id) {
    var wrap = el('div', 'choice-row');
    var lab = el('label', 'check-row');
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!settings.plans[id].on;
    cb.setAttribute('data-notify-plan', id);
    cb.addEventListener('change', function () { settings.plans[id].on = cb.checked; save(settings); });
    lab.appendChild(cb);
    lab.appendChild(el('span', null, ROUTINES[id].label));
    wrap.appendChild(lab);
    var t = document.createElement('input');
    t.type = 'time'; t.value = settings.plans[id].time;
    t.setAttribute('aria-label', ROUTINES[id].label + ' time');
    t.addEventListener('change', function () { settings.plans[id].time = t.value || ROUTINES[id].time; save(settings); });
    wrap.appendChild(t);
    var msg = el('p', 'fineprint', 'Message: “' + ROUTINES[id].message + '”');
    var outer = el('div');
    outer.appendChild(wrap); outer.appendChild(msg);

    /* Escalation ladder controls for this routine */
    var lvlRow = el('div', 'choice-row');
    var lvlLab = el('label', null, 'Alert level');
    var lvl = document.createElement('select');
    lvl.id = 'notify-level-' + id;
    lvl.setAttribute('aria-label', ROUTINES[id].label + ' alert level');
    [['1', 'Level 1 — silent'], ['2', 'Level 2 — silent, reminds again'], ['3', 'Level 3 — ring + vibrate']].forEach(function (pair) {
      var o = document.createElement('option'); o.value = pair[0]; o.textContent = pair[1];
      if (Number(pair[0]) === (settings.plans[id].level || 1)) o.selected = true;
      lvl.appendChild(o);
    });
    var hint = el('p', 'fineprint', ''); hint.id = 'notify-l3hint-' + id; hint.hidden = true;
    lvl.addEventListener('change', function () {
      var want = Number(lvl.value);
      if (want === 3 && coreProfile() === 'grounding' && !settings.plans[id].l3Confirmed) {
        /* PTSD startle protection: level 3 needs the explicit understanding
         * tick first — it is never one accidental dropdown away. */
        lvl.value = String(settings.plans[id].level || 1);
        hint.hidden = false;
        hint.textContent = 'For the Grounding & safety style, ring + vibrate needs the understanding box below ticked first — it is never a surprise.';
        return;
      }
      settings.plans[id].level = want;
      save(settings);
    });
    lvlLab.appendChild(lvl);
    lvlRow.appendChild(lvlLab);
    outer.appendChild(lvlRow);
    outer.appendChild(hint);
    if (coreProfile() === 'focus') {
      outer.appendChild(el('p', 'fineprint', 'Many people set important routines to level 3 so they cannot be missed. It stays your choice, per routine.'));
    }
    if (coreProfile() === 'grounding') {
      var okRow = el('label', 'check-row');
      var ok = document.createElement('input');
      ok.type = 'checkbox'; ok.id = 'notify-l3ok-' + id;
      ok.checked = !!settings.plans[id].l3Confirmed;
      ok.addEventListener('change', function () { settings.plans[id].l3Confirmed = ok.checked; if (!ok.checked && settings.plans[id].level === 3) { settings.plans[id].level = 1; lvl.value = '1'; } save(settings); });
      okRow.appendChild(ok);
      okRow.appendChild(el('span', null, 'I understand level 3 can ring and vibrate, and I choose it for this routine'));
      outer.appendChild(okRow);
    }
    var nightRow = el('label', 'check-row');
    var night = document.createElement('input');
    night.type = 'checkbox'; night.id = 'notify-night-' + id;
    night.checked = !!settings.plans[id].evenAtNight;
    night.addEventListener('change', function () { settings.plans[id].evenAtNight = night.checked; save(settings); });
    nightRow.appendChild(night);
    nightRow.appendChild(el('span', null, 'Even at night — level 3 may ring during quiet hours for this routine only'));
    outer.appendChild(nightRow);
    return outer;
  }
  function timeField(label, idAttr, value, onChange) {
    var wrap = el('div');
    var lab = el('label', null, label); lab.setAttribute('for', idAttr);
    var t = document.createElement('input');
    t.type = 'time'; t.id = idAttr; t.value = value;
    t.addEventListener('change', function () { onChange(t.value); });
    wrap.appendChild(lab); wrap.appendChild(t);
    return wrap;
  }

  function requestPermission(cb) {
    if (typeof Notification === 'undefined') { cb(false); return; }
    if (Notification.permission === 'granted') { cb(true); return; }
    if (Notification.permission === 'denied') { cb(false); return; }
    try {
      var p = Notification.requestPermission();
      if (p && p.then) p.then(function (r) { cb(r === 'granted'); });
      else cb(Notification.permission === 'granted');
    } catch (e) { cb(false); }
  }

  function init() {
    buildCard();
    tick();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    setInterval(function () { tick(); var c = document.getElementById('notifications-card'); if (c && c._renderLog) c._renderLog(); }, 60000);
  }

  var api = {
    KEY: KEY, ROUTINES: ROUTINES, MAX_LATE_MINUTES: MAX_LATE_MINUTES,
    defaults: defaults, load: load, save: save,
    isQuiet: isQuiet, blockReason: blockReason, dueRoutines: dueRoutines,
    refireSlot: refireSlot, coreProfile: coreProfile,
    markFired: markFired, firedToday: firedToday, tick: tick,
    pushStatus: pushStatus,
    getSettings: function () { return settings; }
  };
  if (typeof window !== 'undefined') window.RootlingNotify = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
