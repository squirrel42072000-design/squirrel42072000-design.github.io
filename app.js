/* Rootling — your tiny self-care friend (Live Well)
 * Plain vanilla JS. No build step, no network, state in localStorage only.
 * Phase 1: choose a plant or animal companion at adoption.
 * Phase 2: support profiles ("what helps you") + optional on-device learning.
 * The app adapts support STYLE only. It never diagnoses, never names a
 * condition the user did not pick, and never sends data anywhere.
 * No audio in the MVP (future sound, if any, must be warm/uplifting only).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'sprout-state-v1';
  var NOTIFICATIONS_STORAGE_KEY = 'rootling-notifications-v1';
  var PERSIST_REQUESTED_KEY = 'rootling-persist-requested-v1';
  var MEMORY_EXPORT_KIND = 'rootling-memory';
  /* Module stores that ride along in the memory backup (integration,
   * 2026-10-15 premium phase): every module's own key joins the export
   * so a backup really is the whole pet. The persist-requested flag is
   * NOT exported — it is this device's own request state, not data. */
  var MODULE_STORE_KEYS = ['rootling-appearance-v1', 'rootling-exec-v1',
    'rootling-well-v1', 'rootling-consent-v1', 'rootling-social-v1',
    'rootling-time-v1', 'rootling-memorybook-v1'];
  /* Soft warning line, not a cap: localStorage origins are commonly
   * limited to roughly 5 MB, so at ~4 MB of stored memory the app tells
   * the user and offers an export first. Nothing is dropped at this line
   * — it exists so a browser quota is never the first "notice" a user
   * gets that their pet's memory is at risk. */
  var MEMORY_SOFT_LIMIT_BYTES = 4000000;

  var POINTS = { mood: 10, movementLittle: 10, movementLot: 15, sleep: 10, waterPerGlass: 2, waterMaxGlasses: 8 };

  /* Care styles (2026-10-15 collection rebuild): pacing only. Balanced
   * is the standard pace and changes nothing. Dedicated and Hardcore
   * grow a companion faster and ask for more care moments; Casual is
   * the same pace as Balanced with a lighter touch. In EVERY style the
   * companion never suffers, never fades, and nothing is ever taken
   * away — the style changes rewards and pacing, never punishment. */
  var CARE_STYLE_FACTORS = { casual: 1, balanced: 1, dedicated: 1.25, hardcore: 1.5 };

  /* ---------- companion forms (Phase 1) ---------- */
  var FORMS = {
    plant: {
      label: 'Plant',
      stages: [
        { id: 'seed',   name: 'Seed',   min: 0,   file: 'assets/sprout-seed.svg' },
        { id: 'sprout', name: 'Sprout', min: 25,  file: 'assets/sprout-sprout.svg' },
        { id: 'bud',    name: 'Bud',    min: 70,  file: 'assets/sprout-bud.svg' },
        { id: 'bloom',  name: 'Bloom',  min: 140, file: 'assets/sprout-bloom.svg' }
      ],
      moods: {
        happy: 'assets/sprout-happy.svg',
        sleepy: 'assets/sprout-sleepy.svg',
        low: 'assets/sprout-low.svg',
        celebrate: 'assets/sprout-celebrate.svg',
        celebrateCalm: 'assets/sprout-celebrate-calm.svg'
      },
      firstFile: 'assets/sprout-seed.svg',
      restText: 'Yesterday was a rest day — plants rest too, and rest is part of growing. Your total days of care are all still here. Nothing to catch up on — we kept your spot. 🌿'
    },
    animal: {
      label: 'Animal',
      stages: [
        { id: 'egg',      name: 'Egg',      min: 0,   file: 'assets/creature-egg.svg' },
        { id: 'nestling', name: 'Nestling', min: 25,  file: 'assets/creature-nestling.svg' },
        { id: 'cub',      name: 'Cub',      min: 70,  file: 'assets/creature-cub.svg' },
        { id: 'grown',    name: 'Grown',    min: 140, file: 'assets/creature-grown.svg' }
      ],
      moods: {
        happy: 'assets/creature-happy.svg',
        sleepy: 'assets/creature-sleepy.svg',
        low: 'assets/creature-low.svg',
        celebrate: 'assets/creature-celebrate.svg'
      },
      firstFile: 'assets/creature-egg.svg',
      restText: 'Yesterday was a rest day — companions rest too, and rest is part of growing. Your total days of care are all still here. Nothing to catch up on — we kept your spot. 🌿'
    }
  };
  /* Back-compat: STAGES is the plant set (original tests use it). */
  var STAGES = FORMS.plant.stages;
  var PLACEHOLDER = 'assets/sprout-placeholder.svg';

  /* ---------- support profiles (Phase 2) ----------
   * Framed as "what helps you" support styles, never medical labels on the pet.
   * demand: 'standard' | 'micro' (one tiny step at a time) | 'low' (smaller asks)
   * promptStyle: 'fixed' (same clear wording) | 'varied' (fresh wording) | 'gentle'
   * celebration: 'full' (celebrate art + motion, subject to calm mode) |
   *   'quiet' (words only — no art swap, no motion: nothing startling; the
   *   reward value is identical, only the register changes)
   * controlFraming: true = the "you are in control" message leads the day
   *   until the first check-in, at any hour (not only in the 'stage' mood).
   */
  var PROFILES = {
    companion: {
      id: 'companion', name: 'Just a companion',
      tagline: 'No special style — just a gentle friend who waits with you.',
      demand: 'standard', promptStyle: 'gentle', previews: false,
      celebrateEvery: false, groundingTools: false, bodyDouble: false,
      calmDefault: false, literal: false,
      celebration: 'full', controlFraming: false
    },
    focus: {
      id: 'focus', name: 'Focus & momentum (ADHD-friendly)',
      tagline: 'One tiny step at a time, fresh wording, and a friend who stays right here with you while you do it. No deadlines and no set times — check in whenever works for you.',
      demand: 'micro', promptStyle: 'varied', previews: false,
      celebrateEvery: true, groundingTools: false, bodyDouble: true,
      calmDefault: false, literal: false,
      celebration: 'full', controlFraming: false,
      /* Daniel's first-person ADHD spec (2026-10-15): executive function is
       * the headline — the pet holds the schedule, the open loop, and the
       * one priority so the user's memory doesn't have to. These flags are
       * the settings contract for the executive modules (pet-held schedule,
       * return-to-task, focus sessions, catch-and-park, priority anchor);
       * the modules themselves are spec'd in CONDITION-RECONCILIATION.md
       * and built against EXEC_COPY below + the open-loop record shape
       * defined there. Flags on = this style offers the mechanics. */
      executive: { petSchedule: true, openLoop: true, focusSessions: true, parkCapture: true, priorityAnchor: true }
    },
    calm: {
      id: 'calm', name: 'Calm & predictable (autism-friendly)',
      tagline: 'The same clear routine every day, with a preview of what today looks like. Nothing changes without you choosing it. Calm mode starts on with this style — no bouncing or swaying, softer colours — and you can turn it off any time in settings.',
      demand: 'standard', promptStyle: 'fixed', previews: true,
      celebrateEvery: false, groundingTools: false, bodyDouble: false,
      calmDefault: true, literal: true,
      celebration: 'quiet', controlFraming: false
    },
    grounding: {
      id: 'grounding', name: 'Grounding & safety (PTSD-friendly)',
      tagline: 'Grounding tools close by, nothing startling, and a companion who waits — never demands. You are in control, and you can stop any tool at any point. Calm mode starts on with this style — no bouncing or swaying, softer colours — and you can turn it off any time in settings. Celebrations are words only in this style: the picture never changes suddenly.',
      demand: 'low', promptStyle: 'gentle', previews: false,
      celebrateEvery: false, groundingTools: true, bodyDouble: false,
      calmDefault: true, literal: false,
      celebration: 'quiet', controlFraming: true
    },
    lowdemand: {
      id: 'lowdemand', name: 'Low-demand days (anxiety/depression-friendly)',
      tagline: 'Smaller asks on hard days, in gentle wording. The smallest version of a check-in is the whole check-in — and it counts fully. There is no pressure to do the rest.',
      demand: 'low', promptStyle: 'gentle', previews: false,
      celebrateEvery: true, groundingTools: false, bodyDouble: false,
      calmDefault: false, literal: false,
      celebration: 'full', controlFraming: false
    },
    adaptive: {
      id: 'adaptive', name: 'Let my companion learn',
      tagline: 'Starts with the standard gentle style. Your companion quietly notices what helps you — on this device only — and adjusts its style. You can see and reset everything it learns.',
      demand: 'standard', promptStyle: 'gentle', previews: false,
      celebrateEvery: false, groundingTools: false, bodyDouble: false,
      calmDefault: false, literal: false, forcesLearning: true,
      celebration: 'full', controlFraming: false
    }
  };

  /* Prompt wording per check-in type, per style. 'fixed' is always identical;
   * 'varied' rotates; 'gentle' is the soft default set (original copy).
   * 'low' is the low-demand set (Minimum Viable Day floor + Plan-B versions):
   * the smallest version IS the whole check-in, indoor/lying-down versions
   * are named, and leaving a check-in undone is stated to cost nothing.
   * Sleep copy never grades the night — the number is a note, not a verdict. */
  var PROMPTS = {
    mood: {
      fixed: 'How are you feeling right now? Pick the face that fits. There is no wrong answer.',
      gentle: 'How are you feeling right now? There\'s no wrong answer.',
      low: 'Just tap the face closest to how you feel. That one tap is the whole check-in, and it counts fully.',
      varied: [
        'Quick feelings check — which face is you right now?',
        'Name the weather inside: which face fits today?',
        'One tap: how is your heart doing right now?'
      ]
    },
    water: {
      fixed: 'Drink one glass of water. Tap + Glass when it is done.',
      gentle: 'A glass of water is a small kindness to yourself.',
      low: 'One sip of water is the whole check-in today. A few sips from any glass or bottle count fully — tap + Glass for that first sip.',
      varied: [
        'Water break — one glass, then tap + Glass.',
        'Hydration station: your future self says thanks for one glass.',
        'Sip happens. One glass counts — tap when you\'re done.'
      ]
    },
    movement: {
      fixed: 'Move your body a little, or a lot. Tap "I moved a little" or "I moved a lot" to match what you did. Either choice finishes this check-in for today.',
      gentle: 'A walk to the mailbox counts. So does dancing in the kitchen.',
      low: 'The smallest movement is the whole check-in: sit up, roll your shoulders, or stretch where you are — in bed or in a chair counts fully. Or rest instead: leaving this one today loses nothing.',
      varied: [
        'Tiny movement quest: stretch, stroll, or kitchen-dance — your pick.',
        'Shake it out for a minute? That counts. Tell me how much you moved.',
        'One song of movement. A little or a lot — both are wins.'
      ]
    },
    sleep: {
      fixed: 'How many hours did you sleep last night? Move the slider, then tap Save sleep.',
      gentle: 'Roughly how long did you sleep last night? A guess is fine.',
      low: 'Roughly is enough: move the slider to about how long you slept, or tap a chip below. However the night went, the number is just a note — never a grade.',
      varied: [
        'Sleep report: roughly how many hours last night? Guesses welcome.',
        'How rested are we talking? Log last night\'s hours below.',
        'Last night\'s sleep, in hours — close enough is perfect.'
      ]
    }
  };
  var MICRO_HINTS = {
    mood: 'Tiny step: just tap one face. That is the whole task.',
    water: 'Tiny step: get a glass of water and drink what you can. Tap + Glass for that glass.',
    movement: 'Tiny step: stand up and stretch for 30 seconds. That counts.',
    sleep: 'Tiny step: tap a quick-pick chip below, then tap Save sleep. That is the whole task.'
  };
  /* Shown under a check-in when demand is 'low' (the hint line previously
   * only existed for 'micro'). Rest is named as a legitimate outcome. */
  var LOW_HINTS = {
    mood: 'Smallest version: one tap on any face. That is the whole check-in.',
    water: 'Smallest version: one sip. That counts fully.',
    movement: 'Smallest version: one stretch, sitting or lying down. That counts fully — and resting instead is a real choice, not a missed one.',
    sleep: 'Smallest version: tap one chip below. That counts fully.'
  };
  /* Plan-B versions, pre-made per check-in (Behavioural Activation barrier
   * problem-solving: the alternative is chosen in advance, not invented on
   * a bad day). Render contract: wherever learning has switched a check-in
   * to its tiniest version (microTypes[type] on — the twice-skipped shrink
   * rule), setHint appends the Plan-B line right after the micro hint in
   * the same hint element. All Plan-B versions are indoor / lying-down /
   * nearest-tap sized. Sleep's Plan-B counts rest, never grades it. */
  var PLAN_B = {
    mood: 'Plan B: no words needed — one tap on a face, from wherever you are, is the whole answer.',
    water: 'Plan B: sips from the nearest tap or bottle count — no full glass, no trip to the kitchen needed.',
    movement: 'Plan B: stretch without standing — arms, shoulders, ankles, in bed or in a chair. That is the whole check-in.',
    sleep: 'Plan B: rest lying down counts as care. If sleep did not come, log the hours you rested — the number is a note, not a grade.'
  };

  /* ---------- date helpers (local time) ---------- */
  function dateKey(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function todayKey(now) { return dateKey(now || new Date()); }
  function shiftKey(key, deltaDays) {
    var parts = key.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + deltaDays);
    return dateKey(d);
  }

  /* ---------- learning (Phase 2, on-device only) ---------- */
  function freshLearning() {
    return {
      signals: {
        byType: { /* mood: { done:0, shown:0 } */ },
        byHour: { /* '14': { done:0 } */ },
        restDays: 0,
        careDaysSeen: 0,
        calmUsed: 0,
        groundingUsed: 0,
        daysObserved: 0,
        countedShown: {}, /* 'YYYY-MM-DD|type' -> 1, one exposure counted per type per day */
        countedDone: {},  /* 'YYYY-MM-DD|type' -> 1, one completion counted per type per day */
        skippedDays: {},  /* type -> settled days that type was offered and not done */
        settledDays: {},  /* 'YYYY-MM-DD' -> 1, days whose care/rest/skip outcome is final */
        lastObservedDate: ''
      },
      adaptations: {
        demandLevel: null,      /* null | 'micro' | 'low' — learned demand override */
        microTypes: {},         /* type -> true when that check-in gets micro framing */
        promptStyle: null,      /* null | 'fixed' | 'varied' */
        bestHour: null,         /* hour of day the user most often completes check-ins */
        suggestGrounding: false,
        celebrateBoost: false
      },
      log: [] /* plain-language entries: { date, text } — shown in the Learned view */
    };
  }

  function learnLog(state, text, now) {
    var log = state.learning.log;
    for (var i = 0; i < log.length; i++) { if (log[i].text === text) return; }
    log.push({ date: todayKey(now), text: text });
    /* No cap and no auto-prune: this log is the pet's long-term memory of
     * what it adapted and why. Space is reclaimed only when the user
     * prunes or wipes it in the Learned view (Daniel 2026-10-15: the pet
     * must have plenty of memory, never silently lossy). */
  }

  /* Count one exposure ("shown") per incomplete check-in type per day.
   * Records NOTHING while learning is off — the guard lives here, in the
   * function itself, not only at call sites. A day's care/rest/skip outcome
   * is settled exactly once, when the NEXT day is first observed and that
   * day's check-ins are final: judging today at first open would count a
   * return day as "rest" before the user has had any chance to check in,
   * and would never count a normal care day at all. */
  function recordExposure(state, now) {
    if (!state.learningEnabled) return;
    if (!state.learning) state.learning = freshLearning();
    now = now || new Date();
    var key = todayKey(now);
    var sig = state.learning.signals;
    if (!sig.countedDone) sig.countedDone = {};
    if (!sig.skippedDays) sig.skippedDays = {};
    if (!sig.settledDays) sig.settledDays = {};
    if (sig.lastObservedDate !== key) {
      var prev = sig.lastObservedDate;
      sig.lastObservedDate = key;
      sig.daysObserved += 1;
      if (prev && !sig.settledDays[prev]) {
        sig.settledDays[prev] = 1;
        if (state.careDays.indexOf(prev) !== -1) {
          sig.careDaysSeen += 1;
        } else if (state.careDays.some(function (d) { return d < prev; })) {
          sig.restDays += 1; /* a day after care began, with no check-in: a rest day (data, never a failure) */
        }
        var settleTypes = ['mood', 'water', 'movement', 'sleep'];
        for (var si = 0; si < settleTypes.length; si++) {
          var st = settleTypes[si];
          if (sig.countedShown[prev + '|' + st] && !sig.countedDone[prev + '|' + st]) {
            sig.skippedDays[st] = (sig.skippedDays[st] || 0) + 1;
          }
        }
      }
    }
    /* Date-keyed pattern detail is kept long-term on purpose (plenty of
     * memory, never silently lossy): these maps are the pet's pattern
     * history, they grow slowly (a handful of small keys per day), and
     * they are removed only when the user prunes or wipes them in the
     * Learned view. Settling still only ever reads the single previous
     * observed day; the older keys are the durable record, not working
     * state, and the aggregate counters live alongside them. */
    var day = state.checkins[key] || {};
    var types = ['mood', 'water', 'movement', 'sleep'];
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var doneIt = t === 'water' ? (day.water && day.water.glasses > 0) : !!day[t];
      var ck = key + '|' + t;
      if (!doneIt && !sig.countedShown[ck]) {
        sig.countedShown[ck] = 1;
        if (!sig.byType[t]) sig.byType[t] = { done: 0, shown: 0 };
        sig.byType[t].shown += 1;
      }
    }
  }

  /* Recompute adaptations from signals. Deterministic thresholds, no magic:
   * - a type skipped on >=2 settled days gets micro framing (its ask shrinks),
   *   and so does a type shown >=3 times and completed <1/3 of the time
   * - overall completion <1/2 across >=6 shown prompts (after >=3 observed
   *   days) lowers learned demand to 'low' and switches prompts to 'fixed'
   * - overall completion >=4/5 across >=6 shown prompts earns 'varied' prompts
   * - the hour with >=2 completions and the highest count becomes bestHour
   * - >=2 rest days observed => warmer welcome-back celebration (rest days
   *   only ever drive warmer welcomes — never higher demand)
   * - grounding used >=2 times => the grounding card is surfaced by default
   * Every adaptation writes a plain-language learnLog entry as it fires —
   * nothing changes invisibly. Nothing is computed while learning is off.
   * Demand adaptations only ever soften (never cleared, never raised).
   */
  function computeAdaptations(state, now) {
    if (!state.learning) state.learning = freshLearning();
    if (!state.learningEnabled) return state.learning.adaptations;
    var sig = state.learning.signals, ad = state.learning.adaptations;
    if (!sig.skippedDays) sig.skippedDays = {};
    var totalDone = 0, totalShown = 0;
    for (var t in sig.byType) {
      totalDone += sig.byType[t].done;
      totalShown += sig.byType[t].shown;
      var bt = sig.byType[t];
      if (!ad.microTypes[t] && (sig.skippedDays[t] || 0) >= 2) {
        ad.microTypes[t] = true;
        learnLog(state, 'The ' + t + ' check-in was skipped on 2 days, so its ask is smaller now — the tiniest version counts fully.', now);
      } else if (bt.shown >= 3 && bt.done / bt.shown < 1 / 3 && !ad.microTypes[t]) {
        ad.microTypes[t] = true;
        learnLog(state, 'The ' + t + ' check-in often gets skipped, so it now comes with a smaller first step.', now);
      }
    }
    if (totalShown >= 6) {
      var rate = totalDone / totalShown;
      if (rate < 0.5 && sig.daysObserved >= 3 && ad.demandLevel !== 'low') {
        ad.demandLevel = 'low';
        learnLog(state, 'Check-ins are often left unfinished, so asks are smaller now — one tiny thing is a full day.', now);
      }
      if (rate < 0.5 && sig.daysObserved >= 3 && ad.promptStyle !== 'fixed') {
        ad.promptStyle = 'fixed';
        learnLog(state, 'Prompts now use the same clear wording each day, so they are easier to recognise.', now);
      } else if (rate >= 0.8 && ad.promptStyle !== 'varied') {
        ad.promptStyle = 'varied';
        learnLog(state, 'You finish most check-ins, so prompt wording changes a little each day to keep it fresh.', now);
      }
    }
    var bestH = null, bestN = 1; /* need >= 2 completions in an hour */
    for (var h in sig.byHour) {
      if (sig.byHour[h].done > bestN) { bestN = sig.byHour[h].done; bestH = Number(h); }
    }
    if (bestH !== null && ad.bestHour !== bestH) {
      ad.bestHour = bestH;
      learnLog(state, 'You most often check in around ' + hourLabel(bestH) + ' — that is when your companion is happiest to see you.', now);
    }
    if (sig.restDays >= 2 && !ad.celebrateBoost) {
      ad.celebrateBoost = true;
      /* Log line stays honest about the celebrateBoost gate (see
       * effectiveConfig): the boost only switches celebration ON for the
       * neutral companion/adaptive styles. The Learned-view fact line is
       * rendered against the CURRENT profile, so it stays accurate even
       * if the user changes style after this entry was written. */
      var boostPid = state.profile || 'companion';
      if (boostPid === 'calm' || boostPid === 'grounding') {
        learnLog(state, 'Rest days are part of your rhythm. Your quiet celebration style is kept — learning does not add extra celebration. Rest still never costs you anything.', now);
      } else if (boostPid === 'focus' || boostPid === 'lowdemand') {
        learnLog(state, 'Rest days are part of your rhythm. Your style already celebrates each check-in, so returns keep that same welcome. Rest still never costs you anything.', now);
      } else {
        learnLog(state, 'Rest days are part of your rhythm, so coming back gets an extra-warm welcome. Rest still never costs you anything.', now);
      }
    }
    if (sig.groundingUsed >= 2 && !ad.suggestGrounding) {
      ad.suggestGrounding = true;
      learnLog(state, 'You use the grounding tools, so they now stay near the top of your day.', now);
    }
    return ad;
  }

  function hourLabel(h) {
    if (h === 0) return '12am';
    if (h < 12) return h + 'am';
    if (h === 12) return '12pm';
    return (h - 12) + 'pm';
  }

  /* Plain-language facts for the "What your companion has learned" view. */
  function learnedFacts(state) {
    var facts = [];
    if (!state.learning) return facts;
    var sig = state.learning.signals, ad = state.learning.adaptations;
    if (sig.daysObserved > 0) facts.push('Days observed on this device: ' + sig.daysObserved + ' (' + sig.careDaysSeen + ' with check-ins, ' + sig.restDays + ' rest days).');
    for (var t in sig.byType) {
      var bt = sig.byType[t];
      if (bt.shown > 0) facts.push('The ' + t + ' check-in: finished ' + bt.done + ' of ' + bt.shown + ' days it was offered.');
    }
    if (ad.bestHour !== null && ad.bestHour !== undefined) facts.push('Your most active check-in time is around ' + hourLabel(ad.bestHour) + '.');
    if (ad.demandLevel) facts.push('Ask size adapted: ' + ad.demandLevel + ' (smaller asks).');
    if (Object.keys(ad.microTypes).length) facts.push('Extra-small first steps are on for: ' + Object.keys(ad.microTypes).join(', ') + '.');
    if (ad.promptStyle) facts.push('Prompt wording adapted: ' + (ad.promptStyle === 'fixed' ? 'same clear wording each day' : 'fresh wording for variety') + '.');
    if (ad.celebrateBoost) {
      /* Gate-honest fact line, rendered against the CURRENT profile (see
       * the celebrateBoost gate in effectiveConfig). */
      var factPid = state.profile || 'companion';
      if (factPid === 'calm' || factPid === 'grounding') {
        facts.push('Rest days are part of your rhythm. Your style uses quiet, words-only celebration, so learning does not add extra celebration there. Rest days count as rest — never as failure.');
      } else if (factPid === 'focus' || factPid === 'lowdemand') {
        facts.push('Rest days are part of your rhythm. Your style already celebrates every check-in, so returns keep that same welcome. Rest days count as rest — never as failure.');
      } else {
        facts.push('Coming back after rest days gets an extra-warm welcome. Rest days count as rest — never as failure.');
      }
    }
    if (ad.suggestGrounding) facts.push('Grounding tools stay near the top of your day, because you use them.');
    if (sig.groundingUsed > 0) facts.push('Grounding tools used ' + sig.groundingUsed + ' time(s).');
    if (sig.calmUsed > 0) facts.push('Calm mode turned on ' + sig.calmUsed + ' time(s).');
    var anyAdaptation = !!ad.demandLevel || !!ad.promptStyle || Object.keys(ad.microTypes).length > 0 || !!ad.celebrateBoost || !!ad.suggestGrounding || (ad.bestHour !== null && ad.bestHour !== undefined);
    if (anyAdaptation) facts.push('Your chosen support style always comes first: learning only fills in wording or ask size where your style did not already set them, and it never changes previews or calm mode you chose.');
    for (var i = 0; i < state.learning.log.length; i++) facts.push(state.learning.log[i].text);
    return facts;
  }

  function resetLearning(state) {
    state.learning = freshLearning();
    saveState(state);
    return state.learning;
  }

  /* ---------- pet memory: plenty, durable, user-owned ----------
   * Daniel 2026-10-15: "Make sure it has plenty of memory." Concretely:
   * persistent storage is requested at first run; no store in the app
   * auto-prunes or caps away history; the user can see how much the pet
   * remembers, prune or wipe it themselves, and export/import the whole
   * memory as a file they own (which is also the PWA -> native migration
   * path — the store version imports this file instead of starting over). */
  function jsonByteLength(str) {
    /* UTF-8 byte length without depending on Blob/TextEncoder existing. */
    return unescape(encodeURIComponent(str)).length;
  }

  function memoryStats(state, notifications) {
    var appJson = JSON.stringify(state || {});
    var notifJson = notifications ? JSON.stringify(notifications) : '';
    var sig = (state && state.learning && state.learning.signals) || {};
    var patternDates = {};
    ['countedShown', 'countedDone'].forEach(function (mapName) {
      var map = sig[mapName] || {};
      for (var k in map) patternDates[k.slice(0, 10)] = 1;
    });
    var settled = sig.settledDays || {};
    for (var sk in settled) patternDates[sk] = 1;
    var moduleBytes = 0;
    var moduleStoresPresent = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        MODULE_STORE_KEYS.forEach(function (key) {
          var raw = localStorage.getItem(key);
          if (raw) { moduleBytes += jsonByteLength(raw); moduleStoresPresent += 1; }
        });
      }
    } catch (e) { /* stats never fail on storage access */ }
    var totalBytes = jsonByteLength(appJson) + jsonByteLength(notifJson) + moduleBytes;
    return {
      appBytes: jsonByteLength(appJson),
      notificationBytes: jsonByteLength(notifJson),
      moduleBytes: moduleBytes,
      moduleStoresPresent: moduleStoresPresent,
      totalBytes: totalBytes,
      checkinDays: state && state.checkins ? Object.keys(state.checkins).length : 0,
      careDays: state && state.careDays ? state.careDays.length : 0,
      learningDaysObserved: sig.daysObserved || 0,
      patternDetailDays: Object.keys(patternDates).length,
      learnedEntries: state && state.learning && state.learning.log ? state.learning.log.length : 0,
      notificationEntries: notifications && notifications.log ? notifications.log.length : 0,
      nearLimit: totalBytes >= MEMORY_SOFT_LIMIT_BYTES
    };
  }

  function createMemoryExport(state, notifications, now) {
    var storage = {};
    storage[STORAGE_KEY] = state;
    storage[NOTIFICATIONS_STORAGE_KEY] = notifications || null;
    MODULE_STORE_KEYS.forEach(function (key) {
      try {
        var raw = localStorage.getItem(key);
        if (raw) storage[key] = JSON.parse(raw);
      } catch (e) { /* a module store that cannot be read is left out, never fatal */ }
    });
    return {
      app: 'Rootling',
      kind: MEMORY_EXPORT_KIND,
      version: 1,
      exportedAt: (now || new Date()).toISOString(),
      storage: storage
    };
  }

  function serializeMemoryExport(state, notifications, now) {
    return JSON.stringify(createMemoryExport(state, notifications, now), null, 2);
  }

  function parseMemoryExport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not readable as a Rootling memory backup (it is not valid JSON).'); }
    if (!data || data.kind !== MEMORY_EXPORT_KIND || !data.storage || typeof data.storage !== 'object') {
      throw new Error('That file is not a Rootling memory backup.');
    }
    var appState = data.storage[STORAGE_KEY];
    if (!appState || typeof appState !== 'object' || typeof appState.checkins !== 'object' || !Array.isArray(appState.careDays)) {
      throw new Error('That Rootling memory backup is missing the pet\'s core memory.');
    }
    var notifications = data.storage[NOTIFICATIONS_STORAGE_KEY];
    if (notifications !== null && notifications !== undefined && typeof notifications !== 'object') {
      throw new Error('That Rootling memory backup has an unreadable alerts section.');
    }
    var moduleStores = {};
    MODULE_STORE_KEYS.forEach(function (key) {
      var value = data.storage[key];
      if (value === undefined || value === null) return;
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('That Rootling memory backup has an unreadable section.');
      }
      moduleStores[key] = value;
    });
    return { appState: appState, notifications: notifications || null, moduleStores: moduleStores, exportedAt: data.exportedAt || '' };
  }

  /* Restore a memory backup into storage and into the live app state.
   * The notifications store is restored exactly as exported (including
   * "there was none" -> the key is removed). The caller reloads the page
   * afterwards so the self-contained notifications module re-reads its
   * own store. Returns the parsed backup for reporting. */
  function applyMemoryImport(text) {
    var parsed = parseMemoryExport(text);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.appState));
    if (parsed.notifications) {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(parsed.notifications));
    } else {
      localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
    }
    MODULE_STORE_KEYS.forEach(function (key) {
      if (parsed.moduleStores && parsed.moduleStores[key]) {
        localStorage.setItem(key, JSON.stringify(parsed.moduleStores[key]));
      } else {
        localStorage.removeItem(key);
      }
    });
    state = loadState();
    return parsed;
  }

  /* User-controlled prune: forget the day-by-day pattern detail (the
   * date-keyed maps) while keeping the totals, adaptations and log the
   * user can read. Today's own keys are rebuilt from today's record so a
   * prune can never make today's completions count twice. Never called
   * automatically — the button in the Learned view is the only caller. */
  function pruneLearningDetails(state, now) {
    if (!state.learning) state.learning = freshLearning();
    var sig = state.learning.signals;
    var key = todayKey(now);
    var removed = Object.keys(sig.countedShown || {}).length + Object.keys(sig.countedDone || {}).length + Object.keys(sig.settledDays || {}).length;
    var shownToday = {}, doneToday = {};
    for (var sk in (sig.countedShown || {})) { if (sk.slice(0, 10) === key) shownToday[sk] = 1; }
    for (var dk in (sig.countedDone || {})) { if (dk.slice(0, 10) === key) doneToday[dk] = 1; }
    sig.countedShown = shownToday;
    sig.countedDone = doneToday;
    sig.settledDays = {};
    saveState(state);
    return removed;
  }

  /* Ask the browser to keep this origin's storage persistent. Called
   * once, at first run (flagged in storage); a browser may still evict
   * site data under pressure or when the user clears it — which is why
   * the export above exists and why no copy promises more permanence
   * than the platform gives. Resolves true if a request was made. */
  function requestPersistentStorage(force) {
    try {
      if (!force && typeof localStorage !== 'undefined' && localStorage.getItem(PERSIST_REQUESTED_KEY)) {
        return Promise.resolve(false);
      }
      if (typeof localStorage !== 'undefined') localStorage.setItem(PERSIST_REQUESTED_KEY, '1');
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
        var p = navigator.storage.persist();
        if (p && typeof p.then === 'function') return p.then(function () { return true; }, function () { return true; });
        return Promise.resolve(true);
      }
    } catch (e) { /* storage APIs unavailable — the app still works */ }
    return Promise.resolve(false);
  }

  /* Effective behaviour = chosen profile, refined by learning when enabled.
   * User-explicit choices win: learning can only soften demand (and only
   * from the neutral 'standard' baseline), and it may pick prompt wording
   * only where the profile left wording at the neutral 'gentle' default —
   * a profile's chosen 'fixed' or 'varied' wording is never overridden.
   * It never raises demand above the profile's, and it never overrides
   * calm/previews the user chose. */
  function effectiveConfig(state) {
    var prof = PROFILES[state.profile] || PROFILES.companion;
    var cfg = {
      profileId: prof.id, profileName: prof.name, demand: prof.demand,
      promptStyle: prof.promptStyle, previews: prof.previews,
      celebrateEvery: prof.celebrateEvery, groundingTools: prof.groundingTools,
      bodyDouble: prof.bodyDouble, literal: prof.literal,
      celebration: prof.celebration || 'full', petEnergy: 'gentle',
      promptVariety: prof.promptStyle, reminderIntensity: 'gentle',
      microTypes: {}, suggestGrounding: false, bestHour: null,
      learningOn: !!state.learningEnabled
    };
    if (state.learningEnabled && state.learning) {
      var ad = state.learning.adaptations;
      if (ad.demandLevel === 'low' && cfg.demand === 'standard') cfg.demand = 'low';
      if (ad.demandLevel === 'micro' && cfg.demand === 'standard') cfg.demand = 'micro';
      if (ad.promptStyle && cfg.promptStyle === 'gentle') cfg.promptStyle = ad.promptStyle;
      cfg.microTypes = ad.microTypes || {};
      cfg.suggestGrounding = !!ad.suggestGrounding;
      cfg.bestHour = (ad.bestHour === undefined ? null : ad.bestHour);
      /* celebrateBoost gate (coordinator ruling): learning may switch on
       * celebrateEvery ONLY where the profile's celebration stance is
       * neutral — companion and adaptive (celebrateEvery off, celebration
       * 'full'). Calm and grounding chose 'quiet' (words only, nothing
       * startling): user-explicit wins, so the boost never applies there.
       * Focus and lowdemand already celebrate every check-in, so applying
       * the boost there would only duplicate what the user already chose. */
      if (ad.celebrateBoost && (cfg.profileId === 'companion' || cfg.profileId === 'adaptive')) cfg.celebrateEvery = true;
    }
    /* Law-5 user mix (Worker 3): the user's own picks sit on top of the
     * style pick and on top of anything learned, and each pick moves its
     * own axis only. Learning never writes these words; they change only
     * when the user taps in the Your own mix settings. */
    var tg = state.toggles || {};
    if (tg.celebration) cfg.celebration = tg.celebration;
    if (tg.promptVariety) { cfg.promptStyle = tg.promptVariety; cfg.promptVariety = tg.promptVariety; }
    if (tg.petEnergy) cfg.petEnergy = tg.petEnergy;
    if (tg.reminderIntensity) cfg.reminderIntensity = tg.reminderIntensity;
    if (cfg.suggestGrounding) cfg.groundingTools = true;
    return cfg;
  }

  /* Set one Law-5 mix pick. A blank word clears the pick back to the
   * style pick. One axis is touched; the rest are left as they were. */
  function setToggle(state, axis, value) {
    var allowed = {
      celebration: ['full', 'quiet', 'none'],
      promptVariety: ['fixed', 'varied'],
      petEnergy: ['lively', 'gentle', 'still'],
      reminderIntensity: ['gentle', 'standard']
    };
    if (!allowed[axis]) return false;
    if (!state.toggles) state.toggles = { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null };
    if (value === null || value === undefined || value === '') {
      state.toggles[axis] = null;
      saveState(state);
      return true;
    }
    if (allowed[axis].indexOf(value) === -1) return false;
    state.toggles[axis] = value;
    saveState(state);
    return true;
  }

  function setProfile(state, id) {
    if (!PROFILES[id]) return false;
    state.profile = id;
    if (PROFILES[id].forcesLearning) state.learningEnabled = true;
    saveState(state);
    return true;
  }
  function setForm(state, form) {
    if (!FORMS[form]) return false;
    state.form = form;
    saveState(state);
    return true;
  }
  function setLearningEnabled(state, on) {
    state.learningEnabled = !!on;
    if (on && !state.learning) state.learning = freshLearning();
    saveState(state);
  }
  function promptFor(state, type, now) {
    var cfg = effectiveConfig(state);
    var set = PROMPTS[type];
    var style = cfg.promptStyle;
    if (cfg.demand === 'micro' || cfg.microTypes[type]) {
      return set[style] ? pickPrompt(set, style, now) + ' ' + (MICRO_HINTS[type] || '') : set.gentle;
    }
    if (cfg.demand === 'low') {
      /* Low-demand wording set. A user-chosen 'fixed' style still wins, so
       * predictability is never traded away for the smaller ask. */
      if (style === 'fixed') return set.fixed;
      return set.low || set.gentle;
    }
    return pickPrompt(set, style, now);
  }
  function pickPrompt(set, style, now) {
    if (style === 'varied') {
      var idx = ((now || new Date()).getDate()) % set.varied.length;
      return set.varied[idx];
    }
    return set[style] || set.gentle;
  }

  /* ---------- state ---------- */
  function defaultState() {
    return {
      version: 2,
      petName: '',
      form: 'plant',          /* 'plant' | 'animal' (Phase 1) */
      category: 'plants',     /* collection kind: plants|pets|mythical|spirits|robots|aliens (2026-10-15) */
      species: '',            /* chosen species name from the roster, e.g. 'Fox' */
      companionPersonality: '', /* chosen personality card id, e.g. 'scholar' */
      identityLine: '',       /* species + personality one-liner made at adoption */
      careStyle: 'balanced',  /* casual|balanced|dedicated|hardcore — pacing only, never punishment */
      profile: 'companion',   /* support profile id (Phase 2) */
      learningEnabled: false, /* on-device learning opt-in (Phase 2) */
      calmMode: false,        /* reduced motion + muted palette */
      pauseScreen: 'blank',   /* what Pause shows: 'blank' | 'companion' | 'colour' */
      toggles: { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null }, /* Law-5 mix (Worker 3): null = use the style pick; a word set here is the user's own pick and wins on that one axis only */
      createdDate: '',
      sunshine: 0,
      checkins: {},   /* { 'YYYY-MM-DD': { mood:{value,points}, water:{glasses,points}, movement:{level,points}, sleep:{hours,points} } } */
      careDays: [],   /* sorted unique date keys with >= 1 check-in — never decreases */
      learning: freshLearning()
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var base = defaultState();
      for (var k in base) { if (s[k] === undefined) s[k] = base[k]; }
      if (!s.learning || !s.learning.signals) s.learning = freshLearning();
      return s;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode etc. — app still works in-session */ }
  }

  function dayRecord(state, key) {
    if (!state.checkins[key]) state.checkins[key] = {};
    return state.checkins[key];
  }

  function typesDone(day) {
    if (!day) return 0;
    var n = 0;
    if (day.mood) n++;
    if (day.water && day.water.glasses > 0) n++;
    if (day.movement) n++;
    if (day.sleep) n++;
    return n;
  }

  function markCareDay(state, key) {
    if (state.careDays.indexOf(key) === -1) {
      state.careDays.push(key);
      state.careDays.sort();
    }
  }

  /* Current streak = consecutive care days ending today (or yesterday, if
   * today hasn't happened yet). A gap simply starts a new gentle streak —
   * total care days (careDays.length) is never reset. */
  function currentStreak(state, now) {
    var t = todayKey(now);
    var cursor = null;
    if (state.careDays.indexOf(t) !== -1) cursor = t;
    else if (state.careDays.indexOf(shiftKey(t, -1)) !== -1) cursor = shiftKey(t, -1);
    if (!cursor) return 0;
    var streak = 0;
    while (state.careDays.indexOf(cursor) !== -1) {
      streak++;
      cursor = shiftKey(cursor, -1);
    }
    return streak;
  }

  /* True when the last care day is older than yesterday and today is not yet
   * cared for — i.e. there was at least one full rest day. */
  function hadRestDay(state, now) {
    if (!state.careDays.length) return false;
    var t = todayKey(now);
    if (state.careDays.indexOf(t) !== -1) return false;
    var last = state.careDays[state.careDays.length - 1];
    return last < shiftKey(t, -1);
  }

  function stagesFor(form) { return (FORMS[form] || FORMS.plant).stages; }
  function stageFor(sunshine, form) {
    var list = stagesFor(form);
    var stage = list[0];
    for (var i = 0; i < list.length; i++) {
      if (sunshine >= list[i].min) stage = list[i];
    }
    return stage;
  }
  function nextStage(stage, form) {
    var list = stagesFor(form);
    var i = list.indexOf(stage);
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  }
  function moodFile(state, mood) {
    var f = FORMS[state.form] || FORMS.plant;
    if (mood === 'celebrate' && state.calmMode && f.moods.celebrateCalm) {
      return f.moods.celebrateCalm;
    }
    return f.moods[mood] || stageFor(state.sunshine, state.form).file;
  }

  /* ---------- check-ins (each earns sunshine once per day) ---------- */
  function applyCheckin(state, type, payload, now) {
    now = now || new Date();
    var key = todayKey(now);
    var day = dayRecord(state, key);
    var stageBefore = stageFor(state.sunshine, state.form).id;
    var wasDone = type === 'water' ? !!(day.water && day.water.glasses > 0) : !!day[type];
    var sunshineBefore = state.sunshine;
    var careFactor = CARE_STYLE_FACTORS[state.careStyle] || 1;

    if (type === 'mood') {
      if (!day.mood) {
        day.mood = { value: payload.value, points: POINTS.mood };
        state.sunshine += POINTS.mood;
      } else {
        day.mood.value = payload.value; /* changing your answer is fine, no extra points */
      }
    } else if (type === 'water') {
      if (!day.water) day.water = { glasses: 0, points: 0 };
      var target = Math.max(0, Math.min(POINTS.waterMaxGlasses, payload.glasses));
      var newPoints = target * POINTS.waterPerGlass;
      state.sunshine += (newPoints - day.water.points);
      day.water.glasses = target;
      day.water.points = newPoints;
      /* glasses back to 0 => water no longer counts as done; points reconcile to 0. */
    } else if (type === 'movement') {
      var pts = payload.level === 'lot' ? POINTS.movementLot : POINTS.movementLittle;
      if (!day.movement) {
        day.movement = { level: payload.level, points: pts };
        state.sunshine += pts;
      } else {
        day.movement.level = payload.level; /* record updates, points stay as first earned */
      }
    } else if (type === 'sleep') {
      if (!day.sleep) {
        day.sleep = { hours: payload.hours, points: POINTS.sleep };
        state.sunshine += POINTS.sleep;
      } else {
        day.sleep.hours = payload.hours;
      }
    } else {
      return { ok: false, reason: 'unknown type' };
    }

    /* Care-style pacing: Dedicated/Hardcore grow faster. Balanced and
     * Casual use factor 1, so the standard sunshine math never moves. */
    if (careFactor !== 1 && state.sunshine !== sunshineBefore) {
      state.sunshine = sunshineBefore + Math.round((state.sunshine - sunshineBefore) * careFactor);
    }

    var isDone = type === 'water' ? (day.water && day.water.glasses > 0) : !!day[type];
    if (typesDone(day) > 0) markCareDay(state, key);

    /* Learning signals: count a completion once per type per day, when a
     * type first becomes done today, and note the hour — on-device only.
     * The countedDone guard matters for water, the one reversible check-in:
     * glasses 1 -> 0 -> 1 in one day is still a single completion. */
    if (state.learningEnabled && isDone && !wasDone) {
      if (!state.learning) state.learning = freshLearning();
      var sig = state.learning.signals;
      if (!sig.countedDone) sig.countedDone = {};
      var doneKey = key + '|' + type;
      if (!sig.countedDone[doneKey]) {
        sig.countedDone[doneKey] = 1;
        if (!sig.byType[type]) sig.byType[type] = { done: 0, shown: 0 };
        sig.byType[type].done += 1;
        var hr = String(now.getHours());
        if (!sig.byHour[hr]) sig.byHour[hr] = { done: 0 };
        sig.byHour[hr].done += 1;
        computeAdaptations(state, now);
      }
    }

    saveState(state);
    return {
      ok: true,
      sunshine: state.sunshine,
      stageBefore: stageBefore,
      stageAfter: stageFor(state.sunshine, state.form).id,
      stageUp: stageFor(state.sunshine, state.form).id !== stageBefore,
      allDone: typesDone(day) === 4,
      typesDone: typesDone(day)
    };
  }

  /* ---------- pet mood (never guilt-tripping) ---------- */
  function petMood(state, now, celebrating) {
    if (celebrating) return 'celebrate';
    var day = state.checkins[todayKey(now)];
    var done = typesDone(day);
    var hour = (now || new Date()).getHours();
    if (done > 0) return 'happy';
    if (hour >= 21 || hour < 5) return 'sleepy';
    if (hour >= 17) return 'low';
    return 'stage';
  }

  var MESSAGES = {
    celebrate: [
      'Look at us grow! Thank you for caring so well today. 🎉',
      'Something wonderful just happened — we grew a little! 🎉'
    ],
    happy: [
      'That little bit of care made my day brighter. Thank you. 💚',
      'Sunshine tastes nice. So glad you showed up for yourself today.',
      'We make a good team, you and I. 🌱'
    ],
    sleepy: [
      'Time to curl up and rest. Rest is care, too — see you tomorrow. 🌙',
      'Yawning a little… thanks for checking in. Sweet dreams when you get there.'
    ],
    low: [
      'No rush at all. One tiny sip of water or one deep breath is plenty — I\'ll be right here.',
      'Quiet days are okay. I\'m happy just sitting with you. 🌿'
    ],
    stage: [
      'Hi hi! Whenever you\'re ready, one tiny check-in is a lovely place to start.',
      'Growing slowly is still growing. I\'m glad you\'re here. 🌱'
    ],
    bodyDouble: 'I\'ll stay right here with you while you do it. No hurry — we start when you start.',
    control: 'You are in control here. Everything in Rootling is optional, and I will simply wait whenever you need me to.'
  };

  /* Literal message set (calm profile, literal: true). Same moods, plain
   * facts only: no metaphors, no implied feelings to decode, no praise that
   * needs interpreting. Facts are stated definitively and stay stable. */
  var MESSAGES_LITERAL = {
    celebrate: [
      'You finished a check-in. It is saved on this device. The picture stays the same.'
    ],
    happy: [
      'You did a check-in today. It is saved on this device.',
      'A check-in is done. Your companion is here with you.'
    ],
    sleepy: [
      'It is evening. You can rest now. The app will be here tomorrow, the same as today.'
    ],
    low: [
      'You have not done a check-in yet today. That is allowed. Nothing has been lost.',
      'No check-in yet today. Your companion is here. You can do one, or not.'
    ],
    stage: [
      'This is the home screen. Your companion is shown above. The check-ins are below, in the same order as always.',
      'Nothing has changed since your last visit except what you changed. The check-ins are below.'
    ]
  };

  function pickMessage(mood, state, literal) {
    var list = (literal && MESSAGES_LITERAL[mood]) || MESSAGES[mood] || MESSAGES.stage;
    var seed = (state.sunshine + todayKey().length) % list.length;
    return list[seed];
  }

  /* ---------- executive-function copy (Daniel's ADHD spec, 2026-10-15) --
   * The exact strings the executive modules render. Rules held throughout:
   * externalise, never exhort; no shame; releasing is a decision, not a
   * failure; parked things are SAFE (stated, every time); the pet states
   * facts and returns the choice — it never certifies outcomes.
   * Placeholders: {text} {nextStep} {event} {time} {leaveBy} {oldText} {newText} */
  var EXEC_COPY = {
    /* Return-to-task: the pet holds the open loop and re-presents it. */
    resumeHeadline: 'You were in the middle of: {text}',
    resumeNextStep: 'Next step: {nextStep}',
    resumeButton: 'Pick it back up',
    resumeLaterButton: 'Not now — keep holding it',
    resumeWelcome: 'Back to it, right where you left it. Nothing was lost while you were away.',
    /* Release: first-class, guilt-free, final. No graveyard, no tally. */
    releaseButton: 'Let this go',
    releaseConfirm: 'Let this one go? It leaves your list completely — no record kept, no tally, nothing to feel behind on. Letting go is a decision, not a failure.',
    releaseDone: 'Released, and gone. Your list holds only what you choose to hold.',
    /* Catch it and park it: the thought is safe, the priority is guarded. */
    parkButton: 'Catch it & park it',
    parkAck: 'Parked. It is safe here — you do not have to hold it in your head, and it will not interrupt you.',
    parkResurface: 'That is done. One thing you parked earlier: {text}. Take it next, or leave it parked — it stays safe either way.',
    parkedCount: '{n} parked, all safe.',
    /* Priority anchor: one at a time; switching is deliberate + reflected. */
    prioritySet: 'Your priority: {text}. Everything else waits behind it — I will hold it here for you.',
    prioritySwitch: 'New priority: {newText}. {oldText} is parked, safe — nothing was dropped.',
    priorityDone: 'Priority done. That counts, completely.',
    priorityFirst: 'First, the one thing: {text}',
    /* Focus sessions: pet present (body doubling, honestly framed), visible
     * timer, next-step-only, gentle re-anchor after interruption. */
    sessionStart: 'I will sit here with you while you work on {text}. The timer is on screen, and you can stop any time — stopping is always allowed.',
    sessionReanchor: 'Still on {text} — pick it back up?',
    sessionEnd: 'Session closed. Whatever got done counts; whatever did not simply stays held for next time.',
    sessionPresenceNote: 'Some people find company helps them start. There is no score here — the timer only shows time passing.',
    /* Pet-held schedule: reminders escalate as information, never alarm. */
    eventHeld: 'Held for you: {event}, {time}. You do not need to remember it — I have it.',
    eventSoon: 'Coming up: {event}, {time}. That is information, not a hurry.',
    eventLeaveBy: 'For {event}: leaving at {leaveBy} is the plan — it builds in buffer.',
    eventNow: '{event} is at {time}. Everything you need for it is whatever you already have ready.'
  };

  /* ---------- grounding tools (Phase 2; menu restructured in the
   * condition reconciliation pass) ----------
   * Research position: 5-4-3-2-1 is ONE option among several — its evidence
   * as a standalone exercise is thin, so copy stays at "some people find".
   * Breathing is body-focus and can feel worse for some people, so it is
   * never the only offer, carries an instant stop, and is introduced by
   * BREATHING_NOTE. The menu is user-rankable (see GROUND_MENU + the
   * groundMenuOrder field in the Law-5 toggle design); the order below is
   * only the starting order. Nothing here is timed, scored, or gamified. */
  var GROUNDING_STEPS = [
    'Name 5 things you can see. Take your time — there is no timer.',
    'Name 4 things you can touch. Notice how each one feels.',
    'Name 3 things you can hear, near or far.',
    'Name 2 things you can smell — or 2 smells you like.',
    'Name 1 thing you can taste — or take one slow sip of water.',
    'That is the last step. You are here, in this room, in this moment. Your companion waited with you the whole time. There is nothing else you need to do.'
  ];
  var ORIENTING_STEPS = [
    'Look around slowly. You do not need to name anything out loud.',
    'Notice where you are: this room, this place. It is today, and you are here in it.',
    'Notice one steady thing — a wall, the floor under you, the chair holding you. That is the last step. Stop whenever you like.'
  ];
  var COLD_STEPS = [
    'If you can, hold something cold — a cold drink, a wet cloth, or cold water on your hands or face.',
    'Notice the cold feeling for as long as it helps. Stop the moment you want to. That is the last step.'
  ];
  var BREATHING_STEPS = [
    'Breathe in slowly… 2… 3… 4.',
    'Hold gently… 2… 3… 4.',
    'Breathe out slowly… 2… 3… 4… 5… 6.',
    'Rest… 2… 3. Repeat whenever you are ready — or stop here. You are in control.'
  ];
  var BREATHING_NOTE = 'This tool focuses on your breath. If that ever feels worse, stop straight away and pick a different tool — stopping changes nothing.';
  /* The Ground menu. `steps: null` = the paced-breathing panel. Users will
   * be able to reorder/hide entries (data model in the reconciliation
   * report); every entry is optional and every entry can be stopped. */
  var GROUND_MENU = [
    { id: 'senses', label: 'Notice 5-4-3-2-1', detail: 'Sight, touch, sound, smell, taste — skip any sense that does not work for you. Some people find this helps them feel present.', steps: 'GROUNDING_STEPS' },
    { id: 'orient', label: 'Look around — where am I?', detail: 'Notice the room and today\'s date. No counting, no naming out loud.', steps: 'ORIENTING_STEPS' },
    { id: 'cold', label: 'Cold water', detail: 'Hold something cold, or put cold water on your hands or face.', steps: 'COLD_STEPS' },
    { id: 'breathing', label: 'Paced breathing', detail: 'Slow breathing with the words on screen. You can stop at any point.', steps: null }
  ];

  /* ---------- DOM ---------- */
  var state = loadState();
  var celebrateUntil = 0;
  var paused = false; /* Pause/leave-quietly: while true, render() must not undo the quiet view */
  var groundingStep = -1;
  var activeGroundSteps = GROUNDING_STEPS; /* which menu sequence is running */
  var els = {};

  function $(id) { return document.getElementById(id); }

  function setPetImage(mood) {
    var img = els.petImg;
    var stage = stageFor(state.sunshine, state.form);
    var primary = mood === 'stage' ? stage.file : moodFile(state, mood);
    img.onerror = function () {
      if (img.src.indexOf(stage.file) === -1 && primary !== stage.file) {
        img.src = stage.file;
      } else if (img.src.indexOf(PLACEHOLDER) === -1) {
        img.src = PLACEHOLDER;
      }
      img.onerror = null;
    };
    if (img.getAttribute('src') !== primary) img.src = primary;
    img.classList.remove('bounce', 'sway');
    if (document.body.classList.contains('calm')) return; /* calm mode: no motion */
    if (mood === 'happy' || mood === 'celebrate') img.classList.add('bounce');
    else img.classList.add('sway');
  }

  function render(now) {
    if (paused) return; /* the quiet view owns the screen until the user returns */
    now = now || new Date();
    var adopted = !!state.petName;
    els.adoptView.hidden = adopted;
    els.mainView.hidden = !adopted;
    els.sunshineBadge.hidden = !adopted;
    var cfg = effectiveConfig(state);
    document.body.classList.toggle('calm', !!state.calmMode);
    if (!adopted) {
      /* keep adopt previews in sync with the chosen form */
      if (els.adoptImg) els.adoptImg.src = (FORMS[state.form] || FORMS.plant).firstFile;
      /* Adoption picker shows the chosen style's tagline — nobody picks blind. */
      if (els.adoptProfileTagline && els.adoptProfileSelect) {
        var ap = PROFILES[els.adoptProfileSelect.value] || PROFILES.companion;
        els.adoptProfileTagline.textContent = ap.tagline;
      }
      return;
    }

    var key = todayKey(now);
    var day = state.checkins[key] || {};
    var done = typesDone(day);
    var stage = stageFor(state.sunshine, state.form);
    var next = nextStage(stage, state.form);
    var celebrating = Date.now() < celebrateUntil;
    var mood = petMood(state, now, celebrating);

    els.petNameDisplay.textContent = state.petName;
    var stageIdx = stagesFor(state.form).indexOf(stage);
    els.stageLabel.textContent = stage.name + ' stage · ' + (FORMS[state.form] || FORMS.plant).label + ' companion · Level ' + (stageIdx + 1);
    if (els.petIdentityLine) {
      els.petIdentityLine.textContent = state.identityLine || '';
      els.petIdentityLine.hidden = !state.identityLine;
    }
    els.sunshineCount.textContent = String(state.sunshine);

    /* Message selection. Body-doubling and control framing lead the day
     * until the first check-in at ANY daytime/evening hour — previously
     * they only showed in the 'stage' mood and vanished after 5pm, exactly
     * when an evening starter needs them. The night 'sleepy' message still
     * wins after 9pm: rest is the right offer then. Literal profiles get
     * the literal message set. */
    var profFlags = PROFILES[state.profile] || PROFILES.companion;
    var msg;
    if (celebrating) msg = pickMessage('celebrate', state, cfg.literal);
    else if (done > 0) msg = pickMessage(mood, state, cfg.literal);
    else if (mood === 'sleepy') msg = pickMessage('sleepy', state, cfg.literal);
    else if (cfg.bodyDouble) msg = MESSAGES.bodyDouble;
    else if (profFlags.controlFraming) msg = MESSAGES.control;
    else msg = pickMessage(mood, state, cfg.literal);
    els.petMessage.textContent = msg;
    setPetImage(mood);

    if (next) {
      var span = next.min - stage.min;
      var into = state.sunshine - stage.min;
      els.growthText.textContent = (next.min - state.sunshine) + ' more sunshine to grow into a ' + next.name + ' 🌿';
      els.growthFill.style.width = Math.round((into / span) * 100) + '%';
      els.growthBarWrap.setAttribute('aria-valuenow', String(Math.round((into / span) * 100)));
    } else {
      els.growthText.textContent = state.form === 'animal'
        ? 'All grown — and still right beside you every day. 🌸'
        : 'Fully bloomed — and still growing with you every day. 🌸';
      els.growthFill.style.width = '100%';
      els.growthBarWrap.setAttribute('aria-valuenow', '100');
    }

    els.streakCount.textContent = String(currentStreak(state, now));
    els.totalCareDays.textContent = String(state.careDays.length);
    els.todayCount.textContent = String(done);

    var rest = hadRestDay(state, now);
    els.restNote.hidden = !rest;
    if (rest) els.restNote.textContent = (FORMS[state.form] || FORMS.plant).restText;

    /* Profile-driven prompt wording */
    if (els.qMood) els.qMood.textContent = promptFor(state, 'mood', now);
    if (els.qWater) els.qWater.textContent = promptFor(state, 'water', now);
    if (els.qMovement) els.qMovement.textContent = promptFor(state, 'movement', now);
    if (els.qSleep) els.qSleep.textContent = promptFor(state, 'sleep', now);
    setHint('hint-mood', cfg, 'mood'); setHint('hint-water', cfg, 'water');
    setHint('hint-movement', cfg, 'movement'); setHint('hint-sleep', cfg, 'sleep');
    if (els.demandNote) {
      els.demandNote.hidden = !(cfg.demand === 'low');
      if (cfg.demand === 'low') els.demandNote.textContent = 'Low-demand day: the smallest version of each check-in is the whole check-in, and it counts fully. One check-in is a full day. None today loses nothing — your companion and everything you have grown stay exactly as they are.';
    }
    if (els.checkinsIntro) {
      els.checkinsIntro.textContent = cfg.literal
        ? 'There are 4 check-ins. Each one can be done once per day. Doing 1 is enough. Doing 0 is also okay — nothing is lost.'
        : 'Any one of these is enough. Small counts. Each check-in gives your companion a little sunshine — once a day each.';
    }

    /* Preview card (predictability profiles, or when the user opens it) */
    if (els.previewCard) {
      els.previewCard.hidden = !cfg.previews;
      if (cfg.previews && els.previewList) {
        var items = [
          ['Mood', !!day.mood], ['Water', !!(day.water && day.water.glasses > 0)],
          ['Movement', !!day.movement], ['Sleep', !!day.sleep]
        ];
        els.previewList.innerHTML = items.map(function (it) {
          return '<li>' + (it[1] ? '✓ ' : '○ ') + it[0] + (it[1] ? ' — done' : ' — not yet') + '</li>';
        }).join('');
      }
    }

    /* Grounding card visibility: profile tool, learned suggestion, or user-opened */
    if (els.groundingCard) {
      els.groundingCard.hidden = !cfg.groundingTools;
    }

    /* Settings reflect current state */
    if (els.profileSelect) els.profileSelect.value = state.profile;
    if (els.learnCheckbox) { els.learnCheckbox.checked = !!state.learningEnabled; els.learnCheckbox.disabled = !!PROFILES[state.profile].forcesLearning; }
    if (els.learnDisabledNote) els.learnDisabledNote.hidden = !PROFILES[state.profile].forcesLearning;
    if (els.calmCheckbox) els.calmCheckbox.checked = !!state.calmMode;
    if (els.pauseScreenSelect) els.pauseScreenSelect.value = state.pauseScreen || 'blank';
    var csRadios = document.querySelectorAll('input[name="care-style"]');
    for (var ci = 0; ci < csRadios.length; ci++) {
      csRadios[ci].checked = (csRadios[ci].value === (state.careStyle || 'balanced'));
    }
    if (els.profileTagline) els.profileTagline.textContent = (PROFILES[state.profile] || PROFILES.companion).tagline;

    /* Check-in cards */
    els.doneMood.hidden = !day.mood;
    els.doneWater.hidden = !(day.water && day.water.glasses > 0);
    els.doneMovement.hidden = !day.movement;
    els.doneSleep.hidden = !day.sleep;
    els.cardMood.classList.toggle('done', !!day.mood);
    els.cardWater.classList.toggle('done', !!(day.water && day.water.glasses > 0));
    els.cardMovement.classList.toggle('done', !!day.movement);
    els.cardSleep.classList.toggle('done', !!day.sleep);
    els.allDoneNote.hidden = done !== 4;
    if (done === 4 && els.allDoneNote) {
      els.allDoneNote.textContent = state.form === 'animal'
        ? '🎉 All four check-ins done — what a lovely day of care. Your companion is glowing.'
        : '🎉 All four check-ins done — what a lovely day of care. Rootling is glowing.';
    }

    var moodBtns = document.querySelectorAll('.mood-btn');
    for (var i = 0; i < moodBtns.length; i++) {
      var sel = day.mood && Number(moodBtns[i].getAttribute('data-mood')) === day.mood.value;
      moodBtns[i].classList.toggle('selected', !!sel);
      moodBtns[i].setAttribute('aria-checked', sel ? 'true' : 'false');
    }

    var glasses = day.water ? day.water.glasses : 0;
    els.waterCount.textContent = String(glasses);
    var gHtml = '';
    for (var g = 0; g < POINTS.waterMaxGlasses; g++) {
      gHtml += '<span class="' + (g < glasses ? 'glass-full' : 'glass-empty') + '" aria-hidden="true">🥛</span>';
    }
    els.glassesDisplay.innerHTML = gHtml;
    els.waterMinus.disabled = glasses <= 0;
    els.waterPlus.disabled = glasses >= POINTS.waterMaxGlasses;

    els.moveLittle.classList.toggle('selected', !!(day.movement && day.movement.level === 'little'));
    els.moveLot.classList.toggle('selected', !!(day.movement && day.movement.level === 'lot'));

    if (day.sleep) {
      els.sleepSlider.value = String(day.sleep.hours);
      els.sleepOutput.textContent = String(day.sleep.hours);
    }
    renderLearned();
  }

  function setHint(id, cfg, type) {
    var el = $(id);
    if (!el) return;
    if (cfg.demand === 'micro' || cfg.microTypes[type]) {
      el.hidden = false;
      el.textContent = MICRO_HINTS[type] + (cfg.microTypes[type] && PLAN_B[type] ? ' ' + PLAN_B[type] : '');
    } else if (cfg.demand === 'low') {
      el.hidden = false;
      el.textContent = LOW_HINTS[type];
    } else {
      el.hidden = true;
    }
  }

  function renderLearned() {
    if (!els.learnedList) return;
    var facts = learnedFacts(state);
    els.learnedList.innerHTML = facts.length
      ? facts.map(function (f) { return '<li>' + f + '</li>'; }).join('')
      : '<li>Nothing learned yet. As you use Rootling, anything your companion adjusts will be listed here in plain language. Learning only happens if you turn it on, and it never leaves this device.</li>';
    renderMemory();
  }

  function readNotificationsStore() {
    try {
      var raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function renderMemory() {
    if (!els.memoryStats) return;
    var stats = memoryStats(state, readNotificationsStore());
    var kb = Math.max(1, Math.round(stats.totalBytes / 1024));
    els.memoryStats.textContent = 'Your pet remembers: ' + stats.checkinDays + ' check-in day(s), ' + stats.learningDaysObserved +
      ' day(s) observed for patterns, ' + stats.patternDetailDays + ' day(s) of pattern detail, ' + stats.learnedEntries +
      ' remembered adjustment(s), and ' + stats.notificationEntries + ' alert-log entr(ies) — about ' + kb + ' KB, all on this device.';
    if (els.memoryStatus) {
      if (stats.nearLimit) {
        els.memoryStatus.textContent = 'That is close to what this browser can store for one site. Download a memory backup first, so nothing your pet remembers is at risk.';
      } else if (!els.memoryStatus.textContent) {
        els.memoryStatus.textContent = 'Nothing here is ever deleted automatically. Pruning and forgetting only happen when you use the buttons below.';
      }
    }
  }

  function afterCheckin(result) {
    var cfg = effectiveConfig(state);
    /* 'quiet' celebration (calm / grounding styles): identical reward,
     * words only — the pet picture never swaps suddenly and nothing moves.
     * A stage-up still happens in the numbers; it is announced by the
     * growth text, not by a surprise picture change. */
    var quiet = cfg.celebration === 'quiet' || cfg.celebration === 'none';
    if (!quiet && result && (result.stageUp || result.allDone || cfg.celebrateEvery)) {
      celebrateUntil = Date.now() + 6000;
      render();
      setTimeout(function () { render(); }, 6200);
    } else {
      render();
    }
  }

  /* Pause / leave quietly — one tap, no confirmation, nothing recorded.
   * Motion stops (calm class forced), both views hide, the user's chosen
   * neutral screen shows. Resume returns to the exact prior view via
   * render(); state is untouched and the pause itself is never logged. */
  function pauseApp() {
    paused = true;
    document.body.classList.add('calm');
    els.adoptView.hidden = true;
    els.mainView.hidden = true;
    els.sunshineBadge.hidden = true;
    var mode = state.pauseScreen || 'blank';
    if (els.quietArt) {
      els.quietArt.hidden = mode !== 'companion';
      if (mode === 'companion') els.quietArt.src = (FORMS[state.form] || FORMS.plant).moods.sleepy;
    }
    if (els.quietColour) els.quietColour.hidden = mode !== 'colour';
    if (els.quietView) els.quietView.hidden = false;
  }
  function resumeApp() {
    paused = false;
    if (els.quietView) els.quietView.hidden = true;
    render(); /* restores views + calm class from state.calmMode */
  }

  function bind() {
    if (els.pauseBtn) els.pauseBtn.addEventListener('click', pauseApp);
    if (els.quietResumeBtn) els.quietResumeBtn.addEventListener('click', resumeApp);
    if (els.pauseScreenSelect) {
      els.pauseScreenSelect.addEventListener('change', function () {
        state.pauseScreen = this.value;
        saveState(state);
      });
    }
    /* Form picker on the adopt screen */
    var formBtns = document.querySelectorAll('[data-form-choice]');
    for (var f = 0; f < formBtns.length; f++) {
      formBtns[f].addEventListener('click', function () {
        setForm(state, this.getAttribute('data-form-choice'));
        for (var j = 0; j < formBtns.length; j++) {
          var on = formBtns[j].getAttribute('data-form-choice') === state.form;
          formBtns[j].classList.toggle('selected', on);
          formBtns[j].setAttribute('aria-checked', on ? 'true' : 'false');
        }
        if (els.adoptImg) els.adoptImg.src = FORMS[state.form].firstFile;
      });
    }
    if (els.adoptProfileSelect) {
      els.adoptProfileSelect.addEventListener('change', function () {
        if (els.adoptLearnCheckbox && PROFILES[this.value] && PROFILES[this.value].forcesLearning) {
          els.adoptLearnCheckbox.checked = true;
        }
        if (els.adoptProfileTagline && PROFILES[this.value]) {
          els.adoptProfileTagline.textContent = PROFILES[this.value].tagline;
        }
      });
    }

    els.adoptForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = els.petNameInput.value.trim().slice(0, 24);
      if (!name) name = 'Rootling';
      state.petName = name;
      state.createdDate = todayKey();
      if (els.adoptProfileSelect) setProfile(state, els.adoptProfileSelect.value);
      if (els.adoptLearnCheckbox) setLearningEnabled(state, els.adoptLearnCheckbox.checked || state.learningEnabled);
      /* Collection rebuild (2026-10-15): the card steps in companions.js
       * leave the chosen kind, species, and personality in a pending
       * note; adoption records them on the pet and in the collection. */
      try {
        var pendingRaw = localStorage.getItem('rootling-pending-adopt-v1');
        var pending = pendingRaw ? JSON.parse(pendingRaw) : null;
        if (pending) {
          if (pending.category) state.category = pending.category;
          if (pending.species) state.species = pending.species;
          if (pending.personalityId) state.companionPersonality = pending.personalityId;
          if (pending.identityLine) state.identityLine = pending.identityLine;
          if (typeof window !== 'undefined' && window.RootlingCompanions && window.RootlingCompanions.registerAdoption) {
            window.RootlingCompanions.registerAdoption({
              name: name, form: state.form, category: state.category,
              species: state.species, personality: state.companionPersonality,
              identityLine: state.identityLine
            });
          }
        }
      } catch (e) { /* the adoption itself still stands */ }
      if (PROFILES[state.profile].calmDefault) {
        state.calmMode = true;
        if (state.learningEnabled && state.learning) state.learning.signals.calmUsed += 1;
      }
      saveState(state);
      if (PROFILES[state.profile].celebration !== 'quiet') celebrateUntil = Date.now() + 4000;
      render();
    });

    var moodBtns = document.querySelectorAll('.mood-btn');
    for (var i = 0; i < moodBtns.length; i++) {
      moodBtns[i].addEventListener('click', function () {
        var v = Number(this.getAttribute('data-mood'));
        afterCheckin(applyCheckin(state, 'mood', { value: v }));
      });
    }

    els.waterPlus.addEventListener('click', function () {
      var day = state.checkins[todayKey()] || {};
      var cur = day.water ? day.water.glasses : 0;
      afterCheckin(applyCheckin(state, 'water', { glasses: cur + 1 }));
    });
    els.waterMinus.addEventListener('click', function () {
      var day = state.checkins[todayKey()] || {};
      var cur = day.water ? day.water.glasses : 0;
      afterCheckin(applyCheckin(state, 'water', { glasses: cur - 1 }));
    });

    els.moveLittle.addEventListener('click', function () {
      afterCheckin(applyCheckin(state, 'movement', { level: 'little' }));
    });
    els.moveLot.addEventListener('click', function () {
      afterCheckin(applyCheckin(state, 'movement', { level: 'lot' }));
    });

    els.sleepSlider.addEventListener('input', function () {
      els.sleepOutput.textContent = els.sleepSlider.value;
    });
    var chips = document.querySelectorAll('[data-sleep]');
    for (var c = 0; c < chips.length; c++) {
      chips[c].addEventListener('click', function () {
        els.sleepSlider.value = this.getAttribute('data-sleep');
        els.sleepOutput.textContent = this.getAttribute('data-sleep');
      });
    }
    els.sleepSave.addEventListener('click', function () {
      afterCheckin(applyCheckin(state, 'sleep', { hours: Number(els.sleepSlider.value) }));
    });

    /* Settings: profile / learning / calm / form switch — all changeable anytime */
    if (els.profileSelect) {
      els.profileSelect.addEventListener('change', function () {
        setProfile(state, this.value);
        if (PROFILES[state.profile].calmDefault && !state.calmMode) {
          state.calmMode = true;
          if (state.learningEnabled && state.learning) state.learning.signals.calmUsed += 1;
        }
        saveState(state);
        render();
      });
    }
    if (els.learnCheckbox) {
      els.learnCheckbox.addEventListener('change', function () {
        setLearningEnabled(state, this.checked);
        render();
      });
    }
    if (els.calmCheckbox) {
      els.calmCheckbox.addEventListener('change', function () {
        state.calmMode = this.checked;
        if (this.checked && state.learningEnabled && state.learning) state.learning.signals.calmUsed += 1;
        saveState(state);
        render();
      });
    }
    var switchBtns = document.querySelectorAll('[data-form-switch]');
    for (var s = 0; s < switchBtns.length; s++) {
      switchBtns[s].addEventListener('click', function () {
        /* Switching form keeps name, sunshine, check-ins and learning — only the art changes. */
        setForm(state, this.getAttribute('data-form-switch'));
        render();
      });
    }
    if (els.learnedToggle) {
      els.learnedToggle.addEventListener('click', function () {
        els.learnedView.hidden = !els.learnedView.hidden;
        if (!els.learnedView.hidden) renderLearned();
      });
    }
    /* Integration (USABILITY-MAP density fix): the Learned view leads
     * with three short lines; the full list opens on one labeled tap. */
    var learnedSeeAllBtn = $('learned-see-all-btn');
    if (learnedSeeAllBtn) {
      learnedSeeAllBtn.addEventListener('click', function () {
        var list = $('learned-list');
        if (!list) return;
        list.hidden = !list.hidden;
        learnedSeeAllBtn.textContent = list.hidden ? 'See everything' : 'Hide the list';
      });
    }
    if (els.resetLearningBtn) {
      els.resetLearningBtn.addEventListener('click', function () {
        resetLearning(state);
        render();
      });
    }
    if (els.pruneLearningBtn) {
      els.pruneLearningBtn.addEventListener('click', function () {
        var removed = pruneLearningDetails(state);
        if (els.memoryStatus) els.memoryStatus.textContent = removed > 0
          ? 'Day-by-day pattern details forgotten (' + removed + ' dated entries). Your totals, adjustments and check-in history are unchanged.'
          : 'There were no day-by-day pattern details to forget.';
        render();
      });
    }
    if (els.exportMemoryBtn) {
      els.exportMemoryBtn.addEventListener('click', function () {
        try {
          var text = serializeMemoryExport(state, readNotificationsStore());
          var blob = new Blob([text], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'rootling-memory-' + todayKey() + '.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          if (els.memoryStatus) els.memoryStatus.textContent = 'Memory backup downloaded. Keep it somewhere safe — it can restore this pet, or move it to a future Rootling app.';
        } catch (e) {
          if (els.memoryStatus) els.memoryStatus.textContent = 'This browser would not start the download. Your memory is unchanged and still on this device.';
        }
      });
    }
    if (els.importMemoryInput) {
      els.importMemoryInput.addEventListener('change', function () {
        var file = els.importMemoryInput.files && els.importMemoryInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            applyMemoryImport(String(reader.result || ''));
            if (els.memoryStatus) els.memoryStatus.textContent = 'Memory backup restored. Rootling will reload so every part of your pet wakes up with its memory.';
            setTimeout(function () { window.location.reload(); }, 600);
          } catch (e) {
            if (els.memoryStatus) els.memoryStatus.textContent = e.message + ' Nothing was changed.';
          }
        };
        reader.onerror = function () {
          if (els.memoryStatus) els.memoryStatus.textContent = 'That file could not be read. Nothing was changed.';
        };
        reader.readAsText(file);
      });
    }

    /* Grounding tools — a menu of options, stepped, gentle exits
     * everywhere, no timers, no scores, no surprises. Every sequence runs
     * through the same panel and the same Stop control. */
    function noteGroundingUse() {
      if (state.learningEnabled && state.learning) {
        state.learning.signals.groundingUsed += 1;
        computeAdaptations(state);
        saveState(state);
      }
    }
    function startGroundSequence(steps) {
      activeGroundSteps = steps;
      groundingStep = 0;
      noteGroundingUse();
      els.groundingPanel.hidden = false;
      els.breathingPanel.hidden = true;
      els.groundingText.textContent = steps[0];
      els.groundNext.textContent = steps.length === 1 ? 'Finish' : 'Next';
    }
    if (els.groundStart) {
      els.groundStart.addEventListener('click', function () { startGroundSequence(GROUNDING_STEPS); });
    }
    if (els.groundOrientStart) {
      els.groundOrientStart.addEventListener('click', function () { startGroundSequence(ORIENTING_STEPS); });
    }
    if (els.groundColdStart) {
      els.groundColdStart.addEventListener('click', function () { startGroundSequence(COLD_STEPS); });
    }
    if (els.groundNext) {
      els.groundNext.addEventListener('click', function () {
        groundingStep += 1;
        if (groundingStep >= activeGroundSteps.length) {
          els.groundingPanel.hidden = true;
          groundingStep = -1;
          return;
        }
        els.groundingText.textContent = activeGroundSteps[groundingStep];
        els.groundNext.textContent = groundingStep === activeGroundSteps.length - 1 ? 'Finish' : 'Next';
      });
    }
    if (els.groundStop) {
      els.groundStop.addEventListener('click', function () {
        els.groundingPanel.hidden = true;
        groundingStep = -1;
      });
    }
    if (els.breathStart) {
      els.breathStart.addEventListener('click', function () {
        noteGroundingUse();
        els.breathingPanel.hidden = false;
        els.groundingPanel.hidden = true;
        groundingStep = -1;
        els.breathingText.textContent = BREATHING_NOTE + ' ' + BREATHING_STEPS.join(' ');
      });
    }
    if (els.breathStop) {
      els.breathStop.addEventListener('click', function () {
        els.breathingPanel.hidden = true;
      });
    }

    /* Care style (2026-10-15): pacing only — see CARE_STYLE_FACTORS. */
    var careRadios = document.querySelectorAll('input[name="care-style"]');
    for (var cri = 0; cri < careRadios.length; cri++) {
      careRadios[cri].addEventListener('change', function () {
        state.careStyle = this.value;
        saveState(state);
        var csStatus = $('care-style-status');
        if (csStatus) csStatus.textContent = 'Care style saved. Your companion grows at this pace now — and still never suffers on a missed day.';
        render();
      });
    }

    els.resetBtn.addEventListener('click', function () {
      var ok = true;
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        ok = window.confirm('Start over with a brand-new companion? This clears the name, sunshine, check-ins and anything learned from this device.');
      }
      if (!ok) return;
      state = defaultState();
      saveState(state);
      try {
        if (typeof window !== 'undefined' && window.RootlingCompanions && window.RootlingCompanions.forgetLive) window.RootlingCompanions.forgetLive();
      } catch (e) { /* the reset itself still stands */ }
      celebrateUntil = 0;
      groundingStep = -1;
      activeGroundSteps = GROUNDING_STEPS;
      els.petNameInput.value = '';
      render();
    });
  }

  function init() {
    els.adoptView = $('adopt-view');
    els.mainView = $('main-view');
    els.sunshineBadge = $('sunshine-badge');
    els.sunshineCount = $('sunshine-count');
    els.adoptForm = $('adopt-form');
    els.petNameInput = $('pet-name-input');
    els.petImg = $('pet-img');
    els.adoptImg = $('adopt-img');
    if (els.adoptImg) {
      els.adoptImg.onerror = function () {
        if (els.adoptImg.src.indexOf(PLACEHOLDER) === -1) els.adoptImg.src = PLACEHOLDER;
        els.adoptImg.onerror = null;
      };
    }
    els.adoptProfileSelect = $('adopt-profile-select');
    els.adoptProfileTagline = $('adopt-profile-tagline');
    els.adoptLearnCheckbox = $('adopt-learn-checkbox');
    els.petNameDisplay = $('pet-name-display');
    els.petIdentityLine = $('pet-identity-line');
    els.stageLabel = $('stage-label');
    els.petMessage = $('pet-message');
    els.growthText = $('growth-text');
    els.growthFill = $('growth-fill');
    els.growthBarWrap = $('growth-bar-wrap');
    els.streakCount = $('streak-count');
    els.totalCareDays = $('total-care-days');
    els.todayCount = $('today-count');
    els.restNote = $('rest-note');
    els.doneMood = $('done-mood');
    els.doneWater = $('done-water');
    els.doneMovement = $('done-movement');
    els.doneSleep = $('done-sleep');
    els.cardMood = $('card-mood');
    els.cardWater = $('card-water');
    els.cardMovement = $('card-movement');
    els.cardSleep = $('card-sleep');
    els.allDoneNote = $('all-done-note');
    els.waterCount = $('water-count');
    els.glassesDisplay = $('glasses-display');
    els.waterPlus = $('water-plus');
    els.waterMinus = $('water-minus');
    els.moveLittle = $('move-little');
    els.moveLot = $('move-lot');
    els.sleepSlider = $('sleep-slider');
    els.sleepOutput = $('sleep-output');
    els.sleepSave = $('sleep-save');
    els.resetBtn = $('reset-btn');
    els.pauseBtn = $('pause-btn');
    els.quietView = $('quiet-view');
    els.quietResumeBtn = $('quiet-resume-btn');
    els.quietArt = $('quiet-art');
    els.quietColour = $('quiet-colour');
    els.pauseScreenSelect = $('pause-screen-select');
    els.qMood = $('q-mood'); els.qWater = $('q-water');
    els.qMovement = $('q-movement'); els.qSleep = $('q-sleep');
    els.checkinsIntro = $('checkins-intro');
    els.demandNote = $('demand-note');
    els.previewCard = $('preview-card');
    els.previewList = $('preview-list');
    els.groundingCard = $('grounding-card');
    els.groundStart = $('ground-start');
    els.groundOrientStart = $('ground-orient-start');
    els.groundColdStart = $('ground-cold-start');
    els.groundNext = $('ground-next');
    els.groundStop = $('ground-stop');
    els.groundingPanel = $('grounding-panel');
    els.groundingText = $('grounding-text');
    els.breathStart = $('breath-start');
    els.breathStop = $('breath-stop');
    els.breathingPanel = $('breathing-panel');
    els.breathingText = $('breathing-text');
    els.profileSelect = $('profile-select');
    els.profileTagline = $('profile-tagline');
    els.learnCheckbox = $('learn-checkbox');
    els.learnDisabledNote = $('learn-disabled-note');
    els.calmCheckbox = $('calm-checkbox');
    els.learnedToggle = $('learned-toggle');
    els.learnedView = $('learned-view');
    els.learnedList = $('learned-list');
    els.resetLearningBtn = $('reset-learning-btn');
    els.memoryStats = $('memory-stats');
    els.memoryStatus = $('memory-status');
    els.exportMemoryBtn = $('export-memory-btn');
    els.importMemoryInput = $('import-memory-input');
    els.pruneLearningBtn = $('prune-learning-btn');

    bind();
    requestPersistentStorage(false); /* first run asks the browser to keep this pet's memory persistent */
    if (state.petName && state.learningEnabled) {
      recordExposure(state, new Date());
      computeAdaptations(state, new Date());
      saveState(state);
    }
    render();

    if ('serviceWorker' in navigator) {
      try {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell is a bonus, never a blocker */ });
      } catch (e) { /* ignore */ }
    }
  }

  /* Exposed for the DOM smoke test and future debugging. */
  var api = {
    STORAGE_KEY: STORAGE_KEY,
    POINTS: POINTS,
    STAGES: STAGES,
    FORMS: FORMS,
    PROFILES: PROFILES,
    PROMPTS: PROMPTS,
    GROUNDING_STEPS: GROUNDING_STEPS,
    ORIENTING_STEPS: ORIENTING_STEPS,
    COLD_STEPS: COLD_STEPS,
    GROUND_MENU: GROUND_MENU,
    BREATHING_STEPS: BREATHING_STEPS,
    BREATHING_NOTE: BREATHING_NOTE,
    LOW_HINTS: LOW_HINTS,
    PLAN_B: PLAN_B,
    MESSAGES_LITERAL: MESSAGES_LITERAL,
    EXEC_COPY: EXEC_COPY,
    defaultState: defaultState,
    loadState: loadState,
    saveState: saveState,
    applyCheckin: applyCheckin,
    currentStreak: currentStreak,
    hadRestDay: hadRestDay,
    stageFor: stageFor,
    stagesFor: stagesFor,
    petMood: petMood,
    typesDone: typesDone,
    todayKey: todayKey,
    freshLearning: freshLearning,
    recordExposure: recordExposure,
    computeAdaptations: computeAdaptations,
    learnedFacts: learnedFacts,
    resetLearning: resetLearning,
    NOTIFICATIONS_STORAGE_KEY: NOTIFICATIONS_STORAGE_KEY,
    PERSIST_REQUESTED_KEY: PERSIST_REQUESTED_KEY,
    MEMORY_EXPORT_KIND: MEMORY_EXPORT_KIND,
    MEMORY_SOFT_LIMIT_BYTES: MEMORY_SOFT_LIMIT_BYTES,
    memoryStats: memoryStats,
    createMemoryExport: createMemoryExport,
    serializeMemoryExport: serializeMemoryExport,
    parseMemoryExport: parseMemoryExport,
    applyMemoryImport: applyMemoryImport,
    pruneLearningDetails: pruneLearningDetails,
    requestPersistentStorage: requestPersistentStorage,
    effectiveConfig: effectiveConfig,
    setProfile: setProfile,
    setForm: setForm,
    setLearningEnabled: setLearningEnabled,
    setToggle: setToggle,
    promptFor: promptFor,
    getState: function () { return state; }
  };
  if (typeof window !== 'undefined') window.SproutApp = api;
  if (typeof window !== 'undefined') window.RootlingApp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ==== Appearance and voice module (Worker 1) ====
   * Colours, word size, letter shapes, calm motion and space, plus
   * listen buttons and talk-and-type. Picks live in their own store,
   * rootling-appearance-v1, on this device only. Nothing here talks
   * to the pet store, and nothing is sent anywhere. Reading words
   * aloud and turning talk into words use the browser's own tools,
   * only when the user taps, and only when the browser truly has them. */
  (function () {
    var APPEARANCE_KEY = 'rootling-appearance-v1';
    var THEME_COLORS = { light: '#2e7d5b', dark: '#131916', contrast: '#000000' };
    var THEMES = ['light', 'dark', 'contrast'];
    var TEXT_SIZES = ['standard', 'large', 'xlarge'];
    var FONTS = ['standard', 'reading'];
    var DENSITIES = ['comfortable', 'compact'];

    function reducedMotionWanted() {
      try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) { return false; }
    }
    function loadAppearance() {
      try {
        var raw = window.localStorage.getItem(APPEARANCE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function pick(value, list, fallback) {
      return list.indexOf(value) !== -1 ? value : fallback;
    }
    var savedAppearance = loadAppearance();
    var appearanceSettings = {
      theme: pick(savedAppearance && savedAppearance.theme, THEMES, 'light'),
      textSize: pick(savedAppearance && savedAppearance.textSize, TEXT_SIZES, 'standard'),
      font: pick(savedAppearance && savedAppearance.font, FONTS, 'standard'),
      density: pick(savedAppearance && savedAppearance.density, DENSITIES, 'comfortable'),
      calmMotion: savedAppearance && typeof savedAppearance.calmMotion === 'boolean'
        ? savedAppearance.calmMotion : reducedMotionWanted(),
      voiceNoteSeen: !!(savedAppearance && savedAppearance.voiceNoteSeen === true)
    };
    function saveAppearance() {
      try { window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearanceSettings)); } catch (e) { /* storage can be full or off; the pick still works for this visit */ }
    }
    function $(id) { return document.getElementById(id); }
    function announce(message) {
      var el = $('appearance-status');
      if (el) el.textContent = message;
    }
    function applyAppearance(syncControls) {
      var rootEl = document.documentElement;
      rootEl.setAttribute('data-theme', appearanceSettings.theme);
      rootEl.setAttribute('data-text-size', appearanceSettings.textSize);
      rootEl.setAttribute('data-font', appearanceSettings.font);
      rootEl.setAttribute('data-density', appearanceSettings.density);
      rootEl.classList.toggle('calm-motion', appearanceSettings.calmMotion === true);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[appearanceSettings.theme]);
      if (syncControls) {
        if ($('appearance-theme')) $('appearance-theme').value = appearanceSettings.theme;
        if ($('appearance-text-size')) $('appearance-text-size').value = appearanceSettings.textSize;
        if ($('appearance-font')) $('appearance-font').value = appearanceSettings.font;
        if ($('appearance-density')) $('appearance-density').value = appearanceSettings.density;
        if ($('appearance-calm-motion')) $('appearance-calm-motion').checked = appearanceSettings.calmMotion === true;
      }
    }

    /* ---- Reading aloud (user taps only, never on its own) ---- */
    var ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
    var speakingTarget = null;
    var listenButtons = [];
    function resetListenButtons() {
      listenButtons.forEach(function (entry) {
        entry.btn.textContent = entry.label;
        entry.btn.setAttribute('aria-pressed', 'false');
      });
      speakingTarget = null;
    }
    function stopSpeaking() {
      if (!ttsSupported) return;
      try { window.speechSynthesis.cancel(); } catch (e) { /* nothing to stop */ }
      resetListenButtons();
    }
    function speakText(text, targetEl) {
      if (!ttsSupported || !text) return false;
      var clean = String(text).replace(/\s+/g, ' ').trim();
      if (!clean) return false;
      stopSpeaking();
      try {
        var utterance = new window.SpeechSynthesisUtterance(clean);
        utterance.onend = resetListenButtons;
        utterance.onerror = resetListenButtons;
        speakingTarget = targetEl || null;
        window.speechSynthesis.speak(utterance);
        listenButtons.forEach(function (entry) {
          if (entry.target === speakingTarget) {
            entry.btn.textContent = 'Stop listening';
            entry.btn.setAttribute('aria-pressed', 'true');
          }
        });
        return true;
      } catch (e) { resetListenButtons(); return false; }
    }
    function addListenButton(targetEl, label) {
      if (!ttsSupported || !targetEl || !targetEl.parentNode) return;
      var row = document.createElement('div');
      row.className = 'listen-row';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-soft';
      btn.textContent = label;
      btn.setAttribute('aria-pressed', 'false');
      var entry = { btn: btn, target: targetEl, label: label };
      listenButtons.push(entry);
      btn.addEventListener('click', function () {
        if (speakingTarget === targetEl) { stopSpeaking(); return; }
        speakText(targetEl.textContent, targetEl);
      });
      row.appendChild(btn);
      targetEl.parentNode.insertBefore(row, targetEl.nextSibling);
    }

    /* ---- Talk and type (off until the user says yes, once) ---- */
    var RecognitionCtor = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    var sttSupported = typeof RecognitionCtor === 'function';
    function attachVoice(textarea) {
      if (!sttSupported || !textarea || textarea.__rootlingVoiceAttached) return false;
      textarea.__rootlingVoiceAttached = true;
      var micBtn = document.createElement('button');
      micBtn.type = 'button';
      micBtn.className = 'btn btn-soft voice-mic-btn';
      micBtn.textContent = 'Talk and type';
      var note = document.createElement('div');
      note.className = 'voice-note';
      note.hidden = true;
      var noteText = document.createElement('p');
      noteText.textContent = 'Your browser turns your voice into text. Some browsers send your voice to their maker\u2019s servers to do this. Rootling never receives or stores your voice \u2014 only the words you keep.';
      var row = document.createElement('div');
      row.className = 'voice-row';
      var yesBtn = document.createElement('button');
      yesBtn.type = 'button';
      yesBtn.className = 'btn btn-primary';
      yesBtn.textContent = 'Yes, talk and type';
      var noBtn = document.createElement('button');
      noBtn.type = 'button';
      noBtn.className = 'btn btn-ghost';
      noBtn.textContent = 'Not now';
      row.appendChild(yesBtn);
      row.appendChild(noBtn);
      note.appendChild(noteText);
      note.appendChild(row);
      textarea.parentNode.insertBefore(micBtn, textarea.nextSibling);
      textarea.parentNode.insertBefore(note, micBtn.nextSibling);
      var recognition = null;
      var talking = false;
      function setTalking(on) {
        talking = on;
        micBtn.textContent = on ? 'Stop talking' : 'Talk and type';
        micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      function startTalking() {
        if (talking) return;
        try {
          recognition = new RecognitionCtor();
        } catch (e) { return; }
        var base = textarea.value || '';
        var sep = base && !/\s$/.test(base) ? ' ' : '';
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.onresult = function (event) {
          var words = '';
          for (var i = 0; i < event.results.length; i++) {
            words += event.results[i][0].transcript;
          }
          textarea.value = base + sep + words;
        };
        recognition.onend = function () { setTalking(false); };
        recognition.onerror = function () { setTalking(false); };
        try {
          recognition.start();
          setTalking(true);
        } catch (e) { setTalking(false); }
      }
      micBtn.addEventListener('click', function () {
        if (talking) {
          try { recognition.stop(); } catch (e) { setTalking(false); }
          return;
        }
        if (!appearanceSettings.voiceNoteSeen) {
          note.hidden = false;
          return;
        }
        startTalking();
      });
      yesBtn.addEventListener('click', function () {
        appearanceSettings.voiceNoteSeen = true;
        saveAppearance();
        note.hidden = true;
        startTalking();
      });
      noBtn.addEventListener('click', function () { note.hidden = true; });
      return true;
    }
    function attachAllVoiceTargets() {
      var targets = document.querySelectorAll('.voice-target');
      for (var i = 0; i < targets.length; i++) attachVoice(targets[i]);
    }

    if (typeof window !== 'undefined') {
      window.RootlingVoice = {
        supported: sttSupported,
        ttsSupported: ttsSupported,
        speak: function (text) { return speakText(text, null); },
        stop: stopSpeaking,
        attach: attachVoice
      };
      window.RootlingAppearance = {
        key: APPEARANCE_KEY,
        getSettings: function () {
          return {
            theme: appearanceSettings.theme,
            textSize: appearanceSettings.textSize,
            font: appearanceSettings.font,
            density: appearanceSettings.density,
            calmMotion: appearanceSettings.calmMotion,
            voiceNoteSeen: appearanceSettings.voiceNoteSeen
          };
        },
        apply: function () { applyAppearance(true); }
      };
    }

    function initAppearance() {
      var petApi = null;
      try { petApi = window.RootlingApp || window.SproutApp || null; } catch (e) { petApi = null; }
      if (!petApi) { /* appearance works on its own; the pet is not needed here */ }
      applyAppearance(true);
      if ($('appearance-theme')) $('appearance-theme').addEventListener('change', function () {
        appearanceSettings.theme = pick(this.value, THEMES, 'light');
        saveAppearance(); applyAppearance(false);
        announce(appearanceSettings.theme === 'dark' ? 'Saved. Dark colours are on now.'
          : appearanceSettings.theme === 'contrast' ? 'Saved. Black, white and yellow colours are on now.'
          : 'Saved. Light colours are on now.');
      });
      if ($('appearance-text-size')) $('appearance-text-size').addEventListener('change', function () {
        appearanceSettings.textSize = pick(this.value, TEXT_SIZES, 'standard');
        saveAppearance(); applyAppearance(false);
        announce(appearanceSettings.textSize === 'xlarge' ? 'Saved. Your words are at the biggest size now.'
          : appearanceSettings.textSize === 'large' ? 'Saved. Your words are bigger now.'
          : 'Saved. Word size is standard now.');
      });
      if ($('appearance-font')) $('appearance-font').addEventListener('change', function () {
        appearanceSettings.font = pick(this.value, FONTS, 'standard');
        saveAppearance(); applyAppearance(false);
        announce(appearanceSettings.font === 'reading' ? 'Saved. The easy to read letters are on now.'
          : 'Saved. The usual letters are on now.');
      });
      if ($('appearance-calm-motion')) $('appearance-calm-motion').addEventListener('change', function () {
        appearanceSettings.calmMotion = this.checked === true;
        saveAppearance(); applyAppearance(false);
        announce(appearanceSettings.calmMotion ? 'Saved. All moving and fading is off now.'
          : 'Saved. Gentle moving is on now. You can turn it off here any time.');
      });
      if ($('appearance-density')) $('appearance-density').addEventListener('change', function () {
        appearanceSettings.density = pick(this.value, DENSITIES, 'comfortable');
        saveAppearance(); applyAppearance(false);
        announce(appearanceSettings.density === 'compact' ? 'Saved. There is less space between things now.'
          : 'Saved. There is more space between things now.');
      });
      addListenButton($('pet-message'), 'Listen to your pet');
      addListenButton($('grounding-text'), 'Listen to this step');
      attachAllVoiceTargets();
      if (typeof MutationObserver === 'function' && document.body) {
        try {
          var observer = new MutationObserver(function (records) {
            records.forEach(function (record) {
              record.addedNodes.forEach(function (node) {
                if (node && node.nodeType === 1) {
                  if (node.classList && node.classList.contains('voice-target')) attachVoice(node);
                  if (node.querySelectorAll) {
                    var inner = node.querySelectorAll('.voice-target');
                    for (var j = 0; j < inner.length; j++) attachVoice(inner[j]);
                  }
                }
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) { /* late boxes can still be wired by hand with RootlingVoice.attach */ }
      }
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAppearance);
      } else {
        initAppearance();
      }
    }
  })();

  /* ==== Privacy, consent & data controls module (Worker 4) ====
   * Own store: rootling-consent-v1 { version, date, completed,
   * memoryConsent, choices }. Holds: the first-run consent wizard, the
   * memory consent gate, the Privacy view + Trust & Privacy dashboard,
   * and Delete-my-data. Zero network, like the rest of the app. It
   * never turns anything on by itself: the gate only pauses a switch
   * the user just tapped, and asks once, in plain words. */
  (function () {
    var CONSENT_KEY = 'rootling-consent-v1';
    var ALL_KEYS = ['sprout-state-v1', 'rootling-notifications-v1',
      'rootling-persist-requested-v1', 'rootling-appearance-v1',
      'rootling-exec-v1', 'rootling-well-v1', 'rootling-social-v1',
      'rootling-time-v1', 'rootling-memorybook-v1', CONSENT_KEY];
    var AREA_KEYS = [
      { key: 'rootling-exec-v1', label: 'Delete tasks and focus data' },
      { key: 'rootling-well-v1', label: 'Delete routines and wellbeing data' },
      { key: 'rootling-appearance-v1', label: 'Delete look and voice settings' },
      { key: 'rootling-social-v1', label: 'Delete social practice data' },
      { key: 'rootling-time-v1', label: 'Delete time and activity data' },
      { key: 'rootling-memorybook-v1', label: 'Delete memory book data' }
    ];
    var wizardStep = 1;
    var privacyReturn = null; /* 'adopt' | 'main' | 'wizard' */
    var gateCheckbox = null;
    var learnHome = null; /* where the real learning checkbox label lives in the form */

    function byId(id) { return document.getElementById(id); }
    function consentRecord() {
      try {
        var raw = localStorage.getItem(CONSENT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function saveConsent(rec) {
      try { localStorage.setItem(CONSENT_KEY, JSON.stringify(rec)); } catch (e) { /* private mode */ }
    }
    function remindersOn() {
      try {
        if (typeof window !== 'undefined' && window.RootlingNotify && window.RootlingNotify.load) {
          return !!window.RootlingNotify.load().enabled;
        }
        var raw = localStorage.getItem('rootling-notifications-v1');
        return raw ? !!JSON.parse(raw).enabled : false;
      } catch (e) { return false; }
    }
    function petState() {
      try { return JSON.parse(localStorage.getItem('sprout-state-v1') || '{}') || {}; }
      catch (e) { return {}; }
    }

    /* ---------- wizard ---------- */
    function showWizardStep(n) {
      wizardStep = n;
      var screens = document.querySelectorAll('[data-wizard-screen]');
      for (var i = 0; i < screens.length; i++) {
        screens[i].hidden = screens[i].getAttribute('data-wizard-screen') !== String(n);
      }
      if (n === 3) {
        var line = byId('wizard-reminders-line');
        if (line) line.textContent = remindersOn()
          ? 'Reminders: on. You turned them on in the Alerts card. You can turn them off there too.'
          : 'Reminders: off. Rootling does not send reminders unless you turn them on later, in the app, in the Alerts card.';
      }
      if (n === 5) fillConsentSummary();
    }
    function fillConsentSummary() {
      var s = byId('consent-summary');
      if (!s) return;
      var cb = byId('adopt-learn-checkbox');
      s.textContent = 'Learning: ' + (cb && cb.checked ? 'on' : 'off') +
        '. Reminders: ' + (remindersOn() ? 'on' : 'off') +
        ' (you can change them later in the app). Analytics: none — Rootling collects none.';
    }

    /* ---------- privacy view + dashboard ---------- */
    function openPrivacy(from) {
      var pv = byId('privacy-view');
      if (!pv) return;
      /* The policy must be reachable before adoption too, so the section
       * cannot stay inside the (hidden) main view: move it to <main>. */
      if (pv.parentElement && pv.parentElement.id === 'main-view') {
        var main = document.querySelector('main');
        if (main) main.appendChild(pv);
      }
      var av = byId('adopt-view'), mv = byId('main-view');
      privacyReturn = from || null;
      if (!privacyReturn) {
        if (av && !av.hidden) privacyReturn = 'adopt';
        else if (mv && !mv.hidden) privacyReturn = 'main';
      }
      if (av && privacyReturn !== 'main') av.hidden = true;
      if (mv && privacyReturn !== 'adopt' && privacyReturn !== 'wizard') mv.hidden = true;
      if (mv && privacyReturn === 'main') mv.hidden = true;
      pv.hidden = false;
      renderPrivacyDashboard();
    }
    function closePrivacy() {
      var pv = byId('privacy-view');
      if (pv) pv.hidden = true;
      var adopted = !!petState().petName;
      if (privacyReturn === 'wizard' || privacyReturn === 'adopt' || !adopted) {
        var av = byId('adopt-view');
        if (av) av.hidden = adopted ? true : false;
        if (adopted) { var mv1 = byId('main-view'); if (mv1) mv1.hidden = false; }
      } else {
        var mv = byId('main-view');
        if (mv) mv.hidden = false;
      }
      privacyReturn = null;
    }
    function renderPrivacyDashboard() {
      var rem = byId('privacy-reminders-status');
      if (rem) rem.textContent = 'Reminders: ' + (remindersOn() ? 'on' : 'off') +
        '. You can change them in the Alerts card on the main screen.';
      var st = petState();
      var rec = consentRecord();
      var mem = byId('privacy-memory-status');
      if (mem) mem.textContent = 'Pet memory (learning): ' + (st.learningEnabled ? 'on' : 'off') +
        '. Memory consent: ' + (rec && rec.memoryConsent ? 'given' : 'not given yet') +
        '. You can see what your pet learned in "What your companion has learned".';
      var sum = byId('privacy-storage-summary');
      if (sum) {
        var apiRef = (typeof window !== 'undefined' && window.RootlingApp) || null;
        var done = false;
        try {
          if (apiRef && apiRef.memoryStats && apiRef.getState) {
            var notifObj = null;
            try {
              if (window.RootlingNotify && window.RootlingNotify.load) notifObj = window.RootlingNotify.load();
              else { var nr = localStorage.getItem('rootling-notifications-v1'); notifObj = nr ? JSON.parse(nr) : null; }
            } catch (e2) { notifObj = null; }
            var stats = apiRef.memoryStats(apiRef.getState(), notifObj);
            sum.textContent = 'Rootling keeps, on this device: your pet, ' + stats.checkinDays +
              ' check-in day(s), ' + stats.learnedEntries + ' learned note(s), and your settings. ' +
              'It all takes about ' + stats.totalBytes + ' bytes — a very small amount of space.';
            done = true;
          }
        } catch (e) { done = false; }
        if (!done) {
          var names = [];
          for (var i = 0; i < ALL_KEYS.length - 1; i++) {
            if (localStorage.getItem(ALL_KEYS[i])) names.push(ALL_KEYS[i]);
          }
          sum.textContent = names.length
            ? 'Rootling keeps ' + names.length + ' small set(s) of things on this device: your pet and check-ins, your choices, and any extra parts you turned on.'
            : 'Rootling keeps nothing on this device yet.';
        }
      }
      var box = byId('privacy-area-deletes');
      if (box) {
        box.innerHTML = '';
        AREA_KEYS.forEach(function (area) {
          if (!localStorage.getItem(area.key)) return;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-soft';
          b.textContent = area.label;
          b.addEventListener('click', function () {
            try { localStorage.removeItem(area.key); } catch (e) { /* ignore */ }
            renderPrivacyDashboard();
          });
          box.appendChild(b);
        });
      }
    }

    /* ---------- memory consent gate ----------
     * A capture-phase listener sees the tap before the app's own change
     * handlers do. If memory consent has not been given, the change is
     * paused (the app never applies learning), the dialog opens with
     * focus on its heading, and the user's answer settles it: Enable
     * lets the same change through; Not Now unchecks the box. Later
     * user taps may ask again; the app never asks on its own. */
    function onLearnChange(ev) {
      var t = ev.target;
      if (!t || (t.id !== 'learn-checkbox' && t.id !== 'adopt-learn-checkbox')) return;
      if (!t.checked) return;
      var rec = consentRecord();
      if (rec && rec.memoryConsent) return;
      ev.stopPropagation();
      gateCheckbox = t;
      var gate = byId('memory-gate');
      if (gate) {
        gate.hidden = false;
        var h = byId('memory-gate-heading');
        if (h && h.focus) h.focus();
      }
    }

    function initPrivacy() {
      /* The gate panel starts inside the privacy view; move it to <main>
       * so it can appear over the adoption screen and Settings alike. */
      var gate = byId('memory-gate');
      if (gate && gate.parentElement && gate.parentElement.id === 'privacy-view') {
        var main = document.querySelector('main');
        if (main) main.appendChild(gate);
      }

      var rec = consentRecord();
      var wizard = byId('consent-wizard');
      var form = byId('adopt-form');
      var learnLabel = document.querySelector('label[for="adopt-learn-checkbox"]');
      if (wizard && form) {
        if (rec && rec.completed) {
          wizard.hidden = true;
        } else {
          wizard.hidden = false;
          form.hidden = true;
          /* Screen 3 holds the REAL learning switch: its label is moved
           * from the form for the wizard, and moved back on Accept, so
           * there is only ever one switch and it always works. */
          if (learnLabel) {
            learnHome = { parent: learnLabel.parentNode, next: learnLabel.nextSibling };
            var slot = byId('wizard-learn-slot');
            if (slot) slot.appendChild(learnLabel);
          }
          showWizardStep(1);
        }
      }

      var nextBtns = document.querySelectorAll('[data-wizard-next]');
      for (var i = 0; i < nextBtns.length; i++) {
        nextBtns[i].addEventListener('click', function () { showWizardStep(wizardStep + 1); });
      }
      var backBtns = document.querySelectorAll('[data-wizard-back]');
      for (var j = 0; j < backBtns.length; j++) {
        backBtns[j].addEventListener('click', function () { showWizardStep(wizardStep - 1); });
      }
      var understand = byId('wizard-understand-btn');
      if (understand) understand.addEventListener('click', function () { showWizardStep(5); });
      var learnMore = byId('wizard-learn-more');
      if (learnMore) learnMore.addEventListener('click', function () { openPrivacy('wizard'); });
      var review = byId('consent-review-btn');
      if (review) review.addEventListener('click', function () { showWizardStep(3); });
      var confirmBox = byId('consent-confirm-checkbox');
      var accept = byId('consent-accept-btn');
      if (confirmBox && accept) {
        confirmBox.addEventListener('change', function () { accept.disabled = !confirmBox.checked; });
      }
      if (accept) accept.addEventListener('click', function () {
        var cb = byId('adopt-learn-checkbox');
        var prev = consentRecord();
        saveConsent({
          version: 1,
          date: new Date().toISOString(),
          completed: true,
          memoryConsent: !!(cb && cb.checked) || !!(prev && prev.memoryConsent),
          choices: {
            learning: !!(cb && cb.checked),
            reminders: remindersOn() ? 'on' : 'off',
            analytics: 'none'
          }
        });
        if (learnHome && learnLabel) {
          if (learnHome.next && learnHome.next.parentNode === learnHome.parent) {
            learnHome.parent.insertBefore(learnLabel, learnHome.next);
          } else if (learnHome.parent) {
            learnHome.parent.appendChild(learnLabel);
          }
        }
        if (wizard) wizard.hidden = true;
        if (form) form.hidden = false;
      });

      ['privacy-adopt-btn', 'privacy-toggle', 'privacy-footer-btn'].forEach(function (id) {
        var b = byId(id);
        if (b) b.addEventListener('click', function () { openPrivacy(); });
      });
      var closeBtn = byId('privacy-close-btn');
      if (closeBtn) closeBtn.addEventListener('click', closePrivacy);

      document.addEventListener('change', onLearnChange, true);
      var enableBtn = byId('memory-gate-enable');
      var notNowBtn = byId('memory-gate-notnow');
      if (enableBtn) enableBtn.addEventListener('click', function () {
        var r = consentRecord() || { version: 1, date: new Date().toISOString(), choices: {} };
        r.memoryConsent = true;
        saveConsent(r);
        if (gate) gate.hidden = true;
        if (gateCheckbox) {
          var el = gateCheckbox;
          gateCheckbox = null;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      if (notNowBtn) notNowBtn.addEventListener('click', function () {
        if (gateCheckbox) gateCheckbox.checked = false;
        gateCheckbox = null;
        if (gate) gate.hidden = true;
      });

      var dl = byId('privacy-download-btn');
      if (dl) dl.addEventListener('click', function () {
        var exp = byId('export-memory-btn');
        if (exp) exp.click();
      });
      var delBtn = byId('delete-my-data-btn');
      var delBox = byId('delete-confirm');
      if (delBtn && delBox) delBtn.addEventListener('click', function () { delBox.hidden = false; });
      var delCancel = byId('delete-cancel-btn');
      if (delCancel && delBox) delCancel.addEventListener('click', function () { delBox.hidden = true; });
      var delConfirm = byId('delete-confirm-btn');
      if (delConfirm) delConfirm.addEventListener('click', function () {
        ALL_KEYS.forEach(function (k) {
          try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        });
        setTimeout(function () {
          try { window.location.reload(); } catch (e) { /* tests: storage state is the assertion */ }
        }, 400);
      });
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPrivacy);
      } else {
        initPrivacy();
      }
    }
  })();

  /* ==== Focus and plans module (Worker 2) ====
   * One pinned priority, catch it and park it, focus sessions with the
   * pet present, return-to-task re-anchoring, a pet-held plan list for
   * today, and a task-breakdown helper. Plus the Help panel and the one
   * gentle help offer. All of it lives in its own store on this device
   * only. Nothing is sent anywhere. Nothing here scores the user,
   * nothing is ever taken away, and the pet never suffers from non-use.
   * Copy for the schedule and the open loop comes from EXEC_COPY above,
   * used word for word. Pet state is read only, through
   * window.RootlingApp.getState(), and every read is guarded. */
  (function () {
    var EXEC_KEY = 'rootling-exec-v1';
    var NOTIFY_KEY = 'rootling-notifications-v1';
    var execData = null;
    var focusTimer = null;
    var focusTimeUpShown = false;
    var anchorDismissed = false;
    var loopsOpen = false;
    var armedReleaseId = null;
    var offerDone = false; /* one help offer per visit; kept in memory only, never stored */
    var failedSubmits = [];
    var tapMap = {};
    var viewSwitches = [];

    function getEl(id) { return document.getElementById(id); }
    function fillCopy(tpl, map) {
      return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
        return map && map[k] !== undefined ? map[k] : m;
      });
    }
    function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }
    function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function fmtTime(t) {
      var p = String(t || '').split(':');
      if (p.length !== 2) return String(t || '');
      var h = Number(p[0]), m = Number(p[1]);
      if (isNaN(h) || isNaN(m)) return String(t || '');
      var ap = h >= 12 ? 'pm' : 'am';
      return (h % 12 || 12) + ':' + pad2(m) + ' ' + ap;
    }
    function newId(prefix) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 100000); }
    function petState() {
      try {
        var api = (typeof window !== 'undefined' && (window.RootlingApp || window.SproutApp)) || null;
        return api && typeof api.getState === 'function' ? api.getState() : null;
      } catch (e) { return null; }
    }
    function execDefaults() {
      return {
        priority: '',
        parked: [],
        events: [],
        breakdowns: [],
        activeBreakdownId: null,
        anchor: null,
        focus: null,
        focusPlanMin: 25
      };
    }
    function loadExec() {
      try {
        var raw = localStorage.getItem(EXEC_KEY);
        if (!raw) return execDefaults();
        var d = JSON.parse(raw);
        var base = execDefaults();
        for (var k in base) { if (d[k] === undefined) d[k] = base[k]; }
        if (!Array.isArray(d.parked)) d.parked = [];
        if (!Array.isArray(d.events)) d.events = [];
        if (!Array.isArray(d.breakdowns)) d.breakdowns = [];
        /* A focus time that was running when the app closed is not
         * still running. Its task stays as the anchor, so the user is
         * welcomed back to it instead of losing it. */
        if (d.focus) d.focus = null;
        return d;
      } catch (e) { return execDefaults(); }
    }
    function saveExec() {
      try { localStorage.setItem(EXEC_KEY, JSON.stringify(execData)); } catch (e) { /* storage can be off; the visit still works */ }
    }
    function activeBreakdown() {
      if (!execData || !execData.activeBreakdownId) return null;
      for (var i = 0; i < execData.breakdowns.length; i++) {
        if (execData.breakdowns[i].id === execData.activeBreakdownId) return execData.breakdowns[i];
      }
      return null;
    }
    function breakdownById(id) {
      for (var i = 0; i < execData.breakdowns.length; i++) {
        if (execData.breakdowns[i].id === id) return execData.breakdowns[i];
      }
      return null;
    }
    function todaysEvents() {
      var today = dayKey(new Date());
      return execData.events.filter(function (ev) { return ev.date === today; })
        .sort(function (a, b) { return a.time < b.time ? -1 : (a.time > b.time ? 1 : 0); });
    }
    function nextEvent() {
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var list = todaysEvents();
      for (var i = 0; i < list.length; i++) {
        var p = String(list[i].time).split(':');
        if (Number(p[0]) * 60 + Number(p[1]) >= nowMin) return list[i];
      }
      return null;
    }
    function nextReminderTime() {
      try {
        var raw = localStorage.getItem(NOTIFY_KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (!s || !s.enabled || !s.plans) return null;
        var now = new Date();
        var nowMin = now.getHours() * 60 + now.getMinutes();
        var best = null;
        for (var id in s.plans) {
          var plan = s.plans[id];
          if (!plan || !plan.on || !plan.time) continue;
          var p = String(plan.time).split(':');
          var mins = Number(p[0]) * 60 + Number(p[1]);
          if (mins >= nowMin && (best === null || mins < best)) best = mins;
        }
        if (best === null) return null;
        return fmtTime(pad2(Math.floor(best / 60)) + ':' + pad2(best % 60));
      } catch (e) { return null; }
    }
    var MOOD_WORDS = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };
    function todaysMoodWord() {
      var st = petState();
      if (!st || !st.checkins) return null;
      var day = st.checkins[dayKey(new Date())];
      if (!day || !day.mood || !day.mood.value) return null;
      return MOOD_WORDS[day.mood.value] || null;
    }
    function isFirstRun() {
      var st = petState();
      if (!st) return false;
      return !st.careDays || st.careDays.length === 0;
    }
    function durationWords(sec) {
      sec = Math.max(0, Math.floor(sec));
      if (sec < 60) return sec + (sec === 1 ? ' second' : ' seconds');
      var min = Math.floor(sec / 60), rem = sec % 60;
      var out = min + (min === 1 ? ' minute' : ' minutes');
      if (rem) out += ' and ' + rem + (rem === 1 ? ' second' : ' seconds');
      return out;
    }
    function scrollToEl(elm) {
      if (!elm) return;
      try { if (typeof elm.scrollIntoView === 'function') elm.scrollIntoView({ block: 'start' }); } catch (e) { /* scrolling is a help, never a need */ }
    }

    /* ---------- render ---------- */
    function renderExec() {
      if (!execData) return;
      var st = petState();

      var firstRun = getEl('today-first-run');
      if (firstRun) firstRun.hidden = !isFirstRun();

      var priText = getEl('today-priority-text');
      if (priText) {
        priText.textContent = execData.priority
          ? fillCopy(EXEC_COPY.prioritySet, { text: execData.priority })
          : 'No one thing yet. You can add one below.';
      }

      /* Anchor: the thing the user was in the middle of. */
      var anchor = execData.anchor;
      var showAnchor = !!anchor && !anchorDismissed;
      var anchorText = '';
      if (anchor) {
        anchorText = fillCopy(EXEC_COPY.resumeHeadline, { text: anchor.text });
        if (anchor.kind === 'breakdown' && anchor.id) {
          var ab = breakdownById(anchor.id);
          if (ab && ab.steps && ab.steps[ab.current] !== undefined) {
            anchorText += ' ' + fillCopy(EXEC_COPY.resumeNextStep, { nextStep: ab.steps[ab.current] });
          }
        }
      }
      var taw = getEl('today-anchor-wrap');
      if (taw) { taw.hidden = !showAnchor; var tat = getEl('today-anchor-text'); if (tat) tat.textContent = anchorText; }
      var eaw = getEl('exec-anchor-wrap');
      if (eaw) { eaw.hidden = !showAnchor; var eat = getEl('exec-anchor-text'); if (eat) eat.textContent = anchorText; }

      /* Now: the live step first, else the next plan, else a calm line. */
      var nowText = 'Nothing scheduled. A gentle day.';
      var bd = activeBreakdown();
      if (bd && bd.mode === 'doing' && bd.steps[bd.current] !== undefined) {
        nowText = bd.steps[bd.current];
      } else {
        var nev = nextEvent();
        if (nev) nowText = nev.title + ', ' + fmtTime(nev.time);
      }
      var nowEl = getEl('today-now-text');
      if (nowEl) nowEl.textContent = nowText;

      var neEl = getEl('today-next-event');
      if (neEl) {
        var nev2 = nextEvent();
        neEl.hidden = !nev2;
        if (nev2) neEl.textContent = fillCopy(EXEC_COPY.eventSoon, { event: nev2.title, time: fmtTime(nev2.time) });
      }
      var nrEl = getEl('today-next-reminder');
      if (nrEl) {
        var nrt = nextReminderTime();
        nrEl.hidden = !nrt;
        if (nrt) nrEl.textContent = 'Next reminder: ' + nrt;
      }
      var moodEl = getEl('today-mood');
      if (moodEl) {
        var mw = todaysMoodWord();
        moodEl.hidden = !mw;
        if (mw) moodEl.textContent = 'Your mood today: ' + mw;
      }

      var note = getEl('exec-presence-note');
      if (note && !note.textContent) note.textContent = EXEC_COPY.sessionPresenceNote;
      var petImg = getEl('pet-img'), execPet = getEl('exec-pet-img');
      if (petImg && execPet) {
        var src = petImg.getAttribute('src');
        if (src && execPet.getAttribute('src') !== src) execPet.setAttribute('src', src);
      }
      if (st && st.petName && execPet) execPet.setAttribute('alt', st.petName + ' sits with you');

      renderEvents();
      renderLoops();
      renderBreakdowns();
      renderFocus();
    }

    function renderEvents() {
      var list = getEl('exec-event-list');
      if (!list) return;
      list.innerHTML = '';
      var events = todaysEvents();
      var empty = getEl('exec-event-empty');
      if (empty) empty.hidden = events.length > 0;
      events.forEach(function (ev) {
        var li = document.createElement('li');
        var main = document.createElement('span');
        main.textContent = fillCopy(EXEC_COPY.eventHeld, { event: ev.title, time: fmtTime(ev.time) });
        li.appendChild(main);
        if (ev.leaveBy) {
          var lb = document.createElement('span');
          lb.textContent = ' ' + fillCopy(EXEC_COPY.eventLeaveBy, { event: ev.title, leaveBy: fmtTime(ev.leaveBy) });
          li.appendChild(lb);
        }
        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn btn-ghost'; rm.textContent = 'Remove this plan';
        rm.addEventListener('click', function () {
          execData.events = execData.events.filter(function (x) { return x.id !== ev.id; });
          saveExec(); renderExec();
          var msg = getEl('exec-event-msg'); if (msg) msg.textContent = 'Removed. That plan is gone from the list.';
        });
        li.appendChild(document.createTextNode(' '));
        li.appendChild(rm);
        list.appendChild(li);
      });
    }

    function renderLoops() {
      var wrap = getEl('exec-loops-wrap');
      if (wrap) wrap.hidden = !loopsOpen;
      if (!loopsOpen) return;
      var count = getEl('exec-loops-count');
      if (count) count.textContent = fillCopy(EXEC_COPY.parkedCount, { n: execData.parked.length });
      var list = getEl('exec-loops-list');
      if (!list) return;
      list.innerHTML = '';
      if (!execData.parked.length) {
        var li0 = document.createElement('li');
        li0.textContent = 'Nothing parked right now.';
        list.appendChild(li0);
        return;
      }
      execData.parked.forEach(function (item) {
        var li = document.createElement('li');
        var span = document.createElement('span');
        span.textContent = item.text;
        li.appendChild(span);
        var makeBtn = document.createElement('button');
        makeBtn.type = 'button'; makeBtn.className = 'btn btn-soft'; makeBtn.textContent = 'Make this my one thing';
        makeBtn.addEventListener('click', function () { setPriority(item.text, true); });
        var goBtn = document.createElement('button');
        goBtn.type = 'button'; goBtn.className = 'btn btn-ghost';
        goBtn.textContent = armedReleaseId === item.id ? 'Tap again to let it go' : EXEC_COPY.releaseButton;
        goBtn.addEventListener('click', function () {
          var msg = getEl('exec-loops-msg');
          if (armedReleaseId !== item.id) {
            armedReleaseId = item.id;
            if (msg) msg.textContent = EXEC_COPY.releaseConfirm;
            renderLoops();
            return;
          }
          armedReleaseId = null;
          execData.parked = execData.parked.filter(function (x) { return x.id !== item.id; });
          saveExec(); renderExec();
          var msg2 = getEl('exec-loops-msg');
          if (msg2) msg2.textContent = EXEC_COPY.releaseDone;
        });
        li.appendChild(document.createTextNode(' '));
        li.appendChild(makeBtn);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(goBtn);
        list.appendChild(li);
      });
    }

    function setPriority(text, fromParkedId) {
      text = String(text || '').trim();
      if (!text) return;
      var old = execData.priority;
      var msgText;
      if (old && old !== text) {
        execData.parked.push({ id: newId('park'), text: old, createdAt: Date.now() });
        msgText = fillCopy(EXEC_COPY.prioritySwitch, { newText: text, oldText: old });
      } else {
        msgText = fillCopy(EXEC_COPY.prioritySet, { text: text });
      }
      execData.priority = text;
      if (fromParkedId) {
        execData.parked = execData.parked.filter(function (x) { return x.text !== text; });
      }
      saveExec(); renderExec();
      var pm = getEl('today-priority-msg'); if (pm) pm.textContent = msgText;
      var lm = getEl('exec-loops-msg'); if (lm && fromParkedId) lm.textContent = msgText;
    }

    function renderBreakdowns() {
      var bd = activeBreakdown();
      var build = getEl('exec-break-build');
      var doing = getEl('exec-break-doing');
      if (build) build.hidden = !(bd && bd.mode === 'building');
      if (doing) doing.hidden = !(bd && bd.mode === 'doing');
      if (bd && bd.mode === 'building') {
        var q = getEl('exec-break-build-q');
        if (q) q.textContent = bd.steps.length === 0 ? 'What is the very first tiny step?' : 'What is the next tiny step?';
        var soFar = getEl('exec-break-steps-so-far');
        if (soFar) {
          soFar.innerHTML = '';
          bd.steps.forEach(function (s) {
            var li = document.createElement('li'); li.textContent = s; soFar.appendChild(li);
          });
        }
      }
      if (bd && bd.mode === 'doing') {
        var title = getEl('exec-break-doing-title');
        if (title) title.textContent = bd.title;
        var cur = getEl('exec-break-current-step');
        if (cur) cur.textContent = bd.steps[bd.current] !== undefined ? bd.steps[bd.current] : '';
        var back = getEl('exec-break-back');
        if (back) back.disabled = bd.current <= 0;
      }
      var list = getEl('exec-break-list');
      if (!list) return;
      list.innerHTML = '';
      if (!execData.breakdowns.length) {
        var li0 = document.createElement('li');
        li0.textContent = 'No saved tasks yet.';
        list.appendChild(li0);
        return;
      }
      execData.breakdowns.forEach(function (item) {
        var li = document.createElement('li');
        var label = document.createElement('span');
        var stateWord = item.mode === 'done' ? 'Done' : item.mode === 'parked' ? 'Parked' : item.mode === 'doing' ? 'In progress' : 'Still adding steps';
        label.textContent = item.title + ' — ' + stateWord;
        li.appendChild(label);
        if (item.mode !== 'done') {
          var btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'btn btn-soft';
          btn.textContent = item.mode === 'building' ? 'Add more steps' : 'Keep going';
          btn.addEventListener('click', function () { resumeBreakdown(item.id); });
          li.appendChild(document.createTextNode(' '));
          li.appendChild(btn);
        }
        list.appendChild(li);
      });
    }

    function resumeBreakdown(id) {
      var bd = breakdownById(id);
      if (!bd) return;
      execData.activeBreakdownId = id;
      if (bd.mode !== 'building') {
        bd.mode = 'doing';
        execData.anchor = { kind: 'breakdown', id: id, text: bd.title };
        anchorDismissed = false;
      }
      saveExec(); renderExec();
      scrollToEl(getEl('exec-view'));
      var msg = getEl('exec-break-msg');
      if (msg) msg.textContent = fillCopy(EXEC_COPY.resumeWelcome, {});
    }

    /* ---------- focus sessions ---------- */
    function selectedPlanMin() {
      var custom = getEl('exec-focus-custom');
      if (custom && custom.value) {
        var n = Math.floor(Number(custom.value));
        if (n >= 1 && n <= 180) return n;
      }
      return execData.focusPlanMin || 25;
    }
    function startFocus(task, plannedMin) {
      task = String(task || '').trim() || 'your one thing';
      plannedMin = plannedMin || selectedPlanMin();
      execData.focus = { task: task, plannedMin: plannedMin, startedAt: Date.now() };
      execData.anchor = { kind: 'focus', text: task, plannedMin: plannedMin };
      anchorDismissed = false;
      focusTimeUpShown = false;
      saveExec();
      if (focusTimer) clearInterval(focusTimer);
      focusTimer = setInterval(tickFocus, 1000);
      renderExec();
      var msg = getEl('exec-focus-msg');
      if (msg) msg.textContent = 'Started. That start counts.';
    }
    function focusElapsedSec() {
      if (!execData.focus) return 0;
      return Math.max(0, Math.floor((Date.now() - execData.focus.startedAt) / 1000));
    }
    function tickFocus() {
      if (!execData.focus) { if (focusTimer) clearInterval(focusTimer); focusTimer = null; return; }
      renderFocus();
      var plannedSec = execData.focus.plannedMin * 60;
      if (!focusTimeUpShown && focusElapsedSec() >= plannedSec) {
        focusTimeUpShown = true;
        var msg = getEl('exec-focus-msg');
        if (msg) msg.textContent = 'Time is up. Keep going or stop. Both are fine.';
      }
    }
    function renderFocus() {
      var live = getEl('exec-focus-live');
      var f = execData.focus;
      if (live) live.hidden = !f;
      if (!f) return;
      var status = getEl('exec-focus-status');
      if (status) status.textContent = fillCopy(EXEC_COPY.sessionStart, { text: f.task });
      var elapsed = focusElapsedSec();
      var plannedSec = f.plannedMin * 60;
      var pct = plannedSec > 0 ? Math.min(100, Math.floor((elapsed / plannedSec) * 100)) : 0;
      var fill = getEl('exec-focus-fill');
      if (fill) fill.style.width = pct + '%';
      var wrap = getEl('exec-focus-bar-wrap');
      if (wrap) wrap.setAttribute('aria-valuenow', String(pct));
      var time = getEl('exec-focus-time');
      if (time) {
        var doneMin = Math.floor(elapsed / 60);
        var leftSec = plannedSec - elapsed;
        if (leftSec > 0) {
          time.textContent = doneMin + (doneMin === 1 ? ' minute' : ' minutes') + ' done. ' + Math.ceil(leftSec / 60) + (Math.ceil(leftSec / 60) === 1 ? ' minute' : ' minutes') + ' left.';
        } else {
          time.textContent = doneMin + (doneMin === 1 ? ' minute' : ' minutes') + ' done. The time you picked has passed.';
        }
      }
    }
    function stopFocus() {
      if (!execData.focus) return;
      var elapsed = focusElapsedSec();
      var task = execData.focus.task;
      execData.focus = null;
      if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
      saveExec(); renderExec();
      var msg = getEl('exec-focus-msg');
      if (msg) msg.textContent = 'You focused for ' + durationWords(elapsed) + ' — that counts. ' + EXEC_COPY.sessionEnd;
      /* The anchor stays, so coming back shows what you were in the
       * middle of, with a one-tap way back in. */
      if (!execData.anchor) execData.anchor = { kind: 'focus', text: task };
    }

    function resumeAnchor() {
      var anchor = execData.anchor;
      if (!anchor) return;
      if (anchor.kind === 'breakdown' && anchor.id) { resumeBreakdown(anchor.id); return; }
      startFocus(anchor.text, anchor.plannedMin || execData.focusPlanMin || 25);
      var taskInput = getEl('exec-focus-task');
      if (taskInput) taskInput.value = anchor.text;
      scrollToEl(getEl('exec-view'));
    }

    /* ---------- help and the gentle offer ---------- */
    function quietActive() {
      var q = getEl('quiet-view');
      return !!q && !q.hidden;
    }
    function syncSafetyButton() {
      /* The support-now button in Help shows only when the Safety
       * view (Worker 3) is in the page. Checked each time Help opens,
       * so it works whether that view was there at load or came later. */
      var btn = getEl('help-safety-btn');
      if (btn) btn.hidden = !getEl('safety-view');
    }
    function openHelp() {
      syncSafetyButton();
      var panel = getEl('help-panel');
      if (panel) { panel.hidden = false; scrollToEl(panel); }
    }
    function maybeOfferHelp() {
      if (offerDone) return;
      if (quietActive()) return;
      if (execData && execData.focus) return; /* never while a focus time is running */
      var bd = activeBreakdown();
      if (bd && bd.mode === 'doing') return; /* never in the middle of a task */
      offerDone = true;
      var offer = getEl('stuck-offer');
      if (offer) offer.hidden = false;
    }
    function noteFailedSubmit() {
      var now = Date.now();
      failedSubmits = failedSubmits.filter(function (t) { return now - t < 60000; });
      failedSubmits.push(now);
      if (failedSubmits.length >= 3) maybeOfferHelp();
    }
    function noteViewSwitch() {
      var now = Date.now();
      viewSwitches = viewSwitches.filter(function (t) { return now - t < 10000; });
      viewSwitches.push(now);
      if (viewSwitches.length >= 3) maybeOfferHelp();
    }
    function noteRapidTap(target) {
      if (!target || !target.tagName) return;
      var key = target.id || (target.tagName + '.' + (target.className || ''));
      var now = Date.now();
      var list = (tapMap[key] || []).filter(function (t) { return now - t < 5000; });
      list.push(now);
      tapMap[key] = list;
      if (list.length >= 3) maybeOfferHelp();
    }

    /* ---------- bind ---------- */
    function bindExec() {
      var helpBtn = getEl('help-btn');
      if (helpBtn) helpBtn.addEventListener('click', openHelp);
      var helpClose = getEl('help-close-btn');
      if (helpClose) helpClose.addEventListener('click', function () { var p = getEl('help-panel'); if (p) p.hidden = true; });
      var readBtn = getEl('help-read-btn');
      try {
        var voice = (typeof window !== 'undefined' && window.RootlingVoice) || null;
        if (readBtn && voice && voice.ttsSupported && typeof voice.speak === 'function') {
          readBtn.hidden = false;
          readBtn.addEventListener('click', function () {
            var panel = getEl('help-panel');
            if (panel) voice.speak(panel.textContent);
          });
        }
      } catch (e) { /* no read-aloud on this browser; the button stays hidden */ }
      var showMes = document.querySelectorAll('[data-help-target]');
      for (var i = 0; i < showMes.length; i++) {
        showMes[i].addEventListener('click', function () {
          var target = getEl(this.getAttribute('data-help-target')) || getEl(this.getAttribute('data-help-fallback'));
          var panel = getEl('help-panel');
          if (panel) panel.hidden = true;
          scrollToEl(target);
        });
      }
      syncSafetyButton();
      var safetyBtn = getEl('help-safety-btn');
      if (safetyBtn) safetyBtn.addEventListener('click', function () {
        var sv = getEl('safety-view');
        if (!sv) { safetyBtn.hidden = true; return; }
        var panel = getEl('help-panel');
        if (panel) panel.hidden = true;
        sv.hidden = false;
        scrollToEl(sv);
      });
      var stuckShow = getEl('stuck-show-btn');
      if (stuckShow) stuckShow.addEventListener('click', function () {
        var offer = getEl('stuck-offer'); if (offer) offer.hidden = true;
        openHelp();
      });
      var stuckNo = getEl('stuck-no-btn');
      if (stuckNo) stuckNo.addEventListener('click', function () {
        var offer = getEl('stuck-offer'); if (offer) offer.hidden = true;
      });

      var priForm = getEl('today-priority-form');
      if (priForm) priForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = getEl('today-priority-input');
        var text = input ? input.value.trim() : '';
        if (!text) {
          noteFailedSubmit();
          var m = getEl('today-priority-msg'); if (m) m.textContent = 'Write one word or a few words first. That is enough.';
          return;
        }
        setPriority(text, false);
        if (input) input.value = '';
      });

      var capForm = getEl('today-capture-form');
      if (capForm) capForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = getEl('today-capture-input');
        var text = input ? input.value.trim() : '';
        var msg = getEl('today-capture-msg');
        if (!text) {
          noteFailedSubmit();
          if (msg) msg.textContent = 'Write the thought first. One word is enough.';
          return;
        }
        execData.parked.push({ id: newId('park'), text: text, createdAt: Date.now() });
        saveExec(); renderExec();
        if (msg) msg.textContent = EXEC_COPY.parkAck + ' Saved.';
        if (input) { input.value = ''; try { input.focus(); } catch (e) { /* focus is a help, not a need */ } }
      });

      var focusBtn = getEl('today-focus-btn');
      if (focusBtn) focusBtn.addEventListener('click', function () {
        scrollToEl(getEl('exec-view'));
        var taskInput = getEl('exec-focus-task');
        if (taskInput) { try { taskInput.focus(); } catch (e) { /* fine */ } }
      });
      var chips = document.querySelectorAll('[data-focus-min]');
      for (var c = 0; c < chips.length; c++) {
        chips[c].addEventListener('click', function () {
          execData.focusPlanMin = Number(this.getAttribute('data-focus-min')) || 25;
          for (var j = 0; j < chips.length; j++) chips[j].classList.toggle('selected', chips[j] === this);
          saveExec();
        });
      }
      var startBtn = getEl('exec-focus-start');
      if (startBtn) startBtn.addEventListener('click', function () {
        var taskInput = getEl('exec-focus-task');
        startFocus(taskInput ? taskInput.value : '', selectedPlanMin());
      });
      var stopBtn = getEl('exec-focus-stop');
      if (stopBtn) stopBtn.addEventListener('click', stopFocus);
      var resumeBtns = [getEl('today-resume-btn'), getEl('exec-resume-btn')];
      resumeBtns.forEach(function (b) { if (b) b.addEventListener('click', resumeAnchor); });
      var laterBtn = getEl('exec-anchor-later-btn');
      if (laterBtn) laterBtn.addEventListener('click', function () { anchorDismissed = true; renderExec(); });

      var evForm = getEl('exec-event-form');
      if (evForm) evForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var title = getEl('exec-event-title'), time = getEl('exec-event-time'), leave = getEl('exec-event-leaveby');
        var msg = getEl('exec-event-msg');
        var titleText = title ? title.value.trim() : '';
        var timeVal = time ? time.value : '';
        if (!titleText || !timeVal) {
          noteFailedSubmit();
          if (msg) msg.textContent = 'Write what it is and pick a time first. Those two are all you need.';
          return;
        }
        var ev2 = { id: newId('event'), date: dayKey(new Date()), time: timeVal, title: titleText, leaveBy: leave ? leave.value : '' };
        execData.events.push(ev2);
        saveExec(); renderExec();
        if (msg) msg.textContent = fillCopy(EXEC_COPY.eventHeld, { event: titleText, time: fmtTime(timeVal) }) + ' Saved.';
        if (title) title.value = '';
        if (time) time.value = '';
        if (leave) leave.value = '';
      });

      var createBtn = getEl('exec-break-create');
      if (createBtn) createBtn.addEventListener('click', function () {
        var titleInput = getEl('exec-break-title');
        var msg = getEl('exec-break-msg');
        var text = titleInput ? titleInput.value.trim() : '';
        if (!text) {
          noteFailedSubmit();
          if (msg) msg.textContent = 'Write the big task first. A few words are enough.';
          return;
        }
        var bd = { id: newId('task'), title: text, steps: [], current: 0, mode: 'building', createdAt: Date.now() };
        execData.breakdowns.push(bd);
        execData.activeBreakdownId = bd.id;
        saveExec(); renderExec();
        if (msg) msg.textContent = 'Saved. Now add the very first tiny step.';
        if (titleInput) titleInput.value = '';
        var stepInput = getEl('exec-break-step-input');
        if (stepInput) { try { stepInput.focus(); } catch (e) { /* fine */ } }
      });
      var stepAdd = getEl('exec-break-step-add');
      if (stepAdd) stepAdd.addEventListener('click', function () {
        var bd = activeBreakdown();
        var msg = getEl('exec-break-msg');
        if (!bd || bd.mode !== 'building') return;
        var input = getEl('exec-break-step-input');
        var text = input ? input.value.trim() : '';
        if (!text) {
          noteFailedSubmit();
          if (msg) msg.textContent = 'Write one small step first.';
          return;
        }
        bd.steps.push(text);
        saveExec(); renderExec();
        if (msg) msg.textContent = 'Saved. That step is on your list.';
        if (input) { input.value = ''; try { input.focus(); } catch (e) { /* fine */ } }
      });
      var doStart = getEl('exec-break-do-start');
      if (doStart) doStart.addEventListener('click', function () {
        var bd = activeBreakdown();
        var msg = getEl('exec-break-msg');
        if (!bd) return;
        if (!bd.steps.length) {
          noteFailedSubmit();
          if (msg) msg.textContent = 'Add one small step first. Then you can start.';
          return;
        }
        bd.mode = 'doing'; bd.current = 0;
        execData.anchor = { kind: 'breakdown', id: bd.id, text: bd.title };
        anchorDismissed = false;
        saveExec(); renderExec();
        if (msg) msg.textContent = 'Good start. One step at a time. This step is all you need to look at.';
      });
      var doneBtn = getEl('exec-break-done');
      if (doneBtn) doneBtn.addEventListener('click', function () {
        var bd = activeBreakdown();
        var msg = getEl('exec-break-msg');
        if (!bd || bd.mode !== 'doing') return;
        bd.current += 1;
        if (bd.current >= bd.steps.length) {
          bd.mode = 'done';
          if (execData.anchor && execData.anchor.kind === 'breakdown' && execData.anchor.id === bd.id) execData.anchor = null;
          saveExec(); renderExec();
          if (msg) msg.textContent = 'Task done. That counts, completely.';
          return;
        }
        saveExec(); renderExec();
        if (msg) msg.textContent = 'Done. Here is the next step.';
      });
      var backBtn = getEl('exec-break-back');
      if (backBtn) backBtn.addEventListener('click', function () {
        var bd = activeBreakdown();
        if (!bd || bd.mode !== 'doing' || bd.current <= 0) return;
        bd.current -= 1;
        saveExec(); renderExec();
      });
      var parkBtn = getEl('exec-break-park');
      if (parkBtn) parkBtn.addEventListener('click', function () {
        var bd = activeBreakdown();
        var msg = getEl('exec-break-msg');
        if (!bd || bd.mode !== 'doing') return;
        bd.mode = 'parked';
        execData.anchor = { kind: 'breakdown', id: bd.id, text: bd.title };
        anchorDismissed = false;
        saveExec(); renderExec();
        if (msg) msg.textContent = 'Parked. Your pet holds it here. It is safe, and you can keep going any time.';
      });

      var loopsToggle = getEl('exec-loops-toggle');
      if (loopsToggle) loopsToggle.addEventListener('click', function () {
        loopsOpen = !loopsOpen;
        renderLoops();
      });

      /* Stuck patterns, all on this device, nothing stored:
       * taps on things that do nothing, fast view switching, and
       * repeated empty submits in the forms above. */
      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('#stuck-offer') || t.closest('#help-panel')) return;
        if (t.closest('button, a, input, select, textarea, label, [role="button"]')) return;
        noteRapidTap(t);
      });
      if (typeof MutationObserver === 'function') {
        try {
          var watched = ['main-view', 'adopt-view', 'quiet-view', 'learned-view', 'help-panel'];
          var obs = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
              if (records[i].attributeName === 'hidden') noteViewSwitch();
            }
          });
          watched.forEach(function (id) {
            var elm = getEl(id);
            if (elm) obs.observe(elm, { attributes: true, attributeFilter: ['hidden'] });
          });
        } catch (e) { /* the other two patterns still work */ }
      }
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) renderExec();
      });
      /* Keep the Today card fresh after check-ins and other taps. */
      document.addEventListener('click', function () { setTimeout(renderExec, 80); });
    }

    function initExec() {
      execData = loadExec();
      bindExec();
      renderExec();
    }
    if (typeof window !== 'undefined') {
      window.RootlingExec = {
        key: EXEC_KEY,
        getData: function () { return execData; },
        render: renderExec,
        startFocus: startFocus,
        stopFocus: stopFocus,
        resumeAnchor: resumeAnchor,
        _maybeOfferHelp: maybeOfferHelp
      };
    }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExec);
      } else {
        initExec();
      }
    }
  })();

  /* ==== Wellbeing module (Worker 3): day plans, routines, Now Next Later,
   * worry parking, journal, unsent letters, feeling words, sensory words,
   * word mute list, and the Law-5 mix controls. Its own store lives in
   * rootling-well-v1, on this device only. Nothing here is sent anywhere.
   * The pet never sorts a worry, never speaks for a feeling, and never
   * says how a thing will turn out. Day plan taps write this store only;
   * they never touch sunshine, care days, or any total in the pet store. */
  (function () {
    var WELL_KEY = 'rootling-well-v1';
    var EXEC_KEY = 'rootling-exec-v1';
    var BREAKER_TEXT = "Re-checking can make worries feel bigger. It's parked safely — it will keep until Worry Time.";

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    var uidCounter = 0;
    function uid(prefix) {
      uidCounter += 1;
      return prefix + '-' + Date.now().toString(36) + '-' + uidCounter;
    }
    function wellDefaults() {
      return {
        version: 1,
        dayPlan: 'regular',
        floorItems: ['Open Rootling'],
        routines: [],
        worryTime: '',
        worries: [],
        journal: [],
        unsent: [],
        mutedWords: [],
        sensory: [],
        contacts: [],
        alertsEnabled: false,
        alertsConsent: false,
        alertContactId: '',
        userName: '',
        locationEnabled: false,
        shareHistory: [],
        activeShare: null
      };
    }
    function wellLoad() {
      var base = wellDefaults();
      try {
        var raw = localStorage.getItem(WELL_KEY);
        if (!raw) return base;
        var s = JSON.parse(raw);
        for (var k in base) { if (s[k] === undefined) s[k] = base[k]; }
        return s;
      } catch (e) { return base; }
    }
    function wellSave() {
      try { localStorage.setItem(WELL_KEY, JSON.stringify(well)); } catch (e) { /* storage can be off; the visit still works */ }
    }

    var well = wellLoad();
    var draftSteps = [];
    var run = null; /* { routineId, name, steps: [text], idx } — this visit only; stopping keeps no record */
    var worryListOpen = false;
    var worryOpens = {}; /* this visit only: worry id -> times opened */
    var breakerShown = false;
    var lastDeletedJournal = null; /* this visit only, for Undo */
    var lastDeletedUnsent = null;
    var distressNotes = {}; /* this visit only: journal entry id -> show the support note. Never saved. */
    var editingContactId = null; /* this visit only: contact being changed */
    /* Safeguard flow state — this visit only, never saved. A flow counts
     * as armed only while these fields say so; every cancel clears them,
     * so a stopped flow leaves nothing armed behind. */
    var alertFlow = { stage: 'idle', armed: false, secondsLeft: 0, contactId: '', handoffHref: '', timerId: null };
    var locFlow = { stage: 'idle', fromShare: false, duration: '', durationLabel: '', handoffHref: '', canSkipPlace: false };
    var HANDOFF_LINE = 'Your message app opened with the note ready to send. Rootling did not send anything by itself.';
    /* A short list of exact phrases, checked on this device only when a
     * journal entry is saved. The list is never shown, the match is never
     * saved or flagged anywhere, and saving is never blocked. */
    var DISTRESS_PHRASES = ['kill myself', 'hurt myself', 'harm myself', 'end my life',
      'want to die', 'suicidal', 'suicide', 'self-harm', 'self harm',
      'no reason to live', 'better off dead'];
    function textHasDistress(text) {
      var low = ' ' + String(text || '').toLowerCase() + ' ';
      for (var i = 0; i < DISTRESS_PHRASES.length; i++) {
        if (low.indexOf(DISTRESS_PHRASES[i]) !== -1) return true;
      }
      return false;
    }

    function say(id, text) { var el = $(id); if (el) el.textContent = text; }
    function parkedWorries() {
      return well.worries.filter(function (w) { return w.state === 'parked' || w.state === 'acted'; });
    }
    function isMutedText(text) {
      var low = String(text || '').toLowerCase();
      for (var i = 0; i < well.mutedWords.length; i++) {
        if (well.mutedWords[i] && low.indexOf(well.mutedWords[i]) !== -1) return true;
      }
      return false;
    }
    function isWorryTime(now) {
      if (!well.worryTime) return false;
      var parts = String(well.worryTime).split(':');
      if (parts.length !== 2) return false;
      var setMin = Number(parts[0]) * 60 + Number(parts[1]);
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var diff = nowMin - setMin;
      return diff >= 0 && diff < 60;
    }
    function readExecNext() {
      try {
        var raw = localStorage.getItem(EXEC_KEY);
        if (!raw) return '';
        var d = JSON.parse(raw);
        var cand = null;
        if (typeof d === 'string') cand = d;
        else if (d) {
          cand = d.nextEventText || d.nextText || d.nextEvent || d.next || null;
          if (!cand && Array.isArray(d.events) && d.events.length) cand = d.events[0];
          if (!cand && Array.isArray(d.upcoming) && d.upcoming.length) cand = d.upcoming[0];
        }
        if (!cand) return '';
        if (typeof cand === 'string') return cand;
        return cand.text || cand.title || cand.label || '';
      } catch (e) { return ''; }
    }

    /* ---------- Law-5 mix controls (in the settings card) ---------- */
    function applyPetEnergy() {
      var cfg = effectiveConfig(state);
      try {
        document.body.setAttribute('data-pet-energy', cfg.petEnergy);
        document.body.classList.toggle('well-still', cfg.petEnergy === 'still');
      } catch (e) { /* body hooks are a bonus; the words still work */ }
      var panel = $('well-run-panel');
      if (panel) panel.classList.toggle('well-still', cfg.petEnergy === 'still');
    }
    function syncToggleControls() {
      var t = state.toggles || {};
      if ($('support-celebration')) $('support-celebration').value = t.celebration || '';
      if ($('support-prompt-variety')) $('support-prompt-variety').value = t.promptVariety || '';
      if ($('support-pet-energy')) $('support-pet-energy').value = t.petEnergy || '';
      if ($('support-reminder-intensity')) $('support-reminder-intensity').value = t.reminderIntensity || 'gentle';
      applyPetEnergy();
    }
    function bindToggles() {
      if ($('support-celebration')) $('support-celebration').addEventListener('change', function () {
        setToggle(state, 'celebration', this.value || null);
        syncToggleControls();
        say('support-status', this.value === 'quiet' ? 'Saved. Cheering is now Quiet. Your pet cheers with words only. Nothing else changed.'
          : this.value === 'none' ? 'Saved. Cheering is now off. Your pet will not cheer. Nothing else changed.'
          : this.value === 'full' ? 'Saved. Cheering is now Full. Nothing else changed.'
          : 'Saved. Cheering now uses your style pick. Nothing else changed.');
      });
      if ($('support-prompt-variety')) $('support-prompt-variety').addEventListener('change', function () {
        setToggle(state, 'promptVariety', this.value || null);
        syncToggleControls();
        say('support-status', this.value === 'fixed' ? 'Saved. Check-in words will be the same words each day. Nothing else changed.'
          : this.value === 'varied' ? 'Saved. Check-in words will be new words each day. Nothing else changed.'
          : 'Saved. Check-in words now use your style pick. Nothing else changed.');
        render();
      });
      if ($('support-pet-energy')) $('support-pet-energy').addEventListener('change', function () {
        setToggle(state, 'petEnergy', this.value || null);
        syncToggleControls();
        say('support-status', this.value === 'still' ? 'Saved. Your pet is now Still. It will not move. Nothing else changed.'
          : this.value === 'lively' ? 'Saved. Your pet is now Lively. Nothing else changed.'
          : this.value === 'gentle' ? 'Saved. Your pet is now Gentle. Nothing else changed.'
          : 'Saved. Pet energy now uses your style pick. Nothing else changed.');
      });
      if ($('support-reminder-intensity')) $('support-reminder-intensity').addEventListener('change', function () {
        setToggle(state, 'reminderIntensity', this.value || 'gentle');
        syncToggleControls();
        say('support-status', this.value === 'standard' ? 'Saved. Reminders are now Standard. All reminder plans can show. Nothing else changed.'
          : 'Saved. Reminders are now Gentle. Fewer reminder plans show. Nothing else changed.');
      });
    }

    /* ---------- Day plan + Now Next Later ---------- */
    function effectiveRoutineSteps(routine) {
      if (well.dayPlan === 'low') {
        var out = [];
        routine.steps.forEach(function (s) { if (s.lowText) out.push(s.lowText); });
        return out;
      }
      return routine.steps.map(function (s) { return s.text; });
    }
    function renderDayPlan() {
      var reg = $('well-plan-regular'), low = $('well-plan-low');
      if (reg) { reg.classList.toggle('selected', well.dayPlan === 'regular'); reg.setAttribute('aria-pressed', well.dayPlan === 'regular' ? 'true' : 'false'); }
      if (low) { low.classList.toggle('selected', well.dayPlan === 'low'); low.setAttribute('aria-pressed', well.dayPlan === 'low' ? 'true' : 'false'); }
      say('well-dayplan-status', well.dayPlan === 'low'
        ? 'Today is a Low Day. Routines show only their Low Day steps. Rest is a good end to today.'
        : 'Today is a Regular Day. Routines show all their steps.');
      var list = $('well-floor-list');
      if (list) {
        list.innerHTML = well.floorItems.length
          ? well.floorItems.map(function (item, i) {
              return '<li>' + esc(item) + ' <button type="button" class="btn btn-ghost" data-floor-del="' + i + '">Delete this item</button></li>';
            }).join('')
          : '<li>Your Low Day list is empty. Add one small thing above.</li>';
        var dels = list.querySelectorAll('[data-floor-del]');
        for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
          well.floorItems.splice(Number(this.getAttribute('data-floor-del')), 1);
          wellSave(); renderDayPlan(); renderSchedule();
          say('well-dayplan-status', 'Deleted. That item is off your Low Day list. Today is still a Low Day.');
        });
      }
      var wt = $('well-worry-time');
      if (wt && document.activeElement !== wt) wt.value = well.worryTime || '';
    }
    function renderSchedule() {
      var nowItems = [], nextItems = [], laterItems = [];
      if (run && run.steps.length) {
        nowItems.push(run.steps[run.idx]);
        if (run.steps[run.idx + 1]) nextItems.push(run.steps[run.idx + 1]);
        for (var i = run.idx + 2; i < run.steps.length; i++) laterItems.push(run.steps[i]);
      } else if (well.dayPlan === 'low') {
        if (well.floorItems.length) {
          nowItems.push(well.floorItems[0]);
          if (well.floorItems[1]) nextItems.push(well.floorItems[1]);
          for (var j = 2; j < well.floorItems.length; j++) laterItems.push(well.floorItems[j]);
        }
      }
      var execNext = readExecNext();
      if (execNext) laterItems.push(execNext);
      function fill(id, items, emptyText) {
        var el = $(id);
        if (!el) return;
        el.innerHTML = items.length
          ? items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('')
          : '<li>' + esc(emptyText) + '</li>';
      }
      fill('well-now-list', nowItems, run || well.dayPlan === 'low' ? 'Nothing here yet.' : 'No routine started yet. Start one below when you are ready.');
      fill('well-next-list', nextItems, 'Nothing here yet.');
      fill('well-later-list', laterItems, 'Nothing here yet.');
    }
    function bindDayPlan() {
      if ($('well-plan-regular')) $('well-plan-regular').addEventListener('click', function () {
        well.dayPlan = 'regular'; run = null;
        var panel = $('well-run-panel'); if (panel) panel.hidden = true;
        wellSave(); renderDayPlan(); renderSchedule(); renderRoutines();
        say('well-dayplan-status', 'Saved. Today is a Regular Day. Routines show all their steps. Nothing else changed.');
      });
      if ($('well-plan-low')) $('well-plan-low').addEventListener('click', function () {
        well.dayPlan = 'low'; run = null;
        var panel = $('well-run-panel'); if (panel) panel.hidden = true;
        wellSave(); renderDayPlan(); renderSchedule(); renderRoutines();
        say('well-dayplan-status', 'Saved. Today is a Low Day. Routines show only their Low Day steps. Rest is a good end to today.');
      });
      if ($('well-floor-add')) $('well-floor-add').addEventListener('click', function () {
        var input = $('well-floor-input');
        var text = input ? input.value.trim() : '';
        if (!text) { say('well-dayplan-status', 'Write one small thing first. Or leave it. Both are fine.'); return; }
        well.floorItems.push(text);
        if (input) input.value = '';
        wellSave(); renderDayPlan(); renderSchedule();
        say('well-dayplan-status', 'Saved. That thing is on your Low Day list. It shows under Now, Next, Later.');
      });
    }

    /* ---------- Routines ---------- */
    function renderDraft() {
      var list = $('well-draft-steps');
      if (!list) return;
      list.innerHTML = draftSteps.length
        ? draftSteps.map(function (s, i) {
            return '<li>Step ' + (i + 1) + ': ' + esc(s.text) + (s.lowText ? ' (Low Day: ' + esc(s.lowText) + ')' : '') + '</li>';
          }).join('')
        : '<li>No steps yet. Add one step above.</li>';
    }
    function renderRoutines() {
      var list = $('well-routine-list');
      if (!list) return;
      list.innerHTML = well.routines.length
        ? well.routines.map(function (r) {
            return '<li>' + esc(r.name) + ' — ' + r.steps.length + ' step(s). '
              + '<button type="button" class="btn btn-soft" data-routine-start="' + esc(r.id) + '">Start this routine</button> '
              + '<button type="button" class="btn btn-ghost" data-routine-del="' + esc(r.id) + '">Delete routine</button></li>';
          }).join('')
        : '<li>No routines yet. Make one above.</li>';
      var starts = list.querySelectorAll('[data-routine-start]');
      for (var i = 0; i < starts.length; i++) starts[i].addEventListener('click', function () { startRun(this.getAttribute('data-routine-start')); });
      var dels = list.querySelectorAll('[data-routine-del]');
      for (var j = 0; j < dels.length; j++) dels[j].addEventListener('click', function () {
        var id = this.getAttribute('data-routine-del');
        well.routines = well.routines.filter(function (r) { return r.id !== id; });
        if (run && run.routineId === id) { run = null; var p = $('well-run-panel'); if (p) p.hidden = true; }
        wellSave(); renderRoutines(); renderSchedule();
        say('well-routine-status', 'Deleted. That routine is off your list.');
      });
    }
    function startRun(id) {
      var routine = null;
      well.routines.forEach(function (r) { if (r.id === id) routine = r; });
      if (!routine) return;
      var steps = effectiveRoutineSteps(routine);
      var panel = $('well-run-panel');
      if (panel) panel.hidden = false;
      run = { routineId: routine.id, name: routine.name, steps: steps, idx: 0 };
      if (!steps.length) {
        say('well-run-title', routine.name);
        say('well-run-count', '');
        say('well-run-step', 'This routine has no Low Day steps. Rest is fine.');
        say('well-run-status', 'There is nothing to do here. Tap Stop for now to close this.');
        renderSchedule();
        return;
      }
      renderRun();
      say('well-run-status', 'Started. One step shows at a time. Tap Done when the step is done.');
    }
    function renderRun() {
      if (!run || !run.steps.length) return;
      say('well-run-title', run.name);
      say('well-run-count', 'Step ' + (run.idx + 1) + ' of ' + run.steps.length);
      say('well-run-step', run.steps[run.idx]);
      renderSchedule();
    }
    function bindRoutines() {
      if ($('well-step-add')) $('well-step-add').addEventListener('click', function () {
        var textEl = $('well-step-text'), lowEl = $('well-step-low');
        var text = textEl ? textEl.value.trim() : '';
        if (!text) { say('well-routine-status', 'Write one step first. One short step is enough.'); return; }
        draftSteps.push({ id: uid('step'), text: text, lowText: lowEl ? lowEl.value.trim() : '' });
        if (textEl) textEl.value = '';
        if (lowEl) lowEl.value = '';
        renderDraft();
        say('well-routine-status', 'Saved. Step added to your new routine. Add one more step, or tap Save routine.');
      });
      if ($('well-routine-save')) $('well-routine-save').addEventListener('click', function () {
        if (!draftSteps.length) { say('well-routine-status', 'Add one step first. Then tap Save routine.'); return; }
        var nameEl = $('well-routine-name');
        var name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : 'My routine';
        well.routines.push({ id: uid('routine'), name: name, steps: draftSteps.slice() });
        draftSteps = [];
        if (nameEl) nameEl.value = '';
        wellSave(); renderDraft(); renderRoutines(); renderSchedule();
        say('well-routine-status', 'Saved. Your routine is in the list below. Tap Start this routine when you want to use it.');
      });
      if ($('well-run-done')) $('well-run-done').addEventListener('click', function () {
        if (!run || !run.steps.length) return;
        var cfg = effectiveConfig(state);
        if (run.idx < run.steps.length - 1) {
          run.idx += 1;
          renderRun();
          say('well-run-status', cfg.celebration === 'full' ? 'Well done. That step is done. The next step is above.'
            : cfg.celebration === 'quiet' ? 'That step is done. The next step is above.'
            : 'The next step is above.');
        } else {
          var doneName = run.name;
          run = null;
          var panel = $('well-run-panel'); if (panel) panel.hidden = true;
          renderSchedule();
          say('well-routine-status', cfg.celebration === 'full' ? 'Well done. You did all the steps in ' + doneName + '. Rest now if you like.'
            : cfg.celebration === 'quiet' ? 'You did all the steps in ' + doneName + '.'
            : 'The routine is done.');
        }
      });
      if ($('well-run-back')) $('well-run-back').addEventListener('click', function () {
        if (!run || !run.steps.length) return;
        if (run.idx > 0) { run.idx -= 1; renderRun(); say('well-run-status', 'Back one step. The step is above.'); }
        else say('well-run-status', 'This is the first step. The step is above.');
      });
      if ($('well-run-repeat')) $('well-run-repeat').addEventListener('click', function () {
        if (!run || !run.steps.length) return;
        say('well-run-step', run.steps[run.idx]);
        say('well-run-status', 'Here it is again: ' + run.steps[run.idx]);
      });
      if ($('well-run-stop')) $('well-run-stop').addEventListener('click', function () {
        run = null;
        var panel = $('well-run-panel'); if (panel) panel.hidden = true;
        renderSchedule();
        say('well-routine-status', 'Stopped. Stopping is fine. Nothing was kept about stopping. You can start again when you want.');
      });
    }

    /* ---------- Feeling words ---------- */
    function selectedWords(attr) {
      var out = [];
      var chips = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].classList.contains('selected')) out.push(chips[i].getAttribute(attr));
      }
      return out;
    }
    function bindChips(attr, statusId) {
      var chips = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < chips.length; i++) {
        chips[i].addEventListener('click', function () {
          var on = !this.classList.contains('selected');
          this.classList.toggle('selected', on);
          this.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
    }
    function bindFeelings() {
      bindChips('data-feeling');
      if ($('well-feelings-save')) $('well-feelings-save').addEventListener('click', function () {
        var words = selectedWords('data-feeling');
        if (!words.length) { say('well-feelings-status', 'No words picked. Nothing was saved. That is fine.'); return; }
        well.journal.push({ id: uid('journal'), date: todayKey(), text: 'Feelings today: ' + words.join(', ') });
        wellSave(); renderJournal();
        say('well-feelings-status', 'Saved. Your words are in your journal below. They stay on this device.');
      });
    }

    /* ---------- Worry parking ---------- */
    function renderWorry() {
      var parked = parkedWorries();
      say('well-worry-count', parked.length === 0 ? 'No worries parked.'
        : parked.length === 1 ? '1 worry parked. It is stored on this device.'
        : parked.length + ' worries parked. They are stored on this device.');
      var showList = worryListOpen || isWorryTime(new Date());
      var wrap = $('well-worry-list');
      if (!wrap) return;
      wrap.hidden = !showList;
      if (!showList) { wrap.innerHTML = ''; return; }
      if (!parked.length) { wrap.innerHTML = '<p class="q">No worries parked right now.</p>'; return; }
      wrap.innerHTML = parked.map(function (w) {
        var html = '<div><p class="q">' + esc(w.text) + '</p>';
        if (w.note) html += '<p class="q">Your step: ' + esc(w.note) + '</p>';
        html += '<div class="choice-row">'
          + '<button type="button" class="btn btn-soft" data-worry-step="' + esc(w.id) + '">One small step I can take</button>'
          + '<button type="button" class="btn btn-soft" data-worry-rest="' + esc(w.id) + '">Not in my control — let it rest</button>'
          + '<button type="button" class="btn btn-ghost" data-worry-keep="' + esc(w.id) + '">Keep it parked</button>'
          + '</div>'
          + '<div data-worry-stepbox="' + esc(w.id) + '" hidden>'
          + '<label>One small step, in your words <input type="text" class="voice-target" maxlength="200" data-worry-step-input="' + esc(w.id) + '"></label>'
          + '<button type="button" class="btn btn-primary" data-worry-step-save="' + esc(w.id) + '">Save this step</button>'
          + '</div></div>';
        return html;
      }).join('');
      function wire(attr, fn) {
        var btns = wrap.querySelectorAll('[' + attr + ']');
        for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () { fn(this); });
      }
      wire('data-worry-step', function (btn) {
        var box = wrap.querySelector('[data-worry-stepbox="' + btn.getAttribute('data-worry-step') + '"]');
        if (box) box.hidden = false;
        say('well-worry-status', 'Write one small step. Then tap Save this step.');
      });
      wire('data-worry-step-save', function (btn) {
        var id = btn.getAttribute('data-worry-step-save');
        var input = wrap.querySelector('[data-worry-step-input="' + id + '"]');
        var text = input ? input.value.trim() : '';
        if (!text) { say('well-worry-status', 'Write one small step first. Or tap Keep it parked.'); return; }
        well.worries.forEach(function (w) { if (w.id === id) { w.note = text; w.state = 'acted'; } });
        wellSave(); renderWorry();
        say('well-worry-status', 'Saved. Your step is under your worry. You can do it when you are ready.');
      });
      wire('data-worry-rest', function (btn) {
        var id = btn.getAttribute('data-worry-rest');
        well.worries.forEach(function (w) { if (w.id === id) w.state = 'archived'; });
        wellSave(); renderWorry();
        say('well-worry-status', 'Saved. That worry is put to rest. It is off your list.');
      });
      wire('data-worry-keep', function () {
        say('well-worry-status', 'Okay. It stays parked. It will keep until Worry Time.');
      });
    }
    function bindWorry() {
      if ($('well-worry-park')) $('well-worry-park').addEventListener('click', function () {
        var input = $('well-worry-input');
        var text = input ? input.value.trim() : '';
        if (!text) { say('well-worry-status', 'Write your worry first. One short line is enough.'); return; }
        well.worries.push({ id: uid('worry'), text: text, parkedAt: new Date().toISOString(), state: 'parked', note: '' });
        if (input) input.value = '';
        wellSave(); renderWorry();
        say('well-worry-status', 'Saved. This worry stays parked until Worry Time. You do not need to hold it in your head.');
      });
      if ($('well-worry-time-save')) $('well-worry-time-save').addEventListener('click', function () {
        var input = $('well-worry-time');
        well.worryTime = input && input.value ? input.value : '';
        wellSave(); renderWorry();
        say('well-worry-status', well.worryTime ? 'Saved. Worry Time is set. Your worries will show at that time.'
          : 'Saved. There is no Worry Time. Your worries show only when you tap the look button.');
      });
      if ($('well-worry-time-clear')) $('well-worry-time-clear').addEventListener('click', function () {
        well.worryTime = '';
        var input = $('well-worry-time'); if (input) input.value = '';
        wellSave(); renderWorry();
        say('well-worry-status', 'Saved. Worry Time is cleared. Your worries show only when you tap the look button.');
      });
      if ($('well-worry-look')) $('well-worry-look').addEventListener('click', function () {
        worryListOpen = true;
        parkedWorries().forEach(function (w) { worryOpens[w.id] = (worryOpens[w.id] || 0) + 1; });
        var anyThird = parkedWorries().some(function (w) { return worryOpens[w.id] >= 3; });
        if (anyThird && !breakerShown) {
          breakerShown = true;
          var b = $('well-worry-breaker');
          if (b) { b.hidden = false; b.textContent = BREAKER_TEXT; }
        }
        renderWorry();
        say('well-worry-status', 'Here are your parked worries. You can act on one, let one rest, or keep one parked.');
      });
    }

    /* ---------- Journal + unsent letters (with Undo) ---------- */
    function renderJournal() {
      var list = $('well-journal-list');
      if (!list) return;
      var items = well.journal.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) {
            var html = '<li>' + esc(e.date) + ' — ' + esc(e.text) + ' '
              + '<button type="button" class="btn btn-ghost" data-journal-del="' + esc(e.id) + '">Delete this entry</button></li>';
            if (distressNotes[e.id]) {
              html += '<li data-distress-note="' + esc(e.id) + '">If things feel like too much right now, support is here. '
                + '<button type="button" class="btn btn-soft" data-distress-open="1">Open support</button> '
                + '<button type="button" class="btn btn-ghost" data-distress-close="' + esc(e.id) + '">Close this note</button></li>';
            }
            return html;
          }).join('')
        : '<li>Nothing here yet. Your entries will show here.</li>';
      var openBtns = list.querySelectorAll('[data-distress-open]');
      for (var oi = 0; oi < openBtns.length; oi++) openBtns[oi].addEventListener('click', function () { openSafety(true); });
      var closeBtns = list.querySelectorAll('[data-distress-close]');
      for (var ci = 0; ci < closeBtns.length; ci++) closeBtns[ci].addEventListener('click', function () {
        delete distressNotes[this.getAttribute('data-distress-close')];
        renderJournal();
        say('well-journal-status', 'Note closed. Your entry is still here, just as you wrote it.');
      });
      var dels = list.querySelectorAll('[data-journal-del]');
      for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
        var id = this.getAttribute('data-journal-del');
        for (var j = 0; j < well.journal.length; j++) {
          if (well.journal[j].id === id) { lastDeletedJournal = { item: well.journal[j], index: j }; well.journal.splice(j, 1); break; }
        }
        wellSave(); renderJournal();
        var undo = $('well-journal-undo'); if (undo) undo.hidden = false;
        say('well-journal-status', 'Deleted. Tap Undo delete to put it back.');
      });
      var undoBtn = $('well-journal-undo');
      if (undoBtn) undoBtn.hidden = !lastDeletedJournal;
    }
    function renderUnsent() {
      var list = $('well-unsent-list');
      if (!list) return;
      var items = well.unsent.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) {
            return '<li>' + esc(e.date) + ' — ' + esc(e.text)
              + (e.ready ? ' <strong>Ready to send myself. Rootling will not send it.</strong>' : '') + ' '
              + '<button type="button" class="btn btn-soft" data-unsent-ready="' + esc(e.id) + '">Mark ready to send myself</button> '
              + '<button type="button" class="btn btn-ghost" data-unsent-del="' + esc(e.id) + '">Delete this letter</button></li>';
          }).join('')
        : '<li>No letters parked yet. Your letters will show here.</li>';
      var readys = list.querySelectorAll('[data-unsent-ready]');
      for (var i = 0; i < readys.length; i++) readys[i].addEventListener('click', function () {
        var id = this.getAttribute('data-unsent-ready');
        well.unsent.forEach(function (e) { if (e.id === id) e.ready = true; });
        wellSave(); renderUnsent();
        say('well-unsent-status', 'Saved. This letter is marked ready. Rootling will not send it. You can send it yourself if you choose.');
      });
      var dels = list.querySelectorAll('[data-unsent-del]');
      for (var j = 0; j < dels.length; j++) dels[j].addEventListener('click', function () {
        var id = this.getAttribute('data-unsent-del');
        for (var k = 0; k < well.unsent.length; k++) {
          if (well.unsent[k].id === id) { lastDeletedUnsent = { item: well.unsent[k], index: k }; well.unsent.splice(k, 1); break; }
        }
        wellSave(); renderUnsent();
        var undo = $('well-unsent-undo'); if (undo) undo.hidden = false;
        say('well-unsent-status', 'Deleted. Tap Undo delete to put it back.');
      });
      var undoBtn = $('well-unsent-undo');
      if (undoBtn) undoBtn.hidden = !lastDeletedUnsent;
    }
    function bindJournal() {
      if ($('well-journal-save')) $('well-journal-save').addEventListener('click', function () {
        var input = $('well-journal-input');
        var text = input ? input.value.trim() : '';
        if (!text) { say('well-journal-status', 'Write a few words first. Or leave this blank. Both are fine.'); return; }
        var entry = { id: uid('journal'), date: todayKey(), text: text };
        well.journal.push(entry);
        if (textHasDistress(text)) distressNotes[entry.id] = true; /* this visit only; nothing about this is saved */
        if (input) input.value = '';
        wellSave(); renderJournal();
        say('well-journal-status', 'Saved. Your entry is in the list below. It stays on this device only.');
      });
      if ($('well-journal-undo')) $('well-journal-undo').addEventListener('click', function () {
        if (!lastDeletedJournal) return;
        well.journal.splice(Math.min(lastDeletedJournal.index, well.journal.length), 0, lastDeletedJournal.item);
        lastDeletedJournal = null;
        wellSave(); renderJournal();
        say('well-journal-status', 'Back. Your entry is in the list again.');
      });
      if ($('well-unsent-save')) $('well-unsent-save').addEventListener('click', function () {
        var input = $('well-unsent-input');
        var text = input ? input.value.trim() : '';
        if (!text) { say('well-unsent-status', 'Write your letter first. Or leave this blank. Both are fine.'); return; }
        well.unsent.push({ id: uid('unsent'), date: todayKey(), text: text, ready: false });
        if (input) input.value = '';
        wellSave(); renderUnsent();
        say('well-unsent-status', 'Saved. Your letter is parked below. Rootling will not send it.');
      });
      if ($('well-unsent-undo')) $('well-unsent-undo').addEventListener('click', function () {
        if (!lastDeletedUnsent) return;
        well.unsent.splice(Math.min(lastDeletedUnsent.index, well.unsent.length), 0, lastDeletedUnsent.item);
        lastDeletedUnsent = null;
        wellSave(); renderUnsent();
        say('well-unsent-status', 'Back. Your letter is in the list again.');
      });
    }

    /* ---------- Sensory words ---------- */
    function renderSensory() {
      var list = $('well-sensory-list');
      if (!list) return;
      var items = well.sensory.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) {
            return '<li>' + esc(e.date) + ' — ' + esc(e.words.join(', ')) + (e.note ? ' — ' + esc(e.note) : '') + ' '
              + '<button type="button" class="btn btn-ghost" data-sensory-del="' + esc(e.id) + '">Delete this entry</button></li>';
          }).join('')
        : '<li>Nothing saved yet. Your saved words will show here.</li>';
      var dels = list.querySelectorAll('[data-sensory-del]');
      for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
        var id = this.getAttribute('data-sensory-del');
        well.sensory = well.sensory.filter(function (e) { return e.id !== id; });
        wellSave(); renderSensory();
        say('well-sensory-status', 'Deleted. That entry is off your list.');
      });
    }
    function bindSensory() {
      bindChips('data-sensory');
      if ($('well-sensory-open')) $('well-sensory-open').addEventListener('click', function () {
        var panel = $('well-sensory-panel');
        if (!panel) return;
        panel.hidden = !panel.hidden;
        this.textContent = panel.hidden ? 'Open this check-in' : 'Close this check-in';
        if (!panel.hidden) say('well-sensory-status', 'This card is open. Tap words that fit now. You can close it at any time.');
      });
      if ($('well-sensory-save')) $('well-sensory-save').addEventListener('click', function () {
        var words = selectedWords('data-sensory');
        var noteEl = $('well-sensory-note');
        var note = noteEl ? noteEl.value.trim() : '';
        if (!words.length && !note) { say('well-sensory-status', 'Pick a word first, or write a note. Or close this card. All are fine.'); return; }
        well.sensory.push({ id: uid('sensory'), date: todayKey(), words: words, note: note });
        var chips = document.querySelectorAll('[data-sensory]');
        for (var i = 0; i < chips.length; i++) { chips[i].classList.remove('selected'); chips[i].setAttribute('aria-pressed', 'false'); }
        if (noteEl) noteEl.value = '';
        wellSave(); renderSensory();
        say('well-sensory-status', 'Saved. Your words are in the list below. They stay on this device.');
      });
    }

    /* ---------- Word mute list (this module's surfaces only) ---------- */
    function applyMutes() {
      var prompts = document.querySelectorAll('[data-well-prompt]');
      for (var i = 0; i < prompts.length; i++) {
        if (!prompts[i].getAttribute('data-well-text')) prompts[i].setAttribute('data-well-text', prompts[i].textContent);
        prompts[i].hidden = isMutedText(prompts[i].getAttribute('data-well-text'));
      }
      var chips = document.querySelectorAll('[data-feeling], [data-sensory]');
      for (var j = 0; j < chips.length; j++) {
        var word = chips[j].getAttribute('data-feeling') || chips[j].getAttribute('data-sensory') || '';
        chips[j].hidden = isMutedText(word);
      }
    }
    function renderMute() {
      var list = $('well-mute-list');
      if (!list) return;
      list.innerHTML = well.mutedWords.length
        ? well.mutedWords.map(function (w) {
            return '<li>' + esc(w) + ' <button type="button" class="btn btn-ghost" data-mute-del="' + esc(w) + '">Take off list</button></li>';
          }).join('')
        : '<li>No words on your list.</li>';
      var dels = list.querySelectorAll('[data-mute-del]');
      for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
        var word = this.getAttribute('data-mute-del');
        well.mutedWords = well.mutedWords.filter(function (w) { return w !== word; });
        wellSave(); renderMute(); applyMutes();
        say('well-mute-status', 'Saved. That word is off your list. Notes with it can show again.');
      });
      applyMutes();
    }
    function bindMute() {
      if ($('well-mute-add')) $('well-mute-add').addEventListener('click', function () {
        var input = $('well-mute-input');
        var word = input ? input.value.trim().toLowerCase() : '';
        if (!word) { say('well-mute-status', 'Write one word first.'); return; }
        if (well.mutedWords.indexOf(word) !== -1) { say('well-mute-status', 'That word is on your list now.'); return; }
        well.mutedWords.push(word);
        if (input) input.value = '';
        wellSave(); renderMute();
        say('well-mute-status', 'Saved. Notes with that word will not show in these cards. Your own words still show.');
      });
    }

    /* ---------- Safety view + trusted people ---------- */
    function scrollToEl(el) {
      try { if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView(); } catch (e) { /* scrolling is a help, never a need */ }
    }
    function openSafety(fromDistress) {
      var view = $('safety-view');
      if (!view) return;
      view.hidden = false;
      checkShareEnd();
      renderLocDashboard();
      scrollToEl(view);
      if (fromDistress === true) {
        say('safety-status', 'This is the support page. First, a quick check-in.');
        say('safety-checkin-status', 'I am concerned about your safety. Are you safe right now?');
        var h = $('safety-checkin-heading');
        try { if (h && h.focus) h.focus(); } catch (e) { /* focus is a help, never a need */ }
      } else {
        say('safety-status', 'This is the support page. Pick one thing. Or tap Back.');
      }
    }
    function closeSafety() {
      stopAlertFlow('The alert is stopped. No one was contacted.');
      var view = $('safety-view');
      if (view) view.hidden = true;
      scrollToEl($('well-safety-bar'));
    }
    function goGrounding(breathing) {
      var card = $('grounding-card');
      if (!card) { say('safety-status', 'Grounding tools are just below. Pick the one you want.'); return; }
      card.hidden = false;
      scrollToEl(card);
      if (breathing) {
        var btn = $('breath-start');
        if (btn) {
          btn.click(); /* the breathing tool's own button, with its own Stop */
          say('safety-status', 'Paced breathing is open below. You can stop it at any time.');
          return;
        }
      }
      say('safety-status', 'Grounding tools are just below. Pick the one you want.');
    }
    function cleanPhone(phone) { return String(phone || '').replace(/[^0-9+]/g, ''); }

    /* ---------- Emergency alert safeguard + location sharing ---------- */
    function contactById(id) {
      var found = null;
      well.contacts.forEach(function (c) { if (c.id === id) found = c; });
      return found;
    }
    function selectedContact() {
      if (well.alertContactId) { var c = contactById(well.alertContactId); if (c) return c; }
      return well.contacts.length ? well.contacts[0] : null;
    }
    function contactMethod(c) {
      var m = c && c.method ? String(c.method) : 'text';
      return (m === 'email' || m === 'call' || m === 'text') ? m : 'text';
    }
    function methodWord(c) {
      var m = contactMethod(c);
      return m === 'email' ? 'Email' : m === 'call' ? 'Call' : 'Text';
    }
    /* The note builder reads ONLY the name field the user typed for
     * these notes, plus a place link handed in by the location flow.
     * Nothing from the journal, check-ins, or any history can enter it. */
    function buildAlertMessage(placeLink) {
      var name = String(well.userName || '').trim() || 'Someone';
      var msg = name + ' may be experiencing a mental health crisis and has requested support through their AI Companion app. Please reach out to them as soon as possible.';
      if (placeLink) msg += ' My location: ' + placeLink;
      return msg;
    }
    function handoffHrefFor(c, msg) {
      if (!c) return '';
      var m = contactMethod(c);
      var tel = cleanPhone(c.phone);
      var em = String(c.email || '').trim();
      if (m === 'email' && em) return 'mailto:' + em + '?subject=' + encodeURIComponent('Please reach out soon') + '&body=' + encodeURIComponent(msg);
      if (m === 'call' && tel) return 'tel:' + tel;
      if (tel) return 'sms:' + tel + '?body=' + encodeURIComponent(msg);
      if (em) return 'mailto:' + em + '?subject=' + encodeURIComponent('Please reach out soon') + '&body=' + encodeURIComponent(msg);
      return '';
    }
    function locHrefFor(c, msg) {
      /* A phone call cannot carry a map link, so a place note to a
       * call-first contact goes by text when a number exists. */
      if (c && contactMethod(c) === 'call') {
        var tel = cleanPhone(c.phone);
        if (tel) return 'sms:' + tel + '?body=' + encodeURIComponent(msg);
      }
      return handoffHrefFor(c, msg);
    }
    /* The hand-off: a link the device opens in the user's own app.
     * Rootling itself sends nothing, ever. */
    function handOff(href) {
      if (!href) return false;
      try {
        var a = document.createElement('a');
        a.href = href;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        if (a.parentNode) a.parentNode.removeChild(a);
        return true;
      } catch (e) { return false; }
    }
    function focusEl(el) { try { if (el && el.focus) el.focus(); } catch (e) { /* focus is a help, never a need */ } }
    function hideAlertPanels() {
      var w = $('safety-alert-warning-panel'); if (w) w.hidden = true;
      var t = $('safety-alert-timer-panel'); if (t) t.hidden = true;
      var f = $('safety-alert-final-panel'); if (f) f.hidden = true;
    }
    /* Gate check for arming an alert. Any word but '' means: not armed. */
    function alertGate() {
      if (!well.alertsEnabled) return 'off';
      if (!well.alertsConsent) return 'consent';
      var c = selectedContact();
      if (!c) return 'nocontact';
      if (c.notify === false) return 'muted';
      if (!handoffHrefFor(c, buildAlertMessage(''))) return 'noway';
      return '';
    }
    function stopAlertFlow(line) {
      if (alertFlow.timerId) { try { clearInterval(alertFlow.timerId); } catch (e) { /* already stopped */ } }
      alertFlow.stage = 'idle';
      alertFlow.armed = false;
      alertFlow.secondsLeft = 0;
      alertFlow.contactId = '';
      alertFlow.timerId = null;
      hideAlertPanels();
      if (line) say('safety-alert-status', line);
    }
    function startAlertWarning() {
      var gate = alertGate();
      if (gate) {
        stopAlertFlow('');
        say('safety-alert-status',
          gate === 'off' ? 'Emergency alerts are off. Turn on Emergency alerts in the dashboard first. No one was contacted.'
          : gate === 'consent' ? 'First tap the box that says: I choose to turn this on. I have told my contact about it. No one was contacted.'
          : gate === 'nocontact' ? 'Add a person first, in People you trust. No one was contacted.'
          : gate === 'muted' ? 'Alerts are off for that person. Turn alerts on for them in the list, or pick a new emergency contact. No one was contacted.'
          : 'There is no way to reach that person yet. Add a phone number or an email address. No one was contacted.');
        return false;
      }
      var c = selectedContact();
      alertFlow.stage = 'warning';
      alertFlow.armed = true;
      alertFlow.contactId = c.id;
      say('safety-alert-warning-feature', 'The feature is: Emergency alerts.');
      say('safety-alert-warning-who', 'Your emergency contact is ' + c.name + '. Only ' + c.name + ' will get this note.');
      say('safety-alert-warning-preview', buildAlertMessage(''));
      hideAlertPanels();
      var panel = $('safety-alert-warning-panel');
      if (panel) panel.hidden = false;
      focusEl($('safety-alert-warning-heading'));
      say('safety-alert-status', 'Nothing has gone out. Read the note. Then choose.');
      return true;
    }
    function showAlertFinal() {
      if (alertFlow.timerId) { try { clearInterval(alertFlow.timerId); } catch (e) { /* already stopped */ } alertFlow.timerId = null; }
      alertFlow.secondsLeft = 0;
      say('safety-alert-seconds', '0');
      alertFlow.stage = 'confirm';
      hideAlertPanels();
      var c = selectedContact();
      say('safety-alert-final-preview', c ? 'Note for ' + c.name + ': ' + buildAlertMessage('') : buildAlertMessage(''));
      var panel = $('safety-alert-final-panel');
      if (panel) panel.hidden = false;
      focusEl($('safety-alert-final-heading'));
      say('safety-alert-status', 'One last check. Nothing has gone out yet.');
    }
    function tickAlertTimer(n) {
      if (alertFlow.stage !== 'timing' || !alertFlow.armed) return;
      alertFlow.secondsLeft -= (typeof n === 'number' && n > 0 ? n : 1);
      if (alertFlow.secondsLeft > 0) { say('safety-alert-seconds', String(alertFlow.secondsLeft)); return; }
      showAlertFinal();
    }
    function startAlertTimer() {
      if (alertFlow.stage !== 'warning' || !alertFlow.armed) {
        say('safety-alert-status', 'That step is not ready. Start with Contact My Emergency Contact, and tap each step in order.');
        return false;
      }
      alertFlow.stage = 'timing';
      alertFlow.secondsLeft = 30;
      say('safety-alert-seconds', '30');
      hideAlertPanels();
      var panel = $('safety-alert-timer-panel');
      if (panel) panel.hidden = false;
      focusEl($('safety-alert-timer-heading'));
      if (alertFlow.timerId) { try { clearInterval(alertFlow.timerId); } catch (e) { /* fresh start below */ } }
      alertFlow.timerId = setInterval(function () { tickAlertTimer(1); }, 1000);
      say('safety-alert-status', 'The wait has started. You can stop it at any time.');
      return true;
    }
    function sendNowAlert() {
      if (alertFlow.stage !== 'timing' || !alertFlow.armed) {
        say('safety-alert-status', 'That step is not ready. Start with Contact My Emergency Contact, and tap each step in order.');
        return false;
      }
      tickAlertTimer(alertFlow.secondsLeft);
      return alertFlow.stage === 'confirm';
    }
    function sendAlertNow() {
      if (alertFlow.stage !== 'confirm' || !alertFlow.armed) {
        say('safety-alert-status', 'That step is not ready. The note goes out only after each step, in order.');
        return false;
      }
      if (alertGate()) { stopAlertFlow('The alert is stopped. A switch was turned off. No one was contacted.'); return false; }
      var c = selectedContact();
      var href = handoffHrefFor(c, buildAlertMessage(''));
      if (!href) { stopAlertFlow('The alert is stopped. There is no way to reach that person. No one was contacted.'); return false; }
      alertFlow.handoffHref = href;
      handOff(href);
      well.shareHistory.push({ when: new Date().toISOString(), who: c.name, duration: 'One note', withLocation: false });
      wellSave();
      stopAlertFlow('');
      var line = $('safety-alert-handoff-line');
      if (line) { line.hidden = false; line.textContent = HANDOFF_LINE; }
      say('safety-alert-status', HANDOFF_LINE);
      renderLocDashboard();
      return true;
    }
    /* ----- location sharing ----- */
    function mapsLink(lat, lon) { return 'https:' + '//maps.google.com/?q=' + lat + ',' + lon; }
    function showLocPanel(which) {
      var cp = $('safety-loc-consent-panel'); if (cp) cp.hidden = which !== 'consent';
      var ap = $('safety-loc-ask-panel'); if (ap) ap.hidden = which !== 'ask';
      var sp = $('safety-loc-summary-panel'); if (sp) sp.hidden = which !== 'summary';
    }
    function checkShareEnd() {
      if (well.activeShare && well.activeShare.endsAt && well.activeShare.endsAt <= Date.now()) {
        well.activeShare = null;
        wellSave();
        say('safety-loc-dash-status', 'Sharing ended. The time you picked is over.');
        return true;
      }
      return false;
    }
    function renderLocDashboard() {
      checkShareEnd();
      var sw = $('safety-loc-switch');
      if (sw && document.activeElement !== sw) sw.checked = !!well.locationEnabled;
      var ind = $('safety-loc-indicator');
      if (ind) {
        if (well.activeShare) {
          ind.hidden = false;
          say('safety-loc-indicator-text', 'Sharing your location with ' + well.activeShare.contactName + ' — tap Stop to end it');
        } else ind.hidden = true;
      }
      var list = $('safety-loc-history-list');
      if (list) {
        var items = (well.shareHistory || []).slice().reverse();
        list.innerHTML = items.length
          ? items.map(function (h) {
              var when = h.when;
              try { when = new Date(h.when).toLocaleString(); } catch (e) { /* keep the stored words */ }
              return '<li>' + esc(when) + ' — ' + esc(h.who) + ' — ' + esc(h.duration) + ' — with location: ' + (h.withLocation ? 'yes' : 'no') + '</li>';
            }).join('')
          : '<li>No shares yet.</li>';
      }
    }
    function renderAlertDashboard() {
      var sw = $('safety-alerts-enabled');
      if (sw && document.activeElement !== sw) sw.checked = !!well.alertsEnabled;
      var cb = $('safety-alerts-consent');
      if (cb && document.activeElement !== cb) cb.checked = !!well.alertsConsent;
      var nm = $('safety-user-name');
      if (nm && document.activeElement !== nm) nm.value = well.userName || '';
      say('safety-alert-preview', buildAlertMessage(''));
      var c = selectedContact();
      say('safety-alert-contact-line', c
        ? 'Contact to alert: ' + c.name + ' (best way: ' + methodWord(c) + ').'
        : 'No emergency contact picked yet. Add a person above, then tap Use for alerts in their row.');
    }
    function startLocConsent(fromShare) {
      locFlow.fromShare = !!fromShare;
      locFlow.stage = 'consent';
      showLocPanel('consent');
      focusEl($('safety-loc-consent-heading'));
      say('safety-loc-status', 'Read this first. Then choose. Nothing is picked for you.');
    }
    function openLocAsk() {
      if (!selectedContact()) {
        locFlow.stage = 'idle';
        showLocPanel('');
        say('safety-loc-status', 'Add a person first, in People you trust. Then you can share with them.');
        return;
      }
      locFlow.stage = 'ask';
      showLocPanel('ask');
      focusEl($('safety-loc-ask-heading'));
    }
    function tapShareLocation() {
      if (!selectedContact()) { say('safety-loc-status', 'Add a person first, in People you trust. Then you can share with them.'); return; }
      if (!well.locationEnabled) { startLocConsent(true); return; }
      openLocAsk();
    }
    var LOC_DURATIONS = [
      { id: 'safety-loc-dur-once', key: 'once', label: 'Share Once' },
      { id: 'safety-loc-dur-15', key: '15', label: '15 Minutes' },
      { id: 'safety-loc-dur-60', key: '60', label: '1 Hour' },
      { id: 'safety-loc-dur-until', key: 'until', label: 'Until I Stop It' }
    ];
    function paintLocDurations() {
      LOC_DURATIONS.forEach(function (d) {
        var b = $(d.id);
        if (!b) return;
        var on = locFlow.duration === d.key;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function openLocSummary() {
      var c = selectedContact();
      if (!c) { openLocAsk(); return; }
      locFlow.stage = 'summary';
      locFlow.duration = '';
      locFlow.durationLabel = '';
      locFlow.canSkipPlace = false;
      var nb = $('safety-loc-noloc-btn'); if (nb) nb.hidden = true;
      say('safety-loc-summary-who', 'Your emergency contact is ' + c.name + '. Only ' + c.name + ' gets this note.');
      say('safety-loc-summary-method', contactMethod(c) === 'call'
        ? 'How it goes: by text message. A call cannot carry a map link.'
        : 'How it goes: by ' + (contactMethod(c) === 'email' ? 'email' : 'text message') + '.');
      paintLocDurations();
      showLocPanel('summary');
      focusEl($('safety-loc-summary-heading'));
      say('safety-loc-status', 'Check the words. Pick how long. Then tap Share my location now.');
    }
    function finishLocShare(href, withPlace) {
      if (!href) { say('safety-loc-status', 'There is no way to reach that person yet. Add a phone number or an email address. Nothing was shared.'); return false; }
      var c = selectedContact();
      locFlow.handoffHref = href;
      handOff(href);
      well.shareHistory.push({ when: new Date().toISOString(), who: c ? c.name : '', duration: locFlow.durationLabel || 'Share Once', withLocation: !!withPlace });
      if (withPlace && locFlow.duration && locFlow.duration !== 'once') {
        well.activeShare = {
          contactName: c ? c.name : '',
          endsAt: locFlow.duration === '15' ? Date.now() + 15 * 60000 : locFlow.duration === '60' ? Date.now() + 60 * 60000 : null,
          durationLabel: locFlow.durationLabel
        };
      }
      wellSave();
      locFlow.stage = 'idle';
      locFlow.canSkipPlace = false;
      showLocPanel('');
      var line = $('safety-loc-handoff-line');
      if (line) { line.hidden = false; line.textContent = HANDOFF_LINE; }
      say('safety-loc-status', HANDOFF_LINE);
      renderLocDashboard();
      return true;
    }
    function locPlaceMissing() {
      locFlow.canSkipPlace = true;
      var b = $('safety-loc-noloc-btn'); if (b) b.hidden = false;
      say('safety-loc-status', 'Your phone did not give a location. You can send the note without location, or stop here. Nothing has gone out.');
    }
    function tapLocFinal() {
      if (locFlow.stage !== 'summary') { say('safety-loc-status', 'That step is not ready. Tap Share my location, and tap each step in order.'); return false; }
      if (!locFlow.duration) { say('safety-loc-status', 'Pick how long first. Then tap Share my location now.'); return false; }
      if (!well.locationEnabled) { say('safety-loc-status', 'Location sharing is off. Turn it on first, in the dashboard. Nothing was shared.'); return false; }
      if (!selectedContact()) { say('safety-loc-status', 'Add a person first, in People you trust. Nothing was shared.'); return false; }
      var geo = null;
      try { if (typeof navigator !== 'undefined' && navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === 'function') geo = navigator.geolocation; } catch (e) { geo = null; }
      if (!geo) { locPlaceMissing(); return false; }
      try {
        geo.getCurrentPosition(function (pos) {
          if (locFlow.stage !== 'summary') return;
          var lat = pos && pos.coords ? pos.coords.latitude : null;
          var lon = pos && pos.coords ? pos.coords.longitude : null;
          if (lat === null || lat === undefined || lon === null || lon === undefined) { locPlaceMissing(); return; }
          var c = selectedContact();
          if (!c) { say('safety-loc-status', 'Add a person first, in People you trust. Nothing was shared.'); return; }
          finishLocShare(locHrefFor(c, buildAlertMessage(mapsLink(lat, lon))), true);
        }, function () { locPlaceMissing(); }, { timeout: 10000 });
      } catch (e) { locPlaceMissing(); }
      return true;
    }

    function renderContacts() {
      var list = $('safety-contact-list');
      if (!list) return;
      list.innerHTML = well.contacts.length
        ? well.contacts.map(function (c) {
            var tel = cleanPhone(c.phone);
            var isAlert = selectedContact() && selectedContact().id === c.id;
            var html = '<li>' + esc(c.name)
              + (c.relationship ? ' — ' + esc(c.relationship) : '')
              + (c.phone ? ' — ' + esc(c.phone) : '')
              + (c.email ? ' — ' + esc(c.email) : '')
              + ' — best way: ' + methodWord(c) + ' ';
            if (tel) html += '<a class="btn btn-primary" href="tel:' + esc(tel) + '">Call</a> '
              + '<a class="btn btn-soft" href="sms:' + esc(tel) + '">Text</a> ';
            if (c.email) html += '<a class="btn btn-soft" href="mailto:' + esc(c.email) + '">Email</a> ';
            if (isAlert) html += '<strong>Emergency contact. </strong>';
            else html += '<button type="button" class="btn btn-ghost" data-contact-select="' + esc(c.id) + '">Use for alerts</button> ';
            html += '<button type="button" class="btn btn-ghost" data-contact-notify="' + esc(c.id) + '">'
              + (c.notify === false ? 'Alerts to this person: off — tap to turn on' : 'Alerts to this person: on — tap to turn off') + '</button> '
              + '<button type="button" class="btn btn-ghost" data-contact-edit="' + esc(c.id) + '">Change</button> '
              + '<button type="button" class="btn btn-ghost" data-contact-del="' + esc(c.id) + '">Delete</button></li>';
            return html;
          }).join('')
        : '<li>No people added yet. Add a person above.</li>';
      var edits = list.querySelectorAll('[data-contact-edit]');
      for (var i = 0; i < edits.length; i++) edits[i].addEventListener('click', function () {
        var id = this.getAttribute('data-contact-edit');
        well.contacts.forEach(function (c) {
          if (c.id === id) {
            editingContactId = id;
            if ($('safety-contact-name')) $('safety-contact-name').value = c.name;
            if ($('safety-contact-relationship')) $('safety-contact-relationship').value = c.relationship || '';
            if ($('safety-contact-phone')) $('safety-contact-phone').value = c.phone || '';
            if ($('safety-contact-email')) $('safety-contact-email').value = c.email || '';
            if ($('safety-contact-method')) $('safety-contact-method').value = contactMethod(c);
            if ($('safety-contact-notify')) $('safety-contact-notify').checked = c.notify !== false;
          }
        });
        say('safety-contact-status', 'Change what you need. Then tap Add this person to save.');
      });
      var sels = list.querySelectorAll('[data-contact-select]');
      for (var si = 0; si < sels.length; si++) sels[si].addEventListener('click', function () {
        var id = this.getAttribute('data-contact-select');
        var c = contactById(id);
        well.alertContactId = id;
        wellSave(); renderContacts();
        say('safety-contact-status', c ? 'Saved. ' + c.name + ' is your emergency contact.' : 'Saved.');
      });
      var nots = list.querySelectorAll('[data-contact-notify]');
      for (var ni = 0; ni < nots.length; ni++) nots[ni].addEventListener('click', function () {
        var id = this.getAttribute('data-contact-notify');
        var c = contactById(id);
        if (c) c.notify = c.notify === false ? true : false;
        wellSave(); renderContacts();
        say('safety-contact-status', c ? 'Saved. Alerts to ' + c.name + ' are ' + (c.notify ? 'on.' : 'off.') : 'Saved.');
      });
      var dels = list.querySelectorAll('[data-contact-del]');
      for (var j = 0; j < dels.length; j++) dels[j].addEventListener('click', function () {
        var id = this.getAttribute('data-contact-del');
        well.contacts = well.contacts.filter(function (c) { return c.id !== id; });
        if (editingContactId === id) editingContactId = null;
        if (well.alertContactId === id) well.alertContactId = well.contacts.length ? well.contacts[0].id : '';
        wellSave(); renderContacts();
        say('safety-contact-status', 'Deleted. That person is off your list.');
      });
      renderAlertDashboard();
      renderLocDashboard();
    }
    function bindSafety() {
      if ($('well-safety-open')) $('well-safety-open').addEventListener('click', function () { openSafety(false); });
      /* Integration (v1.0 dashboard): the Emergency Help Button sits on
       * the home dashboard itself (quick actions), same destination. */
      if ($('dash-safety-btn')) $('dash-safety-btn').addEventListener('click', function () { openSafety(false); });
      if ($('safety-back-btn')) $('safety-back-btn').addEventListener('click', closeSafety);
      if ($('safety-grounding-btn')) $('safety-grounding-btn').addEventListener('click', function () { goGrounding(false); });
      if ($('safety-breathing-btn')) $('safety-breathing-btn').addEventListener('click', function () { goGrounding(true); });
      if ($('safety-res-grounding-btn')) $('safety-res-grounding-btn').addEventListener('click', function () { goGrounding(false); });
      if ($('safety-res-breathing-btn')) $('safety-res-breathing-btn').addEventListener('click', function () { goGrounding(true); });

      /* Check-in first: the app talks to the user before anyone else. */
      if ($('safety-checkin-safe')) $('safety-checkin-safe').addEventListener('click', function () {
        stopAlertFlow('');
        var rp = $('safety-resources-panel'); if (rp) rp.hidden = true;
        say('safety-checkin-status', 'Thank you for telling me. Nothing else will happen. You can stay here, or tap Back.');
        say('safety-status', 'You are in charge here. Pick one thing, or tap Back.');
      });
      if ($('safety-checkin-help')) $('safety-checkin-help').addEventListener('click', function () {
        var rp = $('safety-resources-panel'); if (rp) rp.hidden = false;
        scrollToEl(rp);
        say('safety-checkin-status', 'Here are calm tools and crisis lines, right here. You can also contact your emergency contact.');
      });
      if ($('safety-checkin-support')) $('safety-checkin-support').addEventListener('click', function () {
        var opened = false;
        try { var pt = $('privacy-toggle'); if (pt) { pt.click(); opened = true; } } catch (e) { opened = false; }
        if (opened) { say('safety-checkin-status', 'The Privacy page is open. The support words are on that page.'); return; }
        var line = $('safety-support-line'); if (line) line.hidden = false;
        say('safety-checkin-status', 'Support contact details will appear here once they are set up.');
      });
      if ($('safety-checkin-contact-btn')) $('safety-checkin-contact-btn').addEventListener('click', startAlertWarning);
      if ($('safety-alert-start-btn')) $('safety-alert-start-btn').addEventListener('click', startAlertWarning);

      /* Alert steps, in order: warning, wait, last check, hand-off. */
      if ($('safety-alert-warning-go')) $('safety-alert-warning-go').addEventListener('click', startAlertTimer);
      if ($('safety-alert-warning-notyet')) $('safety-alert-warning-notyet').addEventListener('click', function () {
        stopAlertFlow('Okay. Nothing was contacted. You can start again when you want.');
      });
      if ($('safety-alert-warning-resources')) $('safety-alert-warning-resources').addEventListener('click', function () {
        var rp = $('safety-resources-panel'); if (rp) rp.hidden = false;
        scrollToEl(rp);
        say('safety-alert-status', 'Crisis lines and calm tools are showing. The alert wait has not started.');
      });
      if ($('safety-alert-timer-cancel')) $('safety-alert-timer-cancel').addEventListener('click', function () {
        stopAlertFlow('Okay. The alert is stopped. No one was contacted.');
      });
      if ($('safety-alert-timer-safe')) $('safety-alert-timer-safe').addEventListener('click', function () {
        stopAlertFlow('Good. The alert is stopped. No one was contacted.');
        say('safety-checkin-status', 'Thank you for telling me. Nothing else will happen.');
      });
      if ($('safety-alert-timer-sendnow')) $('safety-alert-timer-sendnow').addEventListener('click', sendNowAlert);
      if ($('safety-alert-final-send')) $('safety-alert-final-send').addEventListener('click', sendAlertNow);
      if ($('safety-alert-final-cancel')) $('safety-alert-final-cancel').addEventListener('click', function () {
        stopAlertFlow('Okay. The alert is stopped. No one was contacted.');
      });

      /* Dashboard: switches, consent, name, preview. */
      if ($('safety-alerts-enabled')) $('safety-alerts-enabled').addEventListener('change', function () {
        well.alertsEnabled = !!this.checked;
        if (!well.alertsEnabled) stopAlertFlow('');
        wellSave(); renderAlertDashboard();
        say('safety-alert-dash-status', well.alertsEnabled
          ? 'Saved. Emergency alerts are on. They also need the consent box, and your tap at each step.'
          : 'Saved. Emergency alerts are off. Nothing can go out.');
      });
      if ($('safety-alerts-consent')) $('safety-alerts-consent').addEventListener('change', function () {
        well.alertsConsent = !!this.checked;
        if (!well.alertsConsent) stopAlertFlow('');
        wellSave(); renderAlertDashboard();
        say('safety-alert-dash-status', well.alertsConsent
          ? 'Saved. Your consent is on. You can change it at any time.'
          : 'Saved. Your consent is off. Alerts cannot start.');
      });
      function onUserName() {
        var el = $('safety-user-name');
        well.userName = el ? el.value : '';
        wellSave();
        say('safety-alert-preview', buildAlertMessage(''));
      }
      if ($('safety-user-name')) { $('safety-user-name').addEventListener('change', onUserName); $('safety-user-name').addEventListener('input', onUserName); }

      /* Location sharing: consent, ask, summary, hand-off, stop. */
      if ($('safety-loc-share-btn')) $('safety-loc-share-btn').addEventListener('click', tapShareLocation);
      if ($('safety-loc-enable')) $('safety-loc-enable').addEventListener('click', function () {
        well.locationEnabled = true;
        wellSave();
        var sw = $('safety-loc-switch'); if (sw) sw.checked = true;
        if (locFlow.fromShare) { locFlow.fromShare = false; openLocAsk(); }
        else {
          locFlow.stage = 'idle';
          showLocPanel('');
          say('safety-loc-dash-status', 'Saved. Location sharing is on. It is used only when you share.');
        }
        renderLocDashboard();
      });
      if ($('safety-loc-notnow')) $('safety-loc-notnow').addEventListener('click', function () {
        locFlow.stage = 'idle';
        locFlow.fromShare = false;
        showLocPanel('');
        say('safety-loc-status', 'Location sharing is off. Nothing was shared.');
        renderLocDashboard();
      });
      if ($('safety-loc-ask-yes')) $('safety-loc-ask-yes').addEventListener('click', function () {
        if (locFlow.stage !== 'ask') { say('safety-loc-status', 'That step is not ready. Tap Share my location first.'); return; }
        openLocSummary();
      });
      if ($('safety-loc-ask-no')) $('safety-loc-ask-no').addEventListener('click', function () {
        locFlow.stage = 'idle';
        showLocPanel('');
        say('safety-loc-status', 'Okay. Nothing was shared.');
      });
      LOC_DURATIONS.forEach(function (d) {
        var b = $(d.id);
        if (b) b.addEventListener('click', function () {
          if (locFlow.stage !== 'summary') return;
          locFlow.duration = d.key;
          locFlow.durationLabel = d.label;
          paintLocDurations();
          say('safety-loc-status', 'You picked: ' + d.label + '. Tap Share my location now when you are ready.');
        });
      });
      if ($('safety-loc-final-btn')) $('safety-loc-final-btn').addEventListener('click', tapLocFinal);
      if ($('safety-loc-noloc-btn')) $('safety-loc-noloc-btn').addEventListener('click', function () {
        if (locFlow.stage !== 'summary' || !locFlow.canSkipPlace) {
          say('safety-loc-status', 'That step is not ready. It shows only if your phone gives no location.');
          return;
        }
        var c = selectedContact();
        if (!c) { say('safety-loc-status', 'Add a person first, in People you trust. Nothing was shared.'); return; }
        finishLocShare(locHrefFor(c, buildAlertMessage('')), false);
      });
      if ($('safety-loc-switch')) $('safety-loc-switch').addEventListener('change', function () {
        if (this.checked) {
          this.checked = false; /* stays off until the consent tap */
          startLocConsent(false);
          scrollToEl($('safety-loc-consent-panel'));
        } else {
          well.locationEnabled = false;
          well.activeShare = null;
          wellSave(); renderLocDashboard();
          say('safety-loc-dash-status', 'Saved. Location sharing is off.');
        }
      });
      if ($('safety-loc-stop-btn')) $('safety-loc-stop-btn').addEventListener('click', function () {
        well.activeShare = null;
        wellSave(); renderLocDashboard();
        say('safety-loc-dash-status', 'Stopped. Your location is not being shared now.');
        say('safety-loc-status', 'Stopped. Your location is not being shared now.');
      });
      if ($('safety-loc-history-delete')) $('safety-loc-history-delete').addEventListener('click', function () {
        var box = $('safety-loc-history-confirm'); if (box) box.hidden = false;
      });
      if ($('safety-loc-history-delete-no')) $('safety-loc-history-delete-no').addEventListener('click', function () {
        var box = $('safety-loc-history-confirm'); if (box) box.hidden = true;
        say('safety-loc-dash-status', 'Kept. Your sharing history is still here.');
      });
      if ($('safety-loc-history-delete-yes')) $('safety-loc-history-delete-yes').addEventListener('click', function () {
        well.shareHistory = [];
        wellSave();
        var box = $('safety-loc-history-confirm'); if (box) box.hidden = true;
        renderLocDashboard();
        say('safety-loc-dash-status', 'Deleted. Your sharing history is gone.');
      });

      if ($('safety-contact-add')) $('safety-contact-add').addEventListener('click', function () {
        var nameEl = $('safety-contact-name'), phoneEl = $('safety-contact-phone');
        var relEl = $('safety-contact-relationship'), emailEl = $('safety-contact-email');
        var methodEl = $('safety-contact-method'), notifyEl = $('safety-contact-notify');
        var name = nameEl ? nameEl.value.trim() : '';
        var phone = phoneEl ? phoneEl.value.trim() : '';
        var relationship = relEl ? relEl.value.trim() : '';
        var email = emailEl ? emailEl.value.trim() : '';
        var method = methodEl ? methodEl.value : 'text';
        var notify = notifyEl ? !!notifyEl.checked : true;
        if (method === 'push') { say('safety-contact-status', 'Push is not available yet. Pick Text, Email, or Call.'); return; }
        if (method !== 'text' && method !== 'email' && method !== 'call') method = 'text';
        if (!name) { say('safety-contact-status', 'Write a name first.'); return; }
        if (method === 'email' && !email) { say('safety-contact-status', 'Write an email address first. Or pick Text or Call.'); return; }
        if (method !== 'email' && !cleanPhone(phone)) { say('safety-contact-status', 'Write a phone number first.'); return; }
        if (editingContactId) {
          well.contacts.forEach(function (c) {
            if (c.id === editingContactId) { c.name = name; c.phone = phone; c.relationship = relationship; c.email = email; c.method = method; c.notify = notify; }
          });
          editingContactId = null;
          say('safety-contact-status', 'Saved. Your changes are in the list below. Tap Call or Text to reach them.');
        } else {
          var nc = { id: uid('contact'), name: name, phone: phone, relationship: relationship, email: email, method: method, notify: notify };
          well.contacts.push(nc);
          if (!well.alertContactId) well.alertContactId = nc.id;
          say('safety-contact-status', 'Saved. That person is in the list below. Tap Call or Text to reach them.');
        }
        if (nameEl) nameEl.value = '';
        if (phoneEl) phoneEl.value = '';
        if (relEl) relEl.value = '';
        if (emailEl) emailEl.value = '';
        if (methodEl) methodEl.value = 'text';
        if (notifyEl) notifyEl.checked = true;
        wellSave(); renderContacts();
      });
    }

    function initWell() {
      if (!$('well-dayplan-card')) return;
      bindSafety();
      bindToggles();
      bindDayPlan();
      bindRoutines();
      bindFeelings();
      bindWorry();
      bindJournal();
      bindSensory();
      bindMute();
      syncToggleControls();
      renderDayPlan();
      renderSchedule();
      renderDraft();
      renderRoutines();
      renderWorry();
      renderJournal();
      renderUnsent();
      renderSensory();
      renderMute();
      renderContacts();
      renderAlertDashboard();
      renderLocDashboard();
      /* Timed shares end on their own: checked here at load, and while
       * the app stays open. New notes go out only while Rootling is open. */
      try { setInterval(function () { if (checkShareEnd()) renderLocDashboard(); }, 30000); } catch (e) { /* load check above still ran */ }
    }

    if (typeof window !== 'undefined') {
      window.RootlingWell = {
        key: WELL_KEY,
        getWell: function () { return well; },
        isWorryTime: isWorryTime,
        openSafety: openSafety,
        buildAlertMessage: buildAlertMessage,
        handoffHrefFor: handoffHrefFor,
        getAlertState: function () { return alertFlow; },
        getLocState: function () { return locFlow; },
        startAlertWarning: startAlertWarning,
        _tickAlertTimer: tickAlertTimer,
        reload: function () { well = wellLoad(); return well; }
      };
      if (window.SproutApp) {
        window.SproutApp.WELL_KEY = WELL_KEY;
        window.SproutApp.getWellState = function () { return well; };
      }
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWell);
      else initWell();
    }
  })();

  /* ==== Social Coach module (Social worker): scripts library, guided
   * branching practice, social cue cards, a message worksheet, word
   * helpers, a reflection notebook, and brave moments. Its own store
   * lives in rootling-social-v1, on this device only. Nothing here is
   * sent anywhere, and no chat is faked: practice is a script the pet
   * reads aloud from, said plainly at the top. Readings of other people
   * are always possibilities, never facts, and every reading comes
   * with a kind way to check. Feedback always follows one fixed shape:
   * what went well, one gentle idea, words to try, encouragement. */
  (function () {
    var SOCIAL_KEY = 'rootling-social-v1';

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    var socCounter = 0;
    function uid(prefix) {
      socCounter += 1;
      return prefix + '-' + Date.now().toString(36) + '-' + socCounter;
    }
    function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }
    function dayKey(d) {
      d = d || new Date();
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function say(id, text) { var el = $(id); if (el) el.textContent = text; }

    /* ---------- Static content: scripts library ---------- */
    var SCRIPTS = [
      { id: 'introducing', title: 'Introducing yourself',
        when: 'You meet someone new and they do not know your name yet.',
        say: ['Hello, my name is Sam.', 'It is nice to meet you.', 'I work with the art team.'],
        reply: 'They say: "Nice to meet you too."',
        back: 'You can say: "How is your day going?"' },
      { id: 'making-friend', title: 'Making a friend',
        when: 'You liked talking with someone and want to talk again.',
        say: ['I liked talking with you.', 'Would you like to swap phone numbers?', 'We could have tea some time.'],
        reply: 'They say: "Yes, that sounds good."',
        back: 'You can say: "Great. I will send you a short hello this week."' },
      { id: 'asking-help', title: 'Asking for help',
        when: 'You are stuck and you need a hand.',
        say: ['I am stuck on this part.', 'Could you show me the first step?', 'Thank you for your time.'],
        reply: 'They say: "Sure. Let us look at it."',
        back: 'You can say: "That helps. I will try that step now."' },
      { id: 'saying-no', title: 'Saying no',
        when: 'Someone asks for a thing you cannot do.',
        say: ['Thank you for asking me.', 'I cannot do that this week.', 'I can help next week, if that works.'],
        reply: 'They say: "Okay, I understand."',
        back: 'You can say: "Thank you for hearing me out."' },
      { id: 'giving-feedback', title: 'Giving feedback',
        when: 'You need to tell someone a thing could be better.',
        say: ['Can I share one thing I noticed?', 'The first page was clear and kind.', 'One line on page two was hard to read.'],
        reply: 'They say: "Thanks for telling me so plainly."',
        back: 'You can say: "Happy to. Your work matters to me."' },
      { id: 'receiving-criticism', title: 'Receiving criticism',
        when: 'Someone tells you a thing you did could be better.',
        say: ['Thank you for telling me.', 'I will think about that part.', 'Can we talk again on Friday?'],
        reply: 'They say: "Yes, Friday works."',
        back: 'You can say: "Thank you. I will come with my plan."' },
      { id: 'saying-sorry', title: 'Saying sorry',
        when: 'You made a mistake and it touched someone else.',
        say: ['I am sorry. I made a mistake there.', 'I can see it made your day harder.', 'Next time I will check first.'],
        reply: 'They say: "Thank you for saying that."',
        back: 'You can say: "I mean it. I will do the new way next time."' },
      { id: 'fixing-misunderstanding', title: 'Fixing a misunderstanding',
        when: 'You and someone else heard the same words in two ways.',
        say: ['I think we heard this in two ways.', 'Here is what I meant.', 'What did you hear? I want to get it right.'],
        reply: 'They say: "Oh, I heard it the other way."',
        back: 'You can say: "Thank you for telling me. Now I see both ways."' },
      { id: 'asking-question', title: 'Asking a question in a meeting or class',
        when: 'You do not follow a part and you want it said again.',
        say: ['Can I ask a question?', 'I did not follow that last part.', 'Could you say it in a new way?'],
        reply: 'They say: "Of course. Here it is again."',
        back: 'You can say: "Thank you. That way makes sense to me."' },
      { id: 'starting-call', title: 'Starting a phone call',
        when: 'You call someone and they pick up.',
        say: ['Hello, this is Sam.', 'Is this a good time to talk?', 'I have one thing to ask. It will take two minutes.'],
        reply: 'They say: "Yes, now is fine."',
        back: 'You can say: "Great. Here is my question."' },
      { id: 'asking-time', title: 'Asking for more time',
        when: 'A job needs more time than you first said.',
        say: ['I need a bit more time on this.', 'I can have it done by Thursday.', 'Is Thursday okay with you?'],
        reply: 'They say: "Thursday works for me."',
        back: 'You can say: "Thank you. I will send it on Thursday."' },
      { id: 'ending-chat', title: 'Ending a chat kindly',
        when: 'You need to go, and you want to end in a kind way.',
        say: ['I have liked talking with you.', 'I need to go now.', 'Let us talk again soon.'],
        reply: 'They say: "Sounds good. Take care."',
        back: 'You can say: "You too. Bye for now."' }
    ];

    /* ---------- Static content: cue cards ---------- */
    var CUES = [
      { id: 'quiet-voice', title: 'A quiet voice',
        notice: 'Their voice is soft. You have to lean in to hear.',
        could: ['They may feel shy right now.', 'They may be tired.', 'The room may be loud, and they keep their voice low.'],
        check: 'You can say: "I want to hear you well. Is this a good place to talk?"' },
      { id: 'loud-voice', title: 'A loud voice',
        notice: 'Their voice is big and strong.',
        could: ['They may feel full of energy.', 'They may not know how loud they are.', 'They may feel upset about a thing, not about you.'],
        check: 'You can ask: "Is this about me, or about the day? I want to help if I can."' },
      { id: 'smile', title: 'A smile',
        notice: 'Their mouth turns up and their eyes look soft.',
        could: ['They may feel glad to see you.', 'They may be being polite.', 'They may smile when they feel a bit unsure.'],
        check: 'You can smile back and say: "It is good to see you."' },
      { id: 'crossed-arms', title: 'Crossed arms',
        notice: 'Their arms are folded across their body.',
        could: ['They may feel cold.', 'It may just be a comfy way to stand.', 'They may need a bit of space right now.'],
        check: 'You can give them room and say: "We can talk now, or later. Both are fine."' },
      { id: 'get-together', title: '"We should get together sometime"',
        notice: 'They say the words, but no day or time is named.',
        could: ['They may mean it and want a plan.', 'They may be ending the chat in a kind way.', 'They may like the idea but feel too busy to plan.'],
        check: 'You can say: "I would like that. Would a walk on Sunday work, or is a call better?"' },
      { id: 'short-ok', title: 'A short reply like "Ok"',
        notice: 'You sent a long message. The reply is one short word.',
        could: ['They may be busy and wrote fast.', 'They may be fine with your plan.', 'They may not have read the whole message yet.'],
        check: 'You can ask: "Just to check — are you okay with the plan?"' },
      { id: 'looking-away', title: 'Someone looking away',
        notice: 'Their eyes go to the side while you talk.',
        could: ['They may be thinking about your words.', 'Looking at faces may feel hard for them.', 'A thing in the room may have caught their eye.'],
        check: 'You can keep talking in a calm way. If you need to know, ask: "Would a short break help?"' },
      { id: 'unsure-joke', title: 'A joke you are not sure about',
        notice: 'People laugh, but you do not know if the joke is kind.',
        could: ['It may be a kind joke about a thing, not a person.', 'It may be a joke the group shares a lot.', 'It may be a joke that is not kind.'],
        check: 'You can ask the person later: "Was that joke about me? I want to be sure."' }
    ];

    /* ---------- Static content: branching practice ---------- */
    var SCENARIOS = [
      { id: 'small-talk', title: 'Small talk with a coworker', who: 'Your coworker',
        suggestion: 'Next time, you can ask one thing about their work. People like being asked.',
        alt: 'Say it like this: "How is your work going today?"',
        cheer: 'You kept a chat going, one line at a time. That is a real skill.',
        steps: [
          { partner: 'Hi! We meet at the tea point again.',
            choices: [
              { text: 'Hi! Yes, tea helps the morning.', reply: 'It does. Did you sleep well?', well: 'You said hello back and added one warm line.' },
              { text: 'Hi. I am Sam, from the art team.', reply: 'Nice to meet you, Sam. I am Jo.', well: 'You shared your name and your team, plain and clear.' },
              { text: 'Hi. Busy day?', reply: 'A bit. Yours?', well: 'You asked a small, kind question to open the chat.' } ] },
          { partner: 'My morning is full of lists. How is yours?',
            choices: [
              { text: 'Mine is calm so far. One job at a time.', reply: 'That sounds like a good plan.', well: 'You told a true thing about your day.' },
              { text: 'Full too. I start with the hard job first.', reply: 'Smart. I should try that.', well: 'You shared a tip that helps you.' } ] },
          { partner: 'Well, back to work for me.',
            choices: [
              { text: 'Good to chat. See you at tea time.', reply: 'See you then!', well: 'You ended the chat in a warm way.' },
              { text: 'Bye for now.', reply: 'Bye!', well: 'You kept the ending short and kind.' } ] } ] },
      { id: 'meeting-new', title: 'Meeting someone new', who: 'Someone new',
        suggestion: 'Next time, you can ask what they like to do. It gives you both more to say.',
        alt: 'Say it like this: "What do you like to do on your days off?"',
        cheer: 'Meeting new people takes guts. You did it, line by line.',
        steps: [
          { partner: 'Hello, I do not think we have met.',
            choices: [
              { text: 'Hello, my name is Sam.', reply: 'Hi Sam, I am Ana.', well: 'You gave your name first. That is a strong start.' },
              { text: 'Hello! I am new here too.', reply: 'Oh good, we can be new together.', well: 'You found a thing you both share.' } ] },
          { partner: 'I come here for the drawing class.',
            choices: [
              { text: 'I like drawing too. Faces are my best part.', reply: 'Faces are hard. You must practise a lot.', well: 'You shared a thing you like and a thing you do well.' },
              { text: 'What do you like to draw?', reply: 'Mostly trees and my dog.', well: 'You asked about them. That shows you care.' },
              { text: 'The class is calm. I like that.', reply: 'Me too. It helps my head slow down.', well: 'You said a true thing about how the class feels.' } ] },
          { partner: 'Class is starting. Talk after?',
            choices: [
              { text: 'Yes, I would like that.', reply: 'Great, see you after.', well: 'You said yes in a clear, glad way.' },
              { text: 'Yes. I sit by the door if you want to find me.', reply: 'I will look for you there.', well: 'You made the next step easy to find.' } ] } ] },
      { id: 'saying-no-work', title: 'Saying no to extra work', who: 'Your boss',
        suggestion: 'Next time, you can name the day you can help. A clear day makes a no feel fair.',
        alt: 'Say it like this: "I cannot take this on today. I can help on Friday."',
        cheer: 'Saying no at work is hard. You did it with kind, clear words.',
        steps: [
          { partner: 'Can you take on one more job this week?',
            choices: [
              { text: 'Thank you for asking. I cannot take more this week.', reply: 'I see. Your plate is full, then?', well: 'You said no in a plain, polite way.' },
              { text: 'My week is full. I can look at it next week.', reply: 'Next week might work.', well: 'You said no for now and gave a new time.' } ] },
          { partner: 'It is a small job. Are you sure?',
            choices: [
              { text: 'Yes. If I take it, my other work will slip.', reply: 'That is fair. I do not want that.', well: 'You told the true reason, in one short line.' },
              { text: 'I am sure. I want my work to stay good.', reply: 'Okay, I hear you.', well: 'You held your line in a calm way.' } ] },
          { partner: 'Okay. I will ask Jo this time.',
            choices: [
              { text: 'Thank you for hearing me.', reply: 'Of course. Keep me in mind next week.', well: 'You ended with thanks. That keeps things warm.' },
              { text: 'I can help check it when it is done, if you like.', reply: 'That would help a lot.', well: 'You gave a small help you can truly do.' } ] } ] },
      { id: 'getting-criticism', title: 'Getting criticism', who: 'Your boss',
        suggestion: 'Next time, you can write the main point down. Words on paper are easier to think about.',
        alt: 'Say it like this: "Let me write that down, so I get it right."',
        cheer: 'Hearing hard words and staying calm is brave work. Well done.',
        steps: [
          { partner: 'Your report was good, but the last page was hard to read.',
            choices: [
              { text: 'Thank you for telling me. Which part was hard?', reply: 'The table on the last page.', well: 'You said thanks and asked for the exact part.' },
              { text: 'I see. I will look at that page again.', reply: 'Good. Let me show you the bit I mean.', well: 'You stayed calm and open.' } ] },
          { partner: 'The words in the table run off the edge.',
            choices: [
              { text: 'I can fix that by making the table smaller.', reply: 'Yes, that would do it.', well: 'You named a clear fix.' },
              { text: 'Could you show me how you like it?', reply: 'Sure, like this one here.', well: 'You asked to be shown. That is a strong move.' } ] },
          { partner: 'Send me the new page when it is ready.',
            choices: [
              { text: 'I will send it on Thursday. Is that okay?', reply: 'Thursday is fine.', well: 'You named a day and checked it was okay.' },
              { text: 'I will. Thank you for the help.', reply: 'Any time.', well: 'You closed with thanks.' } ] } ] },
      { id: 'teacher-help', title: 'Asking a teacher for help', who: 'Your teacher',
        suggestion: 'Next time, you can say which part is hard. That helps a teacher help you.',
        alt: 'Say it like this: "The second part is the hard bit for me."',
        cheer: 'Asking for help is a skill. You just used it well.',
        steps: [
          { partner: 'How is the work going today?',
            choices: [
              { text: 'I am stuck on part two. Can you help?', reply: 'Of course. Show me where you got to.', well: 'You said you were stuck and asked plainly.' },
              { text: 'A bit stuck. Could you show me the first step?', reply: 'Yes. The first step is this.', well: 'You asked for just the first step. That is a smart ask.' } ] },
          { partner: 'You did step one well. Step two is the new bit.',
            choices: [
              { text: 'Can you do step two once, slow, so I can watch?', reply: 'Like this. Now you try.', well: 'You asked for a slow show. That helps you learn.' },
              { text: 'I will try. Can you stay while I start?', reply: 'I will stay right here.', well: 'You asked for what you need: a person close by.' } ] },
          { partner: 'That is it. You have got step two now.',
            choices: [
              { text: 'Thank you. I will do the next one on my own.', reply: 'Good plan. Call me if you get stuck.', well: 'You said thanks and named your next step.' },
              { text: 'Thank you for your time.', reply: 'You are welcome.', well: 'You thanked your teacher in a clear way.' } ] } ] },
      { id: 'friend-mixup', title: 'Fixing a mix-up with a friend', who: 'Your friend',
        suggestion: 'Next time, you can check the plan in a message the day before. It stops mix-ups early.',
        alt: 'Say it like this: "Just checking — we meet at ten, yes?"',
        cheer: 'Fixing a mix-up with care keeps a friendship strong. You did that.',
        steps: [
          { partner: 'I waited at the park for an hour yesterday.',
            choices: [
              { text: 'I am so sorry. I thought we said the cafe.', reply: 'Oh. I thought we said the park.', well: 'You said sorry and told your side plainly.' },
              { text: 'Oh no. I got the place mixed up. I am sorry.', reply: 'These things happen.', well: 'You owned your part of the mix-up.' } ] },
          { partner: 'I felt sad standing there on my own.',
            choices: [
              { text: 'I can see that. Your feelings make sense.', reply: 'Thank you for saying that.', well: 'You heard their feelings and said so.' },
              { text: 'I would feel sad too. I am sorry I was not there.', reply: 'That helps to hear.', well: 'You put yourself in their shoes.' } ] },
          { partner: 'Okay. Let us make a new plan.',
            choices: [
              { text: 'Tea at the cafe on Sunday at ten. I will write it down now.', reply: 'Sunday at ten. I have written it too.', well: 'You made a clear new plan and wrote it down.' },
              { text: 'This time, let us both write the plan in a message.', reply: 'Good idea. Then we both have it.', well: 'You found a way to stop the same mix-up.' } ] } ] }
    ];

    /* ---------- Static content: word helpers ---------- */
    var TEMPLATES = [
      { id: 'boundary', title: 'Setting a boundary',
        parts: ["I can't take this on. I can do ", '.'], blanks: ['the part you can do'] },
      { id: 'feelings', title: 'Saying how I feel',
        parts: ['I felt ', ' when ', '. I would like ', '.'], blanks: ['the feeling word', 'what took place', 'what you would like'] },
      { id: 'meaning', title: 'Asking what someone means',
        parts: ['When you said ', ', did you mean ', ' or ', '?'], blanks: ['their words', 'one idea it could be', 'one more idea it could be'] },
      { id: 'criticism-reply', title: 'Replying to criticism',
        parts: ['Thank you for telling me. I will think about ', '. Can we talk again on ', '?'], blanks: ['the part you will think about', 'the day to talk again'] },
      { id: 'help-ask', title: 'Asking for help',
        parts: ['I am stuck on ', '. Could you show me the first step?'], blanks: ['the part you are stuck on'] }
    ];
    var WS_IDEAS = ['They are busy', 'They are fine with it', 'They did not like it', 'They did not understand'];
    var WS_CHECKS = {
      'They are busy': 'Is this a busy time? I can wait, or we can talk later.',
      'They are fine with it': 'Just to check — are you okay with this plan?',
      'They did not like it': 'Did some part of that not sit well with you? I want to know.',
      'They did not understand': 'Was my message clear? I can say it in a new way.'
    };
    var WS_REPLIES = [
      'Thank you for your message.',
      'Can I ask one thing, so I read it well?',
      'Here is what I took from it. Does that match what you meant?'
    ];
    var BRAVE_CHEERS = [
      'That took guts. Well done for doing it.',
      'You did a brave thing. It counts.',
      'Small steps are real steps. Nice work.',
      'You showed up for your own life. That matters.'
    ];

    /* ---------- Store ---------- */
    function socDefaults() { return { version: 1, reflections: [], brave: [], worksheets: [] }; }
    function socLoad() {
      var base = socDefaults();
      try {
        var raw = localStorage.getItem(SOCIAL_KEY);
        if (!raw) return base;
        var s = JSON.parse(raw);
        for (var k in base) { if (s[k] === undefined) s[k] = base[k]; }
        if (!Array.isArray(s.reflections)) s.reflections = [];
        if (!Array.isArray(s.brave)) s.brave = [];
        if (!Array.isArray(s.worksheets)) s.worksheets = [];
        return s;
      } catch (e) { return base; }
    }
    function socSave() {
      try { localStorage.setItem(SOCIAL_KEY, JSON.stringify(soc)); } catch (e) { /* storage can be off; the visit still works */ }
    }
    var soc = socLoad();

    /* ---------- Scripts library ---------- */
    var openScriptId = null;
    function renderScripts() {
      var list = $('soc-scripts-list');
      if (!list) return;
      list.innerHTML = SCRIPTS.map(function (s) {
        return '<button type="button" class="btn btn-soft" data-soc-script="' + esc(s.id) + '">' + esc(s.title) + '</button> ';
      }).join('');
      var btns = list.querySelectorAll('[data-soc-script]');
      for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
        openScriptId = this.getAttribute('data-soc-script');
        renderScriptCard();
      });
      renderScriptCard();
    }
    function renderScriptCard() {
      var box = $('soc-script-card');
      if (!box) return;
      var card = null;
      SCRIPTS.forEach(function (s) { if (s.id === openScriptId) card = s; });
      if (!card) { box.innerHTML = ''; return; }
      box.innerHTML = '<h4>' + esc(card.title) + '</h4>'
        + '<p class="q">When this happens: ' + esc(card.when) + '</p>'
        + '<p class="q">Say it like this:</p>'
        + card.say.map(function (line) { return '<p class="q">' + esc(line) + '</p>'; }).join('')
        + '<p class="q">If they answer like this: ' + esc(card.reply) + '</p>'
        + '<p class="q">' + esc(card.back) + '</p>';
      say('soc-scripts-status', 'Words for ' + card.title + ' are showing below the buttons.');
    }

    /* ---------- Cue cards ---------- */
    var openCueId = null;
    function renderCues() {
      var list = $('soc-cues-list');
      if (!list) return;
      list.innerHTML = CUES.map(function (c) {
        return '<button type="button" class="btn btn-soft" data-soc-cue="' + esc(c.id) + '">' + esc(c.title) + '</button> ';
      }).join('');
      var btns = list.querySelectorAll('[data-soc-cue]');
      for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
        openCueId = this.getAttribute('data-soc-cue');
        renderCueCard();
      });
      renderCueCard();
    }
    function renderCueCard() {
      var box = $('soc-cue-card');
      if (!box) return;
      var card = null;
      CUES.forEach(function (c) { if (c.id === openCueId) card = c; });
      if (!card) { box.innerHTML = ''; return; }
      box.innerHTML = '<h4>' + esc(card.title) + '</h4>'
        + '<p class="q">What you might notice: ' + esc(card.notice) + '</p>'
        + '<p class="q">It could mean:</p>'
        + card.could.map(function (line) { return '<p class="q">' + esc(line) + '</p>'; }).join('')
        + '<p class="q">How you can check: ' + esc(card.check) + '</p>';
    }

    /* ---------- Guided practice ---------- */
    var practice = null; /* { scenario, step, picked: [choice], phase: 'talk' | 'reply' | 'done' } */
    function renderPracticeList() {
      var list = $('soc-practice-list');
      if (!list) return;
      list.innerHTML = SCENARIOS.map(function (s) {
        return '<button type="button" class="btn btn-soft" data-soc-scenario="' + esc(s.id) + '">' + esc(s.title) + '</button> ';
      }).join('');
      var btns = list.querySelectorAll('[data-soc-scenario]');
      for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
        var id = this.getAttribute('data-soc-scenario');
        SCENARIOS.forEach(function (s) { if (s.id === id) startPractice(s); });
      });
    }
    function startPractice(scenario) {
      practice = { scenario: scenario, step: 0, picked: [], phase: 'talk' };
      var panel = $('soc-practice-panel');
      if (panel) panel.hidden = false;
      renderPractice();
      say('soc-practice-status', 'Practice started: ' + scenario.title + '. Read their line, then tap one answer.');
    }
    function renderPractice() {
      if (!practice) return;
      var sc = practice.scenario;
      var progress = $('soc-practice-progress'), speaker = $('soc-practice-speaker'),
        line = $('soc-practice-line'), choices = $('soc-practice-choices'),
        reply = $('soc-practice-reply'), next = $('soc-practice-next'),
        again = $('soc-practice-again'), pick = $('soc-practice-pick'),
        feedback = $('soc-practice-feedback');
      if (feedback) { feedback.hidden = true; feedback.innerHTML = ''; }
      if (again) again.hidden = true;
      if (pick) pick.hidden = true;
      if (practice.phase === 'done') { renderPracticeFeedback(); return; }
      var step = sc.steps[practice.step];
      if (progress) progress.textContent = 'Part ' + (practice.step + 1) + ' of ' + sc.steps.length;
      if (speaker) speaker.textContent = sc.who + ' says:';
      if (line) line.textContent = step.partner;
      if (practice.phase === 'talk') {
        if (reply) { reply.hidden = true; reply.textContent = ''; }
        if (next) next.hidden = true;
        if (choices) {
          choices.innerHTML = step.choices.map(function (c, idx) {
            return '<button type="button" class="btn btn-choice" data-soc-choice="' + idx + '">' + esc(c.text) + '</button> ';
          }).join('');
          var btns = choices.querySelectorAll('[data-soc-choice]');
          for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
            var choice = step.choices[Number(this.getAttribute('data-soc-choice'))];
            practice.picked.push(choice);
            practice.phase = 'reply';
            renderPractice();
          });
        }
      } else { /* reply phase: the partner answers the picked line */
        var last = practice.picked[practice.picked.length - 1];
        if (choices) choices.innerHTML = '';
        if (reply) {
          reply.hidden = false;
          reply.textContent = sc.who + ' says: ' + (last ? last.reply : '');
        }
        if (next) { next.hidden = false; next.textContent = 'Next part'; }
      }
    }
    function renderPracticeFeedback() {
      var sc = practice.scenario;
      var progress = $('soc-practice-progress'), speaker = $('soc-practice-speaker'),
        line = $('soc-practice-line'), choices = $('soc-practice-choices'),
        reply = $('soc-practice-reply'), next = $('soc-practice-next'),
        again = $('soc-practice-again'), pick = $('soc-practice-pick'),
        feedback = $('soc-practice-feedback');
      if (progress) progress.textContent = 'You finished this practice.';
      if (speaker) speaker.textContent = '';
      if (line) line.textContent = '';
      if (choices) choices.innerHTML = '';
      if (reply) { reply.hidden = true; reply.textContent = ''; }
      if (next) next.hidden = true;
      var wells = practice.picked.map(function (c) { return c.well; }).filter(Boolean);
      var wellText = wells.slice(0, 2).join(' ');
      if (!wellText) wellText = 'You took part, line by line, all the way to the end.';
      if (feedback) {
        feedback.hidden = false;
        feedback.innerHTML = '<p class="q">What went well: ' + esc(wellText) + '</p>'
          + '<p class="q">One gentle idea: ' + esc(sc.suggestion) + '</p>'
          + '<p class="q">' + esc(sc.alt) + '</p>'
          + '<p class="q">Keep going: ' + esc(sc.cheer) + '</p>';
      }
      if (again) again.hidden = false;
      if (pick) pick.hidden = false;
      say('soc-practice-status', 'Practice done. Your kind notes are showing.');
    }
    function bindPractice() {
      if ($('soc-practice-next')) $('soc-practice-next').addEventListener('click', function () {
        if (!practice || practice.phase !== 'reply') return;
        if (practice.step + 1 >= practice.scenario.steps.length) practice.phase = 'done';
        else { practice.step += 1; practice.phase = 'talk'; }
        renderPractice();
      });
      if ($('soc-practice-again')) $('soc-practice-again').addEventListener('click', function () {
        if (practice) startPractice(practice.scenario);
      });
      if ($('soc-practice-pick')) $('soc-practice-pick').addEventListener('click', function () {
        practice = null;
        var panel = $('soc-practice-panel');
        if (panel) panel.hidden = true;
        say('soc-practice-status', 'Pick a practice from the buttons above.');
      });
    }

    /* ---------- Message worksheet ---------- */
    var wsStep = 1, wsMessage = '', wsPicked = [];
    function wsChecks() {
      var out = [];
      wsPicked.forEach(function (p) { if (WS_CHECKS[p] && out.length < 2) out.push(WS_CHECKS[p]); });
      if (!out.length) out = ['Can I ask what you meant by that?', 'Is this a good time to talk about it?'];
      return out.slice(0, 2);
    }
    function renderWs() {
      var panel = $('soc-ws-panel'), stage = $('soc-ws-stage'),
        progress = $('soc-ws-progress'), back = $('soc-ws-back'),
        next = $('soc-ws-next'), save = $('soc-ws-save');
      if (!panel || !stage) return;
      panel.hidden = false;
      if (progress) progress.textContent = 'Step ' + wsStep + ' of 4';
      if (back) back.hidden = false;
      if (next) next.hidden = wsStep === 4;
      if (save) save.hidden = wsStep !== 4;
      if (wsStep === 1) {
        stage.innerHTML = '<p class="q">Their words:</p><p class="q">' + esc(wsMessage) + '</p>'
          + '<p class="hint">These are the exact words they sent.</p>';
      } else if (wsStep === 2) {
        var chips = WS_IDEAS.map(function (idea) {
          var on = wsPicked.indexOf(idea) !== -1;
          return '<button type="button" class="btn btn-chip' + (on ? ' selected' : '') + '" data-soc-ws-chip="' + esc(idea) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(idea) + '</button> ';
        }).join('');
        var ownChips = wsPicked.filter(function (p) { return WS_IDEAS.indexOf(p) === -1; }).map(function (idea) {
          return '<button type="button" class="btn btn-chip selected" data-soc-ws-chip="' + esc(idea) + '" aria-pressed="true">' + esc(idea) + '</button> ';
        }).join('');
        stage.innerHTML = '<p class="q">What could it mean? Pick up to 3 ideas.</p>'
          + '<div class="choice-row">' + chips + ownChips + '</div>'
          + '<label for="soc-ws-own">Your own idea</label>'
          + '<input id="soc-ws-own" class="voice-target" type="text" maxlength="120" autocomplete="off" placeholder="One idea of your own">'
          + '<button type="button" class="btn btn-soft" id="soc-ws-own-add">Add my idea</button>';
        var chipBtns = stage.querySelectorAll('[data-soc-ws-chip]');
        for (var i = 0; i < chipBtns.length; i++) chipBtns[i].addEventListener('click', function () {
          var idea = this.getAttribute('data-soc-ws-chip');
          var at = wsPicked.indexOf(idea);
          if (at !== -1) wsPicked.splice(at, 1);
          else if (wsPicked.length >= 3) { say('soc-ws-status', 'You have 3 ideas. Tap one to take it off, then pick a new one.'); return; }
          else wsPicked.push(idea);
          renderWs();
        });
        if ($('soc-ws-own-add')) $('soc-ws-own-add').addEventListener('click', function () {
          var input = $('soc-ws-own');
          var text = input ? input.value.trim() : '';
          if (!text) { say('soc-ws-status', 'Write your idea first.'); return; }
          if (wsPicked.indexOf(text) !== -1) { say('soc-ws-status', 'That idea is picked now.'); return; }
          if (wsPicked.length >= 3) { say('soc-ws-status', 'You have 3 ideas. Tap one to take it off, then add yours.'); return; }
          wsPicked.push(text);
          renderWs();
          say('soc-ws-status', 'Your idea is added.');
        });
      } else if (wsStep === 3) {
        stage.innerHTML = '<p class="q">How to check:</p>'
          + wsChecks().map(function (q) { return '<p class="q">' + esc(q) + '</p>'; }).join('')
          + '<p class="q">You can also do nothing for now. That is a fine choice too.</p>';
      } else {
        stage.innerHTML = '<p class="q">Reply ideas. You can use one, or write your own:</p>'
          + WS_REPLIES.map(function (r) { return '<p class="q">' + esc(r) + '</p>'; }).join('')
          + '<p class="hint">Rootling never sends a reply. You choose if, and when, to send.</p>';
      }
    }
    function renderWsSaved() {
      var list = $('soc-ws-saved-list');
      if (!list) return;
      var items = soc.worksheets.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) {
            return '<li>' + esc(e.day) + ' — ' + esc(e.message) + ' — Ideas: ' + esc(e.ideas.join(', ') || 'none picked') + ' '
              + '<button type="button" class="btn btn-ghost" data-soc-ws-del="' + esc(e.id) + '">Delete this note</button></li>';
          }).join('')
        : '';
      var dels = list.querySelectorAll('[data-soc-ws-del]');
      for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
        var id = this.getAttribute('data-soc-ws-del');
        soc.worksheets = soc.worksheets.filter(function (e) { return e.id !== id; });
        socSave(); renderWsSaved();
        say('soc-ws-status', 'Deleted. That note is off your notebook.');
      });
    }
    function bindWorksheet() {
      if ($('soc-ws-start')) $('soc-ws-start').addEventListener('click', function () {
        var input = $('soc-ws-input');
        var text = input ? input.value.trim() : '';
        if (!text) { say('soc-ws-status', 'Paste or write the message first.'); return; }
        wsMessage = text; wsStep = 1; wsPicked = [];
        renderWs();
        say('soc-ws-status', 'Step 1 of 4. These are their words, just as they sent them.');
      });
      if ($('soc-ws-next')) $('soc-ws-next').addEventListener('click', function () {
        if (wsStep < 4) { wsStep += 1; renderWs(); }
      });
      if ($('soc-ws-back')) $('soc-ws-back').addEventListener('click', function () {
        if (wsStep > 1) { wsStep -= 1; renderWs(); }
        else say('soc-ws-status', 'This is the first step.');
      });
      if ($('soc-ws-save')) $('soc-ws-save').addEventListener('click', function () {
        soc.worksheets.push({ id: uid('ws'), day: dayKey(), message: wsMessage, ideas: wsPicked.slice() });
        socSave(); renderWsSaved();
        say('soc-ws-status', 'Saved to your notebook. It stays on this device.');
      });
    }

    /* ---------- Word helpers ---------- */
    var openTplId = TEMPLATES[0].id;
    function renderTplList() {
      var list = $('soc-tpl-list');
      if (!list) return;
      list.innerHTML = TEMPLATES.map(function (t) {
        return '<button type="button" class="btn btn-soft" data-soc-tpl="' + esc(t.id) + '">' + esc(t.title) + '</button> ';
      }).join('');
      var btns = list.querySelectorAll('[data-soc-tpl]');
      for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
        openTplId = this.getAttribute('data-soc-tpl');
        renderTplForm();
      });
      renderTplForm();
    }
    function openTpl() {
      var found = null;
      TEMPLATES.forEach(function (t) { if (t.id === openTplId) found = t; });
      return found || TEMPLATES[0];
    }
    function renderTplForm() {
      var box = $('soc-tpl-form');
      if (!box) return;
      var t = openTpl();
      var pattern = t.parts.join('___');
      var html = '<h4>' + esc(t.title) + '</h4><p class="q">The shape: ' + esc(pattern) + '</p>';
      t.blanks.forEach(function (label, idx) {
        html += '<label for="soc-tpl-blank-' + idx + '">Gap ' + (idx + 1) + ': ' + esc(label) + '</label>'
          + '<input id="soc-tpl-blank-' + idx + '" class="voice-target" type="text" maxlength="200" autocomplete="off" data-soc-tpl-blank="' + idx + '" placeholder="' + esc(label) + '">';
      });
      box.innerHTML = html;
    }
    function buildTplText() {
      var t = openTpl();
      var out = t.parts[0];
      for (var i = 0; i < t.blanks.length; i++) {
        var input = document.querySelector('[data-soc-tpl-blank="' + i + '"]');
        var v = input ? input.value.trim() : '';
        out += (v || '___') + (t.parts[i + 1] || '');
      }
      return out;
    }
    function bindTemplates() {
      if ($('soc-tpl-build')) $('soc-tpl-build').addEventListener('click', function () {
        var result = $('soc-tpl-result');
        if (result) result.value = buildTplText();
        say('soc-tpl-status', 'Your words are in the box. Read them. Change any part you like.');
      });
      if ($('soc-tpl-copy')) $('soc-tpl-copy').addEventListener('click', function () {
        var result = $('soc-tpl-result');
        if (!result) return;
        if (!result.value.trim()) result.value = buildTplText();
        var done = function () { say('soc-tpl-status', 'Your words are copied. You can paste them where you like. Rootling sends nothing.'); };
        var fallback = function () {
          try { result.focus(); result.select(); } catch (e) { /* selecting is a help, never a need */ }
          say('soc-tpl-status', 'Your words are picked. You can copy them now.');
        };
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            var p = navigator.clipboard.writeText(result.value);
            if (p && typeof p.then === 'function') p.then(done, fallback);
            else done();
          } else fallback();
        } catch (e) { fallback(); }
      });
    }

    /* ---------- Reflection notebook + brave moments ---------- */
    function renderReflections() {
      var list = $('soc-ref-list');
      if (!list) return;
      var items = soc.reflections.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) {
            return '<li>' + esc(e.day)
              + '<br>What happened: ' + esc(e.happened || '—')
              + '<br>What felt confusing: ' + esc(e.confusing || '—')
              + '<br>What went well: ' + esc(e.well || '—')
              + '<br>What I might do next: ' + esc(e.next || '—') + ' '
              + '<button type="button" class="btn btn-ghost" data-soc-ref-del="' + esc(e.id) + '">Delete this entry</button></li>';
          }).join('')
        : '<li>Nothing here yet. Your saved notes will show here.</li>';
      var dels = list.querySelectorAll('[data-soc-ref-del]');
      for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
        var id = this.getAttribute('data-soc-ref-del');
        soc.reflections = soc.reflections.filter(function (e) { return e.id !== id; });
        socSave(); renderReflections();
        say('soc-ref-status', 'Deleted. That entry is off your notebook.');
      });
    }
    var braveCheerIdx = 0;
    function renderBrave() {
      var list = $('soc-brave-list');
      if (!list) return;
      var items = soc.brave.slice().reverse();
      list.innerHTML = items.length
        ? items.map(function (e) {
            return '<li>' + esc(e.day) + ' — ' + esc(e.text) + ' '
              + '<button type="button" class="btn btn-ghost" data-soc-brave-del="' + esc(e.id) + '">Delete this moment</button></li>';
          }).join('')
        : '<li>No brave moments yet. Yours will show here.</li>';
      var dels = list.querySelectorAll('[data-soc-brave-del]');
      for (var i = 0; i < dels.length; i++) dels[i].addEventListener('click', function () {
        var id = this.getAttribute('data-soc-brave-del');
        soc.brave = soc.brave.filter(function (e) { return e.id !== id; });
        socSave(); renderBrave();
        say('soc-brave-status', 'Deleted. That moment is off your list.');
      });
    }
    function bindNotebook() {
      if ($('soc-ref-save')) $('soc-ref-save').addEventListener('click', function () {
        var get = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
        var entry = {
          id: uid('ref'), day: dayKey(),
          happened: get('soc-ref-happened'), confusing: get('soc-ref-confusing'),
          well: get('soc-ref-well'), next: get('soc-ref-next')
        };
        if (!entry.happened && !entry.confusing && !entry.well && !entry.next) {
          say('soc-ref-status', 'Write in one box first. One box is enough.');
          return;
        }
        soc.reflections.push(entry);
        ['soc-ref-happened', 'soc-ref-confusing', 'soc-ref-well', 'soc-ref-next'].forEach(function (id) {
          var el = $(id); if (el) el.value = '';
        });
        socSave(); renderReflections();
        say('soc-ref-status', 'Saved. Your note is in your notebook below. It stays on this device.');
      });
      if ($('soc-brave-add')) $('soc-brave-add').addEventListener('click', function () {
        var input = $('soc-brave-input');
        var text = input ? input.value.trim() : '';
        if (!text) { say('soc-brave-status', 'Write your brave moment first. One short line is enough.'); return; }
        soc.brave.push({ id: uid('brave'), day: dayKey(), text: text });
        if (input) input.value = '';
        socSave(); renderBrave();
        say('soc-brave-pet', BRAVE_CHEERS[braveCheerIdx]);
        braveCheerIdx += 1;
        if (braveCheerIdx >= BRAVE_CHEERS.length) braveCheerIdx = 0;
        say('soc-brave-status', 'Saved. Your brave moment is in your list.');
      });
    }

    function initSocial() {
      if (!$('social-view')) return;
      renderScripts();
      renderCues();
      renderPracticeList();
      bindPractice();
      bindWorksheet();
      renderWsSaved();
      renderTplList();
      bindTemplates();
      bindNotebook();
      renderReflections();
      renderBrave();
    }

    if (typeof window !== 'undefined') {
      window.RootlingSocial = {
        key: SOCIAL_KEY,
        SCRIPTS: SCRIPTS, CUES: CUES, SCENARIOS: SCENARIOS, TEMPLATES: TEMPLATES,
        getStore: function () { return soc; },
        reload: function () { soc = socLoad(); return soc; }
      };
      if (window.SproutApp) window.SproutApp.SOCIAL_KEY = SOCIAL_KEY;
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSocial);
      else initSocial();
    }
  })();


  /* ==== Digital Wellness module (Digital Wellness worker): time with
   * Rootling, smart break reminders, the 5-Minute Activity Library with
   * energy matching, the emergency low-energy list, the Random Activity
   * Picker with personalization, real-world challenges, the "Today you
   * nourished" picture, word aims, the sticker shelf, and the grown-ups
   * mirror. Its own store lives in rootling-time-v1, on this device
   * only. Nothing here is sent anywhere.
   * Honesty rule: this module can only count time while Rootling is
   * open and visible, and every label says "time with Rootling".
   * Reminders ask, never force: one calm inline card, no sound, nothing
   * flashing, never while the quiet view is up. Rewards praise effort,
   * never results, and everything earned is permanent. "Pet Happiness"
   * here means a celebration moment only (art + words at reward time);
   * it is never a number, a level, or a gauge, and nothing about the
   * pet ever goes down. */
  (function () {
    var TIME_KEY = 'rootling-time-v1';
    var EXEC_KEY = 'rootling-exec-v1';
    var WELL_KEY = 'rootling-well-v1';
    var SOCIAL_KEY = 'rootling-social-v1';
    var CORE_KEY = 'sprout-state-v1';

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }
    function dayKey(d) {
      d = d || new Date();
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function say(id, text) { var el = $(id); if (el) el.textContent = text; }
    function parseStore(key) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    /* ---------- The 5-Minute Activity Library (MASTER-SPEC S15) ----------
     * Energy tags follow Daniel's rule: movement, exercise and outdoor
     * items are High; learning, creativity and productivity items are
     * Medium; breathing, hydration, mindfulness and self-care items are
     * Low; nature and social items are tagged by their nature, mostly
     * Low to Medium. Steps are 1 to 3 tiny steps in plain words. */
    var CATEGORIES = ['Mental Wellness', 'Physical', 'Nature', 'Learning', 'Creative', 'Social', 'Productivity', 'Self-Care'];
    var BENEFITS_BY_CAT = {
      'Mental Wellness': ['Calm Mind', 'Stress Reduction', 'Clear Head'],
      'Physical': ['Movement', 'Fresh Energy', 'Strong Body'],
      'Nature': ['Fresh Air', 'Calm Mind', 'Sunlight'],
      'Learning': ['New Words', 'Clear Head', 'Growing Skills'],
      'Creative': ['Making Things', 'Joy', 'New Ideas'],
      'Social': ['Kind Words', 'Feeling Close', 'Joy'],
      'Productivity': ['Clear Space', 'Clear Head', 'Ready for Tomorrow'],
      'Self-Care': ['Rest', 'Comfort', 'Kind to Yourself']
    };
    /* [id, name, category, energy, nourish, outdoor, season, description, steps joined by |] */
    var RAW_ACTIVITIES = [
      ['breathing-reset', 'Breathing Reset 4-4-6', 'Mental Wellness', 'low', 'rest', 0, '', 'Slow breaths to feel calm and steady.', 'Breathe in for 4 counts|Hold for 4 counts|Breathe out for 6 counts'],
      ['gratitude-break', 'Gratitude Break 3-2-1', 'Mental Wellness', 'low', 'learning', 0, '', 'Think of good things, one by one.', 'Name 3 things you can see and like|Name 2 sounds you like|Name 1 kind thing from today'],
      ['positive-memory', 'Positive Memory', 'Mental Wellness', 'low', 'rest', 0, '', 'Rest your mind on a good memory.', 'Think of a good time|Picture one small part of it|Stay with it for a few breaths'],
      ['worry-dump', 'Worry Dump', 'Mental Wellness', 'low', 'rest', 0, '', 'Put worries on paper so your head can rest.', 'Write each worry on paper|Close the paper away|Take one slow breath'],
      ['mindfulness-check', 'Mindfulness Check 5-4-3-2-1', 'Mental Wellness', 'low', 'rest', 0, '', 'Notice the room, one sense at a time.', 'Name 5 things you see|Name 4 things you can touch|Name 3 things you hear'],
      ['kind-thought', 'Name One Kind Thing', 'Mental Wellness', 'low', 'rest', 0, '', 'Find one kind thing in your day.', 'Think of your day|Pick one kind thing, big or small|Say it in your head'],
      ['calm-music', 'Listen to Calm Music', 'Mental Wellness', 'low', 'rest', 0, '', 'Let calm music play for a bit.', 'Pick one calm song|Sit or lie down|Listen to the whole song'],
      ['happy-photo', 'Look at a Happy Photo', 'Mental Wellness', 'low', 'rest', 0, '', 'Look at a photo that makes you smile.', 'Find a photo you like|Look at it slowly|Notice one small thing in it'],
      ['stretch-session', 'Stretch Session', 'Physical', 'high', 'movement', 0, '', 'Stretch your arms, back, and legs.', 'Reach your arms up high|Bend to one side, then the other|Roll your shoulders'],
      ['walk-break', 'Walk Break', 'Physical', 'high', 'movement', 1, '', 'Take a short walk, near or far.', 'Stand up and put on shoes|Walk for a few minutes|Walk back at your own pace'],
      ['water-break', 'Water Break', 'Physical', 'low', 'water', 0, '', 'Drink some water, sip by sip.', 'Get a glass or bottle of water|Take small sips|Drink what feels good'],
      ['posture-reset', 'Posture Reset', 'Physical', 'low', 'movement', 0, '', 'Sit or stand tall and easy.', 'Sit or stand up tall|Drop your shoulders down|Take one slow breath'],
      ['dance-break', 'Dance Break', 'Physical', 'high', 'movement', 0, '', 'Move to one song you like.', 'Pick a song you like|Move any way you want|Stop when the song ends'],
      ['shoulder-rolls', 'Shoulder Rolls', 'Physical', 'high', 'movement', 0, '', 'Roll your shoulders round and round.', 'Lift both shoulders up|Roll them back in a circle|Do it 5 times, slow or quick'],
      ['march-in-place', 'March in Place', 'Physical', 'high', 'movement', 0, '', 'March on the spot, inside.', 'Stand in a clear spot|March your feet up and down|Swing your arms a little'],
      ['stand-and-reach', 'Stand and Reach', 'Physical', 'high', 'movement', 0, '', 'Stand up and reach in all directions.', 'Stand up|Reach up, then to each side|Shake your arms out'],
      ['fresh-air', 'Fresh Air', 'Nature', 'medium', 'outside', 1, '', 'Step outside for fresh air.', 'Go to a door or step outside|Take 3 slow breaths|Feel the air on your face'],
      ['cloud-watch', 'Cloud Watch', 'Nature', 'low', 'outside', 1, '', 'Watch the clouds drift by.', 'Look up at the sky|Pick one cloud|Watch it change shape'],
      ['bird-watch', 'Bird Watch', 'Nature', 'low', 'outside', 1, '', 'Look and listen for birds.', 'Look out or step outside|Watch for a bird|Listen for bird sounds'],
      ['tree-observation', 'Tree Observation', 'Nature', 'low', 'outside', 1, '', 'Look at one tree, bit by bit.', 'Find a tree|Look at its leaves and branches|Notice its colours'],
      ['weather-check', 'Weather Check', 'Nature', 'low', 'outside', 0, '', 'Check the weather from your window.', 'Look out of a window|Feel if the air is warm or cool|Name what the sky looks like'],
      ['leaf-walk', 'Leaf Walk', 'Nature', 'medium', 'outside', 1, 'autumn', 'Walk and look for fallen leaves.', 'Walk a short way|Look for leaves on the ground|Pick your favourite leaf shape'],
      ['water-a-plant', 'Water a Plant', 'Nature', 'low', 'outside', 0, '', 'Give a plant some water.', 'Fill a small cup with water|Pour it slowly on the soil|Look at the leaves'],
      ['look-at-a-leaf', 'Look at a Leaf', 'Nature', 'low', 'outside', 0, '', 'Look at one leaf up close.', 'Find a leaf, on a plant or the ground|Look at its lines and edges|Feel if it is smooth or rough'],
      ['learn-one-fact', 'Learn One Fact', 'Learning', 'medium', 'learning', 0, '', 'Learn one small new fact.', 'Pick a topic you like|Read or hear one fact|Say the fact in your own words'],
      ['vocabulary-builder', 'Vocabulary Builder', 'Learning', 'medium', 'learning', 0, '', 'Learn one new word.', 'Pick a new word|Find what it means|Use it in a short sentence'],
      ['read-one-page', 'Read One Page', 'Learning', 'medium', 'learning', 0, '', 'Read one page of anything.', 'Pick a book or page|Read one page|Stop there, or read more if you like'],
      ['skill-practice', 'Skill Practice', 'Learning', 'medium', 'learning', 0, '', 'Practise a skill for a few minutes.', 'Pick one small skill|Try it slowly, one step at a time|Stop when you have had enough'],
      ['short-video', 'One Short Educational Video', 'Learning', 'medium', 'learning', 0, '', 'Watch one short learning video.', 'Pick a topic you like|Watch one short video|Name one thing you learned'],
      ['puzzle-minute', 'Puzzle Minute', 'Learning', 'medium', 'learning', 0, '', 'Try a puzzle for a few minutes.', 'Pick a puzzle you like|Do a few pieces or clues|Stop any time'],
      ['ask-one-question', 'Ask One Question', 'Learning', 'medium', 'learning', 0, '', 'Ask one question and find the answer.', 'Think of a thing you wonder about|Ask it out loud or write it down|Find one answer'],
      ['memory-game', 'Memory Game', 'Learning', 'medium', 'learning', 0, '', 'Play a short memory game.', 'Look at 5 things in the room|Close your eyes|Name all 5 things'],
      ['doodle-challenge', 'Doodle Challenge', 'Creative', 'medium', 'learning', 0, '', 'Draw small doodles, any way you like.', 'Get paper and a pen|Draw shapes, faces, or swirls|Fill a small corner of the page'],
      ['story-starter', 'Story Starter', 'Creative', 'medium', 'learning', 0, '', 'Start a tiny story.', 'Write one line: Once there was a...|Add one more line|Stop when you like'],
      ['photography-challenge', 'Photography Challenge', 'Creative', 'medium', 'outside', 0, '', 'Take one photo of a thing you like.', 'Pick a thing, a colour, or a view|Take one photo|Look at it and enjoy it'],
      ['build-something', 'Build Something', 'Creative', 'medium', 'learning', 0, '', 'Build a small thing from what you have.', 'Pick blocks, cards, or boxes|Build a small shape|Take it apart or keep it'],
      ['music-minute', 'Music Minute', 'Creative', 'medium', 'rest', 0, '', 'Make or enjoy music for a minute.', 'Pick a song or a rhythm|Tap, hum, or play along|Enjoy the last few notes'],
      ['colour-minute', 'Colour a Shape', 'Creative', 'medium', 'learning', 0, '', 'Colour in one shape.', 'Pick a shape or page|Pick one colour|Colour it in slowly'],
      ['build-a-tower', 'Build a Small Tower', 'Creative', 'medium', 'learning', 0, '', 'Stack things into a small tower.', 'Find 5 things that stack|Stack them one by one|Count how high it got'],
      ['hum-a-song', 'Hum a Song', 'Creative', 'medium', 'rest', 0, '', 'Hum a song you love.', 'Think of a song you love|Hum the tune|Hum it once more if you like'],
      ['nice-message', 'Send a Nice Message', 'Social', 'low', 'people', 0, '', 'Send a kind message to someone.', 'Pick a person|Write one kind line|Send it when you are ready'],
      ['thank-someone', 'Thank Someone', 'Social', 'low', 'people', 0, '', 'Thank a person for a kind thing.', 'Think of a kind thing someone did|Say or write thank you|Tell them what it meant to you'],
      ['compliment-challenge', 'Compliment Challenge', 'Social', 'low', 'people', 0, '', 'Give one true compliment.', 'Pick a person|Pick one true good thing about them|Tell them in a kind way'],
      ['family-check-in', 'Family Check-In', 'Social', 'medium', 'people', 0, '', 'Check in with family.', 'Pick a family member|Ask how they are|Listen to their answer'],
      ['pet-time', 'Pet Time', 'Social', 'low', 'rest', 0, '', 'Spend a few minutes with an animal.', 'Sit near the animal|Stroke it gently if it likes that|Just be together for a bit'],
      ['wave-hello', 'Wave and Say Hello', 'Social', 'low', 'people', 0, '', 'Wave and say hello to someone.', 'Pick a friendly moment|Wave and smile|Say hello'],
      ['share-a-photo', 'Share a Photo with a Friend', 'Social', 'low', 'people', 0, '', 'Share a photo you like with a friend.', 'Pick a photo you like|Send it to a friend|Add one kind line'],
      ['ask-how-they-are', 'Ask How Someone Is', 'Social', 'low', 'people', 0, '', 'Ask someone how they are.', 'Pick a person|Ask: how are you today?|Listen to what they say'],
      ['mini-clean-up', 'Mini Clean-Up', 'Productivity', 'medium', 'rest', 0, '', 'Tidy one tiny area.', 'Pick one small spot|Put its things in place|Stop when the spot is clear'],
      ['quick-organization', 'Quick Organization', 'Productivity', 'medium', 'rest', 0, '', 'Sort one small group of things.', 'Pick one drawer, shelf, or pile|Sort a few things into groups|Stop after a few minutes'],
      ['task-planning', 'Task Planning', 'Productivity', 'medium', 'learning', 0, '', 'Plan one task in small steps.', 'Pick one task|Write its first tiny step|Write one more step'],
      ['delete-digital-clutter', 'Delete Digital Clutter', 'Productivity', 'medium', 'rest', 0, '', 'Clear a few old phone or tablet items.', 'Open your photos or files|Delete a few you do not need|Stop after a few minutes'],
      ['prepare-tomorrow', 'Prepare Tomorrow', 'Productivity', 'medium', 'rest', 0, '', 'Get one thing ready for tomorrow.', 'Pick one thing for tomorrow|Put it where you will see it|That is the whole job'],
      ['clear-one-spot', 'Clear One Small Spot', 'Productivity', 'medium', 'rest', 0, '', 'Clear one small spot, and stop.', 'Pick a spot the size of a book|Move its things away|Wipe it or leave it clear'],
      ['put-one-thing-away', 'Put One Thing Away', 'Productivity', 'medium', 'rest', 0, '', 'Put one thing back in its place.', 'Pick one thing that is out of place|Carry it to its home|That is the whole job'],
      ['make-a-small-list', 'Make a Small List', 'Productivity', 'medium', 'learning', 0, '', 'Write a short list of up to 3 things.', 'Get paper or open a notes page|Write up to 3 things|Stop at 3, even if more come to mind'],
      ['healthy-snack', 'Healthy Snack', 'Self-Care', 'low', 'rest', 0, '', 'Have a healthy snack.', 'Pick a fruit or other healthy snack|Eat it slowly|Enjoy each bite'],
      ['hand-care', 'Hand Care', 'Self-Care', 'low', 'rest', 0, '', 'Care for your hands.', 'Wash your hands with warm water|Dry them well|Rub in cream if you have some'],
      ['eye-rest', 'Eye Rest', 'Self-Care', 'low', 'rest', 0, '', 'Rest your eyes for a minute.', 'Look away from the screen|Look at a far thing|Blink slowly a few times'],
      ['relaxation-minute', 'Relaxation Minute', 'Self-Care', 'low', 'rest', 0, '', 'Relax your body for one minute.', 'Sit or lie down|Let your shoulders drop|Breathe slowly till the minute ends'],
      ['comfort-activity', 'Comfort Activity', 'Self-Care', 'low', 'rest', 0, '', 'Do one thing that feels cosy and kind.', 'Pick a cosy thing: a blanket, a warm drink, a soft chair|Settle in|Stay a few minutes'],
      ['warm-drink', 'Have a Warm Drink', 'Self-Care', 'low', 'water', 0, '', 'Make and enjoy a warm drink.', 'Make a warm drink you like|Hold the cup in both hands|Sip it slowly'],
      ['feet-up', 'Put Your Feet Up', 'Self-Care', 'low', 'rest', 0, '', 'Put your feet up and rest.', 'Sit in a comfy chair|Put your feet up|Rest there a few minutes'],
      ['soft-blanket', 'Get a Soft Blanket', 'Self-Care', 'low', 'rest', 0, '', 'Wrap up in a soft blanket.', 'Find a soft blanket|Wrap it round your shoulders|Rest for a few minutes']
    ];
    var ACTIVITIES = RAW_ACTIVITIES.map(function (r) {
      return {
        id: r[0], name: r[1], category: r[2], energy: r[3], nourish: r[4],
        outdoor: !!r[5], season: r[6] || '', desc: r[7],
        steps: r[8].split('|'), benefits: (BENEFITS_BY_CAT[r[2]] || []).slice()
      };
    });
    var ACT_BY_ID = {};
    ACTIVITIES.forEach(function (a) { ACT_BY_ID[a.id] = a; });
    /* Indoor swaps, used only when the user's own typed note for today
     * mentions rain, cold, or snow. No weather is ever looked up. */
    var INDOOR_SWAPS = {
      'walk-break': 'march-in-place', 'fresh-air': 'water-a-plant',
      'cloud-watch': 'happy-photo', 'bird-watch': 'calm-music',
      'tree-observation': 'look-at-a-leaf', 'leaf-walk': 'colour-minute'
    };
    var SEASON_BY_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
    var SEASONAL_ITEMS = [
      { season: 'autumn', id: 'leaf-walk' },
      { season: 'spring', id: 'look-at-a-leaf' },
      { season: 'summer', id: 'feet-up' },
      { season: 'winter', id: 'soft-blanket' }
    ];

    /* ---------- Emergency low-energy list (MASTER-SPEC S15) ---------- */
    var LOW_ENERGY = [
      { id: 'low-water', name: 'Drink water', nourish: 'water' },
      { id: 'low-stand', name: 'Stand up', nourish: 'movement' },
      { id: 'low-window', name: 'Open a window', nourish: 'outside' },
      { id: 'low-breaths', name: 'Five breaths', nourish: 'rest' },
      { id: 'low-stretch-arms', name: 'Stretch arms', nourish: 'movement' },
      { id: 'low-pet', name: 'Pet an animal', nourish: 'rest' },
      { id: 'low-song', name: 'Favourite song', nourish: 'rest' },
      { id: 'low-wash-face', name: 'Wash face', nourish: 'rest' },
      { id: 'low-sit-outside', name: 'Sit outside', nourish: 'outside' },
      { id: 'low-sky', name: 'Look at the sky', nourish: 'outside' }
    ];
    var LOW_BY_ID = {};
    LOW_ENERGY.forEach(function (a) { LOW_BY_ID[a.id] = a; });
    var LOW_SUCCESS_LINE = 'That counts. One small thing is a real success.';
    var BREAK_CELEBRATION = 'Awesome job taking a break — that helped both of us recharge.';
    var EFFORT_LINES = [
      'You showed up for yourself.',
      'You tried. That is what counts here.',
      'Your pet is happy you tried that with them.',
      'Thanks for taking a screen break. We both needed it!',
      'You gave that a go. Good for you.'
    ];

    /* ---------- Stickers: earned once, kept for good ---------- */
    var STICKERS = [
      { id: 'showed-up', name: 'You showed up', shape: '★' },
      { id: 'first-break', name: 'First break', shape: '♥' },
      { id: 'outside-air', name: 'Outside air', shape: '☀' },
      { id: 'kind-words', name: 'Kind words', shape: '✿' },
      { id: 'hard-one', name: 'Hard one tried', shape: '◆' },
      { id: 'good-sip', name: 'A good sip', shape: '●' },
      { id: 'gentle-stretch', name: 'Gentle stretch', shape: '▲' },
      { id: 'reading-time', name: 'Reading time', shape: '■' },
      { id: 'making-time', name: 'Making time', shape: '✚' }
    ];
    var STICKER_BY_ID = {};
    STICKERS.forEach(function (s) { STICKER_BY_ID[s.id] = s; });

    /* ---------- Challenges ---------- */
    var CHALLENGES = [
      { id: 'ch-water', group: '5 minutes', mins: 5, diff: 'gentle', name: 'Drink water', nourish: 'water', libId: 'water-break' },
      { id: 'ch-stretch', group: '5 minutes', mins: 5, diff: 'gentle', name: 'Stretch', nourish: 'movement', libId: 'stretch-session' },
      { id: 'ch-step-outside', group: '5 minutes', mins: 5, diff: 'gentle', name: 'Step outside', nourish: 'outside', libId: 'fresh-air' },
      { id: 'ch-call', group: '15 minutes', mins: 15, diff: 'gentle', name: 'Call a friend', nourish: 'people', libId: 'family-check-in' },
      { id: 'ch-read', group: '15 minutes', mins: 15, diff: 'middle', name: 'Read a chapter', nourish: 'learning', libId: 'read-one-page', reading: true },
      { id: 'ch-walk', group: '15 minutes', mins: 15, diff: 'middle', name: 'Take a walk', nourish: 'movement', libId: 'walk-break' },
      { id: 'ch-move-body', group: '30 minutes', mins: 30, diff: 'stretch', name: 'Move your body', nourish: 'movement', libId: 'dance-break' },
      { id: 'ch-hobby', group: '30 minutes', mins: 30, diff: 'middle', name: 'Do a hobby', nourish: 'learning', libId: 'skill-practice' },
      { id: 'ch-cook', group: '30 minutes', mins: 30, diff: 'middle', name: 'Cook something', nourish: 'rest', libId: 'healthy-snack' },
      { id: 'ch-family', group: '30 minutes', mins: 30, diff: 'gentle', name: 'Time with family', nourish: 'people', libId: 'family-check-in' }
    ];
    var CHAL_BY_ID = {};
    CHALLENGES.forEach(function (c) { CHAL_BY_ID[c.id] = c; });
    var GOALS = [
      { id: 'less', label: 'Use screens less' },
      { id: 'move', label: 'Move more' },
      { id: 'read', label: 'Read more' },
      { id: 'people', label: 'More time with people' },
      { id: 'sleep', label: 'Sleep better' }
    ];

    /* ---------- Store ---------- */
    function timeDefaults() {
      return {
        version: 1,
        days: {},              /* 'YYYY-MM-DD' -> { seconds, sessions, breaks } */
        openSession: null,     /* { date, startedAt } for the live visit only */
        lifetimeSec: 0,
        nextReminderAt: 1800,
        reminder: { enabled: true, intervalMin: 30, dismissedDate: '' },
        goals: [],
        activeChallenges: [],
        challengesDone: {},    /* date -> [challenge ids] */
        actions: [],           /* { date, kind, itemId, name, category, nourish, reading } */
        nourished: {},         /* date -> { movement, water, rest, learning, people, outside } */
        stickers: [],          /* { id, date } — only ever added to */
        suggest: { energy: '', idx: 0, currentId: '' },
        lowCurrent: '',
        favorites: [],
        dislikes: [],
        prefs: [],             /* { kind:'preference', what, why, updated } */
        participation: 0,      /* only ever grows */
        participationLog: [],  /* { date, itemId, name, answer } answer: yes | partly | not-this-time */
        contextNote: '',
        challengePick: { duration: '', diff: '' },
        picker: { mode: 'any', category: '', recent: [], counter: 0, surpriseCounter: 0, currentId: '', started: false },
        energyCounts: {},
        categoryCounts: {},
        timeCounts: {}
      };
    }
    function timeLoad() {
      var base = timeDefaults();
      try {
        var raw = localStorage.getItem(TIME_KEY);
        if (!raw) return base;
        var s = JSON.parse(raw);
        for (var k in base) { if (s[k] === undefined) s[k] = base[k]; }
        if (!s.reminder || typeof s.reminder !== 'object') s.reminder = base.reminder;
        if (!s.picker || typeof s.picker !== 'object') s.picker = base.picker;
        if (!s.suggest || typeof s.suggest !== 'object') s.suggest = base.suggest;
        if (!s.challengePick || typeof s.challengePick !== 'object') s.challengePick = base.challengePick;
        return s;
      } catch (e) { return base; }
    }
    var data = timeLoad();
    function timeSave() {
      try { localStorage.setItem(TIME_KEY, JSON.stringify(data)); } catch (e) { /* storage can be off; the visit still works */ }
    }
    function dayRec(key) {
      if (!data.days[key]) data.days[key] = { seconds: 0, sessions: 0, breaks: 0 };
      return data.days[key];
    }

    /* ---------- Time words (kind rounding, no numbers as grades) ---------- */
    function minutesWords(totalMin) {
      if (totalMin < 1) return 'less than a minute';
      if (totalMin === 1) return '1 minute';
      if (totalMin < 60) {
        var m = totalMin <= 15 ? totalMin : Math.round(totalMin / 5) * 5;
        if (m >= 60) return 'about 1 hour';
        return m + ' minutes';
      }
      var h = Math.floor(totalMin / 60);
      var rem = totalMin - h * 60;
      var hw = h === 1 ? '1 hour' : h + ' hours';
      if (rem === 0) return hw;
      if (rem < 8) return 'just over ' + hw;
      if (rem > 52) return 'about ' + (h + 1 === 1 ? '1 hour' : (h + 1) + ' hours');
      var rm = Math.round(rem / 5) * 5;
      if (rm === 0) return hw;
      if (rm >= 60) return 'about ' + (h + 1) + ' hours';
      return hw + ' and ' + rm + ' minutes';
    }
    function durationWords(sec) {
      return minutesWords(Math.round((sec || 0) / 60));
    }
    function aboutWords(sec) {
      if (!sec) return 'less than a minute';
      var plain = durationWords(sec);
      if (plain.indexOf('about ') === 0 || plain.indexOf('just over ') === 0 || plain === 'less than a minute') return plain;
      return 'about ' + plain;
    }
    var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    function keyToDate(key) {
      var p = String(key).split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    function shiftKey(key, delta) {
      var d = keyToDate(key);
      d.setDate(d.getDate() + delta);
      return dayKey(d);
    }
    function weekSeconds(offsetDays) {
      var total = 0;
      for (var i = 0; i < 7; i++) {
        var rec = data.days[shiftKey(dayKey(), offsetDays - i)];
        if (rec) total += rec.seconds || 0;
      }
      return total;
    }

    /* ---------- Accrual: open + visible only ---------- */
    var lastTickMs = Date.now();
    var reminderShown = false;
    var breakCountedThisVisit = false;
    function isVisible() {
      try {
        /* visibilityState is the synced signal in real browsers
         * ('hidden' exactly when the tab is not shown). Some test
         * environments report 'prerender' with document.hidden set,
         * which is not a user hiding the app, so the state word rules. */
        if (typeof document.visibilityState === 'string') return document.visibilityState !== 'hidden';
        if (document.hidden === true) return false;
      } catch (e) { /* if in doubt, the app is open in front of the user */ }
      return true;
    }
    function quietViewUp() {
      var q = $('quiet-view');
      return !!q && q.hidden === false;
    }
    function accrue(sec) {
      if (!isVisible()) return 0;
      if (!(sec > 0)) return 0;
      var whole = Math.floor(sec);
      if (whole < 1) return 0;
      var rec = dayRec(dayKey());
      rec.seconds += whole;
      data.lifetimeSec += whole;
      timeSave();
      return whole;
    }
    function tickNow() {
      var now = Date.now();
      var delta = (now - lastTickMs) / 1000;
      lastTickMs = now;
      if (delta > 0 && delta < 3600) accrue(delta);
      renderSummaries();
      checkReminder();
    }
    function accrueSeconds(sec) {
      var added = accrue(sec);
      renderSummaries();
      checkReminder();
      return added;
    }
    function closeStaleSession() {
      /* A session left open when the app closed keeps only the time its
       * own ticks already saved. Nothing is added for time away. */
      data.openSession = null;
      var rec = dayRec(dayKey());
      rec.sessions += 1;
      data.openSession = { date: dayKey(), startedAt: Date.now() };
      if (data.nextReminderAt <= data.lifetimeSec) data.nextReminderAt = data.lifetimeSec + data.reminder.intervalMin * 60;
      timeSave();
    }

    /* ---------- Other stores, read defensively ---------- */
    function petState() {
      try {
        var api = (typeof window !== 'undefined' && (window.RootlingApp || window.SproutApp)) || null;
        return api && typeof api.getState === 'function' ? api.getState() : null;
      } catch (e) { return null; }
    }
    function focusActive() {
      try {
        if (typeof window !== 'undefined' && window.RootlingExec && typeof window.RootlingExec.getData === 'function') {
          var ed = window.RootlingExec.getData();
          if (ed && ed.focus) return true;
        }
      } catch (e) { /* fall through to the store read */ }
      var ex = parseStore(EXEC_KEY);
      return !!(ex && ex.focus);
    }

    /* ---------- Nourished picture: fills latch, never un-fill ---------- */
    var NOURISH_KEYS = ['movement', 'water', 'rest', 'learning', 'people', 'outside'];
    function computeNourished() {
      var today = dayKey();
      var cur = data.nourished[today] || {};
      var out = {};
      NOURISH_KEYS.forEach(function (k) { out[k] = !!cur[k]; });
      var st = petState();
      if (st && st.checkins && st.checkins[today]) {
        var day = st.checkins[today];
        if (day.movement) out.movement = true;
        if (day.water && day.water.glasses > 0) out.water = true;
        if (day.sleep) out.rest = true;
      }
      var well = parseStore(WELL_KEY);
      if (well) {
        if (Array.isArray(well.journal) && well.journal.some(function (j) { return j && j.date === today; })) out.learning = true;
        if (Array.isArray(well.unsent) && well.unsent.some(function (u) { return u && u.date === today; })) out.people = true;
      }
      var soc = parseStore(SOCIAL_KEY);
      if (soc) {
        if (Array.isArray(soc.reflections) && soc.reflections.some(function (r) { return r && (r.day === today || r.date === today); })) out.learning = true;
      }
      data.actions.forEach(function (a) {
        if (a.date === today && a.nourish && NOURISH_KEYS.indexOf(a.nourish) !== -1) out[a.nourish] = true;
      });
      var changed = false;
      NOURISH_KEYS.forEach(function (k) { if (out[k] && !cur[k]) changed = true; });
      if (changed) { data.nourished[today] = out; timeSave(); }
      return out;
    }
    function latchNourish(nourish) {
      if (!nourish || NOURISH_KEYS.indexOf(nourish) === -1) return;
      var today = dayKey();
      if (!data.nourished[today]) data.nourished[today] = {};
      data.nourished[today][nourish] = true;
    }
    function renderNourished() {
      var filled = computeNourished();
      var segs = document.querySelectorAll('#time-nourished .time-nourish-seg');
      for (var i = 0; i < segs.length; i++) {
        var on = !!filled[segs[i].getAttribute('data-nourish')];
        segs[i].classList.toggle('selected', on);
        segs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    /* ---------- Celebration + stickers (small and medium tiers) ---------- */
    var effortIdx = 0;
    function celebrate(line) {
      var box = $('time-celebrate');
      var img = $('time-celebrate-img');
      var st = petState();
      if (img) {
        var src = 'assets/sprout-celebrate.svg';
        try {
          if (st && st.form === 'animal') src = 'assets/creature-celebrate.svg';
          else if (st && st.calmMode) src = 'assets/sprout-celebrate-calm.svg';
        } catch (e) { /* keep the plant art */ }
        img.setAttribute('src', src);
      }
      say('time-celebrate-text', line || EFFORT_LINES[effortIdx % EFFORT_LINES.length]);
      effortIdx += 1;
      if (box) box.hidden = false;
    }
    function awardSticker(id) {
      if (!STICKER_BY_ID[id]) return false;
      for (var i = 0; i < data.stickers.length; i++) if (data.stickers[i].id === id) return false;
      data.stickers.push({ id: id, date: dayKey() });
      return true;
    }
    function awardForActivity(act, isFirstEver) {
      if (!act) return;
      if (isFirstEver) awardSticker('showed-up');
      if (act.nourish === 'outside') awardSticker('outside-air');
      if (act.nourish === 'people') awardSticker('kind-words');
      if (act.nourish === 'water') awardSticker('good-sip');
      if (act.nourish === 'movement') awardSticker('gentle-stretch');
      if (act.category === 'Creative') awardSticker('making-time');
      if (act.reading || act.id === 'read-one-page' || act.libId === 'read-one-page') awardSticker('reading-time');
    }
    function renderStickers() {
      var shelf = $('time-sticker-shelf');
      if (shelf) {
        shelf.innerHTML = data.stickers.map(function (s) {
          var def = STICKER_BY_ID[s.id];
          return def ? '<span class="btn-chip selected">' + esc(def.shape) + ' ' + esc(def.name) + '</span>' : '';
        }).join('');
      }
      var empty = $('time-sticker-empty');
      if (empty) empty.hidden = data.stickers.length > 0;
      renderParticipation();
    }
    function renderParticipation() {
      say('time-participation-line', 'Times you took part: ' + data.participation + '. This number only grows.');
    }

    /* ---------- Prefs: memory items with why-lines (for the Memory Book) ---------- */
    function upsertPref(what, why) {
      var nowIso = new Date().toISOString();
      for (var i = 0; i < data.prefs.length; i++) {
        if (data.prefs[i].what === what) {
          data.prefs[i].why = why;
          data.prefs[i].updated = nowIso;
          return data.prefs[i];
        }
      }
      var entry = { kind: 'preference', what: what, why: why, updated: nowIso };
      data.prefs.push(entry);
      return entry;
    }
    function bumpCount(map, key) {
      map[key] = (map[key] || 0) + 1;
      return map[key];
    }
    function timeBucket() {
      var h = new Date().getHours();
      return h < 12 ? 'morning' : (h < 17 ? 'afternoon' : 'evening');
    }
    function notePickPatterns(act) {
      if (!act) return;
      if (bumpCount(data.categoryCounts, act.category) >= 2) upsertPref('interest:' + act.category, 'You picked this often');
      if (bumpCount(data.timeCounts, timeBucket()) >= 2) upsertPref('time:' + timeBucket(), 'You did activities at this time often');
    }
    function noteEnergyPick(energy) {
      if (!energy) return;
      if (bumpCount(data.energyCounts, energy) >= 2) upsertPref('energy:' + energy, 'You picked this often');
    }

    /* ---------- Recording a finished (or partly finished) activity ---------- */
    function recordAction(kind, item, answer) {
      var today = dayKey();
      var isFirstActivity = data.actions.length === 0;
      data.actions.push({
        date: today, kind: kind, itemId: item.id, name: item.name,
        category: item.category || '', nourish: item.nourish || '',
        reading: !!item.reading
      });
      if (item.nourish) latchNourish(item.nourish);
      awardForActivity(item, isFirstActivity);
      if (kind === 'low') awardSticker('hard-one');
      if (kind === 'challenge' && item.mins >= 30) awardSticker('hard-one');
      notePickPatterns(item);
      timeSave();
      renderNourished();
      renderStickers();
      renderGoals();
    }
    function recordParticipation(item, answer, sourceKind) {
      data.participation += 1;
      data.participationLog.push({ date: dayKey(), itemId: item.id, name: item.name, answer: answer });
      if (answer === 'yes' || answer === 'partly') recordAction(sourceKind, item, answer);
      else timeSave();
      renderParticipation();
    }
    function recordBreak() {
      var rec = dayRec(dayKey());
      rec.breaks += 1;
      data.nextReminderAt = data.lifetimeSec + data.reminder.intervalMin * 60;
      timeSave();
    }

    /* ---------- Summaries ---------- */
    function renderSummaries() {
      var today = dayKey();
      var rec = data.days[today] || { seconds: 0, sessions: 0, breaks: 0 };
      say('time-today', 'Time with Rootling today: ' + aboutWords(rec.seconds) + '.');
      if (rec.seconds >= 7200) say('time-today-warm', "You've been focused for " + durationWords(rec.seconds) + '. Great work.');
      else if (rec.seconds >= 60) say('time-today-warm', 'You spent ' + durationWords(rec.seconds) + ' with Rootling today. Good work, at your own pace.');
      else say('time-today-warm', 'A calm start is a good start. Rootling is glad you are here.');
      say('time-today-breaks', 'Breaks taken today: ' + rec.breaks + '. Sessions today: ' + rec.sessions + '.');
      var list = $('time-week-list');
      if (list) {
        var rows = '';
        for (var i = 0; i < 7; i++) {
          var key = shiftKey(today, -i);
          var r = data.days[key];
          var label = i === 0 ? 'Today' : DAY_NAMES[keyToDate(key).getDay()];
          rows += '<li>' + label + ': time with Rootling ' + aboutWords(r ? r.seconds : 0) + '</li>';
        }
        list.innerHTML = rows;
      }
      var blocks = $('time-week-blocks');
      if (blocks) {
        var html = '';
        for (var b = 6; b >= 0; b--) {
          var bk = shiftKey(today, -b);
          var br = data.days[bk];
          var filledDay = !!(br && br.seconds > 0);
          html += '<span class="btn-chip' + (filledDay ? ' selected' : '') + '">' + DAY_NAMES[keyToDate(bk).getDay()].slice(0, 3) + '</span>';
        }
        blocks.innerHTML = html;
      }
      var monthTotal = 0;
      var prefix = today.slice(0, 7);
      for (var k in data.days) if (k.indexOf(prefix) === 0) monthTotal += data.days[k].seconds || 0;
      say('time-month', 'Time with Rootling this month: ' + aboutWords(monthTotal) + '.');
    }

    /* ---------- Smart break reminders ---------- */
    function reminderDue() {
      if (!data.reminder.enabled) return false;
      if (data.reminder.dismissedDate === dayKey()) return false;
      return data.lifetimeSec >= data.nextReminderAt;
    }
    function renderReminderCard() {
      var card = $('time-reminder-card');
      if (!card) return;
      var focused = focusActive();
      say('time-reminder-text', focused
        ? "It looks like you're focused. Would you like a reminder in 15 minutes?"
        : "You've been with Rootling for a while. Would you like a short break?");
      var cont = $('time-reminder-continue');
      if (cont) cont.hidden = !focused;
      card.hidden = false;
      reminderShown = true;
    }
    function hideReminderCard() {
      var card = $('time-reminder-card');
      if (card) card.hidden = true;
      reminderShown = false;
    }
    function checkReminder() {
      if (reminderShown) { if (!quietViewUp()) renderReminderCard(); return; }
      if (!reminderDue()) return;
      if (quietViewUp()) return; /* defer silently while the quiet view is up */
      renderReminderCard();
    }
    function renderReminderSettings() {
      var on = !!data.reminder.enabled;
      if ($('time-reminder-toggle')) $('time-reminder-toggle').checked = on;
      if ($('time-grown-reminder-toggle')) $('time-grown-reminder-toggle').checked = on;
      var chips = document.querySelectorAll('[data-time-interval]');
      for (var i = 0; i < chips.length; i++) {
        var sel = Number(chips[i].getAttribute('data-time-interval')) === data.reminder.intervalMin;
        chips[i].classList.toggle('selected', sel);
        chips[i].setAttribute('aria-pressed', sel ? 'true' : 'false');
      }
      var gchips = document.querySelectorAll('[data-time-grown-interval]');
      for (var j = 0; j < gchips.length; j++) {
        var gsel = Number(gchips[j].getAttribute('data-time-grown-interval')) === data.reminder.intervalMin;
        gchips[j].classList.toggle('selected', gsel);
        gchips[j].setAttribute('aria-pressed', gsel ? 'true' : 'false');
      }
      say('time-reminder-status', on
        ? 'Saved. Rootling will ask about a break every ' + (data.reminder.intervalMin === 60 ? '1 hour' : data.reminder.intervalMin === 120 ? '2 hours' : '30 minutes') + '.'
        : 'Saved. Break reminders are off. You can turn them on here any time.');
    }
    function setReminderEnabled(on) {
      data.reminder.enabled = !!on;
      if (!on) hideReminderCard();
      else data.nextReminderAt = data.lifetimeSec + data.reminder.intervalMin * 60;
      timeSave();
      renderReminderSettings();
    }
    function setReminderInterval(mins) {
      data.reminder.intervalMin = mins;
      data.nextReminderAt = data.lifetimeSec + mins * 60;
      timeSave();
      renderReminderSettings();
    }

    /* ---------- Context note + indoor swaps ---------- */
    function contextFlags() {
      var note = String(data.contextNote || '').toLowerCase();
      return /rain|cold|snow/.test(note);
    }
    function indoorSwapFor(item) {
      if (!item || !item.outdoor) return item;
      if (!contextFlags()) return item;
      var swap = INDOOR_SWAPS[item.id];
      return (swap && ACT_BY_ID[swap]) ? ACT_BY_ID[swap] : item;
    }
    function seasonalFor(date) {
      var season = SEASON_BY_MONTH[(date || new Date()).getMonth()];
      for (var i = 0; i < SEASONAL_ITEMS.length; i++) {
        if (SEASONAL_ITEMS[i].season === season) return ACT_BY_ID[SEASONAL_ITEMS[i].id] || null;
      }
      return null;
    }

    /* ---------- Suggestion engine (one card at a time) ---------- */
    function cleanPool(pool) {
      return pool.filter(function (a) { return data.dislikes.indexOf(a.id) === -1; });
    }
    function pickFromPool(pool, recent) {
      var clean = cleanPool(pool);
      if (!clean.length) return null;
      var fresh = clean.filter(function (a) { return recent.slice(-5).indexOf(a.id) === -1; });
      var usable = fresh.length ? fresh : clean;
      data.picker.counter += 1;
      var item = usable[(data.picker.counter - 1) % usable.length];
      recent.push(item.id);
      if (recent.length > 20) recent.splice(0, recent.length - 20);
      return indoorSwapFor(item);
    }
    function poolForEnergy(energy) {
      return ACTIVITIES.filter(function (a) { return a.energy === energy; });
    }
    var suggestRecent = [];
    var currentSuggest = null;
    var currentSuggestSource = 'suggest';
    function showSuggest(item) {
      currentSuggest = item;
      data.suggest.currentId = item ? item.id : '';
      var card = $('time-suggest-card');
      if (!item) { if (card) card.hidden = true; return; }
      say('time-suggest-category', item.category + ' · About 5 minutes');
      say('time-suggest-name', item.name);
      var steps = $('time-suggest-steps');
      if (steps) steps.innerHTML = item.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      var g = $('time-suggest-grounding');
      if (g) g.hidden = item.id !== 'breathing-reset' && item.id !== 'mindfulness-check';
      if (card) card.hidden = false;
      timeSave();
    }
    function suggestForEnergy(energy, advance) {
      var pool = poolForEnergy(energy);
      if (advance && currentSuggest) {
        var start = pool.indexOf(currentSuggest);
        /* "Another idea" jumps kind when it can: the next card comes
         * from a different category than the one showing, so rotating
         * ideas really does travel across the library. */
        for (var pass = 0; pass < 2; pass++) {
          for (var step = 1; step <= pool.length; step++) {
            var cand = pool[(start + step) % pool.length];
            if (data.dislikes.indexOf(cand.id) !== -1) continue;
            if (suggestRecent.slice(-5).indexOf(cand.id) !== -1 && pool.length > 5) continue;
            if (pass === 0 && cand.category === currentSuggest.category) continue;
            suggestRecent.push(cand.id);
            return showSuggest(indoorSwapFor(cand));
          }
        }
      }
      var item = pickFromPool(pool, suggestRecent);
      showSuggest(item);
    }

    /* ---------- Emergency low-energy panel ---------- */
    function renderLowPanel() {
      var list = $('time-low-list');
      if (!list) return;
      list.innerHTML = LOW_ENERGY.map(function (item) {
        return '<div class="choice-row"><span class="btn btn-choice">' + esc(item.name) + '</span>'
          + '<button type="button" class="btn btn-primary" data-time-low-done="' + esc(item.id) + '">Done</button></div>';
      }).join('');
      var btns = list.querySelectorAll('[data-time-low-done]');
      for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
        completeLow(this.getAttribute('data-time-low-done'));
      });
    }
    function completeLow(id) {
      var item = LOW_BY_ID[id];
      if (!item) return;
      data.participation += 1;
      data.participationLog.push({ date: dayKey(), itemId: item.id, name: item.name, answer: 'yes' });
      recordAction('low', { id: item.id, name: item.name, category: 'Self-Care', nourish: item.nourish }, 'yes');
      if (!breakCountedThisVisit) { recordBreak(); breakCountedThisVisit = true; }
      say('time-low-status', LOW_SUCCESS_LINE);
      celebrate(LOW_SUCCESS_LINE + ' ' + BREAK_CELEBRATION);
      renderGoals();
    }

    /* ---------- Challenges ---------- */
    function renderChallenges() {
      var wrap = $('time-challenges');
      if (wrap) {
        var pick = data.challengePick;
        var groups = ['5 minutes', '15 minutes', '30 minutes'];
        wrap.innerHTML = groups.map(function (g) {
          if (pick.duration && pick.duration !== g) return '';
          var items = CHALLENGES.filter(function (c) {
            return c.group === g && (!pick.diff || c.diff === pick.diff);
          });
          if (!items.length) return '';
          return '<h5>' + g + '</h5>' + items.map(function (c) {
            return '<div class="choice-row"><span class="btn btn-choice">' + esc(c.name) + '</span>'
              + '<button type="button" class="btn btn-soft" data-time-chal-pick="' + esc(c.id) + '">This one</button></div>';
          }).join('');
        }).join('');
        var picks = wrap.querySelectorAll('[data-time-chal-pick]');
        for (var i = 0; i < picks.length; i++) picks[i].addEventListener('click', function () {
          takeChallenge(this.getAttribute('data-time-chal-pick'));
        });
      }
      /* duration + difficulty chip states */
      var dchips = document.querySelectorAll('[data-time-chal-duration]');
      for (var d = 0; d < dchips.length; d++) {
        var dsel = dchips[d].getAttribute('data-time-chal-duration') === data.challengePick.duration;
        dchips[d].classList.toggle('selected', dsel);
        dchips[d].setAttribute('aria-pressed', dsel ? 'true' : 'false');
      }
      var fchips = document.querySelectorAll('[data-time-chal-diff]');
      for (var f = 0; f < fchips.length; f++) {
        var fsel = fchips[f].getAttribute('data-time-chal-diff') === data.challengePick.diff;
        fchips[f].classList.toggle('selected', fsel);
        fchips[f].setAttribute('aria-pressed', fsel ? 'true' : 'false');
      }
      renderActiveChallenges();
    }
    function renderActiveChallenges() {
      var list = $('time-challenge-active');
      if (!list) return;
      list.innerHTML = data.activeChallenges.length
        ? data.activeChallenges.map(function (id) {
            var c = CHAL_BY_ID[id];
            if (!c) return '';
            return '<li>' + esc(c.name) + ' (' + esc(c.group) + ') '
              + '<button type="button" class="btn btn-primary" data-time-chal-done="' + esc(c.id) + '">Done</button> '
              + '<button type="button" class="btn btn-ghost" data-time-chal-notnow="' + esc(c.id) + '">Not now</button></li>';
          }).join('')
        : '<li>No challenge picked right now. That is fine.</li>';
      var done = list.querySelectorAll('[data-time-chal-done]');
      for (var i = 0; i < done.length; i++) done[i].addEventListener('click', function () {
        completeChallenge(this.getAttribute('data-time-chal-done'));
      });
      var notnow = list.querySelectorAll('[data-time-chal-notnow]');
      for (var j = 0; j < notnow.length; j++) notnow[j].addEventListener('click', function () {
        dropChallenge(this.getAttribute('data-time-chal-notnow'));
      });
    }
    function takeChallenge(id) {
      if (!CHAL_BY_ID[id]) return;
      if (data.activeChallenges.indexOf(id) === -1) data.activeChallenges.push(id);
      timeSave();
      renderActiveChallenges();
      say('time-challenge-status', 'Saved. ' + CHAL_BY_ID[id].name + ' is yours now. Do it when you like. There is no clock on it.');
    }
    function dropChallenge(id) {
      data.activeChallenges = data.activeChallenges.filter(function (x) { return x !== id; });
      timeSave();
      renderActiveChallenges();
      say('time-challenge-status', 'Okay. That one is put away. Nothing was kept about it.');
    }
    function completeChallenge(id) {
      var c = CHAL_BY_ID[id];
      if (!c) return;
      data.activeChallenges = data.activeChallenges.filter(function (x) { return x !== id; });
      var today = dayKey();
      if (!data.challengesDone[today]) data.challengesDone[today] = [];
      if (data.challengesDone[today].indexOf(id) === -1) data.challengesDone[today].push(id);
      data.participation += 1;
      data.participationLog.push({ date: today, itemId: c.id, name: c.name, answer: 'yes' });
      recordAction('challenge', c, 'yes');
      celebrate('You tried a real-world challenge: ' + c.name + '. ' + BREAK_CELEBRATION);
      say('time-challenge-status', 'Well done for trying. ' + c.name + ' is done, and your pet cheered for you.');
      renderActiveChallenges();
      renderGoals();
    }

    /* ---------- Aims (goals) ---------- */
    function daysThisWeekWith(pred) {
      var days = {};
      for (var i = 0; i < 7; i++) {
        var key = shiftKey(dayKey(), -i);
        if (pred(key)) days[key] = 1;
      }
      return Object.keys(days).length;
    }
    function goalLines() {
      var lines = [];
      var nothing = 'Nothing yet. It will show here when it happens.';
      data.goals.forEach(function (g) {
        if (g === 'less') {
          var thisW = weekSeconds(0), lastW = weekSeconds(-7);
          if (!thisW && !lastW) lines.push('Use screens less: ' + nothing);
          else if (Math.abs(thisW - lastW) <= Math.max(300, Math.round(Math.max(thisW, lastW) / 10))) lines.push('Use screens less: your time with Rootling this week is about the same as last week. That is just a fact, in your own words to see.');
          else if (thisW < lastW) lines.push('Use screens less: your time with Rootling this week is less than last week. That is just a fact, in your own words to see.');
          else lines.push('Use screens less: your time with Rootling this week is more than last week. That is just a fact, in your own words to see.');
        } else if (g === 'move') {
          var md = daysThisWeekWith(function (key) {
            var st = petState();
            var core = st && st.checkins && st.checkins[key] && st.checkins[key].movement;
            var acted = data.actions.some(function (a) { return a.date === key && a.nourish === 'movement'; });
            return !!core || acted;
          });
          lines.push(md ? 'Move more: you did a moving break or check-in on ' + md + (md === 1 ? ' day' : ' days') + ' this week.' : 'Move more: ' + nothing);
        } else if (g === 'read') {
          var rd = daysThisWeekWith(function (key) {
            return data.actions.some(function (a) { return a.date === key && a.reading; });
          });
          lines.push(rd ? 'Read more: you did a reading break ' + rd + (rd === 1 ? ' day' : ' days') + ' this week.' : 'Read more: ' + nothing);
        } else if (g === 'people') {
          var pd = daysThisWeekWith(function (key) {
            return data.actions.some(function (a) { return a.date === key && a.nourish === 'people'; });
          });
          lines.push(pd ? 'More time with people: you did a people break or challenge on ' + pd + (pd === 1 ? ' day' : ' days') + ' this week.' : 'More time with people: ' + nothing);
        } else if (g === 'sleep') {
          var sd = daysThisWeekWith(function (key) {
            var st = petState();
            return !!(st && st.checkins && st.checkins[key] && st.checkins[key].sleep);
          });
          lines.push(sd ? 'Sleep better: you saved your sleep on ' + sd + (sd === 1 ? ' day' : ' days') + ' this week.' : 'Sleep better: ' + nothing);
        }
      });
      return lines;
    }
    function renderGoals() {
      var chips = document.querySelectorAll('[data-time-goal]');
      for (var i = 0; i < chips.length; i++) {
        var on = data.goals.indexOf(chips[i].getAttribute('data-time-goal')) !== -1;
        chips[i].classList.toggle('selected', on);
        chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      var lines = goalLines();
      var html = lines.length ? lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') : '<li>No aims picked yet. That is fine.</li>';
      var list = $('time-goal-lines');
      if (list) list.innerHTML = html;
      var grown = $('time-grown-goal-lines');
      if (grown) grown.innerHTML = html;
    }

    /* ---------- Random Activity Picker ---------- */
    var currentPicker = null;
    var pendingCheck = null; /* { source: 'suggest' | 'picker', item } */
    function openCheck(source, item) {
      if (!item) return;
      pendingCheck = { source: source, item: item };
      var panel = $('time-complete-panel');
      if (panel) {
        panel.hidden = false;
        try { panel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* scrolling is a help, not a need */ }
      }
    }
    function answerCheck(answer) {
      if (!pendingCheck) return;
      var item = pendingCheck.item;
      var source = pendingCheck.source;
      pendingCheck = null;
      var panel = $('time-complete-panel');
      if (panel) panel.hidden = true;
      recordParticipation(item, answer, source === 'suggest' ? 'break' : 'picker');
      if (source === 'suggest' && (answer === 'yes' || answer === 'partly')) {
        if (!breakCountedThisVisit) { recordBreak(); breakCountedThisVisit = true; }
      }
      if (source === 'picker') {
        data.picker.started = false;
        var steps = $('time-picker-started');
        if (steps) steps.hidden = true;
      }
      if (answer === 'yes' && source === 'suggest') celebrate(BREAK_CELEBRATION);
      else celebrate();
      var statusId = source === 'suggest' ? 'time-suggest-status' : 'time-picker-status';
      say(statusId, 'Counted. Any attempt counts as success. The goal is participation, not perfection.');
      timeSave();
      renderGoals();
    }
    function surprisePick() {
      data.picker.surpriseCounter += 1;
      var n = data.picker.surpriseCounter;
      if (n % 4 === 3) {
        var seen = {};
        data.picker.recent.forEach(function (id) { seen[id] = 1; });
        data.actions.forEach(function (a) { seen[a.itemId] = 1; });
        var brandNew = ACTIVITIES.filter(function (a) { return !seen[a.id]; });
        if (brandNew.length) return pickFromPool(brandNew, data.picker.recent);
      }
      var favItems = data.favorites.map(function (id) { return ACT_BY_ID[id]; }).filter(Boolean);
      favItems = cleanPool(favItems);
      if (favItems.length) {
        var freshFavs = favItems.filter(function (a) { return data.picker.recent.slice(-5).indexOf(a.id) === -1; });
        var usableFavs = freshFavs.length ? freshFavs : (favItems.length <= 2 ? favItems : freshFavs);
        if (usableFavs.length) {
          var fav = usableFavs[n % usableFavs.length];
          data.picker.recent.push(fav.id);
          return indoorSwapFor(fav);
        }
      }
      var interests = Object.keys(data.categoryCounts);
      var energy = data.suggest.energy;
      var weighted = ACTIVITIES.filter(function (a) {
        return (energy && a.energy === energy) || interests.indexOf(a.category) !== -1;
      });
      return pickFromPool(weighted.length ? weighted : ACTIVITIES, data.picker.recent);
    }
    function pickerPick() {
      var mode = data.picker.mode || 'any';
      var item = null;
      if (mode === 'category') {
        var cat = data.picker.category;
        if (!cat) { say('time-picker-status', 'Pick a kind first, just above. Then tap Pick an Activity.'); return null; }
        var pool = cat === 'low' ? poolForEnergy('low') : ACTIVITIES.filter(function (a) { return a.category === cat; });
        item = pickFromPool(pool, data.picker.recent);
      } else if (mode === 'surprise') {
        item = surprisePick();
      } else {
        if (data.picker.counter > 0 && data.picker.counter % 5 === 4) {
          var seasonal = seasonalFor(new Date());
          if (seasonal && data.dislikes.indexOf(seasonal.id) === -1 && data.picker.recent.slice(-5).indexOf(seasonal.id) === -1) {
            data.picker.counter += 1;
            data.picker.recent.push(seasonal.id);
            item = indoorSwapFor(seasonal);
          }
        }
        if (!item) item = pickFromPool(ACTIVITIES, data.picker.recent);
      }
      if (item) {
        if (contextFlags() && item.outdoor) say('time-picker-status', 'Your note for today talks about wet or cold weather, so here is an indoor idea instead.');
        renderPickerCard(item);
      }
      timeSave();
      return item;
    }
    function renderPickerCard(item) {
      currentPicker = item;
      data.picker.currentId = item ? item.id : '';
      data.picker.started = false;
      var card = $('time-picker-card');
      if (!item) { if (card) card.hidden = true; return; }
      say('time-picker-name', item.name);
      say('time-picker-desc', item.desc);
      say('time-picker-time', 'About 5 minutes');
      say('time-picker-benefits', item.benefits.join(' · '));
      say('time-picker-category', item.category);
      var started = $('time-picker-started');
      if (started) started.hidden = true;
      var steps = $('time-picker-steps');
      if (steps) steps.innerHTML = item.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      if (card) card.hidden = false;
      timeSave();
    }
    function renderFavorites() {
      var list = $('time-favorites-list');
      if (!list) return;
      list.innerHTML = data.favorites.length
        ? data.favorites.map(function (id) {
            var a = ACT_BY_ID[id];
            return a ? '<li>' + esc(a.name) + '</li>' : '';
          }).join('')
        : '<li>No favourites yet. Tap Favorite on an activity you like.</li>';
    }
    function renderPickerControls() {
      var modes = document.querySelectorAll('[data-time-pick-mode]');
      for (var i = 0; i < modes.length; i++) {
        var on = modes[i].getAttribute('data-time-pick-mode') === data.picker.mode;
        modes[i].classList.toggle('selected', on);
        modes[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      var row = $('time-pick-cat-row');
      if (row) row.hidden = data.picker.mode !== 'category';
      var cats = document.querySelectorAll('[data-time-pick-cat]');
      for (var j = 0; j < cats.length; j++) {
        var con = cats[j].getAttribute('data-time-pick-cat') === data.picker.category;
        cats[j].classList.toggle('selected', con);
        cats[j].setAttribute('aria-pressed', con ? 'true' : 'false');
      }
      renderFavorites();
    }

    /* ---------- Bindings + init ---------- */
    function bindTime() {
      if ($('time-reminder-toggle')) $('time-reminder-toggle').addEventListener('change', function () { setReminderEnabled(this.checked); });
      if ($('time-grown-reminder-toggle')) $('time-grown-reminder-toggle').addEventListener('change', function () { setReminderEnabled(this.checked); });
      var chips = document.querySelectorAll('[data-time-interval]');
      for (var i = 0; i < chips.length; i++) chips[i].addEventListener('click', function () { setReminderInterval(Number(this.getAttribute('data-time-interval'))); });
      var gchips = document.querySelectorAll('[data-time-grown-interval]');
      for (var j = 0; j < gchips.length; j++) gchips[j].addEventListener('click', function () { setReminderInterval(Number(this.getAttribute('data-time-grown-interval'))); });

      if ($('time-reminder-break')) $('time-reminder-break').addEventListener('click', function () {
        hideReminderCard();
        if (!breakCountedThisVisit) { recordBreak(); breakCountedThisVisit = true; }
        renderSummaries();
        say('time-suggest-status', 'Good. Pick your energy just below, and Rootling will show one idea.');
        var anchor = $('time-energy-group') || $('time-view');
        if (anchor) { try { anchor.scrollIntoView({ block: 'nearest' }); } catch (e) { /* fine */ } }
      });
      if ($('time-reminder-later')) $('time-reminder-later').addEventListener('click', function () {
        hideReminderCard();
        data.nextReminderAt = data.lifetimeSec + data.reminder.intervalMin * 60;
        timeSave();
      });
      if ($('time-reminder-continue')) $('time-reminder-continue').addEventListener('click', function () {
        hideReminderCard();
        data.nextReminderAt = data.lifetimeSec + 15 * 60;
        timeSave();
      });
      if ($('time-reminder-dismiss')) $('time-reminder-dismiss').addEventListener('click', function () {
        hideReminderCard();
        data.reminder.dismissedDate = dayKey();
        timeSave();
      });

      var echips = document.querySelectorAll('[data-time-energy]');
      for (var e = 0; e < echips.length; e++) echips[e].addEventListener('click', function () {
        var energy = this.getAttribute('data-time-energy');
        data.suggest.energy = energy;
        noteEnergyPick(energy);
        var all = document.querySelectorAll('[data-time-energy]');
        for (var x = 0; x < all.length; x++) {
          var on = all[x].getAttribute('data-time-energy') === energy;
          all[x].classList.toggle('selected', on);
          all[x].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        timeSave();
        suggestForEnergy(energy, false);
        say('time-suggest-status', 'Here is one idea for your energy right now. The goal is progress, not perfection. Always praise effort rather than results.');
      });
      if ($('time-suggest-another')) $('time-suggest-another').addEventListener('click', function () {
        if (!data.suggest.energy) { say('time-suggest-status', 'Pick your energy first. Then Rootling will show one idea.'); return; }
        suggestForEnergy(data.suggest.energy, true);
      });
      if ($('time-suggest-done')) $('time-suggest-done').addEventListener('click', function () {
        if (!currentSuggest) { say('time-suggest-status', 'Pick your energy first. Then Rootling will show one idea.'); return; }
        openCheck('suggest', currentSuggest);
      });
      if ($('time-suggest-grounding')) $('time-suggest-grounding').addEventListener('click', function () {
        var card = $('grounding-card');
        if (card) {
          card.hidden = false;
          try { card.scrollIntoView({ block: 'nearest' }); } catch (e) { /* fine */ }
        }
      });
      if ($('time-hard-link')) $('time-hard-link').addEventListener('click', function () {
        var panel = $('time-low-panel');
        if (panel) panel.hidden = false;
        say('time-low-status', 'Here are tiny steps. Pick one, or none. Even completing one low-energy activity counts as a success.');
      });

      var gch = document.querySelectorAll('[data-time-goal]');
      for (var g = 0; g < gch.length; g++) gch[g].addEventListener('click', function () {
        var id = this.getAttribute('data-time-goal');
        var at = data.goals.indexOf(id);
        if (at === -1) data.goals.push(id); else data.goals.splice(at, 1);
        timeSave();
        renderGoals();
      });
      var dch = document.querySelectorAll('[data-time-chal-duration]');
      for (var d = 0; d < dch.length; d++) dch[d].addEventListener('click', function () {
        var v = this.getAttribute('data-time-chal-duration');
        data.challengePick.duration = data.challengePick.duration === v ? '' : v;
        timeSave();
        renderChallenges();
      });
      var fch = document.querySelectorAll('[data-time-chal-diff]');
      for (var f = 0; f < fch.length; f++) fch[f].addEventListener('click', function () {
        var v = this.getAttribute('data-time-chal-diff');
        data.challengePick.diff = data.challengePick.diff === v ? '' : v;
        timeSave();
        renderChallenges();
      });

      if ($('time-context-save')) $('time-context-save').addEventListener('click', function () {
        var input = $('time-context-input');
        data.contextNote = input ? input.value.trim() : '';
        timeSave();
        say('time-context-status', contextFlags()
          ? 'Saved. Your note talks about wet or cold weather, so outdoor ideas will swap to indoor ones.'
          : 'Saved. Rootling will use your own words about today, and nothing else, to shape ideas.');
      });

      var modes = document.querySelectorAll('[data-time-pick-mode]');
      for (var m = 0; m < modes.length; m++) modes[m].addEventListener('click', function () {
        data.picker.mode = this.getAttribute('data-time-pick-mode');
        timeSave();
        renderPickerControls();
      });
      var cats = document.querySelectorAll('[data-time-pick-cat]');
      for (var c = 0; c < cats.length; c++) cats[c].addEventListener('click', function () {
        data.picker.category = this.getAttribute('data-time-pick-cat');
        timeSave();
        renderPickerControls();
      });
      if ($('time-pick-btn')) $('time-pick-btn').addEventListener('click', function () { pickerPick(); });
      if ($('time-picker-another')) $('time-picker-another').addEventListener('click', function () { pickerPick(); });
      if ($('time-picker-start')) $('time-picker-start').addEventListener('click', function () {
        if (!currentPicker) return;
        data.picker.started = true;
        var started = $('time-picker-started');
        if (started) started.hidden = false;
        timeSave();
        say('time-picker-status', 'Started. Do the steps at your own pace. Tap Done when you stop, in any place.');
      });
      if ($('time-picker-done')) $('time-picker-done').addEventListener('click', function () {
        if (!currentPicker) return;
        openCheck('picker', currentPicker);
      });
      if ($('time-picker-fav')) $('time-picker-fav').addEventListener('click', function () {
        if (!currentPicker) return;
        if (data.favorites.indexOf(currentPicker.id) === -1) {
          data.favorites.push(currentPicker.id);
          upsertPref('favorite-activity:' + currentPicker.id, 'You tapped Favorite on this activity');
          timeSave();
        }
        renderFavorites();
        say('time-picker-status', 'Saved as a favourite. It is in your favourites list below.');
      });
      if ($('time-picker-notforme')) $('time-picker-notforme').addEventListener('click', function () {
        if (!currentPicker) return;
        var id = currentPicker.id;
        if (data.dislikes.indexOf(id) === -1) data.dislikes.push(id);
        data.favorites = data.favorites.filter(function (x) { return x !== id; });
        upsertPref('not-for-me:' + id, 'You tapped Not for me on this activity');
        timeSave();
        renderFavorites();
        say('time-picker-status', 'Okay. Rootling will not show that one again. Here is another idea.');
        pickerPick();
      });
      var answers = document.querySelectorAll('[data-time-complete]');
      for (var a = 0; a < answers.length; a++) answers[a].addEventListener('click', function () {
        answerCheck(this.getAttribute('data-time-complete'));
      });

      document.addEventListener('visibilitychange', function () {
        if (isVisible()) { lastTickMs = Date.now(); renderSummaries(); checkReminder(); }
        else tickNow();
      });
      document.addEventListener('click', function () {
        setTimeout(function () { renderSummaries(); renderNourished(); renderGoals(); }, 90);
      });
      setInterval(tickNow, 30000);
      setInterval(checkReminder, 5000);
    }
    function initTime() {
      if (!$('time-view')) return;
      closeStaleSession();
      lastTickMs = Date.now();
      bindTime();
      if ($('time-context-input')) $('time-context-input').value = data.contextNote || '';
      if (data.suggest.energy) {
        var all = document.querySelectorAll('[data-time-energy]');
        for (var x = 0; x < all.length; x++) {
          var on = all[x].getAttribute('data-time-energy') === data.suggest.energy;
          all[x].classList.toggle('selected', on);
          all[x].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        if (data.suggest.currentId && ACT_BY_ID[data.suggest.currentId]) showSuggest(ACT_BY_ID[data.suggest.currentId]);
      }
      if (data.picker.currentId && ACT_BY_ID[data.picker.currentId]) renderPickerCard(ACT_BY_ID[data.picker.currentId]);
      renderSummaries();
      renderReminderSettings();
      renderLowPanel();
      renderChallenges();
      renderGoals();
      renderNourished();
      renderStickers();
      renderPickerControls();
      checkReminder();
    }

    if (typeof window !== 'undefined') {
      window.RootlingActivities = {
        all: ACTIVITIES,
        categories: CATEGORIES,
        lowEnergy: LOW_ENERGY,
        LOW_SUCCESS_LINE: LOW_SUCCESS_LINE,
        suggest: function (energy) {
          if (energy) return pickFromPool(poolForEnergy(energy), suggestRecent);
          return pickFromPool(ACTIVITIES, suggestRecent);
        },
        seasonal: seasonalFor,
        indoorSwapFor: indoorSwapFor
      };
      window.RootlingTime = {
        key: TIME_KEY,
        getData: function () { return data; },
        reload: function () { data = timeLoad(); return data; },
        accrueSeconds: accrueSeconds,
        tickNow: tickNow,
        checkReminder: checkReminder,
        pickActivity: pickerPick,
        ACTIVITIES: ACTIVITIES,
        LOW_ENERGY: LOW_ENERGY,
        STICKERS: STICKERS,
        CHALLENGES: CHALLENGES,
        EFFORT_LINES: EFFORT_LINES,
        BREAK_CELEBRATION: BREAK_CELEBRATION,
        indoorSwapFor: indoorSwapFor
      };
      window.RootlingPicker = {
        pick: pickerPick,
        getCurrent: function () { return currentPicker; }
      };
      if (window.SproutApp) window.SproutApp.TIME_KEY = TIME_KEY;
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTime);
      else initTime();
    }
  })();


  /* ==== Memory Book module (Memory & Personalization worker) ====
   * Keepsakes, your memories, gentle notes, and about-you words.
   * Own store: rootling-memorybook-v1, on this device only. Nothing
   * here reads or writes anything while memory consent is off. Notes
   * are shown only when a real count in the user's own book backs
   * them up, and each one says where it comes from. Forgetting is
   * always the user's tap. Other stores are read with care and are
   * only written where this book's brief says so: a pick you change
   * here is saved back to the pick list it came from, and a finished
   * pin is cleared only when its shape is sure. */
  (function () {
    var MB_KEY = 'rootling-memorybook-v1';
    var CONSENT_KEY = 'rootling-consent-v1';
    var EXEC_KEY = 'rootling-exec-v1';
    var WELL_KEY = 'rootling-well-v1';
    var TIME_KEY = 'rootling-time-v1';
    var SOCIAL_KEY = 'rootling-social-v1';
    var IMPORTANCE_WORDS = { 5: 'Very important to remember', 4: 'Important', 3: 'In the middle', 2: 'Small', 1: 'Tiny' };
    var ABOUT_WHY = {
      name: 'So your pet can use the name you like.',
      pronouns: 'So your pet can use your words for you.',
      interest: 'So your pet can pick things you like.',
      reward: 'So your pet knows what cheers you up.'
    };
    var ABOUT_LABEL = {
      name: 'Name you like to be called',
      pronouns: 'Pronouns',
      interest: 'A thing you like doing',
      reward: 'What cheers you up'
    };
    var BUNDLES = {
      Friendly: { celebration: 'full', promptVariety: null, petEnergy: 'gentle' },
      Cheerful: { celebration: 'full', promptVariety: 'varied', petEnergy: 'lively' },
      Calm: { celebration: 'quiet', promptVariety: 'fixed', petEnergy: 'still' },
      Professional: { celebration: 'quiet', promptVariety: 'fixed', petEnergy: 'gentle' },
      Motivational: { celebration: 'full', promptVariety: 'varied', petEnergy: 'gentle' },
      Playful: { celebration: 'full', promptVariety: 'varied', petEnergy: 'lively' }
    };
    var CATEGORY_WORDS = {
      'Nature': 'being outside', 'Physical': 'moving your body', 'Movement': 'moving your body',
      'Social': 'time with people', 'Creative': 'making things', 'Learning': 'learning new things',
      'Mental Wellness': 'quiet calm time', 'Productivity': 'getting small jobs done',
      'Self-Care': 'caring for yourself'
    };

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }
    function dayKey(d) {
      d = d || new Date();
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function dateOf(v) {
      if (typeof v === 'string') { var m = v.match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; }
      if (typeof v === 'number' && isFinite(v)) { var d = new Date(v); return isNaN(d.getTime()) ? '' : dayKey(d); }
      return '';
    }
    function ageDays(dateStr) {
      if (!dateStr) return null;
      var p = String(dateStr).split('-');
      if (p.length !== 3) return null;
      var then = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      var t = dayKey().split('-');
      var now = Date.UTC(Number(t[0]), Number(t[1]) - 1, Number(t[2]));
      return Math.floor((now - then) / 86400000);
    }
    function impOf(v, fallback) {
      var n = Number(v);
      return (n >= 1 && n <= 5 && Math.floor(n) === n) ? n : fallback;
    }
    var uidN = 0;
    function uid(prefix) { uidN += 1; return prefix + '-' + Date.now().toString(36) + '-' + uidN + '-' + Math.floor(Math.random() * 100000); }
    function say(id, text) { var el = $(id); if (el) el.textContent = text; }
    function scrollToEl(el) { if (el && el.scrollIntoView) { try { el.scrollIntoView(); } catch (e) { /* fine */ } } }

    /* ---------- own store ---------- */
    function mbDefaults() { return { version: 1, personality: 'Friendly', about: [], keepsakes: [], kept: [], index: [] }; }
    function mbLoad() {
      var base = mbDefaults();
      try {
        var raw = localStorage.getItem(MB_KEY);
        if (!raw) return base;
        var s = JSON.parse(raw);
        if (!s || typeof s !== 'object') return base;
        for (var k in base) { if (s[k] === undefined) s[k] = base[k]; }
        if (!Array.isArray(s.about)) s.about = [];
        if (!Array.isArray(s.keepsakes)) s.keepsakes = [];
        if (!Array.isArray(s.kept)) s.kept = [];
        if (!Array.isArray(s.index)) s.index = [];
        return s;
      } catch (e) { return base; }
    }
    function mbSave(s) { try { localStorage.setItem(MB_KEY, JSON.stringify(s)); } catch (e) { /* storage can be off; the visit still works */ } }
    function addIndex(s, type, ref) {
      s.index.push({ d: dayKey(), t: type, ref: ref });
    }
    function readStore(key) {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        var v = JSON.parse(raw);
        return (v && typeof v === 'object') ? v : null;
      } catch (e) { return null; }
    }
    function writeStore(key, obj) {
      try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
    }
    function consentOn() {
      var rec = readStore(CONSENT_KEY);
      return !!(rec && rec.memoryConsent === true);
    }
    function petState() {
      try {
        var api = (typeof window !== 'undefined' && (window.RootlingApp || window.SproutApp)) || null;
        return api && typeof api.getState === 'function' ? api.getState() : null;
      } catch (e) { return null; }
    }
    function petName() {
      var st = petState();
      return (st && st.petName) ? String(st.petName) : 'Rootling';
    }

    /* ---------- other stores, read with care ---------- */
    function prefWhatWords(what) {
      var w = String(what === null || what === undefined ? '' : what);
      var i = w.indexOf(':');
      if (i === -1) return w;
      var head = w.slice(0, i), tail = w.slice(i + 1).replace(/-/g, ' ');
      var labels = { 'interest': 'Interest', 'favorite-activity': 'Favorite activity', 'time': 'Time you pick often', 'energy': 'Energy you pick often', 'not-for-me': 'Not for me', 'preference': '' };
      if (Object.prototype.hasOwnProperty.call(labels, head)) return labels[head] ? (labels[head] + ': ' + tail) : tail;
      return w;
    }
    function focusEntries(exec) {
      if (!exec) return [];
      var lists = [exec.focusHistory, exec.focusSessions, exec.sessions, exec.focusLog];
      for (var i = 0; i < lists.length; i++) { if (Array.isArray(lists[i])) return lists[i]; }
      return [];
    }
    function focusCount(exec) {
      if (!exec) return 0;
      var list = focusEntries(exec);
      if (list.length) return list.length;
      if (typeof exec.focusSessions === 'number') return exec.focusSessions;
      if (typeof exec.focusCount === 'number') return exec.focusCount;
      if (typeof exec.focusDone === 'number') return exec.focusDone;
      if (typeof exec.completedFocus === 'number') return exec.completedFocus;
      return 0;
    }
    function entryHour(e) {
      if (!e || typeof e !== 'object') return null;
      if (typeof e.hour === 'number') return e.hour;
      var stamps = [e.startedAt, e.ts, e.timestamp, e.at];
      for (var i = 0; i < stamps.length; i++) {
        if (typeof stamps[i] === 'number' && isFinite(stamps[i])) { var d = new Date(stamps[i]); if (!isNaN(d.getTime())) return d.getHours(); }
        if (typeof stamps[i] === 'string' && stamps[i]) { var dd = new Date(stamps[i]); if (!isNaN(dd.getTime())) return dd.getHours(); }
      }
      if (typeof e.time === 'string') { var p = e.time.split(':'); var h = Number(p[0]); if (p.length === 2 && !isNaN(h)) return h; }
      if (typeof e.date === 'string' && typeof e.hour === 'undefined') return null;
      return null;
    }
    function entryDate(e) {
      if (!e || typeof e !== 'object') return '';
      return dateOf(e.date) || dateOf(e.day) || dateOf(e.startedAt) || dateOf(e.ts) || dateOf(e.timestamp) || '';
    }
    function partOfDay(hour) {
      if (hour === null || hour === undefined || isNaN(hour)) return '';
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      if (hour >= 17 && hour < 21) return 'evening';
      return 'night';
    }
    function partPhrase(part) {
      return part === 'night' ? 'at night' : ('in the ' + part);
    }
    function routineCompletions(well) {
      /* One list of { name, date } from any shape the well store may
       * hold. Empty when the store keeps no such list — never guessed. */
      var out = [];
      if (!well) return out;
      var lists = [well.routineCompletions, well.completions, well.routineHistory, well.history];
      for (var i = 0; i < lists.length; i++) {
        if (Array.isArray(lists[i])) {
          lists[i].forEach(function (e) {
            if (e && typeof e === 'object') out.push({ name: String(e.name || e.routine || e.title || ''), date: entryDate(e) });
            else if (typeof e === 'string') out.push({ name: e, date: '' });
          });
        }
      }
      if (Array.isArray(well.routines)) {
        well.routines.forEach(function (r) {
          if (!r || typeof r !== 'object') return;
          var n = (typeof r.timesDone === 'number') ? r.timesDone : ((typeof r.completedCount === 'number') ? r.completedCount : ((typeof r.completions === 'number') ? r.completions : 0));
          for (var j = 0; j < n; j++) out.push({ name: String(r.name || ''), date: '' });
          if (Array.isArray(r.completions)) r.completions.forEach(function (e) { out.push({ name: String(r.name || ''), date: entryDate(e) }); });
        });
      }
      return out.filter(function (e) { return !!e.name; });
    }
    function timeActivityCount(time) {
      if (!time) return 0;
      if (typeof time.participation === 'number') return time.participation;
      if (Array.isArray(time.participationLog)) return time.participationLog.length;
      if (Array.isArray(time.actions)) return time.actions.length;
      return 0;
    }

    /* ---------- keepsakes: filed only from real things ---------- */
    function ensureKeepsakes(store) {
      var core = petState();
      var exec = readStore(EXEC_KEY);
      var well = readStore(WELL_KEY);
      var time = readStore(TIME_KEY);
      var social = readStore(SOCIAL_KEY);
      var have = {};
      store.keepsakes.forEach(function (k) { if (k && k.kind) have[k.kind] = true; });
      var changed = false;
      function file(kind, text, date) {
        if (have[kind]) return;
        var item = { id: uid('keep'), kind: kind, text: text, date: date || dayKey(), source: 'auto' };
        store.keepsakes.push(item);
        addIndex(store, 'keepsake', item.id);
        have[kind] = true;
        changed = true;
      }
      var firstDay = '';
      if (core) {
        if (core.createdDate) firstDay = dateOf(core.createdDate);
        if (!firstDay && Array.isArray(core.careDays) && core.careDays.length) firstDay = dateOf(core.careDays[0]);
        if (!firstDay && core.checkins && typeof core.checkins === 'object') {
          var keys = Object.keys(core.checkins).sort();
          if (keys.length) firstDay = dateOf(keys[0]);
        }
      }
      if (firstDay) file('first-day', 'Your first day with ' + petName() + '.', firstDay);
      var fc = focusCount(exec);
      var fEntries = focusEntries(exec);
      [10, 50, 100].forEach(function (n) {
        if (fc >= n) file('focus-' + n, 'You finished ' + n + ' focus times.', entryDate(fEntries[n - 1]) || dayKey());
      });
      var rc = routineCompletions(well);
      if (rc.length >= 1) file('routine-first', 'You finished your first routine.', rc[0].date || dayKey());
      var ac = timeActivityCount(time);
      [25, 100].forEach(function (n) {
        if (ac >= n) file('activities-' + n, 'You did ' + n + ' activities.', dayKey());
      });
      if (social && Array.isArray(social.brave) && social.brave.length >= 1) {
        file('brave-first', 'Your first brave moment.', entryDate(social.brave[0]) || dateOf(social.brave[0] && social.brave[0].day) || dayKey());
      }
      if (changed) mbSave(store);
    }

    /* ---------- gentle notes: real counts only ---------- */
    function computeObservations() {
      var out = [];
      var time = readStore(TIME_KEY);
      var exec = readStore(EXEC_KEY);
      var well = readStore(WELL_KEY);
      var core = petState();
      if (time && time.categoryCounts && typeof time.categoryCounts === 'object') {
        var bestCat = '', bestN = 0;
        for (var cat in time.categoryCounts) {
          if (typeof time.categoryCounts[cat] === 'number' && time.categoryCounts[cat] > bestN) { bestN = time.categoryCounts[cat]; bestCat = cat; }
        }
        if (bestCat && bestN >= 3) {
          var words = CATEGORY_WORDS[bestCat] || String(bestCat).toLowerCase();
          var since = '';
          if (Array.isArray(time.actions)) {
            time.actions.forEach(function (a) { if (a && a.category === bestCat && a.date) { if (!since || a.date < since) since = a.date; } });
          }
          var imp = 3;
          if (Array.isArray(time.prefs)) time.prefs.forEach(function (p) { if (p && p.what === 'interest:' + bestCat) imp = impOf(p.importance, 3); });
          out.push({ line: 'I noticed you enjoy ' + words + '.', source: 'From your book: ' + bestN + ' ' + words + ' activities' + (since ? ' since ' + since : '') + '.', importance: imp });
        }
      }
      var fEntries = focusEntries(exec);
      var timed = [];
      fEntries.forEach(function (e) { var h = entryHour(e); if (h !== null) timed.push(h); });
      if (timed.length >= 4) {
        var buckets = {};
        timed.forEach(function (h) { var p = partOfDay(h); if (p) buckets[p] = (buckets[p] || 0) + 1; });
        var topPart = '', topN = 0;
        for (var bp in buckets) { if (buckets[bp] > topN) { topN = buckets[bp]; topPart = bp; } }
        if (topPart && topN * 2 > timed.length) {
          out.push({ line: 'You often do focus time ' + partPhrase(topPart) + '.', source: 'From your book: ' + topN + ' focus times ' + partPhrase(topPart) + '.', importance: 3 });
        }
      }
      var rc = routineCompletions(well);
      if (rc.length >= 3) {
        var byName = {};
        rc.forEach(function (e) { byName[e.name] = (byName[e.name] || 0) + 1; });
        var topName = '', topRN = 0;
        for (var nm in byName) { if (byName[nm] > topRN) { topRN = byName[nm]; topName = nm; } }
        if (topName && topRN >= 3) {
          out.push({ line: 'I noticed you often finish the ' + topName + ' routine.', source: 'From your book: you finished the ' + topName + ' routine ' + topRN + ' times.', importance: 3 });
        }
      }
      if (core && Array.isArray(core.careDays) && core.careDays.length >= 5 && core.learning && core.learning.signals && core.learning.signals.byHour) {
        var byHour = core.learning.signals.byHour;
        var totalH = 0, cBuckets = {};
        for (var hk in byHour) {
          var cnt = byHour[hk] && typeof byHour[hk].done === 'number' ? byHour[hk].done : 0;
          totalH += cnt;
          var pp = partOfDay(Number(hk));
          if (pp && cnt) cBuckets[pp] = (cBuckets[pp] || 0) + cnt;
        }
        if (totalH >= 5) {
          var cTop = '', cN = 0;
          for (var cp in cBuckets) { if (cBuckets[cp] > cN) { cN = cBuckets[cp]; cTop = cp; } }
          if (cTop && cN * 2 > totalH) {
            out.push({ line: 'You often check in ' + partPhrase(cTop) + '.', source: 'From your book: ' + cN + ' check-ins ' + partPhrase(cTop) + '.', importance: 3 });
          }
        }
      }
      out.sort(function (a, b) { return b.importance - a.importance; });
      return out;
    }

    /* ---------- dashboard rows ---------- */
    var rowMap = {};
    var editingKey = null;
    var pendingKey = null;
    var shownSources = {};

    function scopeOf(item) {
      if (!item || typeof item !== 'object') return '';
      return String(item.scope || item.group || item.bucket || '');
    }
    function isFaded(row) {
      if (!/now/i.test(row.scope || '')) return false;
      var age = ageDays(row.updated);
      return age !== null && age > 30;
    }
    function collectRows(store) {
      rowMap = {};
      var rows = { now: [], kept: [], noticed: [], tidy: [] };
      var today = dayKey();
      function add(group, row) {
        rowMap[row.key] = row;
        rows[group].push(row);
        var age = ageDays(row.updated);
        if ((row.source === 'about' || row.source === 'pref') && age !== null && age > 180) {
          var trow = { key: 'tidy:' + row.key, what: row.what, why: row.why, updated: row.updated, importance: row.importance, source: row.source, refId: row.refId, baseKey: row.key, scope: row.scope };
          rowMap[trow.key] = trow;
          rows.tidy.push(trow);
        }
      }
      function place(row) {
        if (/now/i.test(row.scope || '')) add('now', row);
        else if (/later/i.test(row.scope || '')) add('kept', row);
        else if (row.updated && row.updated === today) add('now', row);
        else add('kept', row);
      }
      store.about.forEach(function (item) {
        if (!item || typeof item !== 'object' || !item.text) return;
        var kind = ABOUT_WHY[item.kind] ? item.kind : 'interest';
        place({
          key: 'about:' + item.id, source: 'about', refId: item.id,
          what: (ABOUT_LABEL[kind] || 'A thing about you') + ': ' + item.text,
          rawText: item.text, why: item.why || ABOUT_WHY[kind],
          updated: dateOf(item.updated), importance: impOf(item.importance, 4), scope: scopeOf(item)
        });
      });
      store.kept.forEach(function (item) {
        if (!item || typeof item !== 'object' || !item.text) return;
        place({
          key: 'kept:' + item.id, source: 'kept', refId: item.id,
          what: item.text, rawText: item.text, why: item.why || 'You tapped Keep on this one.',
          updated: dateOf(item.updated), importance: impOf(item.importance, 3), scope: scopeOf(item)
        });
      });
      var exec = readStore(EXEC_KEY);
      if (exec && typeof exec.priority === 'string' && exec.priority.trim()) {
        add('now', {
          key: 'priority:pin', source: 'priority', refId: '',
          what: exec.priority.trim(), rawText: exec.priority.trim(), why: 'You pinned this',
          updated: '', importance: 3, scope: 'now'
        });
      }
      store.keepsakes.forEach(function (k) {
        if (k && dateOf(k.date) === today) {
          add('now', {
            key: 'todaykeep:' + k.id, source: 'keepsake', refId: k.id,
            what: k.text, rawText: k.text, why: 'A keepsake from today.',
            updated: dateOf(k.date), importance: 3, scope: ''
          });
        }
      });
      var keptRefs = {};
      store.kept.forEach(function (item) { if (item && item.ref) keptRefs[item.ref] = true; });
      var time = readStore(TIME_KEY);
      if (time && Array.isArray(time.prefs)) {
        time.prefs.forEach(function (p, idx) {
          if (!p || typeof p !== 'object' || typeof p.what !== 'string' || !p.what) return;
          var ref = 'pref:' + p.what;
          if (keptRefs[ref]) return;
          add('noticed', {
            key: 'pref:' + idx + ':' + p.what, source: 'pref', refId: p.what, ref: ref,
            what: prefWhatWords(p.what), rawText: p.what,
            why: (typeof p.why === 'string' && p.why) ? p.why : 'Your pet noticed this from what you picked.',
            updated: dateOf(p.updated), importance: impOf(p.importance, 3), scope: ''
          });
        });
      }
      var core = petState();
      if (core && core.learning && Array.isArray(core.learning.log)) {
        core.learning.log.forEach(function (entry, idx) {
          if (!entry || typeof entry.text !== 'string' || !entry.text) return;
          var ref = 'fact:' + entry.text;
          if (keptRefs[ref]) return;
          add('noticed', {
            key: 'fact:' + idx, source: 'fact', refId: entry.text, ref: ref,
            what: entry.text, rawText: entry.text, why: 'Your pet noticed this from your check-ins',
            updated: dateOf(entry.date), importance: 3, scope: ''
          });
        });
      }
      /* Reads go through the date index: rows are ordered by the
       * newest index date for their day first, then by their own
       * updated date. The index is append-only, so this stays a
       * quick sort even with many entries. */
      var byUpdatedDesc = function (a, b) { return (b.updated || '') < (a.updated || '') ? -1 : ((b.updated || '') > (a.updated || '') ? 1 : 0); };
      rows.now.sort(byUpdatedDesc); rows.kept.sort(byUpdatedDesc); rows.noticed.sort(byUpdatedDesc);
      return rows;
    }

    function importanceLine(row) { return 'How much it matters: ' + IMPORTANCE_WORDS[row.importance || 3]; }
    function rowButtons(row) {
      var h = '';
      if (row.source === 'priority') {
        h += ' <button type="button" class="btn btn-soft" data-mb-priority-done="1">Done — I did it</button>';
        return h;
      }
      if (row.source === 'keepsake') return h;
      if (row.source === 'fact') {
        h += ' <button type="button" class="btn btn-soft" data-mb-keep="' + esc(row.key) + '">Keep</button>';
        h += ' <button type="button" class="btn btn-ghost" data-mb-forget-learned="1">Forget in What your companion has learned</button>';
        return h;
      }
      if (row.source === 'pref') {
        h += ' <button type="button" class="btn btn-soft" data-mb-keep="' + esc(row.key) + '">Keep</button>';
      }
      if (row.source === 'about' || row.source === 'kept' || row.source === 'pref') {
        h += ' <button type="button" class="btn btn-soft" data-mb-edit="' + esc(row.key) + '">Edit</button>';
        h += ' <button type="button" class="btn btn-ghost" data-mb-del="' + esc(row.key) + '">' + (row.source === 'pref' ? 'Forget' : 'Delete') + '</button>';
      }
      return h;
    }
    function renderRow(row) {
      var h = '<li data-mb-row="' + esc(row.key) + '">';
      h += '<span class="q">' + esc(row.what) + '</span><br>';
      h += 'Why: ' + esc(row.why) + '<br>';
      h += 'Updated: ' + (row.updated ? esc(row.updated) : '—') + '<br>';
      h += esc(importanceLine(row));
      if (isFaded(row)) {
        h += '<div data-mb-fade="1"><p class="q">This was a \'right now\' memory from ' + esc(row.updated) + '. It fades after 30 days unless you keep it.</p>';
        h += '<button type="button" class="btn btn-soft" data-mb-fade-keep="' + esc(row.key) + '">Keep for later</button> ';
        h += '<button type="button" class="btn btn-ghost" data-mb-fade-forget="' + esc(row.key) + '">Forget it</button></div>';
      }
      h += rowButtons(row);
      if (pendingKey === row.key) {
        h += '<div><p class="q">Delete this one? This cannot be undone.</p>';
        h += '<button type="button" class="btn btn-soft" data-mb-del-yes="' + esc(row.key) + '">Yes, delete it</button> ';
        h += '<button type="button" class="btn btn-ghost" data-mb-del-no="1">Keep it</button></div>';
      }
      if (editingKey === row.key) {
        h += '<div><label>Your words <input type="text" class="voice-target" data-mb-edit-text value="' + esc(row.source === 'pref' ? row.what : (row.rawText || '')) + '" maxlength="300"></label>';
        h += '<label>How much it matters <select data-mb-edit-importance>';
        [5, 4, 3, 2, 1].forEach(function (n) {
          h += '<option value="' + n + '"' + (row.importance === n ? ' selected' : '') + '>' + IMPORTANCE_WORDS[n] + '</option>';
        });
        h += '</select></label>';
        h += '<button type="button" class="btn btn-soft" data-mb-edit-save="' + esc(row.key) + '">Save</button> ';
        h += '<button type="button" class="btn btn-ghost" data-mb-edit-cancel="1">Cancel</button></div>';
      }
      h += '</li>';
      return h;
    }
    function renderTidyRow(row) {
      var h = '<li data-mb-row="' + esc(row.key) + '">';
      h += '<span class="q">' + esc(row.what) + '</span><br>';
      h += 'Updated: ' + (row.updated ? esc(row.updated) : '—') + '<br>';
      h += '<button type="button" class="btn btn-soft" data-mb-tidy-keep="' + esc(row.key) + '">Keep</button> ';
      h += '<button type="button" class="btn btn-ghost" data-mb-tidy-forget="' + esc(row.key) + '">Forget</button>';
      h += '</li>';
      return h;
    }

    /* ---------- render ---------- */
    function renderMemory() {
      var section = $('memory-book');
      if (!section) return;
      var store = mbLoad();
      var sel = $('personality-select');
      if (sel && BUNDLES[store.personality]) sel.value = store.personality;
      var offPanel = $('memory-off-panel'), onPanel = $('memory-on-panel');
      if (!consentOn()) {
        if (offPanel) offPanel.hidden = false;
        if (onPanel) onPanel.hidden = true;
        ['memory-now-list', 'memory-kept-list', 'memory-noticed-list', 'memory-tidy-list', 'memory-obs-list', 'memory-keepsakes-list', 'memory-about-list'].forEach(function (id) {
          var el = $(id); if (el) el.innerHTML = '';
        });
        return;
      }
      if (offPanel) offPanel.hidden = true;
      if (onPanel) onPanel.hidden = false;
      ensureKeepsakes(store);
      store = mbLoad();
      var nameItem = null;
      store.about.forEach(function (item) { if (item && item.kind === 'name' && item.text) nameItem = item; });
      var heading = $('memory-book-heading');
      if (heading) heading.textContent = nameItem ? (nameItem.text + "'s Memory Book") : 'Memory Book';
      var rows = collectRows(store);
      var renderList = function (listId, emptyId, list, tidyStyle) {
        var el = $(listId); if (!el) return;
        el.innerHTML = list.map(tidyStyle ? renderTidyRow : renderRow).join('');
        var empty = $(emptyId); if (empty) empty.hidden = list.length > 0;
      };
      renderList('memory-now-list', 'memory-now-empty', rows.now, false);
      renderList('memory-kept-list', 'memory-kept-empty', rows.kept, false);
      renderList('memory-noticed-list', 'memory-noticed-empty', rows.noticed, false);
      var tidyWrap = $('memory-tidy-wrap');
      if (tidyWrap) tidyWrap.hidden = rows.tidy.length === 0;
      renderList('memory-tidy-list', null, rows.tidy, true);
      var obs = computeObservations();
      var obsList = $('memory-obs-list');
      if (obsList) {
        obsList.innerHTML = obs.map(function (o, i) {
          var h = '<li><span class="q">' + esc(o.line) + '</span> ';
          h += '<button type="button" class="btn btn-ghost" data-mb-obs-src="' + i + '">See where this comes from</button>';
          if (shownSources[i]) h += '<br><span data-mb-obs-source="1">' + esc(o.source) + '</span>';
          h += '</li>';
          return h;
        }).join('');
      }
      var obsEmpty = $('memory-obs-empty');
      if (obsEmpty) obsEmpty.hidden = obs.length > 0;
      var keeps = store.keepsakes.filter(function (k) { return k && typeof k.text === 'string' && k.text; }).slice();
      keeps.sort(function (a, b) { return (dateOf(b.date) || '') < (dateOf(a.date) || '') ? -1 : ((dateOf(b.date) || '') > (dateOf(a.date) || '') ? 1 : 0); });
      var kList = $('memory-keepsakes-list');
      if (kList) {
        kList.innerHTML = keeps.map(function (k) {
          var h = '<li data-mb-keep-row="' + esc(k.id) + '"><span class="q">' + esc(k.text) + '</span><br>';
          h += (dateOf(k.date) || '—');
          if (k.source === 'user') h += '<br>Your words';
          if (k.note) h += '<br>Your words: ' + esc(k.note);
          h += ' <button type="button" class="btn btn-ghost" data-mb-kdel="' + esc(k.id) + '">Delete</button>';
          if (pendingKey === 'keep:' + k.id) {
            h += '<div><p class="q">Delete this keepsake? This cannot be undone.</p>';
            h += '<button type="button" class="btn btn-soft" data-mb-kdel-yes="' + esc(k.id) + '">Yes, delete it</button> ';
            h += '<button type="button" class="btn btn-ghost" data-mb-del-no="1">Keep it</button></div>';
          }
          h += '</li>';
          return h;
        }).join('');
      }
      var kEmpty = $('memory-keepsakes-empty');
      if (kEmpty) kEmpty.hidden = keeps.length > 0;
      var aList = $('memory-about-list');
      if (aList) {
        aList.innerHTML = store.about.filter(function (item) { return item && item.text; }).map(function (item) {
          return '<li><span class="q">' + esc((ABOUT_LABEL[item.kind] || 'About you') + ': ' + item.text) + '</span><br>Why: ' + esc(item.why || ABOUT_WHY[item.kind] || '') + '<br>Updated: ' + (dateOf(item.updated) || '—') + '</li>';
        }).join('');
      }
    }

    /* ---------- actions ---------- */
    function deleteRow(row) {
      if (!row) return;
      if (row.source === 'about') {
        var s = mbLoad();
        s.about = s.about.filter(function (item) { return item.id !== row.refId; });
        addIndex(s, 'memory', row.refId);
        mbSave(s);
      } else if (row.source === 'kept') {
        var s2 = mbLoad();
        s2.kept = s2.kept.filter(function (item) { return item.id !== row.refId; });
        addIndex(s2, 'memory', row.refId);
        mbSave(s2);
      } else if (row.source === 'pref') {
        var time = readStore(TIME_KEY);
        if (time && Array.isArray(time.prefs)) {
          time.prefs = time.prefs.filter(function (p) { return !(p && p.what === row.refId); });
          writeStore(TIME_KEY, time);
        }
      }
      pendingKey = null;
      say('memory-book-status', 'Deleted. That one is gone.');
      renderMemory();
    }
    function saveEdit(row, li) {
      if (!row || !li) return;
      var textEl = li.querySelector('[data-mb-edit-text]');
      var impEl = li.querySelector('[data-mb-edit-importance]');
      var text = textEl ? textEl.value.trim() : '';
      var imp = impEl ? impOf(Number(impEl.value), row.importance) : row.importance;
      if (!text) { say('memory-book-status', 'Write your words first.'); return; }
      if (row.source === 'about') {
        var s = mbLoad();
        s.about.forEach(function (item) { if (item.id === row.refId) { item.text = text; item.importance = imp; item.updated = dayKey(); } });
        addIndex(s, 'memory', row.refId);
        mbSave(s);
      } else if (row.source === 'kept') {
        var s2 = mbLoad();
        s2.kept.forEach(function (item) { if (item.id === row.refId) { item.text = text; item.importance = imp; item.updated = dayKey(); } });
        addIndex(s2, 'memory', row.refId);
        mbSave(s2);
      } else if (row.source === 'pref') {
        var time = readStore(TIME_KEY);
        if (time && Array.isArray(time.prefs)) {
          time.prefs.forEach(function (p) { if (p && p.what === row.refId) { p.what = text; p.importance = imp; p.updated = new Date().toISOString(); } });
          writeStore(TIME_KEY, time);
        }
      }
      editingKey = null;
      say('memory-book-status', 'Saved. Your words are updated.');
      renderMemory();
    }
    function keepRow(row) {
      if (!row) return;
      var s = mbLoad();
      var exists = false;
      s.kept.forEach(function (item) { if (item.ref === row.ref) exists = true; });
      if (!exists) {
        var item = { id: uid('kept'), text: row.rawText || row.what, why: row.why, updated: dayKey(), importance: impOf(row.importance, 3), scope: 'later', ref: row.ref || (row.source + ':' + row.refId) };
        s.kept.push(item);
        addIndex(s, 'memory', item.id);
        mbSave(s);
      }
      say('memory-book-status', 'Kept. It is with your kept memories now.');
      renderMemory();
    }
    function promoteRow(row) {
      if (!row) return;
      if (row.source === 'about') {
        var s = mbLoad();
        s.about.forEach(function (item) { if (item.id === row.refId) { item.scope = 'later'; item.updated = dayKey(); } });
        addIndex(s, 'memory', row.refId);
        mbSave(s);
      } else if (row.source === 'kept') {
        var s2 = mbLoad();
        s2.kept.forEach(function (item) { if (item.id === row.refId) { item.scope = 'later'; item.updated = dayKey(); } });
        addIndex(s2, 'memory', row.refId);
        mbSave(s2);
      }
      say('memory-book-status', 'Kept for later. It will stay until you delete it.');
      renderMemory();
    }
    function tidyKeep(row) {
      if (!row) return;
      var base = rowMap[row.baseKey] || row;
      if (base.source === 'about') {
        var s = mbLoad();
        s.about.forEach(function (item) { if (item.id === base.refId) item.updated = dayKey(); });
        addIndex(s, 'memory', base.refId);
        mbSave(s);
      } else if (base.source === 'pref') {
        var time = readStore(TIME_KEY);
        if (time && Array.isArray(time.prefs)) {
          time.prefs.forEach(function (p) { if (p && p.what === base.refId) p.updated = new Date().toISOString(); });
          writeStore(TIME_KEY, time);
        }
      }
      say('memory-book-status', 'Kept. It stays in your book.');
      renderMemory();
    }
    function addAbout(kind, text) {
      text = String(text || '').trim();
      if (!text) { say('memory-about-status', 'Write your words first. One short line is enough.'); return false; }
      var s = mbLoad();
      if (kind === 'name' || kind === 'pronouns') {
        s.about = s.about.filter(function (item) { return item.kind !== kind; });
      }
      var item = { id: uid('about'), kind: kind, text: text, why: ABOUT_WHY[kind], updated: dayKey(), importance: 4, scope: 'later' };
      s.about.push(item);
      addIndex(s, 'memory', item.id);
      mbSave(s);
      say('memory-about-status', 'Saved. It is in About you, and in your book.');
      renderMemory();
      return true;
    }
    function applyPersonality(name) {
      var bundle = BUNDLES[name];
      if (!bundle) return;
      var s = mbLoad();
      s.personality = name;
      mbSave(s);
      var applied = false;
      try {
        var api = (typeof window !== 'undefined' && window.RootlingApp) || null;
        if (api && typeof api.setToggle === 'function' && typeof api.getState === 'function') {
          var st = api.getState();
          if (st) {
            var ok = true;
            ['celebration', 'promptVariety', 'petEnergy'].forEach(function (axis) {
              var r = api.setToggle(st, axis, bundle[axis]);
              if (r === false) ok = false;
            });
            applied = ok;
          }
        }
      } catch (e) { applied = false; }
      say('personality-status', applied
        ? 'Saved. Your pet now talks in the ' + name + ' way.'
        : 'Saved. The tone will apply when support styles load.');
    }

    function bindMemory() {
      var howBtn = $('memory-how-btn');
      if (howBtn) howBtn.addEventListener('click', function () {
        var toggle = $('learned-toggle');
        var view = $('learned-view');
        if (toggle && view && view.hidden) toggle.click();
        if (view && !view.hidden) scrollToEl(view);
        else {
          var pv = $('privacy-view');
          if (pv) scrollToEl(pv);
          else if (view) scrollToEl(view);
        }
      });
      var section = $('memory-book');
      if (section) section.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var key;
        if (t.getAttribute('data-mb-del')) { pendingKey = t.getAttribute('data-mb-del'); editingKey = null; renderMemory(); return; }
        if (t.getAttribute('data-mb-del-no')) { pendingKey = null; renderMemory(); return; }
        if (t.getAttribute('data-mb-del-yes')) { deleteRow(rowMap[t.getAttribute('data-mb-del-yes')]); return; }
        if (t.getAttribute('data-mb-edit')) { editingKey = t.getAttribute('data-mb-edit'); pendingKey = null; renderMemory(); return; }
        if (t.getAttribute('data-mb-edit-cancel')) { editingKey = null; renderMemory(); return; }
        if (t.getAttribute('data-mb-edit-save')) { key = t.getAttribute('data-mb-edit-save'); saveEdit(rowMap[key], t.closest ? t.closest('li') : null); return; }
        if (t.getAttribute('data-mb-keep')) { keepRow(rowMap[t.getAttribute('data-mb-keep')]); return; }
        if (t.getAttribute('data-mb-fade-keep')) { promoteRow(rowMap[t.getAttribute('data-mb-fade-keep')]); return; }
        if (t.getAttribute('data-mb-fade-forget')) { deleteRow(rowMap[t.getAttribute('data-mb-fade-forget')]); return; }
        if (t.getAttribute('data-mb-tidy-keep')) { tidyKeep(rowMap[t.getAttribute('data-mb-tidy-keep')]); return; }
        if (t.getAttribute('data-mb-tidy-forget')) { var tr = rowMap[t.getAttribute('data-mb-tidy-forget')]; deleteRow(rowMap[tr && tr.baseKey] || tr); return; }
        if (t.getAttribute('data-mb-forget-learned')) {
          var view2 = $('learned-view');
          var toggle2 = $('learned-toggle');
          if (toggle2 && view2 && view2.hidden) toggle2.click();
          scrollToEl(view2 || $('privacy-view'));
          say('memory-book-status', 'Use the Forget buttons in What your companion has learned. They are just above this book.');
          return;
        }
        if (t.getAttribute('data-mb-obs-src')) {
          var idx = Number(t.getAttribute('data-mb-obs-src'));
          shownSources[idx] = !shownSources[idx];
          renderMemory();
          return;
        }
        if (t.getAttribute('data-mb-priority-done')) {
          var exec = readStore(EXEC_KEY);
          var pinText = (exec && typeof exec.priority === 'string') ? exec.priority.trim() : '';
          var s = mbLoad();
          var item = { id: uid('keep'), kind: 'goal-done', text: pinText ? ('You did your one thing: ' + pinText + '.') : 'You did your one thing.', date: dayKey(), source: 'auto' };
          s.keepsakes.push(item);
          addIndex(s, 'keepsake', item.id);
          var cleared = false;
          if (exec && typeof exec.priority === 'string') {
            exec.priority = '';
            cleared = writeStore(EXEC_KEY, exec);
          }
          mbSave(s);
          say('memory-book-status', cleared ? 'Saved as a keepsake. Your pin is cleared.' : 'Saved as a keepsake. Your pin is still up.');
          renderMemory();
          return;
        }
        if (t.getAttribute('data-mb-kdel')) { pendingKey = 'keep:' + t.getAttribute('data-mb-kdel'); renderMemory(); return; }
        if (t.getAttribute('data-mb-kdel-yes')) {
          var kid = t.getAttribute('data-mb-kdel-yes');
          var s2 = mbLoad();
          s2.keepsakes = s2.keepsakes.filter(function (k) { return k.id !== kid; });
          addIndex(s2, 'keepsake', kid);
          mbSave(s2);
          pendingKey = null;
          say('memory-book-status', 'Deleted. That keepsake is gone.');
          renderMemory();
          return;
        }
      });
      var kAdd = $('memory-keepsake-add');
      if (kAdd) kAdd.addEventListener('click', function () {
        if (!consentOn()) return;
        var input = $('memory-keepsake-input');
        var note = $('memory-keepsake-note');
        var text = input ? input.value.trim() : '';
        if (!text) { say('memory-book-status', 'Write one good moment first.'); return; }
        var s = mbLoad();
        var item = { id: uid('keep'), kind: 'user', text: text, note: note ? note.value.trim() : '', date: dayKey(), source: 'user' };
        s.keepsakes.push(item);
        addIndex(s, 'keepsake', item.id);
        mbSave(s);
        if (input) input.value = '';
        if (note) note.value = '';
        say('memory-book-status', 'Saved. Your good moment is in Keepsakes.');
        renderMemory();
      });
      var bindAbout = function (btnId, inputId, kind) {
        var b = $(btnId);
        if (!b) return;
        b.addEventListener('click', function () {
          if (!consentOn()) { say('memory-about-status', 'Memory is off. Turn memory on first, in the learning switch.'); return; }
          var input = $(inputId);
          if (addAbout(kind, input ? input.value : '')) { if (input) input.value = ''; }
        });
      };
      bindAbout('memory-about-name-add', 'memory-about-name-input', 'name');
      bindAbout('memory-about-pronouns-add', 'memory-about-pronouns-input', 'pronouns');
      bindAbout('memory-about-interest-add', 'memory-about-interest-input', 'interest');
      bindAbout('memory-about-reward-add', 'memory-about-reward-input', 'reward');
      var pSel = $('personality-select');
      if (pSel) pSel.addEventListener('change', function () { applyPersonality(this.value); });
      document.addEventListener('click', function () {
        setTimeout(function () {
          if (editingKey || pendingKey) return;
          var ae = document.activeElement;
          var sec = $('memory-book');
          if (ae && sec && sec.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName || '')) return;
          renderMemory();
        }, 90);
      });
    }

    function initMemory() {
      if (!$('memory-book')) return;
      bindMemory();
      renderMemory();
    }

    if (typeof window !== 'undefined') {
      window.RootlingMemory = {
        key: MB_KEY,
        getStore: function () { return mbLoad(); },
        render: renderMemory
      };
      if (window.SproutApp) window.SproutApp.MEMORYBOOK_KEY = MB_KEY;
    }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMemory);
      else initMemory();
    }
  })();

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
