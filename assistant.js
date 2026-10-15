/* assistant.js — "Ask your pet" (Rootling v11, Daniel 2026-10-15:
 * "Improve the root app so the user's pet can help the user in as many
 * ways as possible with orders such as 'Check my email'. The pet has AI
 * intelligence, acts like a real scientist with researched-backed data on
 * neurodivergent symptoms, treatments, and how the user can best be
 * assisted — and grows and adapts to that user to best meet their needs.")
 *
 * WHAT IT DOES
 *   - A command box on Home. Type or talk ("Check my email", "Remind me to
 *     take my meds at 8", "I can't start my essay", "What does research say
 *     about ADHD?"). The pet works out what you mean ON THIS DEVICE and acts.
 *   - Research answers come from research.js, with how strong the evidence
 *     is and the real source link.
 *   - It learns on this device: which helps you say helped, what you ask
 *     for at which time of day, your own words for things ("when I say X,
 *     do Y"), and whether you like short or longer answers. Its helper
 *     level grows as you work together. Everything it learned is shown in
 *     plain words and can be wiped.
 *
 * GUARDRAILS (same as the rest of Rootling, non-negotiable)
 *   - Never diagnoses or labels the person. Treatments are information to
 *     talk over with a professional, never advice to start or stop care.
 *   - Crisis words ALWAYS route to 988 + the Support page first.
 *   - Optional connected helpers (Google email + calendar, smarter AI
 *     brain, weather) are OFF by default, explain what they touch, and
 *     only run when the user turns them on. Keys stay on this device.
 *   - Nothing is ever sent by itself: email and texts open your own app
 *     with words ready; you press send.
 */
(function (root) {
  'use strict';

  var KEY = 'rootling-assistant-v1';
  var SECRET_KEY = 'rootling-assistant-secrets-v1'; /* not in backups */

  /* ------------------------------------------------------------------
   * Pure helpers (exported for tests)
   * ------------------------------------------------------------------ */
  var CRISIS = ['kill myself', 'hurt myself', 'harm myself', 'end my life', 'want to die',
    'suicidal', 'suicide', 'self-harm', 'self harm', 'no reason to live', 'better off dead',
    'end it all', 'don\u2019t want to be alive', 'dont want to be alive'];

  function clean(s) { return String(s || '').replace(/[\u2018\u2019]/g, '\'').replace(/\s+/g, ' ').trim(); }
  function low(s) { return clean(s).toLowerCase(); }
  function hasCrisis(text) {
    var t = ' ' + low(text).replace(/'/g, '\u2019') + ' ';
    var t2 = ' ' + low(text) + ' ';
    for (var i = 0; i < CRISIS.length; i++) if (t.indexOf(CRISIS[i]) !== -1 || t2.indexOf(CRISIS[i]) !== -1) return true;
    return false;
  }

  /* Parse "in 10 minutes", "at 3pm", "at 15:30", "tomorrow at 9", "at noon".
   * Returns a timestamp (ms) or null. `now` injectable for tests. */
  function parseWhen(text, now) {
    var t = low(text);
    var base = now ? new Date(now) : new Date();
    var m = t.match(/\bin (\d+|an?|half an?) ?(sec|second|min|minute|hr|hour)s?\b/);
    if (m) {
      var n = m[1] === 'a' || m[1] === 'an' ? 1 : (/half/.test(m[1]) ? 0.5 : Number(m[1]));
      var unit = m[2].charAt(0) === 's' ? 1000 : (m[2].charAt(0) === 'm' ? 60000 : 3600000);
      return base.getTime() + n * unit;
    }
    if (/\bin half an hour\b/.test(t)) return base.getTime() + 30 * 60000;
    var tomorrow = /\btomorrow\b/.test(t);
    var h = null, mi = 0, ampmGiven = false;
    if (/\b(at )?noon\b/.test(t)) { h = 12; }
    else if (/\b(at )?midnight\b/.test(t)) { h = 0; }
    else {
      var a = t.match(/\bat (\d{1,2})(?::(\d{2}))? ?(am|pm|a\.m\.|p\.m\.)?\b/) ||
              t.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm|a\.m\.|p\.m\.)\b/) ||
              t.match(/\b(\d{1,2}):(\d{2})\b()/);
      if (a) {
        h = Number(a[1]); mi = a[2] ? Number(a[2]) : 0;
        var ap = a[3] ? a[3].replace(/\./g, '') : '';
        ampmGiven = !!ap;
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        if (/\b(tonight|evening|this afternoon)\b/.test(t) && h < 12) h += 12;
      } else if (tomorrow && /morning/.test(t)) { h = 9; }
      else if (/\btonight\b/.test(t)) { h = 20; }
    }
    if (h === null || h > 23 || mi > 59) return null;
    var d = new Date(base.getTime());
    d.setHours(h, mi, 0, 0);
    if (tomorrow) d.setDate(d.getDate() + 1);
    else if (d.getTime() <= base.getTime()) {
      /* "at 8" with no am/pm: the next 8 o'clock that is still ahead. */
      var pmTry = new Date(d.getTime()); pmTry.setHours(h + 12);
      if (!ampmGiven && h < 12 && pmTry.getTime() > base.getTime()) d = pmTry;
      else d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }

  /* Strip the time words from a reminder so "take meds at 8pm" -> "take meds". */
  function stripWhen(text) {
    return clean(String(text)
      .replace(/\b(tomorrow|tonight|this (morning|afternoon|evening))\b/gi, '')
      .replace(/\bin (\d+|an?|half an?) ?(sec|second|min|minute|hr|hour)s?\b/gi, '')
      .replace(/\bat (\d{1,2})(:\d{2})? ?(am|pm|a\.m\.|p\.m\.)?\b/gi, '')
      .replace(/\b(\d{1,2})(:\d{2})? ?(am|pm)\b/gi, '')
      .replace(/\bat (noon|midnight)\b/gi, '')
      .replace(/^(to|that)\s+/i, '')
      .replace(/[.!?,\s]+$/, ''));
  }

  /* "take my meds" -> "take your meds" when the pet says it back. */
  function youWords(text) {
    return String(text || '').replace(/\b(I'm|I am)\b/gi, 'you are').replace(/\bmyself\b/gi, 'yourself')
      .replace(/\bmy\b/gi, 'your').replace(/\bmine\b/gi, 'yours').replace(/\bme\b/gi, 'you').replace(/\bI\b/g, 'you');
  }

  function parseDuration(text) {
    var t = low(text);
    var m = t.match(/(\d+(?:\.\d+)?) ?(sec|second|min|minute|hr|hour)s?/);
    if (!m) return null;
    var n = Number(m[1]);
    var u = m[2].charAt(0) === 's' ? 1 : (m[2].charAt(0) === 'm' ? 60 : 3600);
    return Math.round(n * u);
  }

  /* Smarter tiny steps for common tasks; generic fallback. */
  var STEP_TEMPLATES = [
    { re: /e-?mail|inbox|reply/, steps: ['Open your email', 'Read only the newest one', 'Reply in one sentence, or star it for later', 'Do the next one, or stop — both are fine'] },
    { re: /essay|paper|report|homework|assignment|write|writing/, steps: ['Open the document', 'Write the title', 'Write one messy sentence — messy is allowed', 'Write two more sentences', 'Save your work'] },
    { re: /clean|tidy|room|mess/, steps: ['Pick up 5 things', 'Put trash in a bag', 'Put clothes in one pile', 'Clear one small surface', 'Stop and look — you did that'] },
    { re: /dish/, steps: ['Run warm water', 'Wash just the cups', 'Wash 5 more things', 'Leave the rest to soak — that counts'] },
    { re: /laundry|clothes|wash/, steps: ['Carry the basket to the washer', 'Put clothes in', 'Add soap and press start', 'Set a reminder to move them'] },
    { re: /shower|bath|teeth/, steps: ['Walk to the bathroom', 'Turn on the water', 'Step in — the hardest part is done', 'Wash, rinse, done'] },
    { re: /call|phone|appointment|doctor/, steps: ['Find the number', 'Write one line: what you want to ask', 'Press call', 'Say your line — you can read it'] },
    { re: /bill|pay|money|budget/, steps: ['Open the bill', 'Find the amount and due date', 'Open the payment page', 'Pay, or set a reminder for payday'] },
    { re: /job|application|resume|r[e\u00e9]sum[e\u00e9]|cover letter/, steps: ['Open the job post', 'Copy 3 key words from it', 'Open your resume', 'Change one line to use those words', 'Save it'] },
    { re: /study|read|exam|test|chapter/, steps: ['Open the book or notes', 'Read one page', 'Write one thing you learned', 'Read one more page'] },
    { re: /cook|dinner|lunch|breakfast|meal|eat/, steps: ['Pick the easiest food you have', 'Get out one pan or plate', 'Make just that one thing', 'Eat — that is care'] }
  ];
  function microSteps(task) {
    var t = low(task);
    for (var i = 0; i < STEP_TEMPLATES.length; i++) if (STEP_TEMPLATES[i].re.test(t)) return STEP_TEMPLATES[i].steps.slice();
    var name = clean(task) || 'it';
    if (name.length > 40) name = name.slice(0, 40);
    return ['Get out what you need for ' + name, 'Do the smallest first bit — 2 minutes only', 'Do one more small bit', 'Stop or keep going — your choice'];
  }

  /* Intent table. Order matters: first match wins. Each returns
   * { id, slots }. Aliases the user taught are checked before this. */
  var INTENTS = [
    { id: 'help', re: /^(help( me)?( please)?|what can you do|what else can you do|what do you do|commands|how do (i|you) use (this|you))$/ },
    { id: 'learned', re: /what (have you|did you) learn|what do you know about me|how are you helping me|your level/ },
    { id: 'forget', re: /^(forget (everything|what you learned|me)|wipe (your )?(memory|learning)|reset (your )?learning)/ },
    { id: 'teach', re: /^when i say (.+?)[,]? (?:i mean|it means|do|open|that means) (.+)$/ },
    { id: 'emailCheck', re: /\b(check|read|open|show|look at|any|go through)\b.*\b(e-?mails?|inbox|mail|gmail|outlook)\b|^(e-?mail|inbox|mail)$|new e-?mails?/ },
    { id: 'emailWrite', re: /(write|send|draft|compose)\b.*\b(e-?mail|email)\b(?: to (.+))?/ },
    { id: 'calendar', re: /(calendar|schedule|agenda|what(?:'s| is) (?:on )?(?:for )?today|plan my day|what do i have|my day|what(?:'s| is) next)/ },
    { id: 'remind', re: /^(?:please )?(?:remind me|set a reminder|reminder)\b(.*)$/ },
    { id: 'reminders', re: /(my|show|list|what are my) reminders|what did i ask you to remind/ },
    { id: 'researchAsk', re: /(what does (the )?(research|science|evidence)|research (say|show)|evidence (for|on|about)|stud(y|ies) (on|about)|treatments? (for|of)|symptoms? of|signs of|tell me about|explain|what is (adhd|autism|anxiety|ptsd|burnout|rsd|rejection)|how (can|do|should) i (cope|deal|handle|manage) with|how to (cope|deal|manage))/ },
    { id: 'timer', re: /(timer|pomodoro|focus (with me|for|block|time)|work (for|with me)|body ?double|sit with me|just \d+ min)/ },
    { id: 'cantStart', re: /(can'?t start|cannot start|help me start|stuck on|procrastinat|break (it|this|.+) (down|into)|don'?t know where to start|too big|overwhelmed by)\b(.*)/ },
    { id: 'addPerson', re: /^add (a )?(person|contact|friend)\b|^save (.+?)'?s? (number|phone|email)/ },
    { id: 'park', re: /^(park|note|jot|save( this)?|remember( that)?|add)\b[: ]*(.*?)( to (my )?(list|tasks|to-?do( list)?))?$/ },
    { id: 'priority', re: /(my one thing|main thing|priority) (is|today is|=)\s*(.+)$|^make (.+) my (one thing|priority)$/ },
    { id: 'sensory', re: /(too (loud|bright|much noise)|overstimulat|sensory|meltdown|shut ?down|noisy|crowd|lights hurt)/ },
    { id: 'anxious', re: /(anxious|anxiety|panic|nervous|worried|worrying|scared|afraid|freaking out|heart (is )?racing|can'?t breathe|stress(ed)?|overwhelm(ed)?)/ },
    { id: 'low', re: /(sad|depressed|feel(ing)? (down|low|empty|bad|awful)|lonely|hopeless|crying|no motivation|unmotivated|small win)/ },
    { id: 'tired', re: /(tired|exhausted|burn(ed|t)? ?out|no energy|drained|wiped out|so sleepy)/ },
    { id: 'sleep', re: /(can'?t sleep|insomnia|trouble sleeping|help me sleep|bedtime|wind ?down)/ },
    { id: 'angry', re: /(angry|furious|so mad|pissed|rage|rejected|rejection)/ },
    { id: 'breathe', re: /^(breathe|breathing|breathe with me|help me breathe)/ },
    { id: 'ground', re: /\bground(ing)?\b|5 4 3 2 1|five things/ },
    { id: 'noise', re: /(white|pink|brown|background) noise|focus (sound|music)|play noise|stop (the )?noise/ },
    { id: 'music', re: /^play (.+)|(put on|play) (some )?music/ },
    { id: 'weather', re: /(weather|rain(ing)?|temperature|cold outside|hot outside|what should i wear|umbrella|forecast)/ },
    { id: 'call', re: /^(call|phone|ring|text|message|sms)\s+(.+)$/ },
    { id: 'water', re: /(drink|water|thirsty|hydrat)/ },
    { id: 'research', re: /(research|science|scientist|studies|study says|evidence|what is|what are|tell me about|explain|symptoms?|treatments?|therapy|medication|meds for|how (can|do|should) i (cope|deal|handle|manage|help)|why do i)/ },
    { id: 'search', re: /^(look up|search( for)?|google|find (out|info))\s+(.+)$/ },
    { id: 'nav', re: /^(open|go to|show( me)?|take me to)\s+(home|focus|tasks|activities|adventures|companion|pets?|settings|support|check-?ins?|journal|privacy)/ },
    { id: 'pause', re: /^(pause|leave quietly|hide|quiet mode)/ },
    { id: 'thanks', re: /^(thanks|thank you|ty|you('re| are) (the best|great|awesome)|good (pet|job))/ },
    { id: 'greet', re: /^(hi|hello|hey|yo|good (morning|afternoon|evening)|how are you|what'?s up)\b/ }
  ];

  function route(text, aliases) {
    var t = low(text).replace(/[?!.]+$/, '');
    if (!t) return { id: 'empty', slots: [] };
    if (hasCrisis(t)) return { id: 'crisis', slots: [] };
    if (aliases) {
      for (var phrase in aliases) {
        if (t === phrase || t.indexOf(phrase) === 0) return { id: 'alias', slots: [aliases[phrase]], alias: phrase };
      }
    }
    for (var i = 0; i < INTENTS.length; i++) {
      var m = t.match(INTENTS[i].re);
      if (m) return { id: INTENTS[i].id, slots: m.slice(1), raw: t };
    }
    return { id: 'unknown', slots: [], raw: t };
  }

  function helperLevel(xp) {
    var L = [
      { min: 0, name: 'Curious listener', unlock: 'Learns your words and what helps.' },
      { min: 15, name: 'Good listener', unlock: 'Starts offering things you often ask for at this time of day.' },
      { min: 40, name: 'Handy helper', unlock: 'Leads with the helps that worked best for you.' },
      { min: 90, name: 'Wise friend', unlock: 'Notices patterns and suggests one next best thing.' },
      { min: 180, name: 'Trusted partner', unlock: 'Knows your routine well. Still asks before it changes anything.' }
    ];
    var cur = L[0], next = null;
    for (var i = 0; i < L.length; i++) { if (xp >= L[i].min) { cur = L[i]; next = L[i + 1] || null; } }
    return { level: L.indexOf(cur) + 1, name: cur.name, unlock: cur.unlock, next: next, xp: xp };
  }

  var pure = { youWords: youWords, hasCrisis: hasCrisis, parseWhen: parseWhen, stripWhen: stripWhen, parseDuration: parseDuration,
    microSteps: microSteps, route: route, helperLevel: helperLevel, INTENTS: INTENTS };

  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (typeof document === 'undefined') { root.ROOTLING_ASSISTANT = pure; return; }

  /* ------------------------------------------------------------------
   * Store
   * ------------------------------------------------------------------ */
  function defaults() {
    return {
      v: 1,
      settings: { speak: false, mail: null, length: 'auto', proactive: true, calendar: null },
      people: [],
      reminders: [],
      learn: { xp: 0, intents: {}, helps: {}, aliases: {}, moreTaps: 0, shortTaps: 0, topics: {}, firstSeen: Date.now() },
      history: []
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var d = JSON.parse(raw), b = defaults();
      for (var k in b) if (d[k] === undefined) d[k] = b[k];
      for (var s in b.settings) if (d.settings[s] === undefined) d.settings[s] = b.settings[s];
      for (var l in b.learn) if (d.learn[l] === undefined) d.learn[l] = b.learn[l];
      return d;
    } catch (e) { return defaults(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage off */ } }
  function loadSecrets() { try { return JSON.parse(localStorage.getItem(SECRET_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveSecrets() { try { localStorage.setItem(SECRET_KEY, JSON.stringify(sec)); } catch (e) { /* storage off */ } }

  var st = load();
  var sec = loadSecrets(); /* { brain:{provider,key,model,baseUrl}, googleClientId } */
  var googleToken = null; /* memory only, never stored */
  var timer = null;
  var noiseNodes = null;

  /* ------------------------------------------------------------------
   * Context from the rest of Rootling
   * ------------------------------------------------------------------ */
  function petState() { try { return window.RootlingApp && window.RootlingApp.getState ? window.RootlingApp.getState() : null; } catch (e) { return null; } }
  function petName() { var s = petState(); return (s && s.petName) || 'Your pet'; }
  function profile() { var s = petState(); return (s && s.profile) || 'companion'; }
  function literal() { return profile() === 'calm'; }
  function execData() { try { return window.RootlingExec && window.RootlingExec.getData ? window.RootlingExec.getData() : null; } catch (e) { return null; } }
  function execSave() {
    var d = execData();
    if (!d) return false;
    try { localStorage.setItem(window.RootlingExec.key || 'rootling-exec-v1', JSON.stringify(d)); } catch (e) { return false; }
    try { window.RootlingExec.render(); } catch (e) { /* render is a help */ }
    return true;
  }
  function nav(view) { try { if (window.RootlingNav) window.RootlingNav.show(view); } catch (e) { /* nav is a help */ } }
  function openSafety() { try { nav('support'); if (window.RootlingWell && window.RootlingWell.openSafety) window.RootlingWell.openSafety(true); } catch (e) { /* 988 line is shown regardless */ } }

  /* ------------------------------------------------------------------
   * Learning (on this device only)
   * ------------------------------------------------------------------ */
  function learnUse(id) {
    if (!id || id === 'unknown' || id === 'empty') return;
    var rec = st.learn.intents[id] || { n: 0, hours: [] };
    rec.n += 1;
    var h = new Date().getHours();
    rec.hours.push(h);
    if (rec.hours.length > 40) rec.hours = rec.hours.slice(-40);
    st.learn.intents[id] = rec;
    st.learn.xp += 1;
    save();
  }
  function learnHelp(helpId, good) {
    var r = st.learn.helps[helpId] || { yes: 0, no: 0 };
    if (good) r.yes += 1; else r.no += 1;
    st.learn.helps[helpId] = r;
    st.learn.xp += 2;
    save();
  }
  function helpScore(id) { var r = st.learn.helps[id]; if (!r) return 0; return (r.yes + 1) / (r.yes + r.no + 2) - 0.5; }
  /* Order a list of help options by what worked before (stable). */
  function rankHelps(list) {
    if (helperLevel(st.learn.xp).level < 3) return list;
    return list.slice().sort(function (a, b) { return helpScore(b.id) - helpScore(a.id); });
  }
  function prefersLong() {
    if (st.settings.length === 'short') return false;
    if (st.settings.length === 'more') return true;
    return st.learn.moreTaps >= 3 && st.learn.moreTaps > st.learn.shortTaps * 2;
  }
  /* Things this person usually asks for around this hour. */
  function habitsNow() {
    var h = new Date().getHours(), out = [];
    for (var id in st.learn.intents) {
      var rec = st.learn.intents[id], near = 0;
      for (var i = 0; i < rec.hours.length; i++) if (Math.abs(rec.hours[i] - h) <= 1) near++;
      if (near >= 3) out.push({ id: id, near: near });
    }
    out.sort(function (a, b) { return b.near - a.near; });
    return out.map(function (x) { return x.id; });
  }

  var CHIP_FOR = {
    emailCheck: 'Check my email', calendar: 'Plan my day', reminders: 'My reminders', timer: 'Focus with me for 15 minutes',
    cantStart: 'I can\u2019t start', anxious: 'I feel anxious', breathe: 'Breathe with me', weather: 'What\u2019s the weather?',
    water: 'Remind me to drink water in 1 hour', noise: 'Play background noise', low: 'Give me one small win', tired: 'I am exhausted',
    sleep: 'Help me wind down', research: 'What does research say about ADHD?'
  };

  /* ------------------------------------------------------------------
   * UI
   * ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function button(label, cls, fn) { var b = el('button', 'btn ' + (cls || 'btn-soft'), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function link(label, href) { var a = el('a', 'ask-link', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }

  function log() { return $('ask-log'); }
  function scrollLog() { var l = log(); if (l) l.scrollTop = l.scrollHeight; }

  function addUser(text) {
    var row = el('div', 'ask-msg ask-user');
    row.appendChild(el('p', '', text));
    log().appendChild(row);
    st.history.push({ who: 'you', text: text, at: Date.now() });
    if (st.history.length > 40) st.history = st.history.slice(-40);
    scrollLog();
  }

  /* reply({ text, lines, list, buttons, research, helpId, more }) */
  function reply(r) {
    var row = el('div', 'ask-msg ask-pet');
    var who = el('p', 'ask-who', petName());
    row.appendChild(who);
    var body = el('div', 'ask-body');
    if (r.text) body.appendChild(el('p', '', r.text));
    if (r.list) {
      var ol = el(r.ordered ? 'ol' : 'ul', 'ask-list');
      r.list.forEach(function (x) { var li = el('li'); if (typeof x === 'string') li.textContent = x; else li.appendChild(x); ol.appendChild(li); });
      body.appendChild(ol);
    }
    if (r.lines) r.lines.forEach(function (x) { body.appendChild(el('p', 'gentle', x)); });
    if (r.node) body.appendChild(r.node);
    if (r.more) {
      var moreWrap = el('div', 'ask-more'); moreWrap.hidden = !prefersLong();
      r.more.forEach(function (x) { if (typeof x === 'string') moreWrap.appendChild(el('p', 'gentle', x)); else moreWrap.appendChild(x); });
      body.appendChild(moreWrap);
      if (moreWrap.hidden) {
        var mb = button('Tell me more', 'btn-ghost', function () { moreWrap.hidden = false; mb.remove(); st.learn.moreTaps++; save(); });
        body.appendChild(mb);
      }
    }
    if (r.buttons && r.buttons.length) {
      var br = el('div', 'ask-actions');
      r.buttons.forEach(function (b) { br.appendChild(button(b.label, b.cls || 'btn-soft', b.fn)); });
      body.appendChild(br);
    }
    if (r.helpId) {
      var fb = el('div', 'ask-feedback');
      fb.appendChild(el('span', 'gentle small', 'Did this help?'));
      var y = button('Yes', 'btn-chip', function () { learnHelp(r.helpId, true); fb.textContent = 'Thank you. I will remember that this helps you.'; });
      var n = button('Not really', 'btn-chip', function () { learnHelp(r.helpId, false); fb.textContent = 'Okay. Next time I will offer something else first.'; });
      fb.appendChild(y); fb.appendChild(n);
      body.appendChild(fb);
    }
    row.appendChild(body);
    log().appendChild(row);
    var spoken = [r.text].concat(r.lines || []).concat((r.list || []).filter(function (x) { return typeof x === 'string'; })).join('. ');
    st.history.push({ who: 'pet', text: spoken.slice(0, 400), at: Date.now() });
    if (st.history.length > 40) st.history = st.history.slice(-40);
    save();
    if (st.settings.speak && window.RootlingVoice && window.RootlingVoice.speak) window.RootlingVoice.speak(spoken);
    scrollLog();
    return row;
  }

  function petLine(msg) { var p = $('pet-message'); if (p) p.textContent = msg; }

  /* ------------------------------------------------------------------
   * Actions
   * ------------------------------------------------------------------ */
  var MAIL = {
    gmail: { name: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox', compose: function (to, s, b) { return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to || '') + '&su=' + encodeURIComponent(s || '') + '&body=' + encodeURIComponent(b || ''); } },
    outlook: { name: 'Outlook', url: 'https://outlook.live.com/mail/0/inbox', compose: function (to, s, b) { return 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(to || '') + '&subject=' + encodeURIComponent(s || '') + '&body=' + encodeURIComponent(b || ''); } },
    yahoo: { name: 'Yahoo Mail', url: 'https://mail.yahoo.com/', compose: null },
    icloud: { name: 'iCloud Mail', url: 'https://www.icloud.com/mail', compose: null },
    proton: { name: 'Proton Mail', url: 'https://mail.proton.me/u/0/inbox', compose: null },
    app: { name: 'my email app', url: 'mailto:', compose: null }
  };
  function mailCompose(to, subject, body) {
    var m = MAIL[st.settings.mail];
    if (m && m.compose) return m.compose(to, subject, body);
    return 'mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }
  function openUrl(u) { try { window.open(u, '_blank', 'noopener'); } catch (e) { window.location.href = u; } }

  function askMailChoice(then) {
    reply({
      text: 'Which email do you use? I will remember, so you only pick once.',
      buttons: Object.keys(MAIL).map(function (k) {
        return { label: k === 'app' ? 'My email app' : MAIL[k].name, fn: function () { st.settings.mail = k; save(); then(); } };
      })
    });
  }

  function inboxSteps() {
    return reply({
      text: 'Inbox in small steps. Set a 10 minute timer and go one email at a time:',
      ordered: true,
      list: ['Only look at the newest 5.', 'Can you answer in one line? Do it now.', 'Needs more time? Star it. I can remind you later.', 'Not needed? Archive or delete it.', 'Timer done? Stop. You did enough.'],
      buttons: [{ label: 'Start 10 minute timer', fn: function () { startTimer(600, 'Inbox time'); } },
        { label: 'Remind me about starred email at 4 pm', fn: function () { addReminder('Look at your starred email', parseWhen('at 4pm')); } }],
      helpId: 'inbox-steps'
    });
  }

  function doEmailCheck() {
    if (sec.googleClientId && st.settings.mail === 'gmail') { googleEmail(); return; }
    if (!st.settings.mail) { askMailChoice(doEmailCheck); return; }
    var m = MAIL[st.settings.mail];
    openUrl(m.url);
    reply({
      text: 'I opened ' + m.name + ' for you.',
      lines: literal() ? ['Look at the newest email first.'] : ['Want to go through it together? Small steps make a full inbox lighter.'],
      buttons: [{ label: 'Inbox in small steps', fn: inboxSteps }, { label: 'Use a different email', cls: 'btn-ghost', fn: function () { st.settings.mail = null; save(); askMailChoice(doEmailCheck); } }],
      more: st.settings.mail === 'gmail' ? ['Tip: in Settings, under "Ask your pet", you can connect Google so I can read your unread count and newest subjects right here. It is off until you set it up.'] : null
    });
  }

  function doEmailWrite(to) {
    var name = clean(to || '');
    var person = findPerson(name);
    var addr = person && person.email ? person.email : (/@/.test(name) ? name : '');
    var go = function (body) {
      openUrl(mailCompose(addr, '', body));
      reply({ text: 'Your email app opened' + (addr ? ' to ' + (person ? person.name : addr) : '') + '. Nothing was sent. You read it and press send.' });
    };
    reply({
      text: 'Want ready words to start? Pick one, then you can change it.',
      buttons: [
        { label: '\u201cHi, just checking in on\u2026\u201d', fn: function () { go('Hi,\n\nI\u2019m just checking in on '); } },
        { label: '\u201cSorry for the slow reply\u2026\u201d', fn: function () { go('Hi,\n\nSorry for the slow reply. '); } },
        { label: '\u201cCan we move our time?\u201d', fn: function () { go('Hi,\n\nSomething came up. Could we move our time to '); } },
        { label: 'Blank email', cls: 'btn-ghost', fn: function () { go(''); } }
      ]
    });
  }

  function todayList() {
    var items = [], d = execData();
    if (d) {
      if (d.priority) items.push({ t: -1, text: 'Your one thing: ' + d.priority });
      var today = new Date(); var key = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
      (d.events || []).filter(function (e) { return e.date === key; }).forEach(function (e) {
        var p = String(e.time).split(':'); items.push({ t: Number(p[0]) * 60 + Number(p[1]), text: fmt(Number(p[0]), Number(p[1])) + ' \u2014 ' + e.title });
      });
    }
    var end = new Date(); end.setHours(23, 59, 59, 999);
    st.reminders.filter(function (r) { return !r.done && r.at <= end.getTime(); }).forEach(function (r) {
      var dt = new Date(r.at); items.push({ t: dt.getHours() * 60 + dt.getMinutes(), text: fmt(dt.getHours(), dt.getMinutes()) + ' \u2014 Reminder: ' + r.text });
    });
    items.sort(function (a, b) { return a.t - b.t; });
    return items.map(function (x) { return x.text; });
  }
  function fmt(h, m) { var ap = h >= 12 ? 'pm' : 'am'; return (h % 12 || 12) + ':' + ('0' + m).slice(-2) + ' ' + ap; }
  function fmtTs(ts) { var d = new Date(ts); var same = new Date().toDateString() === d.toDateString(); return (same ? 'today' : d.toLocaleDateString(undefined, { weekday: 'long' })) + ' at ' + fmt(d.getHours(), d.getMinutes()); }

  function doCalendar() {
    var list = todayList();
    var r = {
      text: list.length ? 'Here is today, in order:' : 'Today is open. Nothing is planned yet.',
      list: list.length ? list : null,
      ordered: true,
      buttons: [{ label: 'Add a plan in Focus', fn: function () { nav('focus'); } }]
    };
    if (sec.googleClientId) r.buttons.unshift({ label: 'Add my Google Calendar', fn: googleCalendar });
    else r.buttons.push({ label: 'Open my calendar', cls: 'btn-ghost', fn: function () { openUrl(st.settings.mail === 'outlook' ? 'https://outlook.live.com/calendar/' : 'https://calendar.google.com/calendar/r/day'); } });
    var d = execData();
    if (!d || !d.priority) r.lines = ['Tip: say \u201cmy one thing today is \u2026\u201d and I will hold it for you.'];
    reply(r);
  }

  function addReminder(text, at) {
    text = youWords(text);
    var r = { id: 'rem-' + Date.now() + '-' + Math.floor(Math.random() * 1000), text: text, at: at, done: false };
    st.reminders.push(r); save();
    askNotify();
    reply({ text: 'Okay. I will remind you to ' + text + ' ' + fmtTs(at) + '.', lines: ['I can only remind you while Rootling is open (in a tab or installed). For phone-off reminders, use Plans and reminders in Settings.'],
      buttons: [{ label: 'Undo', cls: 'btn-ghost', fn: function () { r.done = true; save(); reply({ text: 'Removed that reminder.' }); } }] });
    renderChips();
  }
  function doRemind(rest) {
    var body = clean(rest || '');
    var at = parseWhen(body);
    var what = stripWhen(body) || 'do your thing';
    what = what.replace(/^to\s+/i, '');
    if (!at) {
      reply({ text: 'When should I remind you to ' + what + '?', buttons: [
        { label: 'In 10 minutes', fn: function () { addReminder(what, Date.now() + 600000); } },
        { label: 'In 1 hour', fn: function () { addReminder(what, Date.now() + 3600000); } },
        { label: 'This evening (7 pm)', fn: function () { addReminder(what, parseWhen('at 7pm')); } },
        { label: 'Tomorrow morning (9 am)', fn: function () { addReminder(what, parseWhen('tomorrow at 9am')); } }
      ] });
      return;
    }
    addReminder(what, at);
  }
  function doReminders() {
    var open = st.reminders.filter(function (r) { return !r.done; }).sort(function (a, b) { return a.at - b.at; });
    if (!open.length) { reply({ text: 'You have no reminders with me right now.', lines: ['Try: \u201cRemind me to take my meds at 8 pm.\u201d'] }); return; }
    var nodes = open.map(function (r) {
      var w = el('span', '', r.text + ' \u2014 ' + fmtTs(r.at) + ' ');
      w.appendChild(button('Done', 'btn-chip', function () { r.done = true; save(); w.textContent = r.text + ' \u2014 done.'; }));
      return w;
    });
    reply({ text: 'Here is what I am holding for you:', list: nodes });
  }
  var notifyAsked = false;
  function askNotify() {
    if (notifyAsked || typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    notifyAsked = true;
    try { Notification.requestPermission(); } catch (e) { /* in-app reminder still shows */ }
  }
  function checkReminders() {
    var now = Date.now(), changed = false;
    st.reminders.forEach(function (r) {
      if (!r.done && r.at <= now) {
        r.done = true; changed = true;
        var msg = 'Reminder: ' + r.text + '.';
        reply({ text: msg, lines: ['No rush. One step is enough.'], buttons: [{ label: 'Snooze 10 minutes', fn: function () { addReminder(r.text, Date.now() + 600000); } }] });
        petLine(petName() + ' says: ' + msg);
        try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Rootling', { body: msg, silent: true, tag: r.id, icon: 'icon.svg' }); } catch (e) { /* in-app line still shows */ }
      }
    });
    if (changed) { st.reminders = st.reminders.filter(function (r) { return !r.done || now - r.at < 86400000 * 3; }); save(); }
  }

  function startTimer(seconds, label) {
    stopTimer(true);
    var box = $('ask-timer');
    var end = Date.now() + seconds * 1000;
    box.hidden = false;
    var lbl = $('ask-timer-label'), clock = $('ask-timer-clock');
    lbl.textContent = (label || 'Focus time') + ' \u2014 ' + petName() + ' is sitting with you.';
    function tick() {
      var left = Math.max(0, Math.round((end - Date.now()) / 1000));
      clock.textContent = Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
      if (left <= 0) {
        stopTimer(true);
        reply({ text: 'Time is up. You did it.', lines: ['Take a short break. Stretch or drink some water.'], buttons: [
          { label: '5 more minutes', fn: function () { startTimer(300, label); } },
          { label: 'Take a 5 minute break', cls: 'btn-ghost', fn: function () { startTimer(300, 'Break time'); } }
        ], helpId: 'timer' });
        try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Rootling', { body: 'Time is up. You did it.', silent: true, icon: 'icon.svg' }); } catch (e) { /* fine */ }
      }
    }
    tick();
    timer = setInterval(tick, 1000);
  }
  function stopTimer(quiet) {
    if (timer) clearInterval(timer);
    timer = null;
    var box = $('ask-timer'); if (box) box.hidden = true;
    if (!quiet) reply({ text: 'Timer stopped. Stopping is allowed.' });
  }
  function doTimer(raw) {
    var secs = parseDuration(raw);
    if (!secs) {
      reply({ text: 'How long should we work together?', buttons: [5, 10, 15, 25].map(function (m) { return { label: m + ' minutes', fn: function () { startTimer(m * 60); } }; }) });
      return;
    }
    startTimer(secs);
    reply({ text: 'Timer set for ' + (secs >= 60 ? Math.round(secs / 60) + ' minutes' : secs + ' seconds') + '. I am right here with you.', lines: ['New thought pops up? Type \u201cpark\u201d and the thought. Then come back.'] });
  }

  function doCantStart(task) {
    var t = clean(task || '').replace(/^(on|with|my|the)\s+/i, '');
    if (!t) {
      reply({ text: 'That is okay. Starting is the hardest part. What is the thing?', node: miniInput('The thing is\u2026', function (v) { doCantStart(v); }) });
      return;
    }
    var steps = microSteps(t);
    reply({
      text: 'Let\u2019s make \u201c' + youWords(t) + '\u201d tiny. Just do step 1:',
      ordered: true, list: steps,
      lines: ['Make a when-then plan: \u201cWhen I ' + (new Date().getHours() < 12 ? 'finish breakfast' : 'put my phone down') + ', then I will do step 1.\u201d'],
      buttons: [{ label: 'Do step 1 with a 5 minute timer', fn: function () { startTimer(300, 'Step 1: ' + steps[0]); } },
        { label: 'Make it my one thing today', cls: 'btn-ghost', fn: function () { setPriority(t); } }],
      more: [researchMini('starting')],
      helpId: 'micro-steps'
    });
  }

  function doPark(text) {
    var t = clean(text || '');
    if (!t) { reply({ text: 'What should I hold for you?', node: miniInput('The thought is\u2026', doPark) }); return; }
    var d = execData();
    if (d && Array.isArray(d.parked)) {
      d.parked.push({ id: 'park-' + Date.now() + '-' + Math.floor(Math.random() * 100000), text: t, createdAt: Date.now() });
      execSave();
      reply({ text: 'Parked: \u201c' + t + '\u201d. It is safe in your Focus list.', buttons: [{ label: 'Make it my one thing', cls: 'btn-ghost', fn: function () { setPriority(t); } }] });
    } else reply({ text: 'I could not reach your Focus list right now. Try again in a moment.' });
  }
  function setPriority(t) {
    var d = execData();
    if (!d) { reply({ text: 'I could not reach your Focus list right now.' }); return; }
    if (d.priority && d.priority !== t) d.parked.push({ id: 'park-' + Date.now(), text: d.priority, createdAt: Date.now() });
    d.priority = t; execSave();
    reply({ text: 'Your one thing today is: ' + t + '. I am holding it for you.', buttons: [{ label: 'Show me in Focus', fn: function () { nav('focus'); } }] });
  }

  function breatheNode(rounds) {
    var wrap = el('div', 'ask-breathe');
    var ring = el('div', 'ask-breathe-ring'); var word = el('p', 'ask-breathe-word', 'Ready');
    ring.appendChild(word); wrap.appendChild(ring);
    var count = el('p', 'gentle small', '');
    wrap.appendChild(count);
    var n = 0, phase = 0, t = null;
    function step() {
      if (n >= rounds) { word.textContent = 'Done'; ring.className = 'ask-breathe-ring'; count.textContent = 'Nice. Notice how your body feels now.'; return; }
      if (phase === 0) { word.textContent = 'In\u2026 4'; ring.className = 'ask-breathe-ring grow'; phase = 1; t = setTimeout(step, 4000); }
      else { word.textContent = 'Out\u2026 6'; ring.className = 'ask-breathe-ring shrink'; phase = 0; n++; count.textContent = 'Round ' + n + ' of ' + rounds; t = setTimeout(step, 6000); }
    }
    wrap.appendChild(button('Start', 'btn-primary', function () { this.remove(); step(); }));
    return wrap;
  }
  function doBreathe() {
    reply({ text: 'Breathe with me. In for 4. Out for 6. Five rounds. You can stop any time.', node: breatheNode(5), more: [researchMini('anxiety', 0)], helpId: 'breathing' });
  }
  function doGround() {
    reply({ text: 'Let\u2019s come back to right here. Notice:', ordered: true,
      list: ['5 things you can see', '4 things you can feel', '3 things you can hear', '2 things you can smell', '1 slow breath'],
      lines: ['Go slow. There is no wrong answer.'], helpId: 'grounding' });
  }

  var FEELING_HELPS = {
    anxious: [{ id: 'breathing', label: 'Breathe with me', fn: doBreathe }, { id: 'grounding', label: 'Grounding: 5 things', fn: doGround },
      { id: 'walk', label: 'Short walk', fn: function () { reply({ text: 'A 5 minute walk counts. Even around the room. Moving helps the body use up the alarm energy.', helpId: 'walk' }); } }],
    low: [{ id: 'small-win', label: 'One small win', fn: function () { smallWin(); } }, { id: 'people', label: 'Reach a safe person', fn: function () { doCall(''); } },
      { id: 'walk', label: 'Step outside', fn: function () { reply({ text: 'Step outside for 2 minutes. Look at the sky. That is enough.', helpId: 'walk' }); } }],
    angry: [{ id: 'breathing', label: 'Breathe with me', fn: doBreathe }, { id: 'walk', label: 'Move it out', fn: function () { reply({ text: 'Big feelings need somewhere to go. Walk fast, push a wall, or squeeze a pillow for 30 seconds.', helpId: 'walk' }); } },
      { id: 'park', label: 'Park the thought', fn: function () { doPark(''); } }]
  };
  function smallWin() {
    var wins = ['Drink a glass of water', 'Open a window', 'Put one thing away', 'Wash your face', 'Send one kind text', 'Stretch your arms up high', 'Eat something small', 'Make your bed, just pull up the blanket'];
    var w = wins[Math.floor(Math.random() * wins.length)];
    reply({ text: 'Here is one small win: ' + w + '.', lines: ['Done? That counts. I am proud of you.'], buttons: [{ label: 'Another one', cls: 'btn-ghost', fn: smallWin }], helpId: 'small-win' });
  }
  function doFeeling(kind) {
    var opener = {
      anxious: literal() ? 'You feel anxious. Here are three things that can help. Pick one.' : 'That sounds hard. You are not alone \u2014 I am right here. Pick what feels doable:',
      low: literal() ? 'You feel low. Here are three small things. Pick one.' : 'I am sorry it feels heavy. We can go really small today. Pick one:',
      angry: literal() ? 'You feel angry. That is a real feeling. Here are three things that can help.' : 'That feeling makes sense. Let\u2019s give it somewhere safe to go:'
    }[kind];
    var helps = rankHelps(FEELING_HELPS[kind]);
    var topic = { anxious: 'anxiety', low: 'lowmood', angry: 'feelings' }[kind];
    reply({ text: opener, buttons: helps.map(function (h, i) { return { label: h.label, cls: i === 0 ? 'btn-primary' : 'btn-soft', fn: h.fn }; }),
      lines: kind === 'low' ? ['If hard feelings last a long time, a doctor or counselor can really help.'] : null,
      more: [researchMini(topic)] });
  }
  function doSensory() {
    reply({ text: literal() ? 'Too much input. Do these steps:' : 'Too much input is real and tiring. Let\u2019s lower it:', ordered: true,
      list: ['Put on headphones or earplugs if you have them.', 'Make the light softer, or close your eyes.', 'Move to a quieter spot if you can.', 'Press your hands together hard for 10 seconds.', 'Slow breath out.'],
      buttons: [{ label: 'Leave quietly', fn: function () { var b = $('pause-btn'); if (b) b.click(); } }, { label: 'Breathe with me', cls: 'btn-ghost', fn: doBreathe }],
      more: [researchMini('sensory', 0)], helpId: 'quiet' });
  }
  function doTired() {
    var s = (window.ROOTLING_UX && window.ROOTLING_UX.getRecoverySuggestions) ? window.ROOTLING_UX.getRecoverySuggestions() : ['Drink some water', 'Take a short rest'];
    reply({ text: 'Let\u2019s protect your energy today. Rest counts as care. Pick just one:', list: s.slice(0, 4),
      buttons: [{ label: 'Rest timer, 10 minutes', fn: function () { startTimer(600, 'Rest time'); } }], more: [researchMini('burnout', 0)], helpId: 'recovery' });
  }
  function doSleep() {
    reply({ text: 'A wind-down, same steps each night:', ordered: true, list: ['Dim the lights and put the phone across the room.', 'Something calm for 10 minutes \u2014 a book, music, or a shower.', 'Write tomorrow\u2019s one thing so your brain can let go.', 'Slow breathing in bed.'],
      buttons: [{ label: 'Remind me nightly at 9:30 pm', fn: function () { addReminder('start winding down for bed', parseWhen('at 9:30pm')); } }, { label: 'Breathe with me', cls: 'btn-ghost', fn: doBreathe }],
      more: [researchMini('sleep', 0)], helpId: 'wind-down' });
  }

  /* Gentle pink noise made on this device (no download). */
  function toggleNoise(forceOff) {
    if (noiseNodes || forceOff) {
      if (noiseNodes) { try { noiseNodes.src.stop(); noiseNodes.ctx.close(); } catch (e) { /* already off */ } }
      noiseNodes = null; return false;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    var ctx = new AC(), len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var gain = ctx.createGain(); gain.gain.value = 0.18;
    src.connect(gain); gain.connect(ctx.destination); src.start();
    noiseNodes = { ctx: ctx, src: src };
    return true;
  }
  function doNoise(raw) {
    if (/stop/.test(raw || '') || noiseNodes) { toggleNoise(true); reply({ text: 'Background noise is off.' }); return; }
    var on = toggleNoise();
    if (on === null) { reply({ text: 'This browser cannot play sound from Rootling.' }); return; }
    reply({ text: 'Soft pink noise is on, quietly. Keep the volume low.', lines: ['Research found a small focus boost for people with ADHD, but it made others do a little worse. If it bugs you, turn it off \u2014 that is useful to know too.'],
      buttons: [{ label: 'Stop noise', fn: function () { toggleNoise(true); reply({ text: 'Background noise is off.' }); } }],
      more: [sourceLink('noise')], helpId: 'noise' });
  }

  function doMusic(what) {
    var q = clean(what || '').replace(/\bon spotify\b/i, '').trim();
    if (!q || /^(some )?music$/i.test(q)) q = 'calm focus';
    openUrl('https://open.spotify.com/search/' + encodeURIComponent(q));
    reply({ text: 'I opened Spotify and searched for \u201c' + q + '\u201d.' });
  }

  function doWeather() {
    var w = st.settings.weather;
    function fetchFor(lat, lon) {
      fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var c = j.current || {}, d = j.daily || {};
          var hi = d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null, lo = d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null;
          var rain = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
          var temp = Math.round(c.temperature_2m);
          var wear = temp < 40 ? 'a warm coat, hat, and gloves' : temp < 55 ? 'a jacket' : temp < 68 ? 'a light layer' : 'light clothes';
          reply({ text: 'It is ' + temp + '\u00b0F now. Today: high ' + hi + '\u00b0, low ' + lo + '\u00b0.', lines: ['Wear ' + wear + '.' + (rain !== null && rain >= 40 ? ' Bring an umbrella \u2014 ' + rain + '% chance of rain.' : '')] });
        })
        .catch(function () { reply({ text: 'I could not reach the weather service right now.' }); });
    }
    if (w && w.on && typeof w.lat === 'number') { fetchFor(w.lat, w.lon); return; }
    reply({ text: 'To check the weather I need your rough location. It is sent only to Open-Meteo (a free weather service), rounded to about 1 mile, and only when you ask.',
      buttons: [{ label: 'Yes, use my location', cls: 'btn-primary', fn: function () {
        if (!navigator.geolocation) { reply({ text: 'This browser cannot share location.' }); return; }
        navigator.geolocation.getCurrentPosition(function (p) {
          st.settings.weather = { on: true, lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }; save();
          fetchFor(st.settings.weather.lat, st.settings.weather.lon);
        }, function () { reply({ text: 'Location was not shared, so I cannot check the weather. That is okay.' }); }, { timeout: 10000, maximumAge: 3600000 });
      } }, { label: 'No thanks', cls: 'btn-ghost', fn: function () { reply({ text: 'Okay. Nothing was shared.' }); } }] });
  }

  function findPerson(name) {
    var n = low(name).replace(/^(my )/, '');
    if (!n) return null;
    for (var i = 0; i < st.people.length; i++) if (low(st.people[i].name) === n || low(st.people[i].name).indexOf(n) === 0) return st.people[i];
    return null;
  }
  function doCall(rest, kind) {
    var name = clean(rest || '');
    var p = findPerson(name);
    if (!p) {
      var list = st.people.slice(0, 6).map(function (x) { return { label: x.name, fn: function () { doCall(x.name, kind); } }; });
      list.push({ label: 'Add a person', cls: 'btn-ghost', fn: addPersonForm });
      reply({ text: name ? 'I do not have ' + name.charAt(0).toUpperCase() + name.slice(1) + ' saved yet.' : 'Who would you like to reach?', buttons: list });
      return;
    }
    var isText = /text|message|sms/.test(kind || '');
    if (!p.phone) { reply({ text: 'I do not have a phone number for ' + p.name + '.', buttons: [{ label: 'Add one', fn: addPersonForm }] }); return; }
    if (isText) {
      reply({ text: 'Pick ready words for ' + p.name + ', or write your own. Your messages app will open. Nothing sends by itself.', buttons: [
        { label: '\u201cThinking of you\u201d', fn: function () { window.location.href = 'sms:' + p.phone + '?&body=' + encodeURIComponent('Hey, thinking of you. How are you?'); } },
        { label: '\u201cCan you talk?\u201d', fn: function () { window.location.href = 'sms:' + p.phone + '?&body=' + encodeURIComponent('Hey, are you free to talk for a few minutes?'); } },
        { label: '\u201cHaving a hard day\u201d', fn: function () { window.location.href = 'sms:' + p.phone + '?&body=' + encodeURIComponent('I\u2019m having a hard day. Could you check in on me?'); } },
        { label: 'Blank', cls: 'btn-ghost', fn: function () { window.location.href = 'sms:' + p.phone; } }
      ] });
    } else {
      reply({ text: 'Calling ' + p.name + '. Tip: have one line ready for what you want to say.', buttons: [{ label: 'Call now', cls: 'btn-primary', fn: function () { window.location.href = 'tel:' + p.phone; } }] });
    }
  }
  function addPersonForm() {
    var f = el('form', 'ask-form');
    f.innerHTML = '<label>Name<input name="n" required maxlength="40" autocomplete="off"></label><label>Phone (optional)<input name="p" type="tel" maxlength="20"></label><label>Email (optional)<input name="e" type="email" maxlength="80"></label>';
    var b = el('button', 'btn btn-primary', 'Save person'); b.type = 'submit'; f.appendChild(b);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var p = { name: clean(f.n.value), phone: clean(f.p.value).replace(/[^\d+]/g, ''), email: clean(f.e.value) };
      if (!p.name) return;
      st.people = st.people.filter(function (x) { return low(x.name) !== low(p.name); }); st.people.push(p); save();
      f.replaceWith(el('p', 'gentle', 'Saved ' + p.name + ' on this device.'));
    });
    reply({ text: 'Add a person you trust. They stay on this device only.', node: f });
  }

  function doSearch(q) {
    openUrl('https://duckduckgo.com/?q=' + encodeURIComponent(q));
    var hits = window.ROOTLING_RESEARCH ? window.ROOTLING_RESEARCH.search(q, 1) : [];
    reply({ text: 'I opened a web search for \u201c' + q + '\u201d.', buttons: hits.length ? [{ label: 'What research says about ' + hits[0].title.toLowerCase(), fn: function () { showTopic(hits[0]); } }] : null });
  }

  /* ---------------- research answers ---------------- */
  function sourceLink(id) {
    var s = window.ROOTLING_RESEARCH && window.ROOTLING_RESEARCH.source(id);
    if (!s) return el('span');
    var p = el('p', 'gentle small', 'Source: '); p.appendChild(link(s.name, s.url)); return p;
  }
  function researchMini(topicId, idx) {
    var R = window.ROOTLING_RESEARCH; var t = R && R.byId(topicId);
    var wrap = el('div', 'ask-research-mini');
    if (!t) return wrap;
    var h = typeof idx === 'number' ? t.helps[idx] : t.helps[0];
    wrap.appendChild(el('p', 'gentle', 'What research says: ' + h.text + ' (Evidence: ' + h.strength + ')'));
    wrap.appendChild(sourceLink(h.src));
    wrap.appendChild(button('More on ' + t.title.toLowerCase(), 'btn-ghost', function () { showTopic(t); }));
    return wrap;
  }
  function runAction(a) {
    if (!a) return;
    if (a.indexOf('ask:') === 0) { handle(a.slice(4)); return; }
    if (a.indexOf('timer:') === 0) { startTimer(Number(a.slice(6)) * 60); return; }
    if (a.indexOf('nav:') === 0) { nav(a.slice(4)); return; }
    if (a === 'breathe') doBreathe(); else if (a === 'ground') doGround(); else if (a === 'noise') doNoise('');
    else if (a === 'pause') { var b = $('pause-btn'); if (b) b.click(); }
  }
  function showTopic(t) {
    st.learn.topics[t.id] = (st.learn.topics[t.id] || 0) + 1; save();
    var R = window.ROOTLING_RESEARCH;
    var helps = el('ul', 'ask-list');
    t.helps.forEach(function (h) {
      var li = el('li'); li.appendChild(el('span', '', h.text + ' '));
      li.appendChild(el('span', 'ask-badge ask-' + h.strength.toLowerCase(), h.strength));
      var s = R.source(h.src); if (s) { li.appendChild(document.createTextNode(' ')); li.appendChild(link(s.name, s.url)); }
      helps.appendChild(li);
    });
    var common = el('ul', 'ask-list'); t.common.forEach(function (c) { common.appendChild(el('li', '', c)); });
    var pro = el('ul', 'ask-list'); t.pro.forEach(function (c) { pro.appendChild(el('li', '', c)); });
    var srcs = el('p', 'gentle small', 'Sources: ');
    t.sources.forEach(function (id, i) { var s = R.source(id); if (s) { if (i) srcs.appendChild(document.createTextNode(' \u00b7 ')); srcs.appendChild(link(s.name, s.url)); } });
    var node = el('div', 'ask-topic');
    node.appendChild(el('h4', '', 'What research says helps'));
    node.appendChild(helps);
    var more = [el('h4', '', 'Common experiences'), common, el('h4', '', 'Things to ask a doctor or therapist about'), pro,
      el('p', 'gentle small', 'This is information, not advice. Only a professional who knows you can say what fits you. Rootling never diagnoses.'), srcs];
    reply({ text: t.title + ': ' + t.plain, node: node, more: more,
      buttons: t.pet.map(function (p) { return { label: p.label, fn: function () { runAction(p.action); } }; }) });
  }
  function doResearch(raw) {
    var R = window.ROOTLING_RESEARCH;
    var hits = R ? R.search(raw, 3) : [];
    if (!hits.length) {
      if (brainOn()) { askBrain(raw); return; }
      reply({ text: 'I do not have research notes on that yet. Here is what I have studied:', buttons: (R ? R.TOPICS : []).map(function (t) { return { label: t.title, fn: function () { showTopic(t); } }; }) });
      return;
    }
    showTopic(hits[0]);
    if (hits.length > 1) reply({ text: 'Related notes:', buttons: hits.slice(1).map(function (t) { return { label: t.title, cls: 'btn-ghost', fn: function () { showTopic(t); } }; }) });
  }

  function miniInput(ph, fn) {
    var f = el('form', 'ask-inline');
    var i = el('input'); i.type = 'text'; i.placeholder = ph; i.maxLength = 120; i.setAttribute('aria-label', ph);
    var b = el('button', 'btn btn-primary', 'Go'); b.type = 'submit';
    f.appendChild(i); f.appendChild(b);
    f.addEventListener('submit', function (e) { e.preventDefault(); var v = clean(i.value); if (v) { f.remove(); addUser(v); fn(v); } });
    setTimeout(function () { try { i.focus(); } catch (e) { /* fine */ } }, 50);
    return f;
  }

  /* ---------------- learned view ---------------- */
  function doLearned() {
    var lv = helperLevel(st.learn.xp);
    var lines = ['Helper level ' + lv.level + ': ' + lv.name + '. ' + lv.unlock];
    if (lv.next) lines.push('Next: ' + lv.next.name + ' \u2014 ' + lv.next.unlock + ' (' + (lv.next.min - lv.xp) + ' more times working together).');
    var helped = Object.keys(st.learn.helps).filter(function (k) { return st.learn.helps[k].yes > st.learn.helps[k].no; });
    var notHelped = Object.keys(st.learn.helps).filter(function (k) { return st.learn.helps[k].no > st.learn.helps[k].yes; });
    var NAMES = { breathing: 'slow breathing', grounding: 'grounding', walk: 'moving your body', 'small-win': 'small wins', people: 'reaching your people', quiet: 'quiet steps', 'micro-steps': 'tiny steps', timer: 'focus timers', noise: 'background noise', 'wind-down': 'wind-down steps', recovery: 'rest plans', 'inbox-steps': 'inbox in small steps', park: 'parking thoughts' };
    var list = [];
    if (helped.length) list.push('What helps you most: ' + helped.map(function (k) { return NAMES[k] || k; }).join(', ') + '.');
    if (notHelped.length) list.push('What I offer later now: ' + notHelped.map(function (k) { return NAMES[k] || k; }).join(', ') + '.');
    var habits = habitsNow();
    if (habits.length) list.push('Around this time you often ask me to: ' + habits.slice(0, 3).map(function (id) { return (CHIP_FOR[id] || id).toLowerCase(); }).join(', ') + '.');
    var al = Object.keys(st.learn.aliases);
    if (al.length) list.push('Your words I know: ' + al.map(function (a) { return '\u201c' + a + '\u201d'; }).join(', ') + '.');
    list.push(prefersLong() ? 'You like longer answers, so I show more.' : 'I keep answers short. Tap \u201cTell me more\u201d any time.');
    var style = { calm: 'same clear words every time', focus: 'short, fresh, and quick to start', grounding: 'calm and safety first', lowdemand: 'small asks only' }[profile()];
    if (style) list.push('My talking style follows your support style: ' + style + '.');
    if (!helped.length && !habits.length && !al.length) list.push('I am still learning. Tap \u201cYes\u201d or \u201cNot really\u201d under my answers to teach me.');
    lines.push('Everything here stays on this device. I never guess labels about you.');
    reply({ text: 'Here is what I have learned about helping you:', list: list, lines: lines, buttons: [{ label: 'Forget what you learned', cls: 'btn-ghost', fn: doForget }] });
  }
  function doForget() {
    reply({ text: 'Forget everything I learned about helping you? Your reminders and people stay.', buttons: [
      { label: 'Yes, forget it', cls: 'btn-primary', fn: function () { st.learn = defaults().learn; save(); renderChips(); reply({ text: 'Done. I forgot what I learned. We can start fresh.' }); } },
      { label: 'Keep it', cls: 'btn-ghost', fn: function () { reply({ text: 'Okay, nothing changed.' }); } }] });
  }
  function doTeach(phrase, meaning) {
    var p = low(phrase).replace(/^["\u201c]|["\u201d]$/g, '');
    var target = route(meaning, null);
    if (target.id === 'unknown') { reply({ text: 'I did not understand \u201c' + meaning + '\u201d yet. Try a command I know, like \u201ccheck my email\u201d.' }); return; }
    st.learn.aliases[p] = clean(meaning); st.learn.xp += 2; save();
    reply({ text: 'Got it. When you say \u201c' + p + '\u201d, I will ' + youWords(clean(meaning).toLowerCase()) + '.' });
  }

  function doHelp() {
    var groups = [
      'Email and messages: \u201cCheck my email\u201d, \u201cWrite an email to Sam\u201d, \u201cText Mom\u201d, \u201cCall Alex\u201d',
      'Plans: \u201cPlan my day\u201d, \u201cRemind me to take my meds at 8 pm\u201d, \u201cMy one thing today is laundry\u201d, \u201cPark: buy milk\u201d',
      'Focus: \u201cFocus with me for 20 minutes\u201d, \u201cI can\u2019t start my essay\u201d, \u201cPlay background noise\u201d',
      'Feelings and body: \u201cI feel anxious\u201d, \u201cIt\u2019s too loud\u201d, \u201cI\u2019m exhausted\u201d, \u201cI can\u2019t sleep\u201d, \u201cBreathe with me\u201d',
      'Research: \u201cWhat does research say about ADHD?\u201d, \u201cHow can I cope with sensory overload?\u201d, \u201cTreatments for anxiety\u201d',
      'Everyday: \u201cWhat\u2019s the weather?\u201d, \u201cLook up bus times\u201d, \u201cPlay lo-fi on Spotify\u201d, \u201cOpen settings\u201d',
      'Teach me: \u201cWhen I say inbox, I mean check my email\u201d, \u201cWhat have you learned?\u201d'
    ];
    reply({ text: 'You can type or talk to me. Here are things I can do:', list: groups });
  }

  /* ---------------- smarter AI brain (optional) ---------------- */
  function brainOn() { return !!(sec.brain && sec.brain.key && sec.brain.on); }
  function systemPrompt() {
    var helped = Object.keys(st.learn.helps).filter(function (k) { return st.learn.helps[k].yes > st.learn.helps[k].no; });
    return [
      'You are ' + petName() + ', a gentle companion pet inside Rootling, a self-care app for people who may be neurodivergent (ADHD, autism, anxiety and more).',
      'Speak in short, warm, plain sentences (grade 3-5 reading level). ' + (literal() ? 'Use literal, predictable words. No idioms, no sarcasm, no exclamation marks.' : 'Be encouraging, never pushy.'),
      prefersLong() ? 'The user likes a bit more detail (up to 8 short sentences).' : 'Keep replies under 5 short sentences.',
      'When asked about symptoms, treatments, or research, answer like a careful scientist: say what the evidence shows, how strong it is (Strong / Good / Some / Early), and name the source. Use the research notes below first. If you are not sure, say so. Never invent studies or links.',
      'Never diagnose. Never tell the user what condition they have. Describe treatments as things to talk over with a doctor or therapist; never tell anyone to start, stop, or change medicine.',
      'If the user might be in danger or mentions self-harm, tell them to call or text 988 (US) right now, and tell them the Support page has their people.',
      'You cannot read email, send messages, or act on the device yourself; the app handles commands like "check my email", "remind me...", "timer". If a user asks for those, tell them the exact phrase to type.',
      helped.length ? 'Supports this user says help them: ' + helped.join(', ') + '. Offer these first.' : '',
      '\nRESEARCH NOTES:\n' + (window.ROOTLING_RESEARCH ? window.ROOTLING_RESEARCH.digest() : '')
    ].join('\n');
  }
  function askBrain(text) {
    var b = sec.brain;
    var raw = st.history.slice(-8).map(function (h) { return { role: h.who === 'you' ? 'user' : 'assistant', content: h.text || '' }; });
    var msgs = [];
    raw.forEach(function (m) { var last = msgs[msgs.length - 1]; if (last && last.role === m.role) last.content += '\n' + m.content; else msgs.push({ role: m.role, content: m.content }); });
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: text });
    var thinking = reply({ text: 'Let me think\u2026' });
    st.history.pop();
    var req;
    if (b.provider === 'anthropic') {
      req = fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': b.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: b.model || 'claude-haiku-4-5', max_tokens: 500, system: systemPrompt(), messages: msgs }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error.message); return (j.content || []).map(function (c) { return c.text || ''; }).join(''); });
    } else {
      var base = (b.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      req = fetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + b.key },
        body: JSON.stringify({ model: b.model || 'gpt-4o-mini', max_tokens: 500, messages: [{ role: 'system', content: systemPrompt() }].concat(msgs) }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error.message || 'error'); return j.choices[0].message.content; });
    }
    req.then(function (out) {
      thinking.remove();
      var t = clean(out);
      if (hasCrisis(t)) { /* model echoed crisis words: always show the human help line too */ }
      reply({ text: t, lines: ['(Answered by my smarter brain. Check important facts with a professional.)'] });
    }).catch(function (e) {
      thinking.remove();
      reply({ text: 'My smarter brain could not answer right now (' + String(e && e.message || e).slice(0, 80) + '). I can still help with commands and my research notes.' });
    });
  }

  /* ---------------- Google email + calendar (optional) ---------------- */
  function loadGis(cb) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) { cb(); return; }
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = cb; s.onerror = function () { reply({ text: 'I could not load Google sign-in. Check your connection.' }); };
    document.head.appendChild(s);
  }
  function withGoogle(fn) {
    if (googleToken && googleToken.exp > Date.now()) { fn(googleToken.t); return; }
    loadGis(function () {
      try {
        var client = window.google.accounts.oauth2.initTokenClient({
          client_id: sec.googleClientId,
          scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
          callback: function (resp) {
            if (resp && resp.access_token) { googleToken = { t: resp.access_token, exp: Date.now() + (Number(resp.expires_in || 3500) - 60) * 1000 }; fn(googleToken.t); }
            else reply({ text: 'Google did not give permission, so I did not read anything.' });
          }
        });
        client.requestAccessToken();
      } catch (e) { reply({ text: 'Google sign-in did not start. Check the Client ID in Settings.' }); }
    });
  }
  function gget(url, tok) { return fetch(url, { headers: { authorization: 'Bearer ' + tok } }).then(function (r) { if (!r.ok) throw new Error('Google said ' + r.status); return r.json(); }); }
  function googleEmail() {
    withGoogle(function (tok) {
      var thinking = reply({ text: 'Checking your inbox\u2026' });
      Promise.all([
        gget('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', tok),
        gget('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=' + encodeURIComponent('is:unread in:inbox'), tok)
      ]).then(function (res) {
        var unread = res[0].messagesUnread || 0, ids = (res[1].messages || []).map(function (m) { return m.id; });
        return Promise.all(ids.map(function (id) { return gget('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject', tok); }))
          .then(function (msgs) { return { unread: unread, msgs: msgs }; });
      }).then(function (r) {
        thinking.remove();
        var items = r.msgs.map(function (m) {
          var h = {}; (m.payload && m.payload.headers || []).forEach(function (x) { h[x.name] = x.value; });
          var from = String(h.From || '').replace(/<.*>/, '').replace(/"/g, '').trim();
          return from + ' \u2014 ' + (h.Subject || '(no subject)');
        });
        reply({ text: unread ? 'You have ' + unread + ' unread email' + (unread === 1 ? '' : 's') + '.' + (items.length ? ' The newest:' : '') : 'No unread email. Your inbox is calm.',
          list: items.length ? items : null, ordered: true,
          buttons: [{ label: 'Open Gmail', fn: function () { openUrl(MAIL.gmail.url); } }, { label: 'Inbox in small steps', cls: 'btn-ghost', fn: inboxSteps }],
          lines: unread > 20 ? ['That is a lot. You do not have to read them all. Just the newest 5 is a win.'] : null });
      }).catch(function (e) { thinking.remove(); reply({ text: 'I could not read your inbox (' + e.message + '). I opened Gmail instead.' }); openUrl(MAIL.gmail.url); });
    });
  }
  function googleCalendar() {
    withGoogle(function (tok) {
      var s = new Date(); s.setHours(0, 0, 0, 0); var e = new Date(); e.setHours(23, 59, 59, 999);
      gget('https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=15&timeMin=' + encodeURIComponent(s.toISOString()) + '&timeMax=' + encodeURIComponent(e.toISOString()), tok)
        .then(function (j) {
          var items = (j.items || []).map(function (ev) {
            var st0 = ev.start && (ev.start.dateTime || ev.start.date); var d = new Date(st0);
            return (ev.start && ev.start.dateTime ? fmt(d.getHours(), d.getMinutes()) : 'All day') + ' \u2014 ' + (ev.summary || 'Busy');
          });
          reply({ text: items.length ? 'Your Google Calendar today:' : 'Nothing on your Google Calendar today.', list: items.length ? items : null, ordered: true });
        }).catch(function (er) { reply({ text: 'I could not read your calendar (' + er.message + ').' }); });
    });
  }

  /* ------------------------------------------------------------------
   * Main handler
   * ------------------------------------------------------------------ */
  var aliasDepth = 0;
  function handle(text, fromUser) {
    var t = clean(text);
    if (!t) return;
    if (fromUser !== false) addUser(t);
    var r = route(t, aliasDepth < 2 ? st.learn.aliases : null);
    if (r.id === 'alias') { learnUse('alias'); aliasDepth++; try { handle(r.slots[0], false); } finally { aliasDepth--; } return; }
    learnUse(r.id);
    var raw = low(t);
    switch (r.id) {
      case 'crisis':
        reply({ text: 'I am really glad you told me. You deserve support from a person right now.', lines: ['In the US, call or text 988 \u2014 the Suicide and Crisis Lifeline. Any time, day or night.', 'If you are in danger right now, call 911.'],
          buttons: [{ label: 'Call 988', cls: 'btn-primary', fn: function () { window.location.href = 'tel:988'; } }, { label: 'Text 988', fn: function () { window.location.href = 'sms:988'; } }, { label: 'Open my Support page', fn: openSafety }] });
        return;
      case 'help': doHelp(); return;
      case 'learned': doLearned(); return;
      case 'forget': doForget(); return;
      case 'teach': { var m = t.match(/^when i say (.+?)[,]? (?:i mean|it means|do|open|that means) (.+)$/i); if (m) doTeach(m[1], m[2]); return; }
      case 'emailCheck': doEmailCheck(); return;
      case 'emailWrite': doEmailWrite(r.slots[2]); return;
      case 'calendar': doCalendar(); return;
      case 'remind': doRemind(t.replace(/^(please )?(remind me|set a reminder|reminder)\s*/i, '')); return;
      case 'reminders': doReminders(); return;
      case 'timer': doTimer(raw); return;
      case 'cantStart': doCantStart(t.replace(/^.*?(can'?t start|cannot start|help me start|stuck on|procrastinating on|procrastinating|break|don'?t know where to start( on)?|overwhelmed by|too big)\s*/i, '').replace(/\s*(down|into( tiny)? steps)$/i, '')); return;
      case 'park': { var body = t.replace(/^(park|note|jot|save( this)?|remember( that)?|add)\b[: ]*/i, '').replace(/\s+to (my )?(list|tasks|to-?do( list)?)$/i, ''); if (/^(this |a )?thought$/i.test(body)) body = ''; doPark(body); return; }
      case 'priority': { var pm = t.match(/(?:my one thing|main thing|priority) (?:is|today is|=)\s*(.+)$/i) || t.match(/^make (.+) my (?:one thing|priority)$/i); if (pm) setPriority(pm[1]); return; }
      case 'sensory': doSensory(); return;
      case 'anxious': doFeeling('anxious'); return;
      case 'low': if (/small win/.test(raw)) smallWin(); else doFeeling('low'); return;
      case 'angry': doFeeling('angry'); return;
      case 'tired': doTired(); return;
      case 'sleep': doSleep(); return;
      case 'breathe': doBreathe(); return;
      case 'ground': doGround(); return;
      case 'noise': doNoise(raw); return;
      case 'music': doMusic(r.slots[0] || ''); return;
      case 'weather': doWeather(); return;
      case 'call': doCall(r.slots[1], r.slots[0]); return;
      case 'addPerson': addPersonForm(); return;
      case 'water':
        reply({ text: 'Good idea. Drink a glass of water now. Your body and brain both need it.', buttons: [{ label: 'Remind me every hour today', fn: function () { for (var i = 1; i <= 4; i++) st.reminders.push({ id: 'rem-w' + Date.now() + i, text: 'drink some water', at: Date.now() + i * 3600000, done: false }); save(); askNotify(); reply({ text: 'Okay. I will remind you to drink water every hour for the next 4 hours.' }); } }] });
        return;
      case 'research': case 'researchAsk': doResearch(t); return;
      case 'search': doSearch(r.slots[4] || t.replace(/^(look up|search( for)?|google|find (out|info))\s+/i, '')); return;
      case 'nav': {
        var v = r.slots[2]; var map = { home: 'home', 'check-in': 'home', 'check-ins': 'home', checkin: 'home', checkins: 'home', focus: 'focus', tasks: 'focus', activities: 'activities', adventures: 'activities', companion: 'companion', pet: 'companion', pets: 'companion', settings: 'support', support: 'support', journal: 'support', privacy: 'support' };
        nav(map[v] || 'home'); reply({ text: 'Here you go.' }); return;
      }
      case 'pause': { var pb = $('pause-btn'); if (pb) pb.click(); return; }
      case 'thanks': reply({ text: literal() ? 'You are welcome.' : ['Any time. I like helping you.', 'You are welcome. We make a good team.', 'Happy to help. I am proud of you.'][Math.floor(Math.random() * 3)] }); st.learn.xp += 1; save(); return;
      case 'greet': {
        var g = window.ROOTLING_UX ? window.ROOTLING_UX.getGreeting(new Date().getHours()) : 'Hi';
        reply({ text: g + '. I am here. What can I help with?', buttons: suggestions().slice(0, 3).map(function (c) { return { label: c, fn: function () { handle(c); } }; }) });
        return;
      }
      default:
        if (window.ROOTLING_RESEARCH && window.ROOTLING_RESEARCH.search(t, 1).length && !brainOn()) { doResearch(t); return; }
        if (brainOn()) { askBrain(t); return; }
        unknown(t);
    }
  }

  /* Did not understand: offer best guesses. Picking one TEACHES the pet. */
  function unknown(t) {
    var opts = ['Check my email', 'Plan my day', 'I can\u2019t start', 'I feel anxious', 'Remind me', 'Breathe with me'];
    reply({ text: 'I am not sure what you meant yet. Did you mean one of these? If you pick one, I will remember it for next time.',
      buttons: opts.map(function (o) { return { label: o, fn: function () { st.learn.aliases[low(t).replace(/[?!.]+$/, '')] = o; st.learn.xp += 2; save(); handle(o, false); } }; }),
      lines: brainOn() ? null : ['Tip: you can give me a smarter AI brain in Settings for open questions.'] });
  }

  function suggestions() {
    var out = [];
    var habit = helperLevel(st.learn.xp).level >= 2 ? habitsNow() : [];
    habit.forEach(function (id) { if (CHIP_FOR[id] && out.indexOf(CHIP_FOR[id]) === -1) out.push(CHIP_FOR[id]); });
    var h = new Date().getHours();
    var base = h < 11 ? ['Plan my day', 'Check my email', 'What\u2019s the weather?'] : h < 17 ? ['Focus with me for 15 minutes', 'I can\u2019t start', 'Check my email'] : h < 21 ? ['Plan my day', 'I am exhausted', 'Breathe with me'] : ['Help me wind down', 'Breathe with me', 'Park a thought'];
    base.concat(['What does research say about ADHD?', 'What can you do?']).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
    return out.slice(0, 6);
  }
  function renderChips() {
    var box = $('ask-chips'); if (!box) return;
    box.innerHTML = '';
    if (!st.settings.proactive) return;
    suggestions().forEach(function (c) { box.appendChild(button(c, 'btn-chip', function () { handle(c); })); });
    var lv = $('ask-level');
    if (lv) { var L = helperLevel(st.learn.xp); lv.textContent = 'Helper level ' + L.level + ' \u00b7 ' + L.name; }
  }

  /* ------------------------------------------------------------------
   * Settings card
   * ------------------------------------------------------------------ */
  function bindSettings() {
    var speak = $('ask-set-speak'), pro = $('ask-set-proactive'), len = $('ask-set-length');
    if (speak) { speak.checked = !!st.settings.speak; speak.addEventListener('change', function () { st.settings.speak = speak.checked; save(); }); }
    if (pro) { pro.checked = st.settings.proactive !== false; pro.addEventListener('change', function () { st.settings.proactive = pro.checked; save(); renderChips(); }); }
    if (len) { len.value = st.settings.length || 'auto'; len.addEventListener('change', function () { st.settings.length = len.value; save(); }); }
    var mail = $('ask-set-mail');
    if (mail) { mail.value = st.settings.mail || ''; mail.addEventListener('change', function () { st.settings.mail = mail.value || null; save(); }); }
    var gid = $('ask-set-google'), gsave = $('ask-set-google-save'), gmsg = $('ask-set-google-msg');
    if (gid) gid.value = sec.googleClientId || '';
    if (gsave) gsave.addEventListener('click', function () {
      sec.googleClientId = clean(gid.value); saveSecrets(); googleToken = null;
      if (sec.googleClientId) { st.settings.mail = 'gmail'; save(); if (mail) mail.value = 'gmail'; }
      gmsg.textContent = sec.googleClientId ? 'Saved. Say \u201ccheck my email\u201d and Google will ask you to allow read-only access.' : 'Google helper is off.';
    });
    var bp = $('ask-set-brain-provider'), bk = $('ask-set-brain-key'), bm = $('ask-set-brain-model'), bu = $('ask-set-brain-url'), bon = $('ask-set-brain-on'), bs = $('ask-set-brain-save'), bmsg = $('ask-set-brain-msg');
    var b = sec.brain || {};
    if (bp) bp.value = b.provider || 'openai';
    if (bk) bk.value = b.key || '';
    if (bm) bm.value = b.model || '';
    if (bu) bu.value = b.baseUrl || '';
    if (bon) bon.checked = !!b.on;
    if (bs) bs.addEventListener('click', function () {
      sec.brain = { provider: bp.value, key: clean(bk.value), model: clean(bm.value), baseUrl: clean(bu.value), on: bon.checked && !!clean(bk.value) };
      saveSecrets();
      bmsg.textContent = sec.brain.on ? 'Smarter brain is on. Open questions go to ' + (bp.value === 'anthropic' ? 'Anthropic' : 'your AI service') + '. Commands still run on this device.' : 'Smarter brain is off. Everything stays on this device.';
    });
    var bf = $('ask-set-brain-forget');
    if (bf) bf.addEventListener('click', function () { sec = {}; saveSecrets(); googleToken = null; if (bk) bk.value = ''; if (gid) gid.value = ''; if (bon) bon.checked = false; bmsg.textContent = 'Keys removed from this device.'; });
  }

  /* ------------------------------------------------------------------
   * Voice in
   * ------------------------------------------------------------------ */
  function bindMic() {
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    var mic = $('ask-mic'); if (!mic) return;
    if (!Ctor) { mic.hidden = true; return; }
    var rec = null, on = false;
    mic.addEventListener('click', function () {
      if (on) { try { rec.stop(); } catch (e) { /* fine */ } return; }
      var ap = window.RootlingAppearance && window.RootlingAppearance.getSettings ? window.RootlingAppearance.getSettings() : null;
      if (!st.settings.voiceOk && !(ap && ap.voiceNoteSeen)) {
        reply({ text: 'To hear you, your browser turns your voice into text. Some browsers send your voice to their maker\u2019s servers to do this. Rootling never keeps your voice \u2014 only the words.',
          buttons: [{ label: 'Okay, listen', cls: 'btn-primary', fn: function () { st.settings.voiceOk = true; save(); mic.click(); } }, { label: 'Not now', cls: 'btn-ghost', fn: function () { } }] });
        return;
      }
      try { rec = new Ctor(); } catch (e) { return; }
      rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
      var input = $('ask-input'), final = '';
      rec.onresult = function (ev) { var w = ''; for (var i = 0; i < ev.results.length; i++) w += ev.results[i][0].transcript; input.value = w; final = w; };
      rec.onend = function () { on = false; mic.textContent = '\ud83c\udfa4 Talk'; mic.setAttribute('aria-pressed', 'false'); if (clean(final)) { input.value = ''; handle(final); } };
      rec.onerror = function () { on = false; mic.textContent = '\ud83c\udfa4 Talk'; };
      try { rec.start(); on = true; mic.textContent = 'Listening\u2026 tap to stop'; mic.setAttribute('aria-pressed', 'true'); } catch (e) { on = false; }
    });
  }

  function init() {
    var form = $('ask-form'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var i = $('ask-input'); var v = clean(i.value);
      if (!v) { i.focus(); return; }
      i.value = '';
      handle(v);
    });
    var stopBtn = $('ask-timer-stop'); if (stopBtn) stopBtn.addEventListener('click', function () { stopTimer(false); });
    bindMic();
    bindSettings();
    renderChips();
    var name = $('ask-pet-name'); if (name) name.textContent = petName();
    setTimeout(function () { var n = $('ask-pet-name'); if (n) n.textContent = petName(); renderChips(); }, 600);
    /* Welcome line: once per visit, uses what it learned. */
    var lv = helperLevel(st.learn.xp);
    var habits = lv.level >= 2 ? habitsNow() : [];
    var first = habits.length && CHIP_FOR[habits[0]] ? 'You often ask me to ' + CHIP_FOR[habits[0]].toLowerCase() + ' around now. Want me to?' : 'Ask me anything, or tell me what you need. Try \u201cCheck my email\u201d.';
    var w = el('div', 'ask-msg ask-pet'); w.appendChild(el('p', 'ask-who', petName())); var wb = el('div', 'ask-body'); wb.appendChild(el('p', '', first));
    if (habits.length && CHIP_FOR[habits[0]]) { var ar = el('div', 'ask-actions'); ar.appendChild(button('Yes, please', 'btn-primary', function () { handle(CHIP_FOR[habits[0]]); })); wb.appendChild(ar); }
    w.appendChild(wb); log().appendChild(w);
    checkReminders();
    setInterval(checkReminders, 15000);
  }

  root.ROOTLING_ASSISTANT = pure;
  root.RootlingAssistant = { handle: handle, key: KEY, getStore: function () { return st; }, reload: function () { st = load(); renderChips(); return st; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
