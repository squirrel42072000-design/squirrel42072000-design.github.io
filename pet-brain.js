/* pet-brain.js — the pet's local brain (v11): intent parsing for orders
 * and chat, plus on-device replies. This is the always-available
 * intelligence layer — offline, private, instant. When the connected
 * layer is on and Privacy Mode is off, app.js may ask the AI engine for
 * richer answers; orders that DO something in the app are always
 * handled here first, on-device.
 *
 * Orders the pet understands (Daniel's spec: "help in as many ways as
 * possible with orders such as 'Check my email'"):
 *   check my email · what is today · I can't start · what would help
 *   I drank water · I feel good/okay/rough · why do you suggest … ·
 *   when did I … (memory search) · what can you do
 */
(function (root) {
  'use strict';

  var CRISIS_WORDS = ['kill myself', 'suicide', 'end my life', 'hurt myself', 'self harm', 'want to die', 'end it all'];
  var CRISIS_REPLY = 'I am glad you told me. Help is here now: call or text 988 any time, day or night. Your support tools and your people are in the Support tab. I am staying right here with you.';

  function norm(text) { return ' ' + String(text || '').toLowerCase().replace(/[?.!,;:""]/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }

  var MOOD_WORDS = [
    { words: ['great', 'amazing', 'fantastic'], value: 5 },
    { words: ['good', 'pretty good', 'fine'], value: 4 },
    { words: ['okay', 'ok', 'alright', 'meh'], value: 3 },
    { words: ['low', 'down', 'sad', 'tired'], value: 2 },
    { words: ['rough', 'struggling', 'awful', 'bad', 'terrible'], value: 1 }
  ];

  function parseIntent(text) {
    var t = norm(text);
    var raw = String(text || '').trim();
    for (var i = 0; i < CRISIS_WORDS.length; i++) {
      if (t.indexOf(' ' + CRISIS_WORDS[i]) !== -1 || t.indexOf(CRISIS_WORDS[i] + ' ') !== -1) return { kind: 'crisis' };
    }
    if (/(check|read|fetch|get|any new|look at).*(email|mail|inbox)/.test(t) || t.indexOf(' my email ') !== -1 || t.indexOf(' my mail ') !== -1) return { kind: 'check-email' };
    if (t.indexOf(' ask memory ') !== -1 || t.indexOf(' when did ') !== -1 || t.indexOf(' when was ') !== -1 || t.indexOf(' what did i ') !== -1 || t.indexOf(' do you remember ') !== -1) {
      return { kind: 'memory-search', query: raw };
    }
    if (t.indexOf(" can't start ") !== -1 || t.indexOf(' cant start ') !== -1 || t.indexOf(' stuck ') !== -1 || t.indexOf(' overwhelmed ') !== -1 || t.indexOf(' too much ') !== -1 || t.indexOf(' where to start ') !== -1) return { kind: 'cant-start' };
    if (t.indexOf(' what would help ') !== -1 || t.indexOf(' what should i do ') !== -1 || t.indexOf(' help me ') !== -1) return { kind: 'help-now' };
    if (((t.indexOf(' drank ') !== -1 || t.indexOf(' drink ') !== -1 || t.indexOf(' had ') !== -1) &&
         (t.indexOf(' water ') !== -1 || t.indexOf(' glass ') !== -1 || t.indexOf(' glasses ') !== -1)) ||
        t.indexOf(' log water ') !== -1) {
      var wm = raw.match(/(\d+)\s*glass/);
      return { kind: 'log-water', amount: wm ? Number(wm[1]) : 1 };
    }
    var stepMatch = raw.match(/(\d[\d,]*)\s*steps/i);
    if (stepMatch || t.indexOf(' log steps ') !== -1 || t.indexOf(' add steps ') !== -1) {
      return { kind: 'log-steps', amount: stepMatch ? Number(stepMatch[1].replace(/,/g, '')) : 500 };
    }
    if (t.indexOf(' how many steps ') !== -1 || t.indexOf(' my steps ') !== -1) return { kind: 'steps-query' };
    if (t.indexOf(' i walked ') !== -1 || t.indexOf(' went for a walk ') !== -1 || t.indexOf(' i exercised ') !== -1 || t.indexOf(' did exercise ') !== -1 || t.indexOf(' worked out ') !== -1) return { kind: 'log-exercise' };
    if (t.indexOf(' i slept ') !== -1 || t.indexOf(' slept ') !== -1 && t.indexOf(' hours ') !== -1) {
      var sm = raw.match(/(\d+(?:\.\d+)?)\s*hours/i);
      return { kind: 'log-sleep', hours: sm ? Number(sm[1]) : null };
    }
    if (t.indexOf(' breathe ') !== -1 || t.indexOf(' calm me ') !== -1 || t.indexOf(' calm down ') !== -1 || t.indexOf(' ground me ') !== -1) return { kind: 'breathe' };
    if (t.indexOf(' what time ') !== -1) return { kind: 'time' };
    if (t.indexOf(' good night ') !== -1 || t.indexOf(' goodnight ') !== -1) return { kind: 'goodnight' };
    var navMatch = raw.match(/(?:open|go to|show|take me to)\s+(?:the\s+)?(support|settings|focus|home|companion|activities|today)/i);
    if (navMatch) return { kind: 'nav', view: navMatch[1].toLowerCase() };
    if (t.indexOf(' i feel ') !== -1 || t.indexOf(" i'm feeling ") !== -1 || t.indexOf(' im feeling ') !== -1 || t.indexOf(' feeling ') !== -1) {
      for (var m = 0; m < MOOD_WORDS.length; m++) {
        for (var w = 0; w < MOOD_WORDS[m].words.length; w++) {
          if (t.indexOf(' ' + MOOD_WORDS[m].words[w] + ' ') !== -1 || t.indexOf(' ' + MOOD_WORDS[m].words[w] + '.') !== -1) {
            return { kind: 'log-mood', moodValue: MOOD_WORDS[m].value };
          }
        }
      }
      return { kind: 'log-mood', moodValue: 3 };
    }
    if (t.indexOf(' why do you ') !== -1 || t.indexOf(' tell me about ') !== -1 || t.indexOf(' explain ') !== -1) return { kind: 'explain', query: raw };
    if ((t.indexOf(' what ') !== -1 && t.indexOf(' today ') !== -1) || t.indexOf(' my day ') !== -1 || t.indexOf(" what's next ") !== -1 || t.indexOf(' whats next ') !== -1) return { kind: 'today' };
    if (t.indexOf(' what can you do ') !== -1 || t.indexOf(' your abilities ') !== -1) return { kind: 'capabilities' };
    if (/^ (hi|hello|hey|morning|good morning|good afternoon) /.test(t)) return { kind: 'greeting' };
    if (t.indexOf(' thank ') !== -1) return { kind: 'thanks' };
    return { kind: 'chat' };
  }

  function evWords(evidence) {
    var strength = evidence && typeof evidence === 'object' ? evidence.strength : evidence;
    if (strength === 'High' || strength === 'strong') return 'A lot of research backs this.';
    if (strength === 'Moderate' || strength === 'some') return 'Research backs this.';
    return 'People often find this helps.';
  }

  /* Local replies for the kinds that need no action. facts comes from
   * app.js (real app state only — this file invents nothing). */
  function localReply(intent, facts) {
    var f = facts || {};
    switch (intent.kind) {
      case 'crisis': return CRISIS_REPLY;
      case 'today': {
        var parts = [];
        if (f.nextText) parts.push('Your next thing: ' + f.nextText + '.');
        if (typeof f.doneTypes === 'number') parts.push('Check-ins done today: ' + f.doneTypes + ' of 4.');
        if (f.momentumWord) parts.push('Today so far: ' + f.momentumWord.toLowerCase() + '.');
        return parts.length ? parts.join(' ') : 'Today is open. Any tiny thing counts.';
      }
      case 'help-now': return f.helpText ? (f.helpText + ' ' + (f.helpWhy || '')) : 'Take one small step. Any small step.';
      case 'cant-start': return 'No problem. Let\'s shrink it — I opened the I Can\'t Start card for you. Pick the easiest tiny step.';
      case 'capabilities': return 'I can: check your email when it is connected, tell you about today, shrink a big task with I Can\'t Start, log water, feelings, steps, walks, and sleep when you tell me, open the calm tools ("Breathe with me"), jump to a tab ("Open Focus"), explain why I suggest things, and search what I remember. Try: "Check my email", "Log 500 steps", or "I slept 7 hours".';
      case 'steps-query': return (typeof f.stepsToday === 'number')
        ? 'Steps today: ' + f.stepsToday + (f.stepsGoal ? ' of your ' + f.stepsGoal + ' goal' : '') + '. Every step counts.'
        : 'No steps logged yet today. A short walk counts too.';
      case 'time': return f.timeText ? 'It is ' + f.timeText + '.' : null;
      case 'goodnight': return 'Good night. Rest is care too. I will be right here in the morning.';
      case 'breathe': return 'I opened the calm tools for you. Slow breaths, with a longer breath out. I am right here.';
      case 'nav': return 'Done — I opened it for you.';
      case 'greeting': return 'Hello! I am here. Want to see today, or check your email?';
      case 'thanks': return 'You are welcome. I am glad to be your pet.';
      case 'explain': return f.explainText || 'I suggest things from patterns in your own check-ins, matched with ideas research supports. Your Learned list shows what I noticed.';
      case 'memory-search': return (f.memoryHits && f.memoryHits.length) ? 'Here is what I remember: ' + f.memoryHits.slice(0, 3).join(' · ') : 'I could not find that in what I remember yet. My memory grows as we spend days together.';
      default: return null; /* 'chat' → AI engine or warm fallback in app.js */
    }
  }

  var api = {
    parseIntent: parseIntent, localReply: localReply, evWords: evWords,
    CRISIS_REPLY: CRISIS_REPLY
  };
  root.ROOTLING_BRAIN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
