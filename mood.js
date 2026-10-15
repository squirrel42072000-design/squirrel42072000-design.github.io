/* mood.js — Rootling "Mood care" (v13).
 *
 * Gentle noticing, not diagnosis. Under Rootling's standing guardrails the
 * pet never tells anyone they "have depression". It looks at signals the
 * user already gave (mood faces, words in chat, steps, sleep, optional
 * questionnaire answers) over the last 14 days, and when several point the
 * same way it offers care: a kind check-in, a small mood lift, and a path
 * to a real person. Everything stays on this device. Mood watch is on by
 * default with a clear off switch on the Mood care card.
 *
 * Research:
 *  - PHQ-2 (Kroenke 2003): score of 3+ is the screening cut point.
 *  - PHQ-9 (Kroenke 2001): 10+ found major depression 88% of the time;
 *    5 / 10 / 15 / 20 = mild / moderate / moderately severe / severe.
 *  - 2 weeks is the time window both use, so detection looks at 14 days.
 *  - Behavioural activation (Cochrane 2020) drives "Lift my mood".
 */
(function (root) {
  'use strict';

  var KEY = 'rootling-mood-v1';
  var DAY = 86400000;

  function pad(n) { return ('0' + n).slice(-2); }
  function dkey(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function lastKeys(n, now) {
    var out = [], base = new Date(now || Date.now());
    for (var i = n - 1; i >= 0; i--) { var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i); out.push(dkey(d)); }
    return out;
  }

  /* Words that often show up when someone is having a heavy time. Crisis
   * words are handled separately (always 988 first) by the assistant. */
  var LOW_WORDS = ['depressed', 'depression', 'hopeless', 'worthless', 'empty inside', 'feel empty', 'numb', 'no point', 'what\u2019s the point', "what's the point", 'whats the point',
    'can\u2019t enjoy', "can't enjoy", 'cant enjoy', 'nothing matters', 'i hate myself', 'so alone', 'all alone', 'nobody cares', 'no one cares', 'cry all', 'keep crying',
    'can\u2019t get out of bed', "can't get out of bed", 'cant get out of bed', 'so sad', 'really sad', 'feel sad', 'feeling sad', 'i am sad', 'i\u2019m sad', "i'm sad", 'im sad',
    'feel low', 'feeling low', 'feel down', 'feeling down', 'useless', 'a burden', 'failure', 'giving up', 'no energy', 'don\u2019t care anymore', "don't care anymore", 'dont care anymore'];
  function hasLowWords(text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    for (var i = 0; i < LOW_WORDS.length; i++) if (t.indexOf(LOW_WORDS[i]) !== -1) return true;
    return false;
  }

  /* ---------------- pure detection ----------------
   * input: { moods: {date: 1-5}, sleep: {date: hours}, steps: {date: n},
   *          textDays: {date: count}, checks: [{at, type, score, item9}], now }
   * returns { level: 'none'|'watch'|'concern', reasons: [...], signals: n,
   *           crisis: bool, logged: n, lowDays: n } */
  function detect(input) {
    var d = input || {}, now = d.now || Date.now();
    var keys = lastKeys(14, now), reasons = [], signals = 0, positiveCheck = false, crisis = false;
    var moods = d.moods || {}, logged = 0, low = 0, sum = 0;
    keys.forEach(function (k) { var v = moods[k]; if (typeof v === 'number' && v >= 1) { logged++; sum += v; if (v <= 2) low++; } });
    var avg = logged ? sum / logged : null;
    if (low >= 5 || (logged >= 4 && avg <= 2.3)) {
      signals++; reasons.push('You picked a low face on ' + low + ' of the last ' + logged + ' check-ins.');
    }
    var tdays = 0; keys.forEach(function (k) { if ((d.textDays || {})[k]) tdays++; });
    if (tdays >= 3) { signals++; reasons.push('You told me you felt heavy or low on ' + tdays + ' different days.'); }
    var steps = d.steps || {}, a = 0, b = 0, aN = 0, bN = 0;
    keys.slice(7).forEach(function (k) { if (steps[k] != null) { a += steps[k]; aN++; } });
    keys.slice(0, 7).forEach(function (k) { if (steps[k] != null) { b += steps[k]; bN++; } });
    var prevAvg = b / 7, nowAvg = a / 7;
    if (bN >= 3 && prevAvg > 1500 && nowAvg < prevAvg * 0.5) {
      signals++; reasons.push('You have been moving much less this week than last week.');
    }
    var off = 0; keys.forEach(function (k) { var h = (d.sleep || {})[k]; if (typeof h === 'number' && h > 0 && (h < 5 || h > 10)) off++; });
    if (off >= 3) { signals++; reasons.push('Your sleep has been very short or very long on ' + off + ' nights.'); }
    (d.checks || []).forEach(function (c) {
      if (now - c.at > 14 * DAY) return;
      if (c.item9 > 0) crisis = true;
      if ((c.type === 'phq2' && c.score >= 3) || (c.type === 'phq9' && c.score >= 10)) positiveCheck = true;
    });
    if (positiveCheck) { signals++; reasons.push('Your answers on a recent mood check were on the heavy side.'); }
    var level = 'none';
    if (crisis || positiveCheck || signals >= 2) level = 'concern';
    else if (signals === 1) level = 'watch';
    return { level: level, reasons: reasons, signals: signals, crisis: crisis, logged: logged, lowDays: low, avg: avg };
  }

  /* ---------------- questionnaires ---------------- */
  var ANSWERS = [{ label: 'Not at all', v: 0 }, { label: 'Several days', v: 1 }, { label: 'More than half the days', v: 2 }, { label: 'Nearly every day', v: 3 }];
  var PHQ9 = [
    'Little interest or joy in doing things',
    'Feeling down, sad, or hopeless',
    'Trouble falling or staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Not much appetite, or eating too much',
    'Feeling bad about yourself \u2014 like you are a failure or have let yourself or your family down',
    'Trouble focusing on things, like reading or watching TV',
    'Moving or speaking so slowly that other people could notice \u2014 or being so fidgety or restless that you move around a lot more than usual',
    'Thoughts that you would be better off dead, or of hurting yourself in some way'
  ];
  function phq9Band(score) {
    if (score >= 20) return { band: 'severe', words: 'in the highest range', urgency: 'today' };
    if (score >= 15) return { band: 'moderately severe', words: 'in a high range', urgency: 'soon' };
    if (score >= 10) return { band: 'moderate', words: 'in the middle range', urgency: 'soon' };
    if (score >= 5) return { band: 'mild', words: 'in a lower range', urgency: 'watch' };
    return { band: 'minimal', words: 'in the lowest range', urgency: 'none' };
  }

  /* ---------------- mood lifts (behavioural activation) ---------------- */
  var LIFTS = [
    { id: 'walk', group: 'Move', label: 'Walk outside for 10 minutes', mins: 10 },
    { id: 'stretch', group: 'Move', label: 'Stretch for 5 minutes', mins: 5 },
    { id: 'dance', group: 'Move', label: 'Dance to one song', mins: 4 },
    { id: 'text', group: 'Connect', label: 'Text someone you like', mins: 3 },
    { id: 'call', group: 'Connect', label: 'Call or video chat someone', mins: 10 },
    { id: 'shower', group: 'Care', label: 'Take a warm shower', mins: 10 },
    { id: 'eat', group: 'Care', label: 'Eat something and drink water', mins: 10 },
    { id: 'song', group: 'Joy', label: 'Play a song you love', mins: 4 },
    { id: 'funny', group: 'Joy', label: 'Watch something funny', mins: 10 },
    { id: 'hobby', group: 'Joy', label: '10 minutes of a hobby', mins: 10 },
    { id: 'chore', group: 'I did it', label: 'One tiny chore (5 minutes)', mins: 5 },
    { id: 'light', group: 'Light', label: 'Sit by a window or in the sun', mins: 10 }
  ];
  function liftById(id) { for (var i = 0; i < LIFTS.length; i++) if (LIFTS[i].id === id) return LIFTS[i]; return null; }
  /* Rank lifts by how much they actually helped THIS user. */
  function rankLifts(lifts) {
    var by = {};
    (lifts || []).forEach(function (l) { if (typeof l.before === 'number' && typeof l.after === 'number') { var r = by[l.id] || (by[l.id] = { id: l.id, n: 0, sum: 0 }); r.n++; r.sum += l.after - l.before; } });
    return Object.keys(by).map(function (k) { var r = by[k]; return { id: k, n: r.n, avg: r.sum / r.n }; })
      .sort(function (a, b) { return b.avg - a.avg || b.n - a.n; });
  }

  var KIND = [
    'Depression is an illness, not a weakness. It is not your fault.',
    'Heavy feelings tell you things that are not true. You matter.',
    'Doing one tiny thing on a hard day is a big deal.',
    'You do not have to feel better first to take a small step. The step often comes first, and the feeling follows.',
    'Rest is allowed. So is asking for help.',
    'Talk to yourself the way you would talk to a good friend.',
    'This feeling is real, and it can change. Many people get better with help.'
  ];

  var api = { KEY: KEY, detect: detect, hasLowWords: hasLowWords, LOW_WORDS: LOW_WORDS, ANSWERS: ANSWERS, PHQ9: PHQ9, phq9Band: phq9Band,
    LIFTS: LIFTS, liftById: liftById, rankLifts: rankLifts, KIND: KIND, lastKeys: lastKeys, dkey: dkey };

  /* ---------------- browser: store + gather + card ---------------- */
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    var st = load();
    function defaults() { return { v: 1, watchOn: true, textDays: {}, checks: [], lifts: [], good: [], lastNudge: '' }; }
    function load() { try { var x = JSON.parse(localStorage.getItem(KEY)); if (x && x.v === 1) { var d = defaults(); for (var k in d) if (!(k in x)) x[k] = d[k]; return x; } } catch (e) { /* fresh */ } return defaults(); }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full */ } }
    function trim() {
      var keep = lastKeys(60); Object.keys(st.textDays).forEach(function (k) { if (keep.indexOf(k) === -1) delete st.textDays[k]; });
      if (st.checks.length > 60) st.checks = st.checks.slice(-60);
      if (st.lifts.length > 200) st.lifts = st.lifts.slice(-200);
      if (st.good.length > 120) st.good = st.good.slice(-120);
    }
    function gather() {
      var moods = {}, sleep = {}, steps = {};
      try {
        var s = root.RootlingApp && root.RootlingApp.getState(), ci = (s && s.checkins) || {};
        Object.keys(ci).forEach(function (k) { if (ci[k].mood && typeof ci[k].mood.value === 'number') moods[k] = ci[k].mood.value; if (ci[k].sleep && typeof ci[k].sleep.hours === 'number') sleep[k] = ci[k].sleep.hours; });
      } catch (e) { /* fine */ }
      try {
        var f = JSON.parse(localStorage.getItem('rootling-fitness-v1') || 'null');
        if (f && f.days) Object.keys(f.days).forEach(function (k) { var dd = f.days[k]; steps[k] = (dd.manualSteps || 0) + (dd.sensorSteps || 0); });
      } catch (e) { /* fine */ }
      /* Lift ratings count as mood too, so people who never use check-ins still get noticed. */
      st.lifts.forEach(function (l) { var k = dkey(l.at); if (typeof l.before === 'number' && moods[k] == null) moods[k] = l.before; });
      return { moods: moods, sleep: sleep, steps: steps, textDays: st.textDays, checks: st.checks };
    }
    function status() { var g = gather(); var r = detect(g); r.watchOn = st.watchOn; if (!st.watchOn) { r.level = r.crisis ? 'concern' : 'none'; } r.moods = g.moods; return r; }
    function noteText(text) {
      if (!st.watchOn || !hasLowWords(text)) return false;
      var k = dkey(Date.now()); st.textDays[k] = (st.textDays[k] || 0) + 1; trim(); save(); render(); return true;
    }
    function addCheck(c) { c.at = Date.now(); st.checks.push(c); trim(); save(); render(); }
    function addLift(l) { l.at = l.at || Date.now(); st.lifts.push(l); trim(); save(); render(); return l; }
    function rateLift(l, after) { l.after = after; save(); render(); }
    function addGood(items) { st.good.push({ at: Date.now(), items: items }); trim(); save(); render(); }
    function shouldNudge() { var s = status(); if (s.level === 'none') return null; var k = dkey(Date.now()); if (st.lastNudge === k) return null; return s; }
    function markNudged() { st.lastNudge = dkey(Date.now()); save(); }
    function setWatch(on) { st.watchOn = !!on; save(); render(); }

    var FACE = { 1: 'Rough day', 2: 'Feeling low', 3: 'Okay', 4: 'Good', 5: 'Great' };
    function render() {
      var card = document.getElementById('mood-card'); if (!card) return;
      var s = status();
      var dots = document.getElementById('mood-dots');
      if (dots) {
        dots.innerHTML = '';
        lastKeys(14).forEach(function (k, i) {
          var v = s.moods[k], dEl = document.createElement('span');
          dEl.className = 'mood-dot' + (v ? ' m' + v : ' none');
          var dt = new Date(k + 'T12:00:00');
          dEl.title = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ': ' + (v ? FACE[v] : 'no check-in');
          dEl.setAttribute('aria-label', dEl.title);
          if (i === 13) dEl.classList.add('today');
          dots.appendChild(dEl);
        });
      }
      var msg = document.getElementById('mood-status');
      if (msg) {
        var nm = 'your pet'; try { nm = root.RootlingApp.getState().petName || nm; } catch (e) { /* fine */ }
        if (!st.watchOn) msg.textContent = 'Mood watch is off. ' + nm + ' will not look for heavy patterns. You can still use every tool below.';
        else if (s.level === 'concern') msg.textContent = nm + ' has noticed some heavy days lately and cares about you. ' + (s.reasons[0] || '') + ' Want to do a quick check together, or talk to someone?';
        else if (s.level === 'watch') msg.textContent = nm + ' noticed things have felt a bit heavier. ' + (s.reasons[0] || '') + ' A small lift might help today.';
        else msg.textContent = s.logged ? nm + ' is keeping you company. Your last two weeks look steady. Keep tapping a face each day so ' + nm + ' can notice if things change.' : 'Tap a mood face in your check-in each day, and ' + nm + ' will gently notice if things get heavy for a while.';
      }
      card.classList.toggle('mood-concern', st.watchOn && s.level === 'concern');
      var sw = document.getElementById('mood-watch'); if (sw) sw.checked = st.watchOn;
      var best = document.getElementById('mood-best');
      if (best) {
        var r = rankLifts(st.lifts).filter(function (x) { return x.avg > 0; });
        best.textContent = r.length ? 'What lifts your mood most: ' + r.slice(0, 3).map(function (x) { var L = liftById(x.id); return L ? L.label.toLowerCase() : x.id; }).join(', ') + '.' : '';
        best.hidden = !r.length;
      }
    }
    function ask(cmd) {
      if (root.RootlingAssistant && root.RootlingAssistant.handle) {
        var a = document.getElementById('ask-card'); if (a && a.scrollIntoView) a.scrollIntoView({ behavior: 'smooth', block: 'start' });
        root.RootlingAssistant.handle(cmd);
      }
    }
    function bind() {
      var map = { 'mood-check-btn': 'mood check', 'mood-lift-btn': 'lift my mood', 'mood-good-btn': 'three good things', 'mood-trend-btn': 'my mood this week' };
      Object.keys(map).forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', function () { ask(map[id]); }); });
      var t = document.getElementById('mood-talk-btn');
      if (t) t.addEventListener('click', function () { if (root.RootlingWell && root.RootlingWell.openSafety) root.RootlingWell.openSafety(); else if (root.RootlingNav) root.RootlingNav.show('support'); });
      var sw = document.getElementById('mood-watch'); if (sw) sw.addEventListener('change', function () { setWatch(sw.checked); });
      document.querySelectorAll('.mood-btn').forEach(function (b) { b.addEventListener('click', function () { setTimeout(render, 80); }); });
      render();
      setTimeout(render, 700);
    }
    api.status = status; api.noteText = noteText; api.addCheck = addCheck; api.addLift = addLift; api.rateLift = rateLift; api.addGood = addGood;
    api.shouldNudge = shouldNudge; api.markNudged = markNudged; api.setWatch = setWatch; api.render = render;
    api.getStore = function () { return st; }; api.reload = function () { st = load(); render(); return st; };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  }

  root.RootlingMood = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
