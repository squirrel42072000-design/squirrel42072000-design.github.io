/* traits.js — Rootling support-needs model (installed 2026-10-15, Daniel:
 * "Install this into Root").
 *
 * Source briefs (filed verbatim in build-docs/):
 *   - NEURODIVERGENT-TRAITS-RESEARCH.md — model TRAITS AND SUPPORT NEEDS,
 *     not "treatments"; support needs are better predicted by profile
 *     dimensions than by labels.
 *   - EVIDENCE-LIBRARY-SOURCE.md — guideline-basis evidence (NICE /
 *     Cochrane / NIH) for the wellness supports below.
 *
 * Rootling guardrails this file lives under (non-negotiable):
 *   - NEVER diagnoses, never labels the person, never delivers treatment.
 *     No condition names appear in any user-facing string in this file.
 *   - Scores describe SUPPORT the pet should offer more of. They are
 *     computed ON-DEVICE from check-in patterns (tasks and days — never
 *     claims about who the user is), shown in plain words in the Learned
 *     view, and wiped by resetLearning like all learning state.
 *   - Clinician-delivered therapies named in the source briefs (CBT-I,
 *     sleep restriction, psychotherapy) are NOT app features and appear
 *     nowhere below. Only the wellness supports inside those evidence
 *     lists ship: sleep wind-down habits, breathing, movement, small
 *     wins, kind reminders, ready words, time with trusted people.
 *   - Crisis help is NOT modelled here: the 988 surface lives in the
 *     safety system (spec-safety) and always wins.
 *
 * Four-criteria gate (Daniel 2026-10-15) for this feature:
 *   1. Reduces cognitive load? YES — the pet quietly offers more of the
 *      help that fits, instead of the user hunting through settings.
 *   2. Improves accessibility? YES — all surfaced copy is Grade 3–5,
 *      short sentences, common words, no jargon.
 *   3. Protects privacy? YES — on-device only, zero network, scores live
 *      inside the existing learning state the user can see and wipe.
 *   4. Improves emotional safety? YES — supports only ever ADD help;
 *      nothing is withdrawn, scored against the user, or named as a
 *      label. A dimension with no evidence stays silent (null), never
 *      a guessed zero.
 */
(function (root) {
  'use strict';

  /* The six support-need dimensions from the research brief, in plain
   * words. `about` is the only user-facing description. */
  var DIMENSIONS = [
    { id: 'executive', name: 'Starting and finishing', about: 'Help to begin things, plan them, and finish them.' },
    { id: 'attention', name: 'Staying with one thing', about: 'Help to keep your mind on one thing at a time.' },
    { id: 'sensory', name: 'Body and senses comfort', about: 'Help when sounds, lights, or body feelings are too much.' },
    { id: 'feelings', name: 'Feelings care', about: 'Help when feelings feel big, heavy, or low.' },
    { id: 'routine', name: 'Steady days', about: 'Help to keep days calm and in a known order.' },
    { id: 'social', name: 'People and talking', about: 'Help with talking, messages, and time with people.' }
  ];

  /* Evidence-noted supports. Each maps to a feature Rootling already has
   * (`feature` = the tab or tool), so a "support" is never a promise of
   * something new — it is the pet leaning harder on a real tool.
   * `dims` weights say which needs the support answers (1–3).
   * `evidence` carries the source briefs' strength + basis for the
   * Learned view's honesty and for future audits; it is data, not copy. */
  var SUPPORTS = [
    { id: 'small-steps', name: 'Small steps', line: 'Big things get cut into tiny steps. Do one step. Rest. Do the next.',
      dims: { executive: 3, attention: 1 }, feature: 'focus',
      evidence: { strength: 'High', basis: 'Task chunking — research brief, ADHD & executive function sections' } },
    { id: 'kind-reminders', name: 'Kind reminders', line: 'Your pet reminds you, kindly. You do not have to hold it all in your head.',
      dims: { executive: 2, routine: 2 }, feature: 'today',
      evidence: { strength: 'High', basis: 'External reminders — research brief, ADHD section' } },
    { id: 'see-your-day', name: 'See your day', line: 'Your day is shown in words, in order, on one screen.',
      dims: { routine: 3, executive: 1 }, feature: 'today',
      evidence: { strength: 'High', basis: 'Visual schedules & structured days — research brief, autism section' } },
    { id: 'focus-time', name: 'Focus time', line: 'Work for a short time. Then rest. The timer keeps the time for you.',
      dims: { attention: 3, executive: 1 }, feature: 'focus',
      evidence: { strength: 'High', basis: 'Time-blocking — research brief, ADHD section' } },
    { id: 'pet-stays-with-you', name: 'Your pet stays with you', line: 'Your pet sits with you while you work. You are not doing it alone.',
      dims: { attention: 2, executive: 2 }, feature: 'focus',
      evidence: { strength: 'Moderate', basis: 'Body doubling — research brief, dataset example' } },
    { id: 'park-the-thought', name: 'Park the thought', line: 'A new thought pops up? Park it. It stays safe. Go back to your one thing.',
      dims: { attention: 2, executive: 2, feelings: 1 }, feature: 'focus',
      evidence: { strength: 'Moderate', basis: 'Catch-and-park — executive function supports, research brief' } },
    { id: 'quiet-break', name: 'Quiet break', line: 'Too much noise or light? Take a quiet break. Use the calm tools.',
      dims: { sensory: 3, feelings: 1 }, feature: 'support',
      evidence: { strength: 'High', basis: 'Sensory accommodations — research brief, sensory section' } },
    { id: 'slow-breathing', name: 'Slow breathing', line: 'Breathe in slow. Breathe out slower. Do it a few times.',
      dims: { feelings: 2, sensory: 2 }, feature: 'support',
      evidence: { strength: 'Moderate-High', basis: 'Breathing & mindfulness — evidence library, stress (NICE/Cochrane basis)' } },
    { id: 'wind-down', name: 'Wind-down for sleep', line: 'Slow down before bed. Same steps each night. Sleep comes easier.',
      dims: { routine: 2, feelings: 1 }, feature: 'today',
      evidence: { strength: 'High', basis: 'Sleep-hygiene habits — evidence library, insomnia (NICE/Cochrane basis)' } },
    { id: 'move-your-body', name: 'Move your body', line: 'Move a little. Walk, stretch, or dance. Moving helps feelings and focus.',
      dims: { feelings: 2, attention: 1, sensory: 1 }, feature: 'today',
      evidence: { strength: 'High', basis: 'Physical activity — evidence library, anxiety/stress/low-mood lists' } },
    { id: 'one-small-win', name: 'One small win', line: 'Do one small good thing. It counts. Your pet cheers for you.',
      dims: { feelings: 3, executive: 1 }, feature: 'support',
      evidence: { strength: 'High', basis: 'Behavioral activation, wellness form — evidence library, low-mood list' } },
    { id: 'your-people', name: 'Time with your people', line: 'Spend a little time with a person who feels safe. A call counts.',
      dims: { social: 3, feelings: 1 }, feature: 'social',
      evidence: { strength: 'High', basis: 'Social support — evidence library, low-mood list; research brief, autism section' } },
    { id: 'ready-words', name: 'Words ready to use', line: 'Hard to find the words? Use the ready words. Copy, paste, send.',
      dims: { social: 3 }, feature: 'social',
      evidence: { strength: 'Moderate', basis: 'Social communication supports — research brief, autism section' } },
    { id: 'same-clear-words', name: 'Same clear words', line: 'Your pet uses the same clear words each day, so you know what to expect.',
      dims: { routine: 2, social: 1 }, feature: 'support',
      evidence: { strength: 'High', basis: 'Predictable, structured communication — research brief, autism section' } },
    /* Topic supports (v12): offered more often when the user says they
     * live with the topic — user-declared, never inferred. */
    { id: 'easy-breathing', name: 'Easy breathing pace', line: 'Slow breaths, with a longer breath out. Your pet breathes with you.',
      dims: { feelings: 2, sensory: 2 }, feature: 'support', topics: ['copd'],
      evidence: { strength: 'High', basis: 'Paced breathing with a longer exhale eases breathlessness — pulmonary rehab teaching (NICE NG115; GOLD report)' } },
    { id: 'sit-and-do', name: 'Sit-and-do steps', line: 'Big things can be done sitting down. Your pet plans seated first steps.',
      dims: { executive: 2 }, feature: 'focus', topics: ['copd'],
      evidence: { strength: 'Moderate', basis: 'Energy conservation and seated task planning — standard pacing practice for chronic lung disease' } },
    { id: 'energy-budget', name: 'Plan by energy', line: 'Spend energy like money: the important thing first, and rest is in the budget.',
      dims: { routine: 2, executive: 1 }, feature: 'today', topics: ['copd'],
      evidence: { strength: 'High', basis: 'Pacing and energy management are core self-management teaching in pulmonary rehab programs' } }
  ];

  /* Things a user may say they live with. The pet NEVER guesses these —
   * the user picks them (Settings: "Things you live with"), and picking
   * one only changes which supports are offered more often. */
  var TOPICS = [
    { id: 'copd', name: 'Breathing / COPD', about: 'Help that respects breath and energy: paced breathing, seated steps, energy budgeting.' }
  ];

  /* Gentle signposting only — the app points to people, never to a
   * label. Gated by app.js (high feelings-need over many days). */
  var ESCALATION = [
    { id: 'long-hard-feelings', target: 'support',
      line: 'Hard feelings for a long time? Talk with a person you trust. A doctor or counselor can help too. Help is in the Support tab.' }
  ];

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /* Score support needs from learning signals. Input is a plain object
   * built by app.js from state.learning.signals — this function is pure
   * and knows nothing about app state. A dimension returns null when
   * there is not enough evidence yet: silence, never a guess.
   *   in = { shown, done, skippedTotal, moodSkipped, calmUsed,
   *          groundingUsed, daysObserved, fixedPrompts }
   */
  function scoreSupportNeeds(input) {
    var inp = input || {};
    var scores = { executive: null, attention: null, sensory: null, feelings: null, routine: null, social: null };
    var shown = inp.shown || 0, done = inp.done || 0;
    var uses = (inp.calmUsed || 0) + (inp.groundingUsed || 0);
    if (shown >= 4) {
      var rate = done / shown;
      scores.executive = Math.round(clamp01(0.7 * (1 - rate) + 0.3 * Math.min(1, (inp.skippedTotal || 0) / 6)) * 100);
    }
    if ((inp.daysObserved || 0) >= 2) {
      scores.feelings = Math.round(clamp01(0.5 * Math.min(1, uses / 6) + 0.5 * Math.min(1, (inp.moodSkipped || 0) / 3)) * 100);
      scores.sensory = Math.round(clamp01(uses / 6) * 100);
      scores.routine = inp.fixedPrompts ? 70 : 30;
    }
    /* attention + social stay null in v9: their richest signals (focus
     * sessions, coach use) live in other stores. Their supports still
     * rank whenever a scored dimension weights them. Named follow-up in
     * DEVLOG.md — wiring those stores is a separate, deliberate step. */
    return scores;
  }

  /* Rank supports by weighted need. Null dimensions contribute nothing.
   * Returns [{ id, total }] highest first; zero-need supports omitted. */
  function topSupports(scores, limit) {
    var ranked = [];
    for (var i = 0; i < SUPPORTS.length; i++) {
      var s = SUPPORTS[i], total = 0;
      for (var d in s.dims) {
        var sc = scores ? scores[d] : null;
        if (typeof sc === 'number') total += s.dims[d] * sc;
      }
      if (total > 0) ranked.push({ id: s.id, total: total });
    }
    ranked.sort(function (a, b) { return b.total - a.total; });
    return ranked.slice(0, limit || 3);
  }

  function supportById(id) {
    for (var i = 0; i < SUPPORTS.length; i++) if (SUPPORTS[i].id === id) return SUPPORTS[i];
    return null;
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    SUPPORTS: SUPPORTS,
    TOPICS: TOPICS,
    ESCALATION: ESCALATION,
    scoreSupportNeeds: scoreSupportNeeds,
    topSupports: topSupports,
    supportById: supportById
  };
  root.ROOTLING_SUPPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
