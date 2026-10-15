/* fitness.js — "Move with your pet" (Rootling v12, Daniel 2026-10-15:
 * "assist in fitness goals as well — the user's exercise, step count, and
 * such help. The pet grows and gets experience points.")
 *
 * HONEST LIMITS (said in the app, too):
 *   - A website cannot read Apple Health, Google Fit, or Health Connect.
 *     Steps come from (a) "Walk with me" mode, which counts steps with the
 *     phone's motion sensor while Rootling is open, or (b) the number you
 *     type in from your phone or watch.
 *   - Goals are suggestions you accept. The pet never raises a goal by
 *     itself, never shames a missed day, and never talks about body size.
 *   - Workouts are gentle, general movement. Anyone with a heart, lung, or
 *     joint condition is told to check with their care team, and every
 *     workout says when to stop.
 *
 * Data lives on this device in 'rootling-fitness-v1'.
 */
(function (root) {
  'use strict';
  var KEY = 'rootling-fitness-v1';

  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function defaults() { return { v: 1, goal: { steps: 6000, minutes: 150, strength: 2 }, days: {}, walks: 0, goalHistory: [], lastSuggest: '' }; }

  /* ---------- pure math (exported for tests) ---------- */
  function weekKeys(now) {
    var out = [], d = new Date(now || Date.now());
    for (var i = 6; i >= 0; i--) { var x = new Date(d.getTime()); x.setDate(d.getDate() - i); out.push(dayKey(x)); }
    return out;
  }
  function dayTotals(day) {
    day = day || {};
    var minutes = 0, strength = 0;
    (day.workouts || []).forEach(function (w) { minutes += (Number(w.min) || 0) * (w.intensity === 'vigorous' ? 2 : 1); if (w.strength) strength = 1; });
    return { steps: (day.manualSteps || 0) + (day.sensorSteps || 0), minutes: minutes, strength: strength };
  }
  function weekStats(data, now) {
    var keys = weekKeys(now), steps = [], minutes = 0, strengthDays = 0, goalDays = 0;
    keys.forEach(function (k) {
      var t = dayTotals(data.days[k]);
      steps.push(t.steps); minutes += t.minutes; strengthDays += t.strength;
      if (t.steps >= data.goal.steps) goalDays++;
    });
    var avg = Math.round(steps.reduce(function (a, b) { return a + b; }, 0) / 7);
    return { keys: keys, steps: steps, avgSteps: avg, minutes: minutes, strengthDays: strengthDays, goalDays: goalDays };
  }
  /* Suggest (never force) a new step goal. Research: benefits level off
   * around 6,000–8,000 (60+) and 8,000–10,000 (younger) — Paluch 2022. */
  function suggestGoal(data, now) {
    var w = weekStats(data, now), g = data.goal.steps;
    var logged = w.steps.filter(function (x) { return x > 0; }).length;
    if (logged < 4) return null;
    if (w.goalDays >= 5 && g < 10000) return { to: Math.min(10000, g + 500), why: 'You reached your goal on ' + w.goalDays + ' of the last 7 days.' };
    if (w.goalDays <= 1 && g > 2000) return { to: Math.max(2000, Math.round((w.avgSteps + 500) / 500) * 500), why: 'A goal you can reach most days builds the habit faster.', easier: true };
    return null;
  }

  /* ---------- workouts ---------- */
  var WORKOUTS = {
    gentle: { name: 'Gentle chair workout', note: 'Sit in a sturdy chair without wheels.', strength: true, moves: [
      ['Seated marching', 45, 'Lift one knee, then the other. Swing your arms.'], ['Rest', 15, 'Breathe slowly.'],
      ['Arm circles', 30, 'Small circles forward, then back.'], ['Rest', 15, 'Breathe slowly.'],
      ['Sit to stand', 40, 'Stand up from the chair, sit back down slowly. Use your hands if you need to.'], ['Rest', 20, 'Breathe slowly.'],
      ['Heel raises', 30, 'Hold the chair back. Rise up on your toes, then lower.'], ['Rest', 15, 'Breathe slowly.'],
      ['Seated twists', 30, 'Turn gently left, then right.'], ['Cool down', 30, 'Slow breaths. You did it.']] },
    breathing: { name: 'Breathing-friendly workout (COPD and asthma)', note: 'Go slow. Breathe out through pursed lips during the hard part. It is okay to feel a little out of breath — you should still be able to talk.', strength: true, moves: [
      ['Pursed-lip breathing', 60, 'Breathe in through your nose for 2. Breathe out through pursed lips, like blowing out a candle, for 4.'],
      ['Seated marching', 40, 'Slow and steady. Breathe out as you lift.'], ['Rest', 30, 'Pursed-lip breathing.'],
      ['Arm raises', 30, 'Raise arms to shoulder height while breathing out. Lower while breathing in.'], ['Rest', 30, 'Pursed-lip breathing.'],
      ['Sit to stand', 30, 'Breathe out as you stand. Go at your own pace.'], ['Rest', 40, 'Pursed-lip breathing.'],
      ['Slow walk in place', 45, 'Hold a counter if you like.'], ['Cool down', 60, 'Pursed-lip breathing until your breath settles.']] },
    everyday: { name: 'Everyday 10-minute workout', note: 'No equipment.', strength: true, moves: [
      ['Warm-up: march in place', 60, 'Easy pace.'], ['Wall push-ups', 40, 'Hands on the wall, lean in and push back.'], ['Rest', 20, 'Shake it out.'],
      ['Squats to a chair', 40, 'Sit back like you are sitting down, then stand.'], ['Rest', 20, 'Breathe.'],
      ['Step-ups or stair steps', 60, 'Use the bottom stair. Hold the rail.'], ['Rest', 20, 'Breathe.'],
      ['Standing knee lifts', 40, 'Bring each knee up toward your hip.'], ['Rest', 20, 'Breathe.'],
      ['Glute bridges', 40, 'Lie on your back, knees bent. Lift your hips, lower slowly.'], ['Cool down: stretch', 60, 'Reach up tall, then gently touch your knees.']] },
    stronger: { name: 'Stronger 15-minute workout', note: 'Ready for more? Keep good form.', strength: true, moves: [
      ['Warm-up: fast march', 60, 'Arms swinging.'], ['Squats', 45, 'Full range you can control.'], ['Rest', 15, ''],
      ['Push-ups (knees or toes)', 40, 'Body in a straight line.'], ['Rest', 15, ''], ['Lunges', 45, 'Alternate legs. Hold a wall if needed.'], ['Rest', 15, ''],
      ['Plank', 30, 'Elbows under shoulders. Breathe.'], ['Rest', 15, ''], ['Jumping jacks or step jacks', 45, 'Step out instead of jumping if you prefer.'], ['Rest', 15, ''],
      ['Squats', 45, ''], ['Push-ups', 40, ''], ['Cool down', 90, 'Walk slowly, then stretch.']] },
    stretch: { name: '5-minute stretch', note: 'Never stretch into pain. Gentle is the goal.', strength: false, moves: [
      ['Neck rolls', 30, 'Slow half circles, ear to chest to ear.'], ['Shoulder rolls', 30, 'Up, back, down.'], ['Reach up tall', 30, 'Breathe in as you reach.'],
      ['Side stretch', 40, 'Reach over to one side, then the other.'], ['Hamstring stretch', 40, 'Sit, one leg out straight, lean forward gently.'],
      ['Chest opener', 30, 'Hands behind your back, open your chest.'], ['Calf stretch', 40, 'Hands on wall, one leg back, heel down.'], ['Slow breaths', 40, 'You are done.']] }
  };
  var STOP_SIGNS = 'Stop and rest if you feel chest pain or pressure, dizziness, or breathlessness that does not ease with rest. Call 911 if chest pain does not go away.';

  var pure = { dayKey: dayKey, dayTotals: dayTotals, weekStats: weekStats, suggestGoal: suggestGoal, weekKeys: weekKeys, WORKOUTS: WORKOUTS, STOP_SIGNS: STOP_SIGNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (typeof document === 'undefined') { root.ROOTLING_FITNESS = pure; return; }

  /* ---------- store ---------- */
  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!d) return defaults(); var b = defaults(); for (var k in b) if (d[k] === undefined) d[k] = b[k]; for (var g in b.goal) if (d.goal[g] === undefined) d.goal[g] = b.goal[g]; return d; }
    catch (e) { return defaults(); }
  }
  var data = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage off */ } render(); }
  function today() { var k = dayKey(); if (!data.days[k]) data.days[k] = { manualSteps: 0, sensorSteps: 0, workouts: [] }; return data.days[k]; }

  function xp(points, why) {
    try { if (window.RootlingApp && window.RootlingApp.addExperience) return window.RootlingApp.addExperience(points, why); } catch (e) { /* growth is a bonus */ }
    return { added: 0 };
  }
  function xpLine(r) {
    if (!r || !r.added) return r && r.capped ? 'Your pet already grew all it can from bonus points today. Check-ins still help.' : '';
    var nm = 'your pet'; try { nm = (window.RootlingApp.getState().petName) || nm; } catch (e) { /* fine */ }
    return '+' + r.added + ' growth points for ' + nm + '.' + (r.stageUp ? ' ' + nm + ' grew to the ' + r.stageName + ' stage!' : '');
  }

  /* ---------- actions (return plain result objects for the assistant) ---------- */
  function setSteps(n, add) {
    var d = today(), before = dayTotals(d).steps;
    n = Math.max(0, Math.min(100000, Math.round(n)));
    if (add) d.manualSteps += n; else d.manualSteps = Math.max(0, n - d.sensorSteps);
    var after = dayTotals(d).steps, r = { added: 0 };
    if (before < data.goal.steps && after >= data.goal.steps) r = xp(10, 'step goal');
    else if (after > before) r = xp(2, 'steps');
    save();
    return { steps: after, goal: data.goal.steps, hit: after >= data.goal.steps, xp: xpLine(r) };
  }
  function logWorkout(type, minutes, opts) {
    opts = opts || {};
    var d = today();
    var t = String(type || 'activity').toLowerCase();
    var strength = !!opts.strength || /strength|weights?|lift|resistance|push|squat|yoga|pilates|chair workout|everyday|stronger/.test(t);
    var vigorous = opts.intensity === 'vigorous' || /\b(run|ran|running|jog|jogged|jogging|hiit|swim laps|spin|basketball|soccer|stronger)\b/.test(t);
    var w = { type: t, min: Math.max(1, Math.min(600, Math.round(minutes))), intensity: vigorous ? 'vigorous' : 'moderate', strength: strength, at: Date.now() };
    d.workouts.push(w);
    var est = 0;
    if (/walk|hike/.test(t) && !opts.noSteps) { est = Math.round(w.min * 100); d.manualSteps += est; }
    var r = xp(Math.min(10, 3 + Math.floor(w.min / 10)), 'workout');
    save();
    var ws = weekStats(data);
    return { workout: w, estSteps: est, week: ws, goal: data.goal, xp: xpLine(r) };
  }
  function setGoal(kind, n) {
    var old = data.goal[kind];
    data.goal[kind] = Math.round(n);
    data.goalHistory.push({ at: Date.now(), kind: kind, from: old, to: data.goal[kind] });
    save();
    return data.goal;
  }
  function summary() { var t = dayTotals(data.days[dayKey()]); return { today: t, week: weekStats(data), goal: data.goal, suggest: suggestGoal(data), walks: data.walks }; }

  /* ---------- Walk with me: motion-sensor step counter ---------- */
  var walk = null;
  function onMotion(e) {
    var a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x === null) return;
    var mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    walk.avg = walk.avg * 0.9 + mag * 0.1;            /* slow baseline */
    var diff = mag - walk.avg, now = Date.now();
    if (!walk.up && diff > 1.4 && now - walk.last > 280) { walk.up = true; walk.steps++; walk.last = now; tickWalk(); }
    else if (walk.up && diff < 0.2) walk.up = false;
  }
  function tickWalk() {
    var el = document.getElementById('fit-walk-live'); if (!el || !walk) return;
    var sec = Math.round((Date.now() - walk.start) / 1000);
    el.textContent = walk.steps + ' steps \u00b7 ' + Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2) + (walk.sensor ? '' : ' (no motion sensor \u2014 I am timing you)');
  }
  function startWalk(cb) {
    if (walk) { cb && cb({ already: true }); return; }
    function begin(sensor) {
      walk = { start: Date.now(), steps: 0, avg: 9.8, up: false, last: 0, sensor: sensor, timer: setInterval(tickWalk, 1000) };
      if (sensor) window.addEventListener('devicemotion', onMotion);
      var box = document.getElementById('fit-walk'); if (box) box.hidden = false;
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { walk && (walk.lock = l); }).catch(function () {}); } catch (e) { /* screen may sleep */ }
      tickWalk();
      cb && cb({ sensor: sensor });
    }
    var DM = window.DeviceMotionEvent;
    if (!DM) { begin(false); return; }
    if (typeof DM.requestPermission === 'function') {
      DM.requestPermission().then(function (p) { begin(p === 'granted'); }).catch(function () { begin(false); });
    } else begin(('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  }
  function stopWalk() {
    if (!walk) return null;
    window.removeEventListener('devicemotion', onMotion);
    clearInterval(walk.timer);
    try { if (walk.lock) walk.lock.release(); } catch (e) { /* fine */ }
    var min = Math.max(1, Math.round((Date.now() - walk.start) / 60000));
    var steps = walk.steps, sensor = walk.sensor && steps > 20;
    walk = null;
    var box = document.getElementById('fit-walk'); if (box) box.hidden = true;
    var d = today();
    var before = dayTotals(d).steps;
    if (sensor) d.sensorSteps += steps;
    data.walks += 1;
    var res = logWorkout('walk with my pet', min, { noSteps: sensor });
    var after = dayTotals(today()).steps;
    if (before < data.goal.steps && after >= data.goal.steps) { var r2 = xp(10, 'step goal'); if (r2.added) res.xp = [res.xp, xpLine(r2)].join(' '); }
    save();
    return { minutes: min, steps: sensor ? steps : Math.round(min * 100), estimated: !sensor, today: after, goal: data.goal.steps, xp: res.xp };
  }

  /* ---------- workout player (a DOM node the assistant drops into chat) ---------- */
  function workoutNode(id, onDone) {
    var w = WORKOUTS[id] || WORKOUTS.gentle;
    var wrap = document.createElement('div'); wrap.className = 'fit-player';
    var title = document.createElement('p'); title.className = 'fit-player-title'; title.textContent = w.name; wrap.appendChild(title);
    var note = document.createElement('p'); note.className = 'gentle small'; note.textContent = w.note + ' ' + STOP_SIGNS; wrap.appendChild(note);
    var list = document.createElement('ol'); list.className = 'ask-list';
    w.moves.forEach(function (m) { var li = document.createElement('li'); li.textContent = m[0] + ' \u2014 ' + m[1] + ' sec'; list.appendChild(li); });
    wrap.appendChild(list);
    var now = document.createElement('div'); now.className = 'fit-now'; now.hidden = true;
    var nowName = document.createElement('p'); nowName.className = 'fit-now-name';
    var nowCue = document.createElement('p'); nowCue.className = 'gentle';
    var nowClock = document.createElement('p'); nowClock.className = 'ask-timer-clock';
    now.appendChild(nowName); now.appendChild(nowClock); now.appendChild(nowCue);
    wrap.appendChild(now);
    var row = document.createElement('div'); row.className = 'ask-actions';
    var start = document.createElement('button'); start.type = 'button'; start.className = 'btn btn-primary'; start.textContent = 'Start workout';
    var stop = document.createElement('button'); stop.type = 'button'; stop.className = 'btn btn-ghost'; stop.textContent = 'Stop'; stop.hidden = true;
    row.appendChild(start); row.appendChild(stop); wrap.appendChild(row);
    var i = 0, left = 0, t = null, began = 0;
    function show() {
      var m = w.moves[i]; nowName.textContent = 'Move ' + (i + 1) + ' of ' + w.moves.length + ': ' + m[0]; nowCue.textContent = m[2];
      nowClock.textContent = left + 's';
      Array.prototype.forEach.call(list.children, function (li, j) { li.className = j === i ? 'fit-current' : (j < i ? 'fit-done' : ''); });
    }
    function finish(done) {
      clearInterval(t); t = null; now.hidden = true; stop.hidden = true; start.hidden = !done ? false : true;
      var min = Math.max(1, Math.round((Date.now() - began) / 60000));
      if (done || min >= 3) { var res = logWorkout(w.name.toLowerCase(), min, { strength: w.strength }); onDone && onDone(res, done); }
    }
    start.addEventListener('click', function () {
      i = 0; left = w.moves[0][1]; began = Date.now(); now.hidden = false; start.hidden = true; stop.hidden = false; show();
      t = setInterval(function () {
        left--;
        if (left <= 0) { i++; if (i >= w.moves.length) { finish(true); return; } left = w.moves[i][1]; try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { /* fine */ } }
        show();
      }, 1000);
    });
    stop.addEventListener('click', function () { finish(false); });
    return wrap;
  }

  /* ---------- Home card ---------- */
  function bar(id, val, max) { var e = document.getElementById(id); if (e) { e.style.width = Math.min(100, Math.round(100 * val / Math.max(1, max))) + '%'; } }
  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function render() {
    if (!document.getElementById('fit-card')) return;
    var s = summary();
    setText('fit-steps', s.today.steps.toLocaleString() + ' / ' + s.goal.steps.toLocaleString() + ' steps today');
    bar('fit-steps-bar', s.today.steps, s.goal.steps);
    setText('fit-min', s.week.minutes + ' / ' + s.goal.minutes + ' active minutes this week');
    bar('fit-min-bar', s.week.minutes, s.goal.minutes);
    setText('fit-str', s.week.strengthDays + ' / ' + s.goal.strength + ' strength days this week');
    bar('fit-str-bar', s.week.strengthDays, s.goal.strength);
    var wk = document.getElementById('fit-week');
    if (wk) {
      wk.innerHTML = '';
      var mx = Math.max(s.goal.steps, Math.max.apply(null, s.week.steps));
      s.week.steps.forEach(function (v, i) {
        var col = document.createElement('div'); col.className = 'fit-day';
        var b = document.createElement('span'); b.className = 'fit-day-bar' + (v >= s.goal.steps ? ' hit' : ''); b.style.height = Math.max(4, Math.round(56 * v / Math.max(1, mx))) + 'px';
        var l = document.createElement('span'); l.className = 'fit-day-label'; l.textContent = new Date(s.week.keys[i] + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });
        col.title = v.toLocaleString() + ' steps'; col.appendChild(b); col.appendChild(l); wk.appendChild(col);
      });
    }
  }
  function ask(text) { if (window.RootlingAssistant) { window.RootlingAssistant.handle(text); var c = document.getElementById('ask-card'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); } }
  function init() {
    var map = { 'fit-walk-btn': 'start a walk', 'fit-log-btn': 'log my steps', 'fit-workout-btn': 'give me a workout', 'fit-sum-btn': 'my fitness' };
    Object.keys(map).forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', function () { ask(map[id]); }); });
    var stop = document.getElementById('fit-walk-stop'); if (stop) stop.addEventListener('click', function () { ask('stop my walk'); });
    render();
  }

  root.ROOTLING_FITNESS = pure;
  root.RootlingFitness = { key: KEY, getData: function () { return data; }, setSteps: setSteps, logWorkout: logWorkout, setGoal: setGoal, summary: summary,
    startWalk: startWalk, stopWalk: stopWalk, walking: function () { return !!walk; }, workoutNode: workoutNode, xp: xp, xpLine: xpLine, render: render,
    reload: function () { data = load(); render(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
