/* trust.js — Rootling trust layer (v10, from Daniel's architectural
 * upgrade prompt, 2026-10-15): AI access permission matrix, confidence
 * engine, explainability insights, memory aging, crisis ladder, data
 * classification, privacy-mode fallback.
 *
 * Standing translations (Daniel's own guardrails outrank the source
 * prompt where they differ — recorded in DEVLOG + SPEC-MAP §E):
 *   - Confidence is STORED as a number, DISPLAYED as words only
 *     ("seen many times" / "an early observation"). Users never see a
 *     numeric confidence, a risk band, or a detection label.
 *   - Memory aging SCORES memories to order what surfaces first. It
 *     never deletes or fades data (plenty of memory, never silently
 *     lossy); a user pin outranks every score forever.
 *   - The crisis ladder formalizes Rootling's already-graded safety
 *     copy. Level 4 is the existing crisis-resources surface (988) and
 *     is never weakened, delayed, or reworded by this file.
 *   - Data classification is a registry + policy input (it drives the
 *     permission defaults and the connected layer's retention rules).
 *     On-device there is no server to encrypt; nothing here claims
 *     otherwise.
 */
(function (root) {
  'use strict';

  /* ---------- Priority 1: AI access permission matrix ----------
   * Data access ≠ AI access. Defaults deny every external provider for
   * every source; only CompanionAI and the local/on-device lane start
   * granted. The matrix is data — app.js owns the persisted store and
   * the Settings UI; these functions are pure. */
  var PROVIDERS = ['companion', 'copilot', 'gemini', 'openai', 'local'];
  var PROVIDER_NAMES = {
    companion: 'CompanionAI (your pet)', copilot: 'Copilot', gemini: 'Gemini',
    openai: 'OpenAI', local: 'On-device only'
  };
  var RESOURCES = ['gmail', 'calendar', 'memory_book', 'tasks', 'wellbeing'];
  var RESOURCE_NAMES = {
    gmail: 'Email', calendar: 'Calendar', memory_book: 'Memory book',
    tasks: 'Tasks', wellbeing: 'Wellbeing notes'
  };
  function defaultPermissions() {
    var m = {};
    for (var i = 0; i < RESOURCES.length; i++) {
      m[RESOURCES[i]] = { companion: true, copilot: false, gemini: false, openai: false, local: true };
    }
    return m;
  }
  function canAIAccess(matrix, resource, provider) {
    if (!matrix || !matrix[resource]) return false;
    return !!matrix[resource][provider];
  }
  /* CRITICAL-class resources can never be granted to external providers,
   * whatever the matrix says (defense in depth under the UI). */
  var EXTERNAL = ['copilot', 'gemini', 'openai'];
  function canAIAccessSafe(matrix, resource, provider) {
    if (EXTERNAL.indexOf(provider) !== -1 && classificationOf(resource) === 'critical') return false;
    return canAIAccess(matrix, resource, provider);
  }

  /* ---------- Priority 8: data classification ---------- */
  var CLASSIFICATION = {
    memory_book: 'critical', wellbeing: 'critical', support_contacts: 'critical',
    learning_patterns: 'critical', oauth_tokens: 'critical',
    gmail: 'sensitive', calendar: 'sensitive',
    tasks: 'private', checkins: 'private', journal: 'private',
    settings: 'public', appearance: 'public'
  };
  function classificationOf(resource) { return CLASSIFICATION[resource] || 'private'; }

  /* ---------- Priority 3: confidence engine ----------
   * Patch formula (source prompt): min(1, observations*0.1 +
   * consistency*0.5). Bands: low < 0.4, medium 0.4–0.75, high ≥ 0.75.
   * Display is words only (see header). */
  function calculateConfidence(observations, consistency) {
    var c = Math.min(1, (observations || 0) * 0.1 + (consistency || 0) * 0.5);
    return Math.round(c * 100) / 100;
  }
  function confidenceBand(confidence) {
    if (confidence >= 0.75) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
  }
  var CONFIDENCE_WORDS = {
    high: "I've noticed this pattern several times.",
    medium: 'Your pet has seen this a few times.',
    low: 'This is only an early observation.'
  };
  function confidenceWords(confidence) { return CONFIDENCE_WORDS[confidenceBand(confidence)]; }

  /* ---------- Priority 2: explainability — insight factory ---------- */
  function createInsight(recommendation, reasons, confidence) {
    return {
      recommendation: recommendation,
      reasons: (reasons || []).slice(),
      confidence: confidence,
      createdAt: Date.now()
    };
  }

  /* ---------- Priority 5: memory aging (scoring only — never deletes) */
  function calculateMemoryScore(memory, now) {
    var ageDays = Math.max(0, ((now || Date.now()) - (memory.lastViewed || memory.createdAt || 0)) / 86400000);
    return (memory.importance || 0) * 5 + (memory.frequency || 0) * 3 + (memory.pinned ? 100 : 0) - ageDays;
  }

  /* ---------- Priority 7: crisis escalation ladder ----------
   * Graded, supportive, no failure or judgment language at any level.
   * Level 4 = the existing crisis-resources surface; this ladder never
   * gates it — anything at level 4 (or any direct user tap) shows the
   * resources immediately. */
  var CRISIS_LADDER = [
    { level: 0, name: 'Normal', line: 'All is calm. Your pet is here with you.' },
    { level: 1, name: 'Check in', line: 'Your pet checks in: how are you, really?' },
    { level: 2, name: 'Suggest support', line: 'Your pet offers a calm tool or a small next step.' },
    { level: 3, name: 'Strong encouragement', line: 'Your pet gently says: talking with a person you trust could help today.' },
    { level: 4, name: 'Crisis resources', line: 'Help is here now: call or text 988 any time, day or night.' }
  ];
  function ladderLevel(band, feelingsScore) {
    if (band === 'red') return 3;
    if (band === 'orange') return 2;
    if (band === 'yellow') return 1;
    if (typeof feelingsScore === 'number' && feelingsScore >= 70) return 2;
    return 0;
  }

  /* ---------- Priority 6: reflection builder (pure) ----------
   * Takes a plain stats object assembled by app.js from real stores;
   * missing stats simply omit their line. */
  function buildReflection(stats, periodLabel) {
    var lines = [];
    var s = stats || {};
    if (typeof s.completedTasks === 'number') lines.push('Things finished: ' + s.completedTasks + '.');
    if (typeof s.careDays === 'number') lines.push('Days with check-ins: ' + s.careDays + '.');
    if (s.bestTimeLabel) lines.push('Your most active time: ' + s.bestTimeLabel + '.');
    if (s.topSupportName) lines.push('The help that fit you most: ' + s.topSupportName + '.');
    if (typeof s.stepsWeek === 'number' && s.stepsWeek > 0) lines.push('Steps this week: ' + s.stepsWeek + '. Every step counts.');
    if (s.topChallenge) lines.push('Hardest to start: ' + s.topChallenge + '. Starting is the hard part — small steps help.');
    return { period: periodLabel || '', lines: lines, createdAt: Date.now() };
  }

  var api = {
    PROVIDERS: PROVIDERS, PROVIDER_NAMES: PROVIDER_NAMES,
    RESOURCES: RESOURCES, RESOURCE_NAMES: RESOURCE_NAMES,
    defaultPermissions: defaultPermissions,
    canAIAccess: canAIAccess, canAIAccessSafe: canAIAccessSafe,
    CLASSIFICATION: CLASSIFICATION, classificationOf: classificationOf,
    calculateConfidence: calculateConfidence,
    confidenceBand: confidenceBand, confidenceWords: confidenceWords,
    createInsight: createInsight,
    calculateMemoryScore: calculateMemoryScore,
    CRISIS_LADDER: CRISIS_LADDER, ladderLevel: ladderLevel,
    buildReflection: buildReflection
  };
  root.ROOTLING_TRUST = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
