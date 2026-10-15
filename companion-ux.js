/* companion-ux.js — Rootling companion experience helpers (v10, from
 * Daniel's UX upgrade prompt, 2026-10-15: Today Screen, I Can't Start,
 * Burnout Recovery Mode, celebrations, What Would Help Right Now).
 * Pure functions; app.js owns state and DOM.
 *
 * Translation (Daniel's standing rules): momentum is computed with the
 * source formula but SHOWN AS WORDS, never a percentage — no score
 * pressure on the person. All copy is Grade 3–5, supportive only.
 */
(function (root) {
  'use strict';

  function getGreeting(hour) {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /* Source formula: 50 + 5 per thing finished today − 2 per open loop,
   * clamped 0–100. The number stays inside; users see words. */
  function momentumScore(s) {
    var v = 50 + (s.completedToday || 0) * 5 - (s.openLoops || 0) * 2;
    return Math.max(0, Math.min(100, v));
  }
  function momentumWords(score) {
    if (score < 35) return 'A fresh start';
    if (score < 55) return 'Warming up';
    if (score < 75) return 'Steady going';
    return 'A strong day';
  }

  /* I Can't Start: shrink the task. First step names the task itself;
   * the rest are tiny on purpose. */
  function generateMicroSteps(title) {
    var t = (title || 'your task').trim();
    if (t.length > 42) t = t.slice(0, 42);
    return [
      'Open ' + t,
      'Read the first bit',
      'Write one sentence',
      'Save your work'
    ];
  }

  function shouldEnterRecoveryMode(band) {
    return band === 'orange' || band === 'red';
  }
  function getRecoverySuggestions() {
    return [
      'Drink some water',
      'Take a short walk',
      'Make today about one thing only',
      'Take a 10 minute break',
      'Move the rest to tomorrow — your pet will hold them'
    ];
  }
  function getCompanionMessage(recoveryMode) {
    return recoveryMode ? "Let's protect your energy today." : "Let's make progress today.";
  }

  /* What Would Help Right Now: exactly ONE suggestion, with its why. */
  function whatWouldHelp(s) {
    var inp = s || {};
    if (inp.band === 'red') return { text: 'Take a short break.', why: 'Your pet noticed signs of overload. Rest first.' };
    if ((inp.openLoops || 0) > 5) return { text: 'Finish the smallest thing on your list.', why: 'A small finish can make the pile feel lighter.' };
    if (inp.energyLow) return { text: 'Drink some water and stretch.', why: 'Your body asked for a reset.' };
    if (inp.nextText) return { text: 'Work on: ' + inp.nextText, why: 'It is your one thing for today.' };
    return { text: 'Pick one tiny thing. Any tiny thing counts.', why: 'Small starts build steady days.' };
  }

  /* Celebration engine: companion reactions, never points. Inputs are
   * facts app.js verified (counts, streaks, waits) — this file only
   * words them. */
  function checkCelebrations(s) {
    var out = [];
    var inp = s || {};
    if (inp.firstFinish) out.push('Your first finish! Your pet is so proud.');
    if (typeof inp.longWaitDays === 'number' && inp.longWaitDays >= 7 && inp.longWaitTitle) {
      out.push('You finished "' + inp.longWaitTitle + '" — something you had been putting off for ' + inp.longWaitDays + ' days. That is huge.');
    }
    if ((inp.completedToday || 0) >= 3) out.push('You finished ' + inp.completedToday + ' things today. Lovely work.');
    if (inp.streakDays === 5) out.push('Five days in a row of showing up. Your pet noticed.');
    if (inp.streakDays === 7) out.push('Seven days in a row. A whole week of showing up.');
    return out;
  }

  /* Pet experience (v12): the pet earns experience when it helps. The
   * level is the pet's growth — displayed proudly, never a user score. */
  var XP_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 4000];
  function xpLevel(xp) {
    var lvl = 1;
    for (var i = 0; i < XP_THRESHOLDS.length; i++) if ((xp || 0) >= XP_THRESHOLDS[i]) lvl = i + 1;
    return lvl;
  }

  var api = {
    xpLevel: xpLevel,
    getGreeting: getGreeting,
    momentumScore: momentumScore, momentumWords: momentumWords,
    generateMicroSteps: generateMicroSteps,
    shouldEnterRecoveryMode: shouldEnterRecoveryMode,
    getRecoverySuggestions: getRecoverySuggestions,
    getCompanionMessage: getCompanionMessage,
    whatWouldHelp: whatWouldHelp,
    checkCelebrations: checkCelebrations
  };
  root.ROOTLING_UX = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
