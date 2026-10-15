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

  /* Find a day in text: today, tomorrow, weekdays ("friday", "next tue"),
   * "oct 20", "october 20th", "10/20". Returns a Date at 00:00 or null. */
  var WD = [/\bsun(day)?\b/, /\bmon(day)?\b/, /\btue(s(day)?)?\b/, /\bwed(nesday)?\b/, /\bthu(rs(day)?)?\b/, /\bfri(day)?\b/, /\bsat(urday)?\b/];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.? (\d{1,2})(?:st|nd|rd|th)?\b/;
  function parseDay(text, now) {
    var t = low(text), base = now ? new Date(now) : new Date();
    var d = new Date(base.getTime()); d.setHours(0, 0, 0, 0);
    if (/\bday after tomorrow\b/.test(t)) { d.setDate(d.getDate() + 2); return d; }
    if (/\btomorrow\b/.test(t)) { d.setDate(d.getDate() + 1); return d; }
    if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return d;
    var m = t.match(MONTH_RE);
    if (m) {
      var mi = MONTHS.indexOf(m[1].slice(0, 3)), day = Number(m[2]);
      var x = new Date(d.getFullYear(), mi, day);
      if (x.getTime() < d.getTime()) x.setFullYear(x.getFullYear() + 1);
      return x;
    }
    var n = t.match(/\b(?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (n && Number(n[1]) <= 12) {
      var y = n[3] ? (n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])) : d.getFullYear();
      var z = new Date(y, Number(n[1]) - 1, Number(n[2]));
      if (!n[3] && z.getTime() < d.getTime()) z.setFullYear(z.getFullYear() + 1);
      return z;
    }
    for (var i = 0; i < 7; i++) {
      if (WD[i].test(t)) {
        var diff = (i - d.getDay() + 7) % 7;
        if (diff === 0 || /\bnext\b/.test(t) && diff < 7 && /\bnext (week )?\w*day\b/.test(t) && diff === 0) diff = 7;
        d.setDate(d.getDate() + diff);
        return d;
      }
    }
    if (/\bnext week\b/.test(t)) { d.setDate(d.getDate() + 7); return d; }
    return null;
  }
  function parseClock(t) {
    if (/\bnoon\b/.test(t)) return { h: 12, m: 0, ap: true };
    if (/\bmidnight\b/.test(t)) return { h: 0, m: 0, ap: true };
    var a = t.match(/\bat (\d{1,2})(?::(\d{2}))? ?(am|pm|a\.m\.|p\.m\.)?(?![\d\/])/) ||
            t.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm|a\.m\.|p\.m\.)(?![a-z])/) ||
            t.match(/\b(\d{1,2}):(\d{2})\b()/);
    if (!a) {
      if (/\b(tonight|this evening)\b/.test(t)) return { h: 20, m: 0, ap: true };
      if (/\bthis afternoon\b/.test(t)) return { h: 15, m: 0, ap: true };
      if (/\bmorning\b/.test(t)) return { h: 9, m: 0, ap: true };
      return null;
    }
    var h = Number(a[1]), mi = a[2] ? Number(a[2]) : 0;
    var ap = a[3] ? a[3].replace(/\./g, '') : '';
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && /\b(tonight|evening|afternoon)\b/.test(t) && h < 12) { h += 12; ap = 'pm'; }
    if (h > 23 || mi > 59) return null;
    return { h: h, m: mi, ap: !!ap };
  }
  /* Parse "in 10 minutes", "at 3pm", "friday at 3", "tomorrow morning",
   * "oct 20 at 9:30". Returns a timestamp (ms) or null. */
  function parseWhen(text, now) {
    var t = low(text);
    var base = now ? new Date(now) : new Date();
    var m = t.match(/\bin (\d+|an?|half an?) ?(sec|second|min|minute|hr|hour|day)s?\b/);
    if (m) {
      var n = m[1] === 'a' || m[1] === 'an' ? 1 : (/half/.test(m[1]) ? 0.5 : Number(m[1]));
      var c = m[2].charAt(0), unit = c === 's' ? 1000 : (c === 'm' ? 60000 : (c === 'd' ? 86400000 : 3600000));
      return base.getTime() + n * unit;
    }
    var day = parseDay(t, base.getTime()), clock = parseClock(t);
    if (!day && !clock) return null;
    if (day && !clock) clock = { h: 9, m: 0, ap: true };
    var d = new Date((day || base).getTime());
    d.setHours(clock.h, clock.m, 0, 0);
    if (!day && d.getTime() <= base.getTime()) {
      /* "at 8" with no am/pm: the next 8 o'clock that is still ahead. */
      var pmTry = new Date(d.getTime()); pmTry.setHours(clock.h + 12);
      if (!clock.ap && clock.h < 12 && pmTry.getTime() > base.getTime()) d = pmTry;
      else d.setDate(d.getDate() + 1);
    } else if (day && !clock.ap && clock.h >= 1 && clock.h <= 7) d.setHours(clock.h + 12);
    return d.getTime();
  }
  function isRepeat(text) { return /\b(every ?day|daily|each day|every (morning|night|evening)|every \d+ hours?)\b/.test(low(text)); }

  /* Strip the time words from a reminder so "take meds at 8pm" -> "take meds". */
  function stripWhen(text) {
    return clean(String(text)
      .replace(/\b(every ?day|daily|each day|every (morning|night|evening))\b/gi, '')
      .replace(/\b(the )?day after tomorrow\b/gi, '')
      .replace(/\b(on )?(next )?(tomorrow|today|tonight|this (morning|afternoon|evening)|next week)\b/gi, '')
      .replace(/\b(on )?(next )?(sun|mon|tues?|wed|thu|thurs|fri|sat)(day|nesday|sday|urday)?\b/gi, '')
      .replace(/\b(on )?(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.? \d{1,2}(st|nd|rd|th)?\b/gi, '')
      .replace(/\b(on )?\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/gi, '')
      .replace(/\bin (\d+|an?|half an?) ?(sec|second|min|minute|hr|hour|day)s?\b/gi, '')
      .replace(/\bat (\d{1,2})(:\d{2})? ?(am|pm|a\.m\.|p\.m\.)?(?![\d])/gi, '')
      .replace(/\b(\d{1,2})(:\d{2})? ?(am|pm)\b/gi, '')
      .replace(/\b(at )?(noon|midnight)\b/gi, '')
      .replace(/\bin the (morning|afternoon|evening)\b/gi, '')
      .replace(/^(to|that)\s+/i, '')
      .replace(/\s+(to|at|on)$/i, '')
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
    { id: 'moodWatch', re: /mood watch (off|on)|(stop|start) (watching|noticing) my mood|turn (off|on) mood watch/ },
    { id: 'moodCheck', re: /mood check|check (on )?my mood|depression (test|screen|screening|quiz|check)|phq|am i depressed|do i have depression|test (me )?for depression/ },
    { id: 'moodLift', re: /lift my mood|mood (lift|boost|booster)|make me feel better|help me feel better|cheer me up|i want to feel better|feel better/ },
    { id: 'goodThings', re: /(three|3) good things|gratitude|grateful|good things (today|journal)|show my good things/ },
    { id: 'moodTrend', re: /my mood (this|last) (week|two weeks|2 weeks|month)|how (has|have) my mood|mood (trend|history|chart)|what helps my mood|what lifts my mood/ },
    { id: 'moodKind', re: /say something kind|be kind to me|self.?compassion|i hate myself|i'?m (worthless|useless|a burden)|i am (worthless|useless|a burden)/ },
    { id: 'depressed', re: /i'?m depressed|i am depressed|i feel depressed|feeling depressed|i have depression|i think i (have|might have) depression|my depression|depressed again|i'?m so depressed/ },
    { id: 'help', re: /^(help( me)?( please)?|what can you do|what else can you do|what do you do|commands|how do (i|you) use (this|you))$/ },
    { id: 'learned', re: /what (have you|did you) learn|what do you know about me|how are you helping me|your level|my pet'?s? (xp|level|points)/ },
    { id: 'forget', re: /^(forget (everything|what you learned|me)|wipe (your )?(memory|learning)|reset (your )?learning)/ },
    { id: 'teach', re: /^when i say (.+?)[,]? (?:i mean|it means|do|open|that means) (.+)$/ },
    /* body emergencies come before feelings, so "I can't breathe" is never treated as only worry */
    { id: 'urgentBody', re: /(chest (pain|pressure|tight)|can'?t breathe|cannot breathe|can'?t catch my breath|trouble breathing|struggling to breathe|lips (are |turning )?(blue|gr[ae]y)|face (is )?droop|slurred speech|stroke|passed out|fainted|seizure|overdose|bleeding (a lot|badly|won'?t stop)|allergic reaction|throat (is )?closing)/ },
    { id: 'timeNow', re: /^(what time is it|what'?s the time|time|current time)$|what (day|date) is (it|today)|today'?s date|what'?s the date/ },
    { id: 'daysUntil', re: /how (many|long) (days |weeks )?(until|till|til|to|before) (.+)/ },
    { id: 'percent', re: /(\d+(?:\.\d+)?) ?(?:%|percent) of \$?(\d+(?:\.\d+)?)/ },
    { id: 'tip', re: /\btip\b.*?\$?(\d+(?:\.\d+)?)|\$?(\d+(?:\.\d+)?).*\btip\b/ },
    { id: 'convert', re: /(-?\d+(?:\.\d+)?) ?(miles?|mi|km|kilometers?|kilometres?|lbs?|pounds?|kg|kilos?|kilograms?|°?f|fahrenheit|°?c|celsius|inch(?:es)?|in|cm|centimeters?|feet|foot|ft|meters?|metres?|m|cups?|ml|milliliters?|oz|ounces?|grams?|g|liters?|l|gallons?|gal) (?:to|in|into) (\w+)/ },
    { id: 'math', re: /^(?:what is |what'?s |calculate |calc |compute )?(-?[\d.]+(?:\s*[-+*\/x\u00d7\u00f7^]\s*\(?-?[\d.]+\)?)+)\s*\??$/ },
    { id: 'coin', re: /flip a coin|coin (flip|toss)|heads or tails/ },
    { id: 'dice', re: /roll (a |the |some )?(die|dice|d\d+)/ },
    { id: 'randomNum', re: /(pick|give me|choose) a (random )?number(?: (?:between|from) (\d+) (?:and|to) (\d+))?/ },
    { id: 'choose', re: /^(?:help me )?(?:choose|pick|decide)(?: between)? (.+?) or (.+)$|^should i (.+?) or (.+)$/ },
    { id: 'joke', re: /\b(tell me a joke|joke|make me laugh|something funny)\b/ },
    { id: 'affirm', re: /(say something nice|affirmation|encourage me|motivate me|i need motivation|cheer me up|compliment me|i feel like a failure|i'?m (a )?failure)/ },
    { id: 'stopwatch', re: /stopwatch/ },
    { id: 'readAloud', re: /^(read (that|it|this) (to me|aloud|out loud)|say that again|repeat that|read it to me)$/ },
    { id: 'emailDraft', re: /(draft|write|compose)\b.*\be-?mail\b.*\b(saying|that says|to say|about)\b/ },
    { id: 'emailRead', re: /read (me )?(my )?(newest|latest|last|top|first|most recent) e-?mail|what'?s my (newest|latest) e-?mail/ },
    { id: 'emailSearch', re: /(search|find|look for|look up)\b.*\b(e-?mails?|inbox|gmail)\b|e-?mails? (from|about) (.+)|any e-?mails? (from|about) (.+)/ },
    { id: 'emailCheck', re: /\b(check|read|open|show|look at|any|go through)\b.*\b(e-?mails?|inbox|mail|gmail|outlook)\b|^(e-?mail|inbox|mail)$|new e-?mails?/ },
    { id: 'emailWrite', re: /(write|send|draft|compose)\b.*\b(e-?mail|email)\b(?: to (.+))?/ },
    { id: 'calAdd', re: /\b(add|put|schedule|book|create)\b.+\b(to|on|in) (my )?(google )?calendar\b|^(schedule|book) (an? )?(.+) (on|for|at|tomorrow|next)\b/ },
    { id: 'calendar', re: /(calendar|schedule|agenda|what(?:'s| is) (?:on )?(?:for )?(today|tomorrow|this week)|plan my day|what do i have|my day|my week|what(?:'s| is) next)/ },
    { id: 'remind', re: /^(?:please )?(?:remind me|set a reminder|reminder|set an alarm|wake me)\b(.*)$|^(every ?day|daily) (at .+ )?remind me/ },
    { id: 'reminders', re: /(my|show|list|what are my) (reminders|alarms)|what did i ask you to remind/ },
    { id: 'listAdd', re: /^(?:add|put) (.+?) (?:to|on) (?:my |the )?(shopping|grocery|groceries|packing|wish) ?list$|^(?:i need to buy|buy) (.+)$/ },
    { id: 'listRemove', re: /^(?:remove|delete|cross off|take|check off) (.+?) (?:from|off) (?:my |the )?(shopping|grocery|groceries|packing|wish) ?list$/ },
    { id: 'listClear', re: /^(?:clear|empty|reset) (?:my |the )?(shopping|grocery|groceries|packing|wish) ?list$/ },
    { id: 'listShow', re: /(?:what'?s on|show|read|open|see) (?:me )?(?:my |the )?(shopping|grocery|groceries|packing|wish) ?list|^(?:my )?(shopping|grocery|groceries|packing) list$/ },
    { id: 'medsCheck', re: /did i (already )?(take|use) my (meds|medicine|medication|pills?|inhaler|vitamins?)/ },
    { id: 'medsTook', re: /^i (just |already )?(took|used|had) my (meds|medicine|medication|pills?|inhaler|vitamins?)|^(took|log|logged) (my )?(meds|medicine|medication|pills?|inhaler)/ },
    { id: 'waterLog', re: /^i (just )?(drank|had|finished) (a |one |\d+ |two |three )?(glass|glasses|cups?|bottles?) of water|^log (a )?(glass of )?water/ },
    { id: 'journalShow', re: /(show|read|open) (me )?my (journal|diary|notes)/ },
    { id: 'journal', re: /^(journal|diary|dear diary|log this|note to self)[:,]? (.+)|^write in my journal/ },
    { id: 'walkStop', re: /(stop|end|finish|done with) (my |the )?walk|i'?m back from (my|the) walk/ },
    { id: 'walkStart', re: /(start|begin|go for|going for|take|count) (a |my )?(walk|steps)|walk with me|let'?s (go for a )?walk/ },
    { id: 'stepGoal', re: /(?:set|change|make|update) my (?:daily )?step goal(?: to)? ([\d,]+)|step goal (?:of|to) ([\d,]+)/ },
    { id: 'stepsLog', re: /(?:log|add|record|i (?:walked|did|took|have|got|am at|'m at)) ([\d,]+) steps|^([\d,]+) steps( today)?$|my steps (?:are|is|today (?:are|is|=)) ([\d,]+)/ },
    { id: 'stepsAsk', re: /how many steps|my steps( today)?$|step count|how close am i to my (step )?goal/ },
    { id: 'workoutLog', re: /^(?:i )?(?:just )?(?:did|went|finished|walked|ran|jogged|biked|cycled|swam|hiked|played|lifted|danced|stretched|rode)\b.*?(\d+) ?(min|mins|minutes|hour|hours|hr|hrs)\b|^log (?:a |an )?(\d+) ?(?:min|minute|hour)s? (.+)/ },
    { id: 'pursedLip', re: /pursed[- ]?lip/ },
    { id: 'stretch', re: /^stretch|stretch(ing)? (with me|routine|break)|help me stretch/ },
    { id: 'workout', re: /(give me|start|do|suggest|need|want|show me) (a |an |some |my )?(.*)?(workout|exercise routine|exercises)|^(.*)workout( please)?$|^exercise with me/ },
    { id: 'fitness', re: /(my fitness|fitness (summary|report|this week|goals?)|how am i doing (this week|with (my )?(fitness|exercise|steps|goals?))|my (exercise|activity|active minutes)|fitness)/ },
    { id: 'studies', re: /(find|show|look up|search|get|latest|newest|recent|new)\b.*?\b(studies|study|research papers?|papers|trials|reviews|research)\b(?: on| about| for| into)? (.+)/ },
    { id: 'directions', re: /^(?:directions|navigate|take me|how do i get|route) (?:to )?(.+)|(?:find|where is|where'?s|nearest|closest) (?:the |a )?(?:nearest |closest )?(.+?) near me/ },
    { id: 'translate', re: /^translate (.+?) (?:to|into) (\w+)$|^how do you say (.+?) in (\w+)$/ },
    { id: 'define', re: /^(?:define|definition of|meaning of) (.+)$|^what does (?:the word )?(.+?) mean$/ },
    { id: 'news', re: /^(news|headlines|what'?s in the news|today'?s news)/ },
    { id: 'researchAsk', re: /(what does (the )?(research|science|evidence)|research (say|show)|evidence (for|on|about)|stud(y|ies) (on|about)|treatments? (for|of)|symptoms? of|signs of|tell me about|explain|what is (adhd|autism|anxiety|ptsd|burnout|rsd|rejection|copd|asthma|diabetes|ocd)|how (can|do|should) i (cope|deal|handle|manage) with|how to (cope|deal|manage))/ },
    { id: 'timer', re: /(timer|pomodoro|focus (with me|for|block|time)|work (for|with me)|body ?double|sit with me|just \d+ min)/ },
    { id: 'cantStart', re: /(can'?t start|cannot start|help me start|stuck on|procrastinat|break (it|this|.+) (down|into)|don'?t know where to start|too big|overwhelmed by)\b(.*)/ },
    { id: 'addPerson', re: /^add (a )?(person|contact|friend)\b|^save (.+?)'?s? (number|phone|email)/ },
    { id: 'park', re: /^(park|note|jot|save( this)?|remember( that)?|add)\b[: ]*(.*?)( to (my )?(list|tasks|to-?do( list)?))?$/ },
    { id: 'priority', re: /(my one thing|main thing|priority) (is|today is|=)\s*(.+)$|^make (.+) my (one thing|priority)$/ },
    { id: 'sensory', re: /(too (loud|bright|much noise)|overstimulat|sensory|meltdown|shut ?down|noisy|crowd|lights hurt)/ },
    { id: 'anxious', re: /(anxious|anxiety|panic|nervous|worried|worrying|scared|afraid|freaking out|heart (is )?racing|stress(ed)?|overwhelm(ed)?)/ },
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
    { id: 'research', re: /(research|science|scientist|studies|study says|evidence|what is|what are|tell me about|explain|symptoms?|treatments?|therapy|medication|meds for|how (can|do|should) i (cope|deal|handle|manage|help)|why do i|who is|who was)/ },
    { id: 'search', re: /^(look up|search( for)?|google|find (out|info))\s+(.+)$/ },
    { id: 'nav', re: /^(open|go to|show( me)?|take me to)\s+(home|focus|tasks|activities|adventures|companion|pets?|settings|support|check-?ins?|privacy)$/ },
    { id: 'checkin', re: /^(check in|check-in|daily check ?in|log my mood)$/ },
    { id: 'pause', re: /^(pause|leave quietly|hide|quiet mode)/ },
    { id: 'thanks', re: /^(thanks|thank you|ty|you('re| are) (the best|great|awesome)|good (pet|job))/ },
    { id: 'greet', re: /^(hi|hello|hey|yo|good (morning|afternoon|evening)|how are you|what'?s up)\b/ }
  ];

  /* ---------- small everyday helpers (pure) ---------- */
  var UNITS = {
    mi: ['len', 1609.344], km: ['len', 1000], m: ['len', 1], cm: ['len', 0.01], in: ['len', 0.0254], ft: ['len', 0.3048],
    lb: ['mass', 453.59237], kg: ['mass', 1000], g: ['mass', 1], oz: ['mass', 28.349523],
    ml: ['vol', 1], l: ['vol', 1000], cup: ['vol', 236.588], gal: ['vol', 3785.41], c: ['temp'], f: ['temp']
  };
  function unitKey(u) {
    u = String(u || '').toLowerCase().replace(/[°.]/g, '');
    var map = { mile: 'mi', miles: 'mi', mi: 'mi', km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', meter: 'm', meters: 'm', metre: 'm', metres: 'm', m: 'm',
      cm: 'cm', centimeter: 'cm', centimeters: 'cm', inch: 'in', inches: 'in', in: 'in', foot: 'ft', feet: 'ft', ft: 'ft',
      lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', g: 'g', gram: 'g', grams: 'g', oz: 'oz', ounce: 'oz', ounces: 'oz',
      ml: 'ml', milliliter: 'ml', milliliters: 'ml', l: 'l', liter: 'l', liters: 'l', cup: 'cup', cups: 'cup', gal: 'gal', gallon: 'gal', gallons: 'gal',
      c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f' };
    return map[u] || null;
  }
  function convert(n, from, to) {
    var a = unitKey(from), b = unitKey(to);
    if (!a || !b) return null;
    if (a === 'c' && b === 'f') return n * 9 / 5 + 32;
    if (a === 'f' && b === 'c') return (n - 32) * 5 / 9;
    if (UNITS[a][0] !== UNITS[b][0] || UNITS[a][0] === 'temp') return null;
    return n * UNITS[a][1] / UNITS[b][1];
  }
  function calc(expr) {
    var e = String(expr).replace(/[x\u00d7]/g, '*').replace(/\u00f7/g, '/').replace(/\^/g, '**');
    if (!/^[\d\s.+\-*\/()]+$/.test(e)) return null;
    try { var v = Function('"use strict";return (' + e + ')')(); return typeof v === 'number' && isFinite(v) ? v : null; } catch (er) { return null; }
  }
  function nice(n) { return Math.abs(n) >= 100 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100); }
  function holidayDate(name, now) {
    var t = low(name), base = now ? new Date(now) : new Date(), y = base.getFullYear();
    var fixed = { christmas: [11, 25], 'christmas eve': [11, 24], 'new year': [0, 1], 'new years': [0, 1], halloween: [9, 31], 'valentine': [1, 14], 'july 4th': [6, 4], 'fourth of july': [6, 4], 'independence day': [6, 4] };
    for (var k in fixed) if (t.indexOf(k) !== -1) { var d = new Date(y, fixed[k][0], fixed[k][1]); if (d < new Date(base.getFullYear(), base.getMonth(), base.getDate())) d.setFullYear(y + 1); return d; }
    if (/thanksgiving/.test(t)) { var f = function (yr) { var d = new Date(yr, 10, 1); var off = (4 - d.getDay() + 7) % 7; return new Date(yr, 10, 1 + off + 21); }; var th = f(y); if (th < base) th = f(y + 1); return th; }
    return null;
  }

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

  var pure = { convert: convert, calc: calc, holidayDate: holidayDate, parseDay: parseDay, isRepeat: isRepeat, youWords: youWords, hasCrisis: hasCrisis, parseWhen: parseWhen, stripWhen: stripWhen, parseDuration: parseDuration,
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
      lists: {},
      meds: [],
      journal: [],
      water: {},
      lastTopic: null,
      lastDay: '',
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
    sleep: 'Help me wind down', research: 'What does research say about ADHD?',
    walkStart: 'Start a walk', stepsLog: 'Log my steps', stepsAsk: 'How many steps today?', workout: 'Give me a workout', workoutLog: 'Log a workout',
    medsTook: 'I took my meds', medsCheck: 'Did I take my meds?', fitness: 'My fitness', emailRead: 'Read my newest email', listShow: 'What\u2019s on my shopping list?',
    moodLift: 'Lift my mood', moodCheck: 'Mood check', goodThings: 'Three good things', moodTrend: 'My mood this week', depressed: 'Lift my mood',
    stretch: 'Stretch with me', waterLog: 'I drank a glass of water', journal: 'Journal', studies: 'Find studies on COPD exercise'
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
      var y = button('Yes', 'btn-chip', function () { learnHelp(r.helpId, true); var x = xpGive(1, 'helped'); fb.textContent = 'Thank you. I will remember that this helps you.' + (x ? ' ' + x : ''); });
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
    try { renderChips(); } catch (e) { /* chips are a help */ }
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
    if (googleReady()) { googleEmail(); return; }
    if (!st.settings.mail) { askMailChoice(doEmailCheck); return; }
    var m = MAIL[st.settings.mail];
    openUrl(m.url);
    reply({
      text: 'I opened ' + m.name + ' for you.',
      lines: literal() ? ['Look at the newest email first.'] : ['Want to go through it together? Small steps make a full inbox lighter.'],
      buttons: [{ label: 'Inbox in small steps', fn: inboxSteps }, { label: 'Use a different email', cls: 'btn-ghost', fn: function () { st.settings.mail = null; save(); askMailChoice(doEmailCheck); } }],
      more: st.settings.mail === 'gmail' ? ['Tip: tap “Connect Gmail + Calendar” at the top of this card, and I can show your unread email, read the newest one to you, search, and save drafts right here.'] : null
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

  var lastCalRaw = '';
  function doCalendar(raw) {
    lastCalRaw = raw || '';
    if (googleReady() && /tomorrow|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.test(lastCalRaw)) { googleCalendar(lastCalRaw); return; }
    var list = todayList();
    var r = {
      text: list.length ? 'Here is today, in order:' : 'Today is open. Nothing is planned yet.',
      list: list.length ? list : null,
      ordered: true,
      buttons: [{ label: 'Add a plan in Focus', fn: function () { nav('focus'); } }]
    };
    if (googleReady()) r.buttons.unshift({ label: 'Add my Google Calendar', cls: 'btn-primary', fn: function () { googleCalendar(lastCalRaw); } });
    else if (googleClientId()) r.buttons.unshift({ label: 'Connect Google Calendar', fn: googleConnect });
    else r.buttons.push({ label: 'Open my calendar', cls: 'btn-ghost', fn: function () { openUrl(st.settings.mail === 'outlook' ? 'https://outlook.live.com/calendar/' : 'https://calendar.google.com/calendar/r/day'); } });
    var d = execData();
    if (!d || !d.priority) r.lines = ['Tip: say \u201cmy one thing today is \u2026\u201d and I will hold it for you.'];
    reply(r);
  }

  function addReminder(text, at, repeat) {
    text = youWords(text);
    var r = { id: 'rem-' + Date.now() + '-' + Math.floor(Math.random() * 1000), text: text, at: at, done: false, repeat: repeat ? 'daily' : '' };
    st.reminders.push(r); save();
    askNotify();
    reply({ text: 'Okay. I will remind you to ' + text + ' ' + (repeat ? 'every day at ' + fmt(new Date(at).getHours(), new Date(at).getMinutes()) + ', starting ' : '') + fmtTs(at) + '.', lines: ['I can only remind you while Rootling is open (in a tab or installed). For phone-off reminders, use Plans and reminders in Settings.'],
      buttons: [{ label: 'Undo', cls: 'btn-ghost', fn: function () { r.done = true; save(); reply({ text: 'Removed that reminder.' }); } }] });
    renderChips();
  }
  function doRemind(rest) {
    var body = clean(rest || '');
    var at = parseWhen(body);
    var repeat = isRepeat(body);
    var what = stripWhen(body) || 'do your thing';
    what = what.replace(/^to\s+/i, '');
    if (!at) {
      reply({ text: 'When should I remind you to ' + what + '?', buttons: [
        { label: 'In 10 minutes', fn: function () { addReminder(what, Date.now() + 600000, repeat); } },
        { label: 'In 1 hour', fn: function () { addReminder(what, Date.now() + 3600000, repeat); } },
        { label: 'This evening (7 pm)', fn: function () { addReminder(what, parseWhen('at 7pm'), repeat); } },
        { label: 'Tomorrow morning (9 am)', fn: function () { addReminder(what, parseWhen('tomorrow at 9am'), repeat); } }
      ] });
      return;
    }
    addReminder(what, at, repeat);
  }
  function doReminders() {
    var open = st.reminders.filter(function (r) { return !r.done; }).sort(function (a, b) { return a.at - b.at; });
    open.forEach(function (r) { r._label = r.repeat ? ' (every day)' : ''; });
    if (!open.length) { reply({ text: 'You have no reminders with me right now.', lines: ['Try: \u201cRemind me to take my meds at 8 pm.\u201d'] }); return; }
    var nodes = open.map(function (r) {
      var w = el('span', '', r.text + ' \u2014 ' + fmtTs(r.at) + (r._label || '') + ' ');
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
        changed = true;
        if (r.repeat === 'daily') { var nx = r.at; while (nx <= now) nx += 86400000; r.at = nx; }
        else r.done = true;
        var msg = 'Reminder: ' + r.text + '.';
        reply({ text: msg, lines: ['No rush. One step is enough.'], buttons: [
          { label: 'Done', cls: 'btn-primary', fn: function () { if (/med|pill|inhaler/.test(r.text)) logMeds(r.text); reply({ text: 'Nice work.', lines: [xpGive(2, 'reminder done')].filter(Boolean) }); } },
          { label: 'Snooze 10 minutes', fn: function () { addReminder(r.text, Date.now() + 600000); } }] });
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
        reply({ text: 'Time is up. You did it.', lines: ['Take a short break. Stretch or drink some water.', seconds >= 300 ? xpGive(3, 'focus timer') : ''].filter(Boolean), buttons: [
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
    low: [{ id: 'lift', label: 'Lift my mood', fn: function () { doLift(); } }, { id: 'small-win', label: 'One small win', fn: function () { smallWin(); } }, { id: 'people', label: 'Reach a safe person', fn: function () { doCall(''); } },
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
      lines: kind === 'low' ? [moodLevel() !== 'none' ? 'I have noticed a few heavy days lately. If you want, we can do a 2-question mood check together. Say \u201cmood check\u201d.' : 'If hard feelings last 2 weeks or more, a doctor or counselor can really help.'] : null,
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
  function showTopic(t, kind) {
    st.learn.topics[t.id] = (st.learn.topics[t.id] || 0) + 1; st.lastTopic = t.id; save();
    kind = kind || 'about';
    var R = window.ROOTLING_RESEARCH;
    function helpsNode() {
      var helps = el('ul', 'ask-list');
      t.helps.forEach(function (h) {
        var li = el('li'); li.appendChild(el('span', '', h.text + ' '));
        li.appendChild(el('span', 'ask-badge ask-' + h.strength.toLowerCase(), h.strength));
        var s = R.source(h.src); if (s) { li.appendChild(document.createTextNode(' ')); li.appendChild(link(s.name, s.url)); }
        helps.appendChild(li);
      });
      return helps;
    }
    function listNode(arr) { var u = el('ul', 'ask-list'); arr.forEach(function (c) { u.appendChild(el('li', '', c)); }); return u; }
    var srcs = el('p', 'gentle small', 'Sources: ');
    t.sources.forEach(function (id, i) { var s = R.source(id); if (s) { if (i) srcs.appendChild(document.createTextNode(' \u00b7 ')); srcs.appendChild(link(s.name, s.url)); } });
    var sections = {
      helps: [el('h4', '', 'What research says helps'), helpsNode()],
      symptoms: [el('h4', '', 'Common experiences'), listNode(t.common)],
      treatments: [el('h4', '', 'Treatments to ask a doctor or therapist about'), listNode(t.pro)]
    };
    var order = kind === 'symptoms' ? ['symptoms', 'helps', 'treatments'] : kind === 'treatments' ? ['treatments', 'helps', 'symptoms'] : ['helps', 'symptoms', 'treatments'];
    var node = el('div', 'ask-topic');
    if (t.urgent) node.appendChild(el('p', 'ask-urgent', t.urgent));
    sections[order[0]].forEach(function (x) { node.appendChild(x); });
    var more = [];
    order.slice(1).forEach(function (k) { sections[k].forEach(function (x) { more.push(x); }); });
    more.push(el('p', 'gentle small', 'This is information, not advice. Only a professional who knows you can say what fits you. Rootling never diagnoses.'));
    more.push(srcs);
    var intro = { symptoms: 'Here is what people with ' + t.title.toLowerCase() + ' often notice. Only a clinician can say what is going on for you.', treatments: 'Here is what the evidence says about treatment for ' + t.title.toLowerCase() + '.' }[kind];
    var btns = t.pet.map(function (p) { return { label: p.label, fn: function () { runAction(p.action); } }; });
    btns.push({ label: 'Find the newest studies', cls: 'btn-ghost', fn: function () { doStudies(t.study || t.title); } });
    reply({ text: t.title + ': ' + t.plain, lines: intro ? [intro] : null, node: node, more: more, buttons: btns });
    st.learn.xp += 1;
  }
  function doResearch(raw) {
    var R = window.ROOTLING_RESEARCH;
    var hits = R ? R.search(raw, 3) : [];
    var kind = R ? R.questionKind(raw) : 'about';
    /* follow-up: "what about treatments?" with no topic words -> last topic */
    if (!hits.length && st.lastTopic && /\b(that|it|this|those|them|treatments?|symptoms?|signs|help|cope|what about|and)\b/.test(low(raw))) {
      var lt = R.byId(st.lastTopic); if (lt) { showTopic(lt, kind); return; }
    }
    if (!hits.length) {
      if (brainOn()) { askBrain(raw); return; }
      var term = clean(raw).replace(/^(what|who) (is|are|was|were) /i, '').replace(/^(tell me about|explain) /i, '').replace(/[?!.]+$/, '');
      if (term && term.split(' ').length <= 6) {
        doWiki(term, function () {
          reply({ text: 'I do not have notes on that yet. I can look for research reviews, or show what I have studied.', buttons: [{ label: 'Find studies on \u201c' + term + '\u201d', cls: 'btn-primary', fn: function () { doStudies(term); } }, { label: 'Show my research topics', cls: 'btn-ghost', fn: showTopicList }] });
        });
        return;
      }
      showTopicList();
      return;
    }
    showTopic(hits[0], kind);
    if (hits.length > 1) reply({ text: 'Related notes:', buttons: hits.slice(1).map(function (t) { return { label: t.title, cls: 'btn-ghost', fn: function () { showTopic(t, kind); } }; }) });
  }
  function showTopicList() {
    var R = window.ROOTLING_RESEARCH; var T = R ? R.TOPICS : [];
    var neuro = T.filter(function (t) { return t.kind !== 'body'; }), body = T.filter(function (t) { return t.kind === 'body'; });
    reply({ text: 'Mind and brain notes:', buttons: neuro.map(function (t) { return { label: t.title, cls: 'btn-chip', fn: function () { showTopic(t); } }; }) });
    reply({ text: 'Body and health notes:', buttons: body.map(function (t) { return { label: t.title, cls: 'btn-chip', fn: function () { showTopic(t); } }; }) });
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

  /* ================= v13: mood care (depression support) ================= */
  var M = function () { return window.RootlingMood || null; };
  function moodLevel() { try { var m = M(); return m && m.status ? m.status().level : 'none'; } catch (e) { return 'none'; } }
  var FACES = [{ v: 1, label: 'Rough' }, { v: 2, label: 'Low' }, { v: 3, label: 'Okay' }, { v: 4, label: 'Good' }, { v: 5, label: 'Great' }];
  function askFace(question, then) {
    reply({ text: question, buttons: FACES.map(function (f) { return { label: f.v + ' \u00b7 ' + f.label, cls: 'btn-chip', fn: function () { then(f.v); } }; }) });
  }
  function crisisReply(lead) {
    reply({ text: lead || 'Thank you for telling me that. You deserve support from a person right now.', lines: ['Please call or text 988 \u2014 the Suicide and Crisis Lifeline. It is free, private, and open any time.', 'If you are in danger right now, call 911.', 'You do not have to go through this alone.'],
      buttons: [{ label: 'Call 988', cls: 'btn-primary', fn: function () { window.location.href = 'tel:988'; } }, { label: 'Text 988', fn: function () { window.location.href = 'sms:988'; } }, { label: 'Open my Support page', fn: openSafety }] });
  }

  function doDepressed() {
    reply({ text: 'Thank you for telling me. That takes courage, and I am glad you did.',
      lines: ['I cannot tell you if you have depression \u2014 only a doctor or therapist can. But depression is common, it is not your fault, and it is very treatable.', 'Right now, I can help in small ways. Pick one:', 'If you are having thoughts of hurting yourself, call or text 988 now.'],
      buttons: [{ label: 'Lift my mood', cls: 'btn-primary', fn: function () { doLift(); } }, { label: 'Two-question mood check', fn: function () { doMoodCheck(); } },
        { label: 'What research says', fn: function () { var t = window.ROOTLING_RESEARCH && window.ROOTLING_RESEARCH.byId('lowmood'); if (t) showTopic(t, 'about'); } },
        { label: 'Talk to someone', cls: 'btn-ghost', fn: openSafety }], helpId: 'depressed' });
  }

  /* PHQ-2, then PHQ-9 if it points that way. Plain words, never a diagnosis. */
  function doMoodCheck() {
    var m = M(); if (!m) return;
    reply({ text: 'Two quick questions about the last 2 weeks. This is a check, not a test you can fail, and it is not a diagnosis. Your answers stay on this device.',
      buttons: [{ label: 'Start', cls: 'btn-primary', fn: function () { phqAsk([], 2); } }, { label: 'Not now', cls: 'btn-ghost', fn: function () { reply({ text: 'Okay. You can say \u201cmood check\u201d any time.' }); } }] });
  }
  function phqAsk(ans, upto) {
    var m = M(), i = ans.length;
    if (i >= upto) { if (upto === 2) phq2Done(ans); else phq9Done(ans); return; }
    var q = m.PHQ9[i];
    reply({ text: 'Question ' + (i + 1) + ' of ' + upto + '. Over the last 2 weeks, how often have you been bothered by:', lines: [q + '?'],
      buttons: m.ANSWERS.map(function (a) { return { label: a.label, cls: 'btn-chip', fn: function () {
        var next = ans.concat([a.v]);
        if (i === 8 && a.v > 0) crisisReply('Thank you for being honest with me. That is really important, and you deserve help from a person today.');
        phqAsk(next, upto);
      } }; }) });
  }
  function phq2Done(ans) {
    var m = M(), score = ans[0] + ans[1];
    m.addCheck({ type: 'phq2', score: score, item9: 0 });
    if (score >= 3) {
      reply({ text: 'Thank you. Your answers suggest it is worth looking a little closer. That is not a diagnosis \u2014 it just means these feelings have been around a lot.',
        lines: ['Doctors use 7 more questions to understand it better. Want to keep going? It takes about 2 minutes.'],
        buttons: [{ label: 'Keep going', cls: 'btn-primary', fn: function () { phqAsk(ans, 9); } }, { label: 'Lift my mood instead', fn: function () { doLift(); } }, { label: 'Talk to someone', cls: 'btn-ghost', fn: openSafety }] });
    } else {
      reply({ text: 'Thank you. Your answers do not point to depression right now. Hard days still count, and I am here for them.',
        lines: ['If things feel heavy for 2 weeks or more, check again or talk with a doctor.', xpGive(2, 'mood check')].filter(Boolean),
        buttons: [{ label: 'Lift my mood', fn: function () { doLift(); } }, { label: 'Three good things', cls: 'btn-ghost', fn: function () { doGoodThings(''); } }] });
    }
  }
  function phq9Done(ans) {
    var m = M(), score = ans.reduce(function (a, b) { return a + b; }, 0), band = m.phq9Band(score), item9 = ans[8] || 0;
    var prev = m.getStore().checks.filter(function (c) { return c.type === 'phq9'; }).slice(-1)[0];
    m.addCheck({ type: 'phq9', score: score, item9: item9, band: band.band });
    var lines = ['This is not a diagnosis. It is a way for you and a doctor to talk about how you have been.'];
    if (prev) lines.push(score < prev.score ? 'Last time your score was ' + prev.score + '. It went down, which usually means things are a bit lighter.' : score > prev.score ? 'Last time your score was ' + prev.score + '. It went up, so please be extra kind to yourself and reach out.' : 'Same as last time (' + prev.score + ').');
    if (item9 > 0 || band.urgency === 'today') lines.push('Please talk to a doctor, therapist, or 988 today. You deserve help now, and help works.');
    else if (band.urgency === 'soon') lines.push('People with scores like this often feel much better with help. Please make an appointment with a doctor or therapist in the next week or so.');
    else if (band.urgency === 'watch') lines.push('Some signs are there. Small daily steps can help. If it does not get better in a few weeks, talk with a doctor.');
    else lines.push('Your answers show few signs right now. Keep doing what helps you.');
    var x = xpGive(3, 'mood check'); if (x) lines.push(x);
    var btns = [];
    if (band.urgency !== 'none' || item9 > 0) {
      btns.push({ label: 'Words to book an appointment', cls: 'btn-primary', fn: function () { bookWords(score); } });
      btns.push({ label: 'Find care near me', fn: function () { openUrl('https://findtreatment.gov/'); reply({ text: 'I opened FindTreatment.gov, the free US government finder for mental health care. You can also call 988 to talk now.' }); } });
    }
    btns.push({ label: 'Copy for my doctor', fn: function () { copyDoctor(ans, score, band); } });
    btns.push({ label: 'Lift my mood', cls: 'btn-ghost', fn: function () { doLift(); } });
    if (score >= 15 || item9 > 0) btns.push({ label: 'Call or text 988', cls: 'btn-ghost', fn: function () { crisisReply('You can talk to a caring person right now.'); } });
    reply({ text: 'Thank you for doing this. Your score is ' + score + ' out of 27. That is ' + band.words + ' (doctors call it \u201c' + band.band + '\u201d).', lines: lines, buttons: btns });
  }
  function copyText(txt, ok) {
    var done = function () { reply({ text: ok }); };
    try { navigator.clipboard.writeText(txt).then(done, function () { reply({ text: 'Here it is to copy:', lines: [txt] }); }); } catch (e) { reply({ text: 'Here it is to copy:', lines: [txt] }); }
  }
  function copyDoctor(ans, score, band) {
    var m = M(), d = new Date().toLocaleDateString();
    var lines = ['PHQ-9 mood check from Rootling, ' + d, 'Total: ' + score + ' / 27 (' + band.band + ')'];
    m.PHQ9.forEach(function (q, i) { lines.push((i + 1) + '. ' + q + ': ' + m.ANSWERS[ans[i]].label); });
    var past = m.getStore().checks.filter(function (c) { return c.type === 'phq9'; }).slice(-5).map(function (c) { return new Date(c.at).toLocaleDateString() + ': ' + c.score; });
    if (past.length > 1) lines.push('Past scores: ' + past.join(', '));
    copyText(lines.join('\n'), 'Copied. You can paste it into a patient portal message or show it at your visit.');
  }
  function bookWords(score) {
    var w = 'Hi, I would like to make an appointment to talk about my mood. I have been feeling down or not enjoying things for about 2 weeks or more. A mood check (PHQ-9) I took gave a score of ' + score + '. What is the first time you have?';
    reply({ text: 'Here are words you can say or send. You can read them off the screen on the phone:', lines: [w],
      buttons: [{ label: 'Copy these words', cls: 'btn-primary', fn: function () { copyText(w, 'Copied. Paste it into your doctor\u2019s message portal, or read it on the phone.'); } },
        { label: 'Remind me to call tomorrow at 10 am', fn: function () { addReminder('call to make a mood appointment', parseWhen('tomorrow at 10am')); } }] });
  }

  /* Lift my mood: behavioural activation, with before/after ratings so the pet learns what helps THIS person. */
  function doLift() {
    var m = M(); if (!m) return;
    askFace('Let\u2019s find one small thing to lift your mood. First, how is your mood right now? (1 is rough, 5 is great)', function (before) { liftMenu(before); });
  }
  function liftMenu(before) {
    var m = M(), ranked = m.rankLifts(m.getStore().lifts).filter(function (x) { return x.avg > 0; }).slice(0, 2);
    var pickL = ranked.map(function (x) { return m.liftById(x.id); }).filter(Boolean);
    var groups = {}; m.LIFTS.forEach(function (L) { if (pickL.indexOf(L) === -1 && !groups[L.group]) groups[L.group] = L; });
    var opts = pickL.concat(Object.keys(groups).map(function (g) { return groups[g]; })).slice(0, 7);
    reply({ text: before <= 2 ? 'Thank you for telling me. When mood is low, doing comes before feeling better. Pick one tiny thing:' : 'Pick one small thing:',
      lines: pickL.length ? ['The first ' + (pickL.length === 1 ? 'one has' : pickL.length + ' have') + ' helped you before.'] : ['Research shows that small, planned activities can lift mood, even when you do not feel like it.'],
      buttons: opts.map(function (L, i) { return { label: L.label, cls: i === 0 ? 'btn-primary' : 'btn-soft', fn: function () { liftGo(L, before); } }; })
        .concat([{ label: 'Something else', cls: 'btn-ghost', fn: function () { liftAll(before); } }]) });
  }
  function liftAll(before) {
    var m = M();
    reply({ text: 'All my mood lifts:', buttons: m.LIFTS.map(function (L) { return { label: L.group + ': ' + L.label, cls: 'btn-chip', fn: function () { liftGo(L, before); } }; }) });
  }
  function liftGo(L, before) {
    var m = M(), rec = m.addLift({ id: L.id, before: before });
    var extra = [];
    if (L.id === 'walk') extra.push({ label: 'Walk with me (count steps)', fn: function () { handle('start a walk', false); } });
    if (L.id === 'text' || L.id === 'call') extra.push({ label: 'Pick someone', fn: function () { doCall('', L.id === 'text' ? 'text' : 'call'); } });
    if (L.id === 'stretch') extra.push({ label: 'Stretch with me', fn: function () { handle('stretch with me', false); } });
    reply({ text: 'Good choice: ' + L.label.toLowerCase() + '.', lines: ['You do not have to enjoy it. Just doing it counts. When you are done, tap \u201cI did it\u201d.'],
      buttons: [{ label: 'Start ' + L.mins + ' minute timer', cls: 'btn-primary', fn: function () { startTimer(L.mins * 60, L.label); } }]
        .concat(extra)
        .concat([{ label: 'I did it', fn: function () { liftAfter(rec, L); } },
          { label: 'Remind me in 1 hour', cls: 'btn-ghost', fn: function () { addReminder(L.label.toLowerCase() + ' (a small mood lift)', Date.now() + 3600000); } }]) });
  }
  function liftAfter(rec, L) {
    var m = M();
    askFace('You did it. How is your mood now?', function (after) {
      m.rateLift(rec, after);
      var x = xpGive(3, 'mood lift');
      var t = after > rec.before ? 'Your mood went from ' + rec.before + ' to ' + after + '. I will remember that ' + L.label.toLowerCase() + ' helps you.' :
        after === rec.before ? 'Your mood stayed at ' + after + '. That is okay. Doing it still counts, and sometimes the lift comes a little later.' :
        'Thank you for trying. Some days are just hard. You still did something kind for yourself.';
      reply({ text: t, lines: [x, after <= 2 ? pick(M().KIND) : ''].filter(Boolean),
        buttons: [{ label: 'One more lift', fn: function () { liftMenu(after); } }, { label: 'Three good things', cls: 'btn-ghost', fn: function () { doGoodThings(''); } }] });
    });
  }

  function doGoodThings(raw) {
    var m = M(); if (!m) return;
    if (/show/.test(raw || '')) {
      var g = m.getStore().good.slice(-5).reverse();
      reply({ text: g.length ? 'Your recent good things:' : 'No good things saved yet. Want to write three now?', list: g.length ? g.map(function (e) { return new Date(e.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ': ' + e.items.join('; '); }) : null,
        buttons: [{ label: 'Write three good things', fn: function () { doGoodThings(''); } }] });
      return;
    }
    var f = el('form', 'mood-good-form'); var ins = [];
    ['Something that went okay today', 'Something that made you smile, even a little', 'Something you are glad you have'].forEach(function (ph, i) {
      var lab = el('label', 'sr-only', 'Good thing ' + (i + 1)); var inp = el('input', 'mood-good-input'); inp.type = 'text'; inp.placeholder = ph; inp.maxLength = 140; inp.id = 'good-' + Date.now() + '-' + i; lab.htmlFor = inp.id;
      f.appendChild(lab); f.appendChild(inp); ins.push(inp);
    });
    var sb = el('button', 'btn btn-primary', 'Save'); sb.type = 'submit'; f.appendChild(sb);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var items = ins.map(function (x) { return clean(x.value); }).filter(Boolean);
      if (!items.length) { ins[0].focus(); return; }
      m.addGood(items); f.replaceWith(el('p', 'gentle', 'Saved: ' + items.join('; ')));
      var x = xpGive(3, 'three good things');
      reply({ text: 'Thank you. Noticing small good things can slowly lift your mood. Tiny ones count \u2014 like a warm drink.', lines: [x].filter(Boolean),
        buttons: [{ label: 'Remind me every evening at 8 pm', fn: function () { addReminder('write three good things', parseWhen('at 8pm'), true); } }, { label: 'Show my good things', cls: 'btn-ghost', fn: function () { doGoodThings('show'); } }] });
    });
    reply({ text: 'Three good things from today. Small is perfect. One is fine too.', node: f });
  }

  function doMoodTrend() {
    var m = M(); if (!m) return;
    var s = m.status(), words = { 1: 'rough', 2: 'low', 3: 'okay', 4: 'good', 5: 'great' };
    var lines = [];
    if (s.logged) lines.push('You checked in on ' + s.logged + ' of the last 14 days. On average your mood was about ' + words[Math.round(s.avg)] + ' (' + (Math.round(s.avg * 10) / 10) + ' out of 5). Low days: ' + s.lowDays + '.');
    else lines.push('No mood check-ins in the last 2 weeks yet. Tap a face in your daily check-in and I can show you a trend.');
    s.reasons.forEach(function (r) { lines.push('I noticed: ' + r); });
    var r = m.rankLifts(m.getStore().lifts);
    if (r.length) lines.push('What helps you most: ' + r.slice(0, 3).map(function (x) { var L = m.liftById(x.id); return (L ? L.label.toLowerCase() : x.id) + ' (' + (x.avg >= 0 ? '+' : '') + (Math.round(x.avg * 10) / 10) + ')'; }).join(', ') + '.');
    var c = m.getStore().checks.filter(function (x) { return x.type === 'phq9'; }).slice(-3);
    if (c.length) lines.push('Mood check scores: ' + c.map(function (x) { return new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' \u2014 ' + x.score; }).join(', ') + ' (lower is lighter).');
    reply({ text: 'Your mood, the last 2 weeks:', lines: lines,
      buttons: [{ label: 'Lift my mood', cls: 'btn-primary', fn: function () { doLift(); } }, { label: 'Mood check', fn: function () { doMoodCheck(); } }] });
  }
  function doMoodKind(raw) {
    var m = M(), hard = /hate myself|worthless|useless|burden/.test(raw || '');
    reply({ text: hard ? 'I am really sorry you feel that way about yourself. Those thoughts hurt. Heavy feelings can tell you things that are not true about you.' : pick(m ? m.KIND : ['You matter.']),
      lines: hard ? [pick(m.KIND), 'If those thoughts ever turn into wanting to hurt yourself, call or text 988 right away.'] : null,
      buttons: [{ label: 'Another kind thought', cls: 'btn-ghost', fn: function () { doMoodKind(''); } }, { label: 'Lift my mood', fn: function () { doLift(); } }].concat(hard ? [{ label: 'Mood check', fn: function () { doMoodCheck(); } }] : []) });
  }
  function doMoodWatch(raw) {
    var m = M(); if (!m) return;
    var on = !/off|stop/.test(raw);
    m.setWatch(on);
    reply({ text: on ? 'Mood watch is on. I will gently notice if things look heavy for a while, and check in at most once a day. It all stays on this device.' : 'Mood watch is off. I will not look for patterns. Crisis words still always bring up 988. You can turn it back on with \u201cmood watch on\u201d.' });
  }
  /* Once a day at most, a caring check-in when signals line up. */
  function moodNudge() {
    var m = M(); if (!m || !m.shouldNudge) return;
    var s = m.shouldNudge(); if (!s) return;
    m.markNudged();
    if (s.crisis) { crisisReply('I have been thinking about what you shared in your last mood check. I care about you. How are you right now?'); return; }
    if (s.level === 'concern') {
      reply({ text: 'I care about you, so I want to gently check in. Here is what I noticed:', list: s.reasons,
        lines: ['This is not a diagnosis. It just looks like things have been heavy. How have you been, really?'],
        buttons: [{ label: 'Two-question mood check', cls: 'btn-primary', fn: function () { doMoodCheck(); } }, { label: 'Lift my mood', fn: function () { doLift(); } },
          { label: 'Talk to someone', fn: openSafety }, { label: 'I am okay, thanks', cls: 'btn-ghost', fn: function () { reply({ text: 'Okay. I am glad. I am here any time you need me.' }); } }] });
    } else {
      reply({ text: 'Things have felt a bit heavier lately. ' + (s.reasons[0] || ''), lines: ['Want to try a small mood lift together?'],
        buttons: [{ label: 'Lift my mood', cls: 'btn-primary', fn: function () { doLift(); } }, { label: 'Not now', cls: 'btn-ghost', fn: function () { reply({ text: 'Okay. I am right here.' }); } }] });
    }
    petLine(petName() + ' is checking in on you.');
  }

  /* ================= v12 handlers ================= */
  /* Pet growth points (shared with check-ins; daily cap in app.js). */
  function xpGive(points, why) {
    try {
      if (!window.RootlingApp || !window.RootlingApp.addExperience) return '';
      var r = window.RootlingApp.addExperience(points, why);
      if (!r || !r.added) return '';
      renderChips();
      return '+' + r.added + ' growth points for ' + petName() + '.' + (r.stageUp ? ' ' + petName() + ' grew to the ' + r.stageName + ' stage!' : '');
    } catch (e) { return ''; }
  }

  function doUrgentBody(raw) {
    var breath = /breath|lips/.test(raw);
    reply({ text: 'If this is new, severe, or getting worse, call 911 now. Do not wait.',
      lines: [breath ? 'If you have a COPD or asthma action plan, follow its red-zone steps and use your rescue inhaler as your plan says.' : 'If you have chest pain, sit down and stay still while you wait for help.',
        'If you know this feeling is panic and you have had it before, I can breathe with you. If you are not sure, call.'],
      buttons: [{ label: 'Call 911', cls: 'btn-primary', fn: function () { window.location.href = 'tel:911'; } },
        { label: 'It is panic I know \u2014 breathe with me', fn: doBreathe }, { label: 'Pursed-lip breathing', cls: 'btn-ghost', fn: doPursedLip }] });
  }

  function doTimeNow(raw) {
    var d = new Date();
    if (/day|date/.test(raw)) reply({ text: 'Today is ' + d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '.' });
    else reply({ text: 'It is ' + fmt(d.getHours(), d.getMinutes()) + '.' });
  }
  function doDaysUntil(what) {
    var target = holidayDate(what) || parseDay(what);
    if (!target) { reply({ text: 'Which date? Try \u201chow many days until December 25\u201d.' }); return; }
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var days = Math.round((target.getTime() - t0.getTime()) / 86400000);
    reply({ text: days === 0 ? 'That is today.' : days + ' day' + (days === 1 ? '' : 's') + ' until ' + target.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (days > 13 ? ' (about ' + Math.round(days / 7) + ' weeks).' : '.'),
      buttons: [{ label: 'Remind me the day before', fn: function () { var d = new Date(target.getTime() - 86400000); d.setHours(9, 0, 0, 0); addReminder('get ready: ' + clean(what), Math.max(d.getTime(), Date.now() + 60000)); } }] });
  }
  function doPercent(a, b) { reply({ text: a + '% of ' + b + ' is ' + nice(Number(a) * Number(b) / 100) + '.' }); }
  function doTip(amount) {
    var n = Number(amount);
    reply({ text: 'Tips on $' + n.toFixed(2) + ':', list: [15, 18, 20, 25].map(function (p) { return p + '%: $' + (n * p / 100).toFixed(2) + ' (total $' + (n * (1 + p / 100)).toFixed(2) + ')'; }) });
  }
  function doConvert(raw) {
    var m = raw.match(INTENTS.filter(function (x) { return x.id === 'convert'; })[0].re);
    var v = m ? convert(Number(m[1]), m[2], m[3]) : null;
    if (v === null) { reply({ text: 'I can convert miles, km, feet, meters, inches, cm, pounds, kg, ounces, grams, cups, ml, liters, gallons, and \u00b0F/\u00b0C.' }); return; }
    reply({ text: m[1] + ' ' + m[2] + ' is about ' + nice(v) + ' ' + m[3] + '.' });
  }
  function doMath(expr) { var v = calc(expr); reply({ text: v === null ? 'I could not work that out. Try something like 12 * 7.' : clean(expr) + ' = ' + nice(v) }); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function doCoin() { reply({ text: 'It is ' + pick(['heads', 'tails']) + '.' }); }
  function doDice(raw) { var m = raw.match(/d(\d+)/), sides = m ? Number(m[1]) : 6; reply({ text: 'You rolled a ' + (1 + Math.floor(Math.random() * sides)) + '.' }); }
  function doRandom(a, b) { var lo = a ? Number(a) : 1, hi = b ? Number(b) : 10; if (hi < lo) { var x = lo; lo = hi; hi = x; } reply({ text: 'Your number is ' + (lo + Math.floor(Math.random() * (hi - lo + 1))) + '.' }); }
  function doChoose(a, b) {
    var c = pick([a, b]);
    reply({ text: 'I pick: ' + youWords(clean(c)) + '.', lines: [literal() ? 'If you feel disappointed, that means you wanted the other one. That is useful to know.' : 'Notice how that feels. A little sad? Then you secretly wanted the other one \u2014 go with that.'] });
  }
  var JOKES = ['Why did the scarecrow win an award? He was outstanding in his field.', 'What do you call a sleeping dinosaur? A dino-snore.', 'Why don\u2019t eggs tell jokes? They would crack each other up.',
    'What did the ocean say to the beach? Nothing. It just waved.', 'Why did the bicycle fall over? It was two-tired.', 'What do you call a fake noodle? An impasta.', 'Why are frogs so happy? They eat whatever bugs them.'];
  function doJoke() { reply({ text: literal() ? pick(JOKES) + ' (This is a joke. It is a play on words.)' : pick(JOKES) }); }
  var AFFIRM = ['You are doing better than you think.', 'Hard days do not erase your good days.', 'Small steps still move you forward.', 'You are allowed to rest and still be worth a lot.',
    'Your brain works differently, not wrongly.', 'You showed up today. That counts.', 'You have gotten through every hard day so far.', 'Being kind to yourself is a skill, and you are practicing it right now.'];
  function doAffirm() { reply({ text: pick(AFFIRM), buttons: [{ label: 'Another one', cls: 'btn-ghost', fn: doAffirm }, { label: 'One small win', fn: smallWin }] }); }
  var sw = null;
  function doStopwatch(raw) {
    if (/stop|end|pause/.test(raw) && sw) { var secs = Math.round((Date.now() - sw) / 1000); sw = null; reply({ text: 'Stopwatch stopped at ' + Math.floor(secs / 60) + ' min ' + (secs % 60) + ' sec.' }); return; }
    if (sw) { var s2 = Math.round((Date.now() - sw) / 1000); reply({ text: 'Stopwatch: ' + Math.floor(s2 / 60) + ' min ' + (s2 % 60) + ' sec so far.', buttons: [{ label: 'Stop stopwatch', fn: function () { doStopwatch('stop'); } }] }); return; }
    sw = Date.now(); reply({ text: 'Stopwatch started.', buttons: [{ label: 'Stop stopwatch', fn: function () { doStopwatch('stop'); } }] });
  }
  function doReadAloud() {
    var last = null; for (var i = st.history.length - 1; i >= 0; i--) if (st.history[i].who === 'pet') { last = st.history[i].text; break; }
    if (last && window.RootlingVoice && window.RootlingVoice.speak) window.RootlingVoice.speak(last);
    else if (last && window.speechSynthesis) { try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(last)); } catch (e) { /* fine */ } }
    reply({ text: last ? 'Reading it aloud.' : 'There is nothing to read yet.' });
  }

  /* ---------- lists ---------- */
  function listName(n) { n = low(n); return /grocer/.test(n) ? 'shopping' : n; }
  function doListAdd(items, name) {
    name = listName(name || 'shopping');
    var L = st.lists[name] = st.lists[name] || [];
    var added = clean(items).split(/,\s*|\s+and\s+/).map(clean).filter(Boolean);
    added.forEach(function (x) { if (L.map(low).indexOf(low(x)) === -1) L.push(x); });
    save();
    reply({ text: 'Added ' + added.join(', ') + ' to your ' + name + ' list. It has ' + L.length + ' item' + (L.length === 1 ? '' : 's') + ' now.', buttons: [{ label: 'Show the list', cls: 'btn-ghost', fn: function () { doListShow(name); } }] });
  }
  function doListRemove(item, name) {
    name = listName(name); var L = st.lists[name] || [], before = L.length;
    st.lists[name] = L.filter(function (x) { return low(x) !== low(item); }); save();
    reply({ text: st.lists[name].length < before ? 'Took ' + item + ' off your ' + name + ' list.' : item + ' was not on your ' + name + ' list.' });
  }
  function doListClear(name) { name = listName(name); st.lists[name] = []; save(); reply({ text: 'Your ' + name + ' list is empty now.' }); }
  function doListShow(name) {
    name = listName(name); var L = st.lists[name] || [];
    if (!L.length) { reply({ text: 'Your ' + name + ' list is empty. Try \u201cadd eggs and milk to my ' + name + ' list\u201d.' }); return; }
    var nodes = L.map(function (x) { var w = el('span', '', x + ' '); w.appendChild(button('Got it', 'btn-chip', function () { st.lists[name] = st.lists[name].filter(function (y) { return y !== x; }); save(); w.textContent = x + ' \u2014 done'; w.className = 'fit-done'; })); return w; });
    reply({ text: 'Your ' + name + ' list:', list: nodes, buttons: [{ label: 'Copy list', cls: 'btn-ghost', fn: function () { try { navigator.clipboard.writeText(L.join('\n')); reply({ text: 'Copied. You can paste it into a text.' }); } catch (e) { /* fine */ } } }] });
  }

  /* ---------- meds, water, journal ---------- */
  function logMeds(what) { st.meds.push({ at: Date.now(), what: clean(what || 'meds') }); if (st.meds.length > 200) st.meds = st.meds.slice(-200); save(); }
  function doMedsTook(raw) {
    var what = (raw.match(/(meds|medicine|medication|pills?|inhaler|vitamins?)/) || ['meds'])[0];
    logMeds(what);
    reply({ text: 'Logged: you took your ' + what + ' at ' + fmt(new Date().getHours(), new Date().getMinutes()) + '.', lines: ['Ask me \u201cdid I take my ' + what + '?\u201d any time.', xpGive(2, 'meds logged')].filter(Boolean),
      buttons: [{ label: 'Remind me every day at this time', cls: 'btn-ghost', fn: function () { addReminder('take your ' + what, Date.now() + 86400000, true); } }] });
  }
  function doMedsCheck(raw) {
    var what = (raw.match(/(meds|medicine|medication|pills?|inhaler|vitamins?)/) || ['meds'])[0];
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var todayLogs = st.meds.filter(function (m) { return m.at >= t0.getTime(); });
    if (todayLogs.length) reply({ text: 'Yes. You logged your ' + todayLogs.map(function (m) { return m.what; }).join(', ') + ' today at ' + todayLogs.map(function (m) { var d = new Date(m.at); return fmt(d.getHours(), d.getMinutes()); }).join(', ') + '.', lines: ['If you are unsure about taking more, check your label or ask a pharmacist before taking another dose.'] });
    else reply({ text: 'I do not have it logged today.', lines: ['That does not mean you did not take it \u2014 only that I was not told. If you are not sure, check your pill box or ask a pharmacist before taking another dose.'],
      buttons: [{ label: 'I took it now', fn: function () { doMedsTook(what); } }] });
  }
  function doWaterLog(raw) {
    var n = /two/.test(raw) ? 2 : /three/.test(raw) ? 3 : (Number((raw.match(/(\d+) (glass|cup|bottle)/) || [])[1]) || 1);
    var k = new Date().toDateString(); st.water[k] = (st.water[k] || 0) + n; save();
    for (var key in st.water) if (key !== k && Object.keys(st.water).length > 14) delete st.water[key];
    reply({ text: 'Logged ' + n + ' glass' + (n > 1 ? 'es' : '') + ' of water. ' + st.water[k] + ' today.', lines: [xpGive(1, 'water'), 'You can also log water in your daily check-in on Home.'].filter(Boolean) });
  }
  function doJournal(text) {
    if (!text) { reply({ text: 'What would you like to write?', node: miniInput('Today\u2026', doJournal) }); return; }
    st.journal.push({ at: Date.now(), text: clean(text) }); if (st.journal.length > 300) st.journal = st.journal.slice(-300); save();
    reply({ text: 'Saved to your journal on this device.', lines: [xpGive(2, 'journal')].filter(Boolean) });
  }
  function doJournalShow() {
    var last = st.journal.slice(-8).reverse();
    if (!last.length) { reply({ text: 'Your journal is empty. Say \u201cjournal: \u2026\u201d to write.' }); return; }
    reply({ text: 'Your latest journal entries:', list: last.map(function (j) { var d = new Date(j.at); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + fmt(d.getHours(), d.getMinutes()) + ' \u2014 ' + j.text; }) });
  }

  /* ---------- fitness ---------- */
  function F() { return window.RootlingFitness; }
  function num(x) { return Number(String(x || '').replace(/,/g, '')); }
  function doWalkStart() {
    if (!F()) return;
    if (F().walking()) { reply({ text: 'We are already walking. Say \u201cstop my walk\u201d when you are back.' }); return; }
    F().startWalk(function (r) {
      reply({ text: 'Let\u2019s walk. I am counting with you.', lines: [r.sensor ? 'Keep your phone in your pocket or hand. I count steps with the motion sensor while Rootling stays open.' : 'This device has no motion sensor I can use, so I will time your walk and estimate steps (about 100 a minute).', F() ? '' : ''].filter(Boolean),
        buttons: [{ label: 'Stop walk', cls: 'btn-primary', fn: doWalkStop }] });
    });
  }
  function doWalkStop() {
    if (!F() || !F().walking()) { reply({ text: 'We are not on a walk right now.', buttons: [{ label: 'Start a walk', fn: doWalkStart }] }); return; }
    var r = F().stopWalk();
    reply({ text: 'Walk done: ' + r.minutes + ' minute' + (r.minutes === 1 ? '' : 's') + ', ' + r.steps.toLocaleString() + (r.estimated ? ' estimated' : '') + ' steps.',
      lines: ['Today: ' + r.today.toLocaleString() + ' of ' + r.goal.toLocaleString() + ' steps.' + (r.today >= r.goal ? ' You reached your goal!' : ''), r.xp].filter(Boolean), helpId: 'walk' });
  }
  function doStepGoal(n) {
    n = num(n);
    if (!n || n < 500 || n > 40000) { reply({ text: 'Pick a step goal between 500 and 40,000.' }); return; }
    F().setGoal('steps', n);
    reply({ text: 'Your daily step goal is ' + n.toLocaleString() + ' now.', lines: [n > 10000 ? 'Research found benefits level off around 8,000\u201310,000 steps for adults under 60 (6,000\u20138,000 for 60+). More is fine if you enjoy it.' : 'Research found benefits keep growing up to about 6,000\u20138,000 steps for adults 60+ and 8,000\u201310,000 for younger adults.'], more: [sourceLink('paluch')] });
  }
  function doStepsLog(raw, n) {
    n = num(n); if (!n) { doStepsAsk(); return; }
    var add = /\badd\b/.test(raw);
    var r = F().setSteps(n, add);
    reply({ text: 'Logged. You are at ' + r.steps.toLocaleString() + ' of ' + r.goal.toLocaleString() + ' steps today.' + (r.hit ? ' Goal reached!' : ''),
      lines: [r.hit ? '' : (r.goal - r.steps).toLocaleString() + ' to go. A 10 minute walk is about 1,000 steps.', r.xp].filter(Boolean),
      buttons: r.hit ? null : [{ label: 'Walk with me', fn: doWalkStart }] });
  }
  function doStepsAsk() {
    var s = F().summary();
    reply({ text: 'Today: ' + s.today.steps.toLocaleString() + ' of ' + s.goal.steps.toLocaleString() + ' steps.', lines: ['A website cannot read your phone\u2019s health app. Tell me your number (\u201cI walked 4,200 steps\u201d) or walk with me and I will count.'],
      buttons: [{ label: 'Log my steps', fn: function () { reply({ text: 'How many steps does your phone or watch show?', node: miniInput('Steps, like 4200', function (v) { doStepsLog('log', v); }) }); } }, { label: 'Walk with me', cls: 'btn-ghost', fn: doWalkStart }] });
  }
  function doWorkoutLog(raw, m) {
    var mins = Number(m[0] || m[2]); var unit = m[1] || 'min';
    if (/hour|hr/.test(unit)) mins *= 60;
    if (!mins) { reply({ text: 'How many minutes? Try \u201cI did 20 minutes of walking\u201d.' }); return; }
    var type = (m[3] || raw).replace(/^(i )?(just )?(did|went|finished)\s+/, '').replace(/^(i )?(just )?/, '').replace(/\b(for|of|about)\b/g, ' ').replace(/\d+ ?(min|mins|minutes|hour|hours|hr|hrs)\b/g, '').replace(/\s+/g, ' ').trim() || 'activity';
    var r = F().logWorkout(type, mins);
    var w = r.week;
    reply({ text: 'Logged ' + r.workout.min + ' minutes (' + youWords(type) + ')' + (r.workout.intensity === 'vigorous' ? ' \u2014 counted double as vigorous activity.' : '.'),
      lines: ['This week: ' + w.minutes + ' of ' + r.goal.minutes + ' active minutes, ' + w.strengthDays + ' of ' + r.goal.strength + ' strength days.' + (r.estSteps ? ' I also added about ' + r.estSteps.toLocaleString() + ' estimated steps.' : ''), r.xp].filter(Boolean) });
  }
  function workoutPick(raw) {
    if (/breath|copd|lung|asthma|pulmonary/.test(raw)) return 'breathing';
    if (/gentle|chair|easy|seated|beginner|senior|low impact|sore|pain|heart/.test(raw)) return 'gentle';
    if (/strong|hard|intense|advanced|15/.test(raw)) return 'stronger';
    if (/stretch/.test(raw)) return 'stretch';
    if (/everyday|10|normal|medium/.test(raw)) return 'everyday';
    return null;
  }
  function playWorkout(id) {
    reply({ text: 'Here is your ' + window.ROOTLING_FITNESS.WORKOUTS[id].name.toLowerCase() + '. I will call out each move.', node: F().workoutNode(id, function (res, done) {
      reply({ text: done ? 'Workout complete. Amazing.' : 'Good effort. Stopping early still counts.', lines: ['Logged ' + res.workout.min + ' minutes. This week: ' + res.week.minutes + ' of ' + res.goal.minutes + ' active minutes.', res.xp].filter(Boolean), helpId: 'workout-' + id });
    }) });
  }
  function doWorkout(raw) {
    var id = workoutPick(raw);
    if (id) { playWorkout(id); return; }
    var opts = [{ id: 'gentle', label: 'Gentle chair (5 min)' }, { id: 'breathing', label: 'Breathing-friendly (COPD/asthma)' }, { id: 'everyday', label: 'Everyday (10 min)' }, { id: 'stronger', label: 'Stronger (15 min)' }, { id: 'stretch', label: 'Stretch (5 min)' }];
    if (helperLevel(st.learn.xp).level >= 3) opts = opts.slice().sort(function (a, b) { return helpScore('workout-' + b.id) - helpScore('workout-' + a.id); });
    if (userTopics().indexOf('copd') !== -1) opts = [opts[1]].concat(opts.filter(function (o) { return o.id !== 'breathing'; }));
    reply({ text: 'Which kind of workout fits today?', buttons: opts.map(function (o, i) { return { label: o.label, cls: i === 0 ? 'btn-primary' : 'btn-soft', fn: function () { playWorkout(o.id); } }; }),
      lines: ['If you have a heart, lung, or joint condition, check with your care team about what is safe for you.'] });
  }
  function doPursedLip() {
    reply({ text: 'Pursed-lip breathing slows your breath and helps get stale air out. Try it now:', ordered: true,
      list: ['Relax your neck and shoulders.', 'Breathe in through your nose for 2 counts.', 'Pucker your lips like you are about to whistle or blow out a candle.', 'Breathe out slowly through your lips for 4 counts.', 'Repeat until your breathing feels calmer.'],
      lines: ['Use it when you are short of breath, climbing stairs, or lifting. If your breathing does not improve, follow your action plan or call 911.'], helpId: 'pursed-lip' });
  }
  function doFitness() {
    var s = F().summary(), w = s.week;
    var lines = ['Steps today: ' + s.today.steps.toLocaleString() + ' of ' + s.goal.steps.toLocaleString() + '.', 'Average this week: ' + w.avgSteps.toLocaleString() + ' steps a day. Goal reached on ' + w.goalDays + ' of 7 days.',
      'Active minutes this week: ' + w.minutes + ' of ' + s.goal.minutes + '.', 'Strength days: ' + w.strengthDays + ' of ' + s.goal.strength + '.'];
    var btns = [{ label: 'Walk with me', fn: doWalkStart }, { label: 'Give me a workout', cls: 'btn-ghost', fn: function () { doWorkout(''); } }];
    if (s.suggest) {
      lines.push((s.suggest.easier ? 'Idea: ' : 'You are ready for more. ') + s.suggest.why + ' Want a goal of ' + s.suggest.to.toLocaleString() + ' steps?');
      btns.unshift({ label: 'Yes, ' + s.suggest.to.toLocaleString() + ' steps', cls: 'btn-primary', fn: function () { doStepGoal(String(s.suggest.to)); } });
    }
    if (w.minutes < s.goal.minutes) lines.push('Next best step: ' + (s.goal.minutes - w.minutes > 60 ? 'a 10\u201315 minute walk today.' : 'one more short walk gets you to your weekly goal.'));
    reply({ text: 'Your fitness this week:', list: lines, buttons: btns, more: [researchMini('fitness', 0)] });
  }

  /* ---------- live research: Europe PMC (studies), Wikipedia, dictionary ---------- */
  function conclusionOf(abs) {
    var rawA = String(abs || '');
    var c = '';
    var parts = rawA.split(/<h\d>/i);
    for (var i = parts.length - 1; i >= 1; i--) {
      var hp = parts[i].split(/<\/h\d>/i);
      if (hp.length > 1 && /conclu|interpret|discussion|implication|main results/i.test(hp[0])) { c = hp.slice(1).join(' '); break; }
    }
    var t = rawA.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (!c) { var m = t.match(/\b(conclusions?|interpretation|authors' conclusions)\b\s*[:.]\s*(.+)$/i); c = m ? m[2] : ''; }
    c = clean(String(c).replace(/<[^>]+>/g, ' '));
    var sents = (c || t).match(/[^.!?]+[.!?]+/g) || [c || t];
    c = (c ? sents.slice(0, 2) : sents.slice(-2)).join(' ').trim();
    return c.length > 340 ? c.slice(0, 337).replace(/\s+\S*$/, '') + '\u2026' : c;
  }
  function doStudies(topic) {
    var q = clean(topic).replace(/[?!.]+$/, '');
    if (!q) { reply({ text: 'Studies on what? Try \u201cfind studies on COPD exercise\u201d.' }); return; }
    var thinking = reply({ text: 'Searching medical research for reviews on \u201c' + q + '\u201d\u2026' });
    var STOP = ['the', 'a', 'an', 'of', 'for', 'and', 'on', 'in', 'to', 'with', 'about', 'how', 'does', 'do', 'is', 'are', 'new', 'latest', 'recent', 'research', 'studies', 'study', 'my', 'me', 'people', 'what'];
    var terms = low(q).replace(/[^a-z0-9\- ]/g, ' ').split(/\s+/).filter(function (w) { return w && STOP.indexOf(w) === -1; }).slice(0, 5);
    if (!terms.length) terms = [low(q)];
    var query = '(' + terms.map(function (w) { return 'TITLE_ABS:"' + w + '"'; }).join(' AND ') + ') AND (PUB_TYPE:"systematic review" OR PUB_TYPE:"meta-analysis" OR TITLE:"meta-analysis" OR TITLE:"systematic review") AND FIRST_PDATE:[2019-01-01 TO 2030-12-31]';
    fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=5&query=' + encodeURIComponent(query))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        thinking.remove();
        var items = (j.resultList && j.resultList.result) || [];
        if (!items.length) { reply({ text: 'I did not find recent reviews on that. Try fewer or simpler words.' }); return; }
        var nodes = items.map(function (it) {
          var wrap = el('div', 'ask-study');
          var url = it.doi ? 'https://doi.org/' + it.doi : (it.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + it.pmid + '/' : 'https://europepmc.org/article/' + it.source + '/' + it.id);
          wrap.appendChild(link(String(it.title || '').replace(/<[^>]+>/g, '').replace(/\.$/, ''), url));
          var jn = (it.journalInfo && it.journalInfo.journal && it.journalInfo.journal.title) || it.journalTitle || '';
          wrap.appendChild(el('p', 'gentle small', [jn, it.pubYear].filter(Boolean).join(' \u00b7 ') + (it.citedByCount ? ' \u00b7 cited ' + it.citedByCount + ' times' : '')));
          if (it.abstractText) wrap.appendChild(el('p', 'small', 'What they found: ' + conclusionOf(it.abstractText)));
          return wrap;
        });
        reply({ text: 'Here are ' + items.length + ' recent research reviews (summaries of many studies):', list: nodes,
          lines: ['I pulled the authors\u2019 own conclusions. Reviews are stronger evidence than single studies, but they are still not advice for you \u2014 bring anything interesting to your doctor.'],
          more: [el('p', 'gentle small', 'Searched Europe PMC (includes PubMed), reviews from 2019 on.')] });
        st.learn.xp += 1; save();
      }).catch(function () { thinking.remove(); reply({ text: 'I could not reach the research database right now. Check your connection.' }); });
  }
  function doWiki(term, cb) {
    var t = clean(term).replace(/^(a|an|the)\s+/i, '').replace(/[?!.]+$/, '');
    fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/\s+/g, '_')))
      .then(function (r) { if (!r.ok) throw new Error('none'); return r.json(); })
      .then(function (j) {
        if (!j.extract || j.type === 'disambiguation') throw new Error('none');
        var p = el('p', 'gentle small', 'Source: '); p.appendChild(link('Wikipedia \u2014 ' + j.title, (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(t))));
        reply({ text: j.extract.length > 600 ? j.extract.slice(0, 597).replace(/\s+\S*$/, '') + '\u2026' : j.extract, node: p });
      }).catch(function () { if (cb) cb(); else reply({ text: 'I could not find a clear answer for \u201c' + t + '\u201d.', buttons: [{ label: 'Search the web', fn: function () { doSearch(t); } }] }); });
  }
  function doDefine(word) {
    var w = clean(word).replace(/[?!."]+/g, '');
    fetch('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(low(w).replace(/\s+/g, '_')))
      .then(function (r) { if (!r.ok) throw new Error('none'); return r.json(); })
      .then(function (j) {
        var en = j.en || [];
        var list = [];
        en.slice(0, 3).forEach(function (e) {
          var d = (e.definitions || []).filter(function (x) { return x.definition && x.definition.replace(/<[^>]+>/g, '').trim(); })[0];
          if (d) list.push('(' + String(e.partOfSpeech).toLowerCase() + ') ' + clean(decodeEntities(d.definition.replace(/<[^>]+>/g, ''))).split('\n')[0]);
        });
        if (!list.length) throw new Error('none');
        var p = el('p', 'gentle small', 'Source: '); p.appendChild(link('Wiktionary \u2014 ' + w, 'https://en.wiktionary.org/wiki/' + encodeURIComponent(low(w))));
        reply({ text: w + ':', list: list, node: p });
      }).catch(function () { doWiki(w); });
  }
  function doDirections(place, near) {
    var q = clean(place);
    openUrl(near ? 'https://www.google.com/maps/search/' + encodeURIComponent(q + ' near me') : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q));
    reply({ text: near ? 'I opened a map of ' + q + ' near you.' : 'I opened directions to ' + q + ' in Google Maps.', lines: ['Tip: say \u201cremind me to leave at 2:30\u201d so you are not rushed.'] });
  }
  var LANG = { spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', chinese: 'zh-CN', japanese: 'ja', korean: 'ko', russian: 'ru', arabic: 'ar', hindi: 'hi', vietnamese: 'vi', polish: 'pl', dutch: 'nl', greek: 'el', tagalog: 'tl', english: 'en', ukrainian: 'uk' };
  function doTranslate(text, lang) {
    var code = LANG[low(lang)] || 'es';
    openUrl('https://translate.google.com/?sl=auto&tl=' + code + '&text=' + encodeURIComponent(text) + '&op=translate');
    reply({ text: 'I opened Google Translate for \u201c' + text + '\u201d into ' + lang + '.' });
  }
  function doNews() { openUrl('https://news.google.com/'); reply({ text: 'I opened Google News.', lines: ['News can be a lot. Maybe set a 10 minute timer so it does not take your whole evening.'], buttons: [{ label: '10 minute timer', fn: function () { startTimer(600, 'News time'); } }] }); }

  /* ---------- calendar: add an event ---------- */
  function icsDate(d) { return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2) + 'T' + ('0' + d.getUTCHours()).slice(-2) + ('0' + d.getUTCMinutes()).slice(-2) + '00Z'; }
  function doCalAdd(raw) {
    var at = parseWhen(raw);
    var dm = raw.match(/for (\d+(?:\.\d+)?) ?(hour|hr|min|minute)s?/);
    var durMin = dm ? (/h/.test(dm[2]) ? Number(dm[1]) * 60 : Number(dm[1])) : 60;
    var title = stripWhen(raw.replace(/\b(add|put|schedule|book|create)\b/i, '').replace(/\b(to|on|in) (my )?(google )?calendar\b/i, '').replace(/for \d+(\.\d+)? ?(hour|hr|min|minute)s?/i, '').replace(/^\s*(an?|my)\s+/i, ''));
    title = title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Event';
    if (!at) { reply({ text: 'When is \u201c' + title + '\u201d? Try \u201cadd ' + title.toLowerCase() + ' Friday at 3 pm to my calendar\u201d.' }); return; }
    var start = new Date(at), end = new Date(at + durMin * 60000);
    var when = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' at ' + fmt(start.getHours(), start.getMinutes());
    var btns = [];
    if (googleReady()) btns.push({ label: 'Add to my Google Calendar', cls: 'btn-primary', fn: function () { googleAddEvent(title, start, end); } });
    else btns.push({ label: 'Open in Google Calendar to save', cls: 'btn-primary', fn: function () { openUrl('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&dates=' + icsDate(start) + '/' + icsDate(end)); } });
    btns.push({ label: 'Outlook calendar', fn: function () { openUrl('https://outlook.live.com/calendar/0/deeplink/compose?subject=' + encodeURIComponent(title) + '&startdt=' + encodeURIComponent(start.toISOString()) + '&enddt=' + encodeURIComponent(end.toISOString())); } });
    btns.push({ label: 'Also remind me 1 hour before', cls: 'btn-ghost', fn: function () { addReminder(title.toLowerCase(), Math.max(Date.now() + 60000, at - 3600000)); } });
    var d = execData();
    var dk = start.getFullYear() + '-' + ('0' + (start.getMonth() + 1)).slice(-2) + '-' + ('0' + start.getDate()).slice(-2);
    if (d && Array.isArray(d.events)) { d.events.push({ id: 'event-' + Date.now(), date: dk, time: ('0' + start.getHours()).slice(-2) + ':' + ('0' + start.getMinutes()).slice(-2), title: title, leaveBy: '' }); execSave(); }
    reply({ text: 'Plan saved in Rootling: ' + title + ', ' + when + ' (' + durMin + ' min).', lines: ['Pick where else to save it. Nothing is added to an outside calendar until you choose.'], buttons: btns });
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
    var ps = petState(); if (ps) lines.push(petName() + ' has ' + ps.sunshine + ' growth points. Check-ins, walks, workouts, focus timers, and logging meds or water all help ' + petName() + ' grow (up to 30 bonus points a day).');
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

  var HELP_GROUPS = [
    ['Email', ['Check my email', 'Read my newest email', 'Emails from Amazon', 'Draft an email to Sam saying I will be late', 'Write an email to Sam']],
    ['Calendar and plans', ['Plan my day', 'What\u2019s on my calendar tomorrow?', 'Add dentist Friday at 3 pm to my calendar', 'Remind me every day at 8 am to take my meds', 'My one thing today is laundry']],
    ['Fitness', ['Start a walk', 'I walked 4000 steps', 'I did 30 minutes of yoga', 'Give me a workout', 'Give me a breathing friendly workout', 'Stretch with me', 'Set my step goal to 7000', 'My fitness']],
    ['Health and meds', ['I took my meds', 'Did I take my meds?', 'I drank a glass of water', 'Pursed lip breathing', 'Journal: headache after lunch']],
    ['Research', ['What is COPD?', 'Treatments for anxiety', 'Symptoms of ADHD', 'Find studies on COPD exercise', 'Show my research topics']],
    ['Mood care', ['Lift my mood', 'Mood check', 'Three good things', 'My mood this week', 'What lifts my mood?', 'I feel depressed', 'Say something kind', 'Treatments for depression', 'Mood watch off']],
    ['Feelings and focus', ['I feel anxious', 'It\u2019s too loud', 'I can\u2019t start my essay', 'Focus with me for 20 minutes', 'Breathe with me', 'Motivate me']],
    ['Everyday', ['What\u2019s the weather?', 'Add eggs and milk to my shopping list', 'Directions to Walmart', 'Find coffee near me', 'Convert 5 miles to km', 'Tip on $45', 'What is 15% of 80', 'How many days until Christmas', 'Translate thank you to Spanish', 'Define resilient', 'Flip a coin', 'Tell me a joke', 'Text Mom']],
    ['Teach me', ['When I say inbox, I mean check my email', 'What have you learned?']]
  ];
  function doHelp() {
    reply({ text: 'You can type or talk to me. Tap a group to see examples:', buttons: HELP_GROUPS.map(function (g) {
      return { label: g[0], fn: function () { reply({ text: g[0] + ' \u2014 tap one to try it:', buttons: g[1].map(function (c) { return { label: c, cls: 'btn-chip', fn: function () { handle(c); } }; }) }); } };
    }) });
  }

  /* ---------------- smarter AI brain (optional) ---------------- */
  /* Muse's trust layer: Privacy Mode (AI Access Controls card) means
   * on-device answers only, so the optional AI brain stays off. */
  function privacyMode() { try { var a = JSON.parse(localStorage.getItem('rootling-ai-access-v1') || 'null'); return !!(a && a.privacyMode); } catch (e) { return false; } }
  function brainOn() { return !privacyMode() && !!(sec.brain && sec.brain.key && sec.brain.on); }
  /* Muse's "Things you live with" (state.topics): the user's own choice.
   * The pet offers matching abilities first; it never guesses topics. */
  function userTopics() { try { var s = petState(); return (s && Array.isArray(s.topics)) ? s.topics : []; } catch (e) { return []; } }
  var TOPIC_CHIPS = { copd: ['Give me a breathing friendly workout', 'Pursed lip breathing', 'What is COPD?'] };
  function systemPrompt() {
    var helped = Object.keys(st.learn.helps).filter(function (k) { return st.learn.helps[k].yes > st.learn.helps[k].no; });
    return [
      'You are ' + petName() + ', a gentle companion pet inside Rootling, a self-care app for people who may be neurodivergent (ADHD, autism, anxiety and more).',
      'Speak in short, warm, plain sentences (grade 3-5 reading level). ' + (literal() ? 'Use literal, predictable words. No idioms, no sarcasm, no exclamation marks.' : 'Be encouraging, never pushy.'),
      prefersLong() ? 'The user likes a bit more detail (up to 8 short sentences).' : 'Keep replies under 5 short sentences.',
      'When asked about symptoms, treatments, or research (mind or body: ADHD, autism, anxiety, COPD, asthma, diabetes, blood pressure, pain, fitness and more), answer like a careful scientist: say what the evidence shows, how strong it is (Strong / Good / Some / Early), and name the source. Use the research notes below first. If you are not sure, say so and suggest "Find studies on <topic>". Never invent studies, numbers, or links.',
      'Body emergencies (chest pain, cannot breathe, stroke signs, blue lips) always get: call 911 now.',
      'If the user seems low or depressed: be warm and hopeful, say depression is common, not their fault, and treatable; never say they have depression; offer the app\'s "Lift my mood" or "Mood check"; suggest a doctor or therapist if it has lasted 2 weeks or more.',
      'Never diagnose. Never tell the user what condition they have. Describe treatments as things to talk over with a doctor or therapist; never tell anyone to start, stop, or change medicine.',
      'If the user might be in danger or mentions self-harm, tell them to call or text 988 (US) right now, and tell them the Support page has their people.',
      'You can ask the app to run ONE of its own commands by adding a final line exactly like: DO: <command>. The app shows it as a button the user taps to confirm. Commands it understands include: ' + HELP_GROUPS.map(function (g) { return g[1].join('; '); }).join('; ') + '. Only use DO: when the user clearly wants that action. Never claim you already did it.',
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
        body: JSON.stringify({ model: b.model || 'claude-haiku-4-5', max_tokens: 700, system: systemPrompt(), messages: msgs }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error.message); return (j.content || []).map(function (c) { return c.text || ''; }).join(''); });
    } else {
      var base = (b.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      req = fetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + b.key },
        body: JSON.stringify({ model: b.model || 'gpt-4o-mini', max_tokens: 500, messages: [{ role: 'system', content: systemPrompt() }].concat(msgs) }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error.message || 'error'); return j.choices[0].message.content; });
    }
    req.then(function (out) {
      thinking.remove();
      var raw = String(out || '');
      var dm = raw.match(/^\s*DO:\s*(.+)\s*$/m);
      var t = clean(raw.replace(/^\s*DO:.*$/m, ''));
      var btns = dm ? [{ label: 'Do it: ' + clean(dm[1]).slice(0, 60), cls: 'btn-primary', fn: function () { handle(clean(dm[1])); } }] : null;
      if (hasCrisis(text)) { handle(text, false); return; }
      reply({ text: t, lines: ['(Answered by my smarter brain. Check important facts with a professional.)'], buttons: btns });
    }).catch(function (e) {
      thinking.remove();
      reply({ text: 'My smarter brain could not answer right now (' + String(e && e.message || e).slice(0, 80) + '). I can still help with commands and my research notes.' });
    });
  }

  /* ---------------- Google: Gmail + Calendar (real connection, opt-in) ----------------
   * Uses Google's own sign-in popup (Google Identity Services). Scopes:
   *   gmail.readonly  — count unread, read the newest, search
   *   gmail.compose   — save DRAFTS only (Rootling never presses send)
   *   calendar.events — read your events and add ones you confirm
   * The access pass lives in memory only (about 1 hour) and is never saved.
   * The Client ID comes from config.js (set once by the app owner) or from
   * Settings on this device. */
  var GSCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events';
  function googleClientId() { return clean(sec.googleClientId || (window.ROOTLING_CONFIG && window.ROOTLING_CONFIG.googleClientId) || ''); }
  function googleReady() { return !!googleClientId() && !!st.settings.googleOn; }
  function loadGis(cb) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) { cb(); return; }
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = cb; s.onerror = function () { reply({ text: 'I could not load Google sign-in. Check your connection.' }); };
    document.head.appendChild(s);
  }
  var pendingGoogle = [];
  function withGoogle(fn) {
    if (googleToken && googleToken.exp > Date.now()) { fn(googleToken.t); return; }
    if (!googleClientId()) { googleSetupHelp(); return; }
    pendingGoogle.push(fn);
    if (pendingGoogle.length > 1) return;
    loadGis(function () {
      try {
        var client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId(), scope: GSCOPES,
          callback: function (resp) {
            var q = pendingGoogle; pendingGoogle = [];
            if (resp && resp.access_token) {
              googleToken = { t: resp.access_token, exp: Date.now() + (Number(resp.expires_in || 3500) - 60) * 1000 };
              if (!st.settings.googleOn) { st.settings.googleOn = true; save(); renderGoogleBtn(); reply({ text: 'Google is connected. I can read your inbox, save drafts, and see and add calendar events \u2014 only when you ask.', lines: [xpGive(5, 'connected google')].filter(Boolean) }); }
              q.forEach(function (f) { f(resp.access_token); });
            } else reply({ text: 'Google did not give permission, so I did not read anything.' });
          },
          error_callback: function () { pendingGoogle = []; reply({ text: 'The Google window closed before finishing. Nothing was shared.' }); }
        });
        client.requestAccessToken({ prompt: st.settings.googleOn ? '' : 'consent' });
      } catch (e) { pendingGoogle = []; reply({ text: 'Google sign-in did not start. Check the Client ID in Settings.' }); }
    });
  }
  function googleSetupHelp() {
    reply({ text: 'To connect Gmail and Google Calendar, this app needs a Google Client ID (a free, one-time setup by the app owner).',
      ordered: true, list: ['Go to console.cloud.google.com and make a project.', 'Turn on the Gmail API and the Google Calendar API.', 'OAuth consent screen: External, then add your Google address as a test user.', 'Credentials \u2192 Create OAuth Client ID \u2192 Web application. Add https://squirrel42072000-design.github.io under Authorized JavaScript origins.', 'Paste the Client ID in Settings \u2192 Ask your pet \u2192 Google.'],
      buttons: [{ label: 'Open Google Cloud console', fn: function () { openUrl('https://console.cloud.google.com/apis/credentials'); } }, { label: 'Go to Settings', cls: 'btn-ghost', fn: function () { nav('support'); var c = $('ask-settings-card'); if (c) c.scrollIntoView(); } }] });
  }
  function googleConnect() {
    if (googleToken && googleToken.exp > Date.now()) { reply({ text: 'Google is connected.', buttons: [{ label: 'Disconnect Google', cls: 'btn-ghost', fn: googleDisconnect }] }); return; }
    withGoogle(function () { /* the callback announces it */ });
  }
  function googleDisconnect() {
    try { if (googleToken && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(googleToken.t, function () {}); } catch (e) { /* fine */ }
    googleToken = null; st.settings.googleOn = false; save(); renderGoogleBtn();
    reply({ text: 'Google is disconnected. I removed my access.' });
  }
  function renderGoogleBtn() {
    var b = $('ask-google-btn'); if (!b) return;
    b.textContent = st.settings.googleOn ? 'Google connected \u2713' : 'Connect Gmail + Calendar';
    b.setAttribute('aria-pressed', st.settings.googleOn ? 'true' : 'false');
  }
  function gget(url, tok) { return fetch(url, { headers: { authorization: 'Bearer ' + tok } }).then(function (r) { if (r.status === 401) { googleToken = null; } if (!r.ok) throw new Error('Google said ' + r.status); return r.json(); }); }
  function gpost(url, tok, body) { return fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { if (!r.ok) throw new Error('Google said ' + r.status); return r.json(); }); }
  function hdrs(m) { var h = {}; (m.payload && m.payload.headers || []).forEach(function (x) { h[x.name] = x.value; }); return h; }
  function fromName(f) { return String(f || '').replace(/<.*>/, '').replace(/"/g, '').trim() || String(f || ''); }
  function decodeEntities(t) { var e = document.createElement('textarea'); e.innerHTML = t || ''; return e.value; }
  function msgList(tok, q, max) {
    return gget('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + (max || 5) + '&q=' + encodeURIComponent(q), tok).then(function (res) {
      var ids = (res.messages || []).map(function (m) { return m.id; });
      return Promise.all(ids.map(function (id) { return gget('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date', tok); }));
    });
  }
  function msgNodes(msgs) {
    return msgs.map(function (m) {
      var h = hdrs(m), w = el('div', 'ask-mail');
      w.appendChild(el('p', 'ask-mail-from', fromName(h.From) + ' \u2014 ' + (h.Subject || '(no subject)')));
      if (m.snippet) w.appendChild(el('p', 'gentle small', decodeEntities(m.snippet).slice(0, 160)));
      w.appendChild(link('Open in Gmail', 'https://mail.google.com/mail/u/0/#inbox/' + m.id));
      return w;
    });
  }
  function googleEmail() {
    withGoogle(function (tok) {
      var thinking = reply({ text: 'Checking your inbox\u2026' });
      Promise.all([gget('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', tok), msgList(tok, 'is:unread in:inbox', 5)]).then(function (r) {
        thinking.remove();
        var unread = r[0].messagesUnread || 0;
        reply({ text: unread ? 'You have ' + unread + ' unread email' + (unread === 1 ? '' : 's') + '.' + (r[1].length ? ' The newest:' : '') : 'No unread email. Your inbox is calm.',
          list: r[1].length ? msgNodes(r[1]) : null,
          buttons: [{ label: 'Open Gmail', fn: function () { openUrl(MAIL.gmail.url); } }, { label: 'Inbox in small steps', cls: 'btn-ghost', fn: inboxSteps }],
          lines: [unread > 20 ? 'That is a lot. You do not have to read them all. Just the newest 5 is a win.' : '', xpGive(1, 'checked email')].filter(Boolean) });
      }).catch(function (e) { thinking.remove(); reply({ text: 'I could not read your inbox (' + e.message + '). I opened Gmail instead.' }); openUrl(MAIL.gmail.url); });
    });
  }
  function googleSearch(q) {
    withGoogle(function (tok) {
      var thinking = reply({ text: 'Searching your email for \u201c' + q + '\u201d\u2026' });
      msgList(tok, q, 6).then(function (msgs) {
        thinking.remove();
        reply({ text: msgs.length ? 'I found these:' : 'I did not find email matching \u201c' + q + '\u201d.', list: msgs.length ? msgNodes(msgs) : null });
      }).catch(function (e) { thinking.remove(); reply({ text: 'Search did not work (' + e.message + ').' }); });
    });
  }
  function bodyText(payload) {
    var out = '';
    (function walk(p) {
      if (!p || out) return;
      if (p.mimeType === 'text/plain' && p.body && p.body.data) { try { out = decodeURIComponent(escape(atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')))); } catch (e) { out = ''; } return; }
      (p.parts || []).forEach(walk);
    })(payload);
    return out;
  }
  function googleReadNewest() {
    withGoogle(function (tok) {
      gget('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=' + encodeURIComponent('in:inbox'), tok).then(function (r) {
        if (!r.messages || !r.messages.length) { reply({ text: 'Your inbox is empty.' }); return null; }
        return gget('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + r.messages[0].id + '?format=full', tok);
      }).then(function (m) {
        if (!m) return;
        var h = hdrs(m), body = clean(bodyText(m.payload) || decodeEntities(m.snippet));
        var short = body.length > 700 ? body.slice(0, 697).replace(/\s+\S*$/, '') + '\u2026' : body;
        reply({ text: 'From ' + fromName(h.From) + ': \u201c' + (h.Subject || '(no subject)') + '\u201d', lines: [short],
          buttons: [{ label: 'Reply with ready words', fn: function () { var addr = (String(h.From).match(/<(.+)>/) || [0, h.From])[1]; doEmailWrite(addr); } }, { label: 'Open in Gmail', cls: 'btn-ghost', fn: function () { openUrl('https://mail.google.com/mail/u/0/#inbox/' + m.id); } }] });
      }).catch(function (e) { reply({ text: 'I could not open your newest email (' + e.message + ').' }); });
    });
  }
  function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function googleDraft(to, subject, body) {
    withGoogle(function (tok) {
      var raw = 'To: ' + (to || '') + '\r\nSubject: ' + (subject || '') + '\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n' + (body || '');
      gpost('https://gmail.googleapis.com/gmail/v1/users/me/drafts', tok, { message: { raw: b64url(raw) } }).then(function (d) {
        reply({ text: 'Draft saved in Gmail. It has NOT been sent.', lines: ['Open it, read it once, and press send when you are ready.', xpGive(2, 'drafted email')].filter(Boolean),
          buttons: [{ label: 'Open my drafts', cls: 'btn-primary', fn: function () { openUrl('https://mail.google.com/mail/u/0/#drafts?compose=' + (d.message && d.message.id || '')); } }] });
      }).catch(function (e) { reply({ text: 'I could not save the draft (' + e.message + ').' }); });
    });
  }
  function calRange(raw) {
    var s = new Date(); s.setHours(0, 0, 0, 0); var e = new Date(s.getTime()); var label = 'today';
    if (/tomorrow/.test(raw)) { s.setDate(s.getDate() + 1); e = new Date(s.getTime()); label = 'tomorrow'; }
    else if (/week/.test(raw)) { e.setDate(e.getDate() + 6); label = 'the next 7 days'; }
    else { var d = parseDay(raw); if (d) { s = d; e = new Date(d.getTime()); label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); } }
    e.setHours(23, 59, 59, 999);
    return { s: s, e: e, label: label };
  }
  function googleCalendar(raw) {
    var rg = calRange(low(raw || ''));
    withGoogle(function (tok) {
      gget('https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=' + encodeURIComponent(rg.s.toISOString()) + '&timeMax=' + encodeURIComponent(rg.e.toISOString()), tok)
        .then(function (j) {
          var multi = rg.label === 'the next 7 days';
          var items = (j.items || []).map(function (ev) {
            var st0 = ev.start && (ev.start.dateTime || ev.start.date); var d = new Date(st0);
            var day = multi ? d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' : '';
            return day + (ev.start && ev.start.dateTime ? fmt(d.getHours(), d.getMinutes()) : 'All day') + ' \u2014 ' + (ev.summary || 'Busy');
          });
          reply({ text: items.length ? 'Your Google Calendar for ' + rg.label + ':' : 'Nothing on your Google Calendar for ' + rg.label + '.', list: items.length ? items : null, ordered: true,
            lines: items.length > 5 ? ['That is a full day. Pick the one thing that matters most and protect some rest.'] : null });
        }).catch(function (er) { reply({ text: 'I could not read your calendar (' + er.message + ').' }); });
    });
  }
  function googleAddEvent(title, start, end) {
    withGoogle(function (tok) {
      var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/New_York';
      gpost('https://www.googleapis.com/calendar/v3/calendars/primary/events', tok, { summary: title, start: { dateTime: start.toISOString(), timeZone: tz }, end: { dateTime: end.toISOString(), timeZone: tz }, reminders: { useDefault: true } })
        .then(function (ev) { reply({ text: 'Added to your Google Calendar: ' + title + '.', lines: [xpGive(2, 'calendar event')].filter(Boolean), buttons: ev.htmlLink ? [{ label: 'Open the event', cls: 'btn-ghost', fn: function () { openUrl(ev.htmlLink); } }] : null }); })
        .catch(function (e) { reply({ text: 'I could not add it to Google Calendar (' + e.message + ').' }); });
    });
  }

  /* email commands that work with OR without Google */
  function doEmailDraft(raw, orig) {
    var m = orig.match(/\bto ([^\s]+(?: [A-Z][a-z]+)?)\b/) || orig.match(/\bto (\w+)/i);
    var name = m ? m[1] : '';
    var body = (orig.match(/\b(?:saying|that says|to say)\b[:,]?\s*(.+)$/i) || [])[1] || '';
    var about = (orig.match(/\babout\b\s*(.+?)(?:\s+saying\b|$)/i) || [])[1] || '';
    var p = findPerson(name); var addr = p && p.email ? p.email : (/@/.test(name) ? name : '');
    var subject = about ? about.charAt(0).toUpperCase() + about.slice(1) : (body ? body.split(/[.!?]/)[0].slice(0, 60) : '');
    var full = (p ? 'Hi ' + p.name + ',' : 'Hi,') + '\n\n' + (body ? body.charAt(0).toUpperCase() + body.slice(1) + (/[.!?]$/.test(body) ? '' : '.') : '') + '\n\nThanks,';
    if (googleReady()) { googleDraft(addr, subject, full); return; }
    openUrl(mailCompose(addr, subject, full));
    reply({ text: 'I opened a new email' + (addr ? ' to ' + (p ? p.name : addr) : '') + ' with your words. Nothing was sent.', lines: [!addr && name ? 'I do not have an email for ' + name + '. Add them with \u201cadd a person\u201d.' : ''].filter(Boolean) });
  }
  function doEmailSearch(orig) {
    var m = orig.match(/e-?mails? (?:from|about) (.+)$/i) || orig.match(/(?:search|find|look for|look up)\s+(?:my\s+)?(?:e-?mails?|inbox|gmail)\s+(?:for\s+)?(.+)$/i) || orig.match(/(?:search|find|look for)\s+(.+?)\s+in\s+my\s+(?:e-?mail|inbox)/i);
    var q = m ? clean(m[1]).replace(/[?!.]+$/, '') : '';
    if (/from/i.test(orig) && q && !/^from:/.test(q)) q = 'from:' + q.replace(/\s+/g, '');
    if (!q) { reply({ text: 'What should I look for?', node: miniInput('Like: invoice, or from Sam', function (v) { doEmailSearch('search my email for ' + v); }) }); return; }
    if (googleReady()) { googleSearch(q); return; }
    openUrl('https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(q));
    reply({ text: 'I opened Gmail search for \u201c' + q + '\u201d.', lines: ['Connect Google and I can show results right here.'] });
  }
  function doEmailRead() {
    if (googleReady()) { googleReadNewest(); return; }
    reply({ text: 'To read your newest email to you, connect Gmail first.', buttons: [{ label: 'Connect Gmail + Calendar', cls: 'btn-primary', fn: googleConnect }, { label: 'Just open my email', cls: 'btn-ghost', fn: doEmailCheck }] });
  }

  /* ------------------------------------------------------------------
   * Main handler
   * ------------------------------------------------------------------ */
  var aliasDepth = 0;
  function handle(text, fromUser) {
    var t = clean(text);
    if (!t) return;
    if (fromUser !== false) { addUser(t); try { if (window.RootlingMood && window.RootlingMood.noteText) window.RootlingMood.noteText(t); } catch (e) { /* mood watch is a help */ } }
    var r = route(t, aliasDepth < 2 ? st.learn.aliases : null);
    if (r.id === 'alias') { learnUse('alias'); aliasDepth++; try { handle(r.slots[0], false); } finally { aliasDepth--; } return; }
    learnUse(r.id);
    var raw = low(t);
    var todayK = new Date().toDateString();
    if (st.lastDay !== todayK && r.id !== 'crisis') { st.lastDay = todayK; save(); setTimeout(function () { var x = xpGive(2, 'said hello today'); if (x) petLine(petName() + ' is happy you came by. ' + x); }, 50); }
    switch (r.id) {
      case 'crisis':
        reply({ text: 'I am really glad you told me. You deserve support from a person right now.', lines: ['In the US, call or text 988 \u2014 the Suicide and Crisis Lifeline. Any time, day or night.', 'If you are in danger right now, call 911.'],
          buttons: [{ label: 'Call 988', cls: 'btn-primary', fn: function () { window.location.href = 'tel:988'; } }, { label: 'Text 988', fn: function () { window.location.href = 'sms:988'; } }, { label: 'Open my Support page', fn: openSafety }] });
        return;
      case 'help': doHelp(); return;
      case 'moodWatch': doMoodWatch(raw); return;
      case 'moodCheck': doMoodCheck(); return;
      case 'moodLift': doLift(); return;
      case 'goodThings': doGoodThings(raw); return;
      case 'moodTrend': doMoodTrend(); return;
      case 'moodKind': doMoodKind(raw); return;
      case 'depressed': doDepressed(); return;
      case 'urgentBody': doUrgentBody(raw); return;
      case 'timeNow': doTimeNow(raw); return;
      case 'daysUntil': doDaysUntil(r.slots[3]); return;
      case 'percent': doPercent(r.slots[0], r.slots[1]); return;
      case 'tip': doTip(r.slots[0] || r.slots[1]); return;
      case 'convert': doConvert(raw); return;
      case 'math': doMath(r.slots[0]); return;
      case 'coin': doCoin(); return;
      case 'dice': doDice(raw); return;
      case 'randomNum': doRandom(r.slots[2], r.slots[3]); return;
      case 'choose': doChoose(r.slots[0] || r.slots[2], r.slots[1] || r.slots[3]); return;
      case 'joke': doJoke(); return;
      case 'affirm': doAffirm(); return;
      case 'stopwatch': doStopwatch(raw); return;
      case 'readAloud': doReadAloud(); return;
      case 'emailDraft': doEmailDraft(raw, t); return;
      case 'emailRead': doEmailRead(); return;
      case 'emailSearch': doEmailSearch(t); return;
      case 'calAdd': doCalAdd(t); return;
      case 'listAdd': doListAdd(r.slots[0] || r.slots[2], r.slots[1] || 'shopping'); return;
      case 'listRemove': doListRemove(r.slots[0], r.slots[1]); return;
      case 'listClear': doListClear(r.slots[0]); return;
      case 'listShow': doListShow(r.slots[0] || r.slots[1]); return;
      case 'medsTook': doMedsTook(raw); return;
      case 'medsCheck': doMedsCheck(raw); return;
      case 'waterLog': doWaterLog(raw); return;
      case 'journal': doJournal(r.slots[1] || ''); return;
      case 'journalShow': doJournalShow(); return;
      case 'walkStart': doWalkStart(); return;
      case 'walkStop': doWalkStop(); return;
      case 'stepGoal': doStepGoal(r.slots[0] || r.slots[1]); return;
      case 'stepsLog': doStepsLog(raw, r.slots[0] || r.slots[1] || r.slots[3]); return;
      case 'stepsAsk': doStepsAsk(); return;
      case 'workoutLog': doWorkoutLog(raw, r.slots); return;
      case 'workout': doWorkout(raw); return;
      case 'stretch': playWorkout('stretch'); return;
      case 'pursedLip': doPursedLip(); return;
      case 'fitness': doFitness(); return;
      case 'studies': doStudies(r.slots[2]); return;
      case 'directions': doDirections(r.slots[0] || r.slots[1], !r.slots[0]); return;
      case 'translate': doTranslate(r.slots[0] || r.slots[2], r.slots[1] || r.slots[3]); return;
      case 'define': doDefine(r.slots[0] || r.slots[1]); return;
      case 'news': doNews(); return;
      case 'checkin': nav('home'); reply({ text: 'Your daily check-in is on Home, just above me. Mood, water, movement, and sleep each help me grow.' }); return;
      case 'learned': doLearned(); return;
      case 'forget': doForget(); return;
      case 'teach': { var m = t.match(/^when i say (.+?)[,]? (?:i mean|it means|do|open|that means) (.+)$/i); if (m) doTeach(m[1], m[2]); return; }
      case 'emailCheck': doEmailCheck(); return;
      case 'emailWrite': doEmailWrite(r.slots[2]); return;
      case 'calendar': doCalendar(raw); return;
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
        if (st.lastTopic && /\b(that|it|this)\b/.test(raw) && /\b(help|treat|symptom|cope|more)\b/.test(raw)) { doResearch(t); return; }
        if (brainOn()) { askBrain(t); return; }
        unknown(t);
    }
  }

  /* Did not understand: offer best guesses. Picking one TEACHES the pet. */
  function unknown(t) {
    var opts = ['Check my email', 'Plan my day', 'I can\u2019t start', 'I feel anxious', 'Remind me', 'Breathe with me'];
    reply({ text: 'I am not sure what you meant yet. Did you mean one of these? If you pick one, I will remember it for next time.',
      buttons: opts.map(function (o) { return { label: o, fn: function () { st.learn.aliases[low(t).replace(/[?!.]+$/, '')] = o; st.learn.xp += 2; save(); handle(o, false); } }; }),
      lines: brainOn() ? null : [privacyMode() ? 'Privacy Mode is on, so I answer on this device only.' : 'Tip: you can give me a smarter AI brain in Settings for open questions.'] });
  }

  function suggestions() {
    var out = [];
    var habit = helperLevel(st.learn.xp).level >= 2 ? habitsNow() : [];
    habit.forEach(function (id) { if (CHIP_FOR[id] && out.indexOf(CHIP_FOR[id]) === -1) out.push(CHIP_FOR[id]); });
    var h = new Date().getHours();
    var base = h < 11 ? ['Plan my day', 'Check my email', 'What\u2019s the weather?'] : h < 17 ? ['Focus with me for 15 minutes', 'I can\u2019t start', 'Check my email'] : h < 21 ? ['Plan my day', 'I am exhausted', 'Breathe with me'] : ['Help me wind down', 'Breathe with me', 'Park a thought'];
    try {
      var fs = window.RootlingFitness && window.RootlingFitness.summary();
      if (fs && h >= 11 && h < 20 && fs.today.steps < fs.goal.steps) base.splice(1, 0, 'Start a walk');
      if (fs && h >= 7 && h < 20 && fs.week.minutes < fs.goal.minutes / 2) base.push('Give me a workout');
    } catch (e) { /* fitness is optional */ }
    userTopics().forEach(function (tp) { (TOPIC_CHIPS[tp] || []).slice(0, 2).forEach(function (c) { if (base.indexOf(c) === -1) base.push(c); }); });
    try { var ml = moodLevel(); if (ml !== 'none') base.unshift('Lift my mood'); if (ml === 'concern') base.splice(1, 0, 'Mood check'); else if (h >= 19) base.push('Three good things'); } catch (e) { /* mood is optional */ }
    base.concat(['What does research say about ADHD?', 'What can you do?']).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
    return out.slice(0, 7);
  }
  function renderChips() {
    var box = $('ask-chips'); if (!box) return;
    box.innerHTML = '';
    if (!st.settings.proactive) return;
    suggestions().forEach(function (c) { box.appendChild(button(c, 'btn-chip', function () { handle(c); })); });
    var lv = $('ask-level');
    if (lv) {
      var L = helperLevel(st.learn.xp), ps = petState(), today = ps && ps.bonusXp && ps.bonusXp.date === new Date().getFullYear() + '-' + ('0' + (new Date().getMonth() + 1)).slice(-2) + '-' + ('0' + new Date().getDate()).slice(-2) ? ps.bonusXp.pts : 0;
      lv.textContent = 'Helper level ' + L.level + ' \u00b7 ' + L.name;
      var xpEl = $('ask-xp'); if (xpEl) xpEl.textContent = (ps ? ps.sunshine : 0) + ' growth points \u00b7 +' + today + '/30 from helping today';
    }
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
      gmsg.textContent = sec.googleClientId ? 'Saved. Tap \u201cConnect Gmail + Calendar\u201d on Home, or say \u201ccheck my email\u201d. Google will ask you to allow access.' : 'Using the app\u2019s built-in Google setup, if it has one.';
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
    var gb = $('ask-google-btn'); if (gb) gb.addEventListener('click', function () { if (st.settings.googleOn && googleToken && googleToken.exp > Date.now()) googleConnect(); else if (googleClientId()) withGoogle(function () { if (st.settings.googleOn) reply({ text: 'Google is connected.' }); }); else googleSetupHelp(); });
    renderGoogleBtn();
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
    setTimeout(function () { try { moodNudge(); } catch (e) { /* mood is a help */ } }, 1500);
  }

  root.ROOTLING_ASSISTANT = pure;
  root.RootlingAssistant = { googleReady: googleReady, handle: handle, key: KEY, getStore: function () { return st; }, reload: function () { st = load(); renderChips(); return st; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
