/* burnoutEngine.js — Rootling tired-pattern engine (v10, Priority 4 of
 * Daniel's architectural upgrade prompt, 2026-10-15).
 *
 * The engine watches for a tired pattern across tasks, wellbeing,
 * social, and routine signals and returns a band + plain-word triggers.
 * Translation under Daniel's standing guardrails (recorded in DEVLOG +
 * SPEC-MAP §E): the band is an INTERNAL tuning signal — it raises
 * support (smaller asks, recovery suggestions, ladder level) and its
 * triggers surface as "Your pet noticed" lines. The band is never shown
 * to the user as a label or a score, notifications are supportive only,
 * and no output of this file uses alarming, failure, or judgment words.
 * The user-facing name for the whole thing is "tired pattern," never
 * "burnout risk."
 */
(function (root) {
  'use strict';

  /* Patch formula (source prompt): +25 per negative signal, bands at
   * 25 / 50 / 75. Input trends are -1 (declining), 0 (steady), or
   * null (no signal — contributes nothing, like every Rootling scorer). */
  function calculateBurnoutRisk(data) {
    var d = data || {};
    var score = 0;
    var triggers = [];
    if (typeof d.unfinishedTasks === 'number' && d.unfinishedTasks > 10) {
      score += 25; triggers.push('Things to do have been piling up.');
    }
    if (d.wellbeingTrend === -1) { score += 25; triggers.push('Wellbeing check-ins have been harder to finish.'); }
    if (d.socialTrend === -1) { score += 25; triggers.push('Time with people has been quiet lately.'); }
    if (d.routineTrend === -1) { score += 25; triggers.push('Days have felt less steady than usual.'); }
    var band = 'green';
    if (score >= 75) band = 'red';
    else if (score >= 50) band = 'orange';
    else if (score >= 25) band = 'yellow';
    return { band: band, score: score, triggers: triggers };
  }

  /* Supportive responses per band — what the pet DOES. Green rests.
   * Every line is an offer, never an alarm. */
  var BAND_SUPPORT = {
    green: [],
    yellow: ['A little rest soon can help. Your pet can hold your place.'],
    orange: ['Today can be a small-ask day. One tiny thing is enough.', 'A quiet break is a good plan. The calm tools are in the Support tab.'],
    red: ['Today asks can be the very smallest. Rest counts as care.', 'Talking with a person you trust could help today. Your people are in the Support tab.']
  };
  function supportLines(band) { return (BAND_SUPPORT[band] || []).slice(); }

  var api = {
    calculateBurnoutRisk: calculateBurnoutRisk,
    supportLines: supportLines,
    BAND_SUPPORT: BAND_SUPPORT
  };
  root.ROOTLING_BURNOUT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
