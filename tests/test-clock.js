/* Rootling test clock — shared by the clock-fragile suites (B4).
 *
 * Why this exists: spec-exec and spec-memory built their fixtures from
 * the real wall clock ("a plan 60 minutes from now", "a pick updated
 * today"). Run late at night, those fixtures cross the local day
 * boundary: a plan 150 minutes after 23:50 is 02:20 TOMORROW, but the
 * app (correctly) files plans under today and a 02:20 plan reads as
 * already past; an ISO "updated" stamp is a UTC instant whose UTC date
 * is already tomorrow while the user's local day is still today. The
 * suites then failed on correct app code — identically on the previous
 * release's code, which is how the fragility was proven.
 *
 * What this does: it pins BOTH clocks the suite can see — the Node
 * test process and each jsdom window — to a safe local midday
 * (2026-10-15 12:00 local, mid-month so day offsets never cross a
 * month edge either), then lets that pinned clock advance in real
 * time from the moment of install. Elapsed-time behaviour (focus
 * timers, tick waits) is unchanged; only the calendar is held away
 * from every boundary. Assertions are NOT weakened: "next plan",
 * "next reminder" and "updated today" are still checked in full —
 * they are now checked at a time of day when the fixture means the
 * same thing in every timezone the suite might run in.
 *
 * Usage:
 *   const clock = require('./test-clock');
 *   clock.installNode();            // once, at the top of the suite
 *   clock.installWindow(dom.window); // inside makeDom, before eval
 */
'use strict';

const RealDate = Date;
/* Local noon, mid-month: +/-12h of fixture offsets stay on the same
 * local day in every timezone, and 200-day look-backs stay in-year. */
const FIXED_START = new RealDate(2026, 9, 15, 12, 0, 0, 0).getTime();
const nodeStartReal = RealDate.now();

function installNode() {
  if (global.__rootlingTestClock) return;
  global.__rootlingTestClock = true;
  class TestDate extends RealDate {
    constructor() {
      if (arguments.length === 0) {
        super(FIXED_START + (RealDate.now() - nodeStartReal));
      } else {
        super(...arguments);
      }
    }
    static now() { return FIXED_START + (RealDate.now() - nodeStartReal); }
  }
  global.Date = TestDate;
}

function installWindow(win) {
  if (!win || typeof win.eval !== 'function') return;
  /* The window has its own Date realm, so the subclass is built
   * inside the window from its own RealDate. startFixed is the same
   * pinned noon; the window clock then advances in real time too, so
   * window "now" and Node "now" never drift apart by more than the
   * milliseconds between the two installs. */
  win.eval(
    '(function () {\n' +
    '  if (window.__rootlingTestClock) return;\n' +
    '  window.__rootlingTestClock = true;\n' +
    '  var RealDate = window.Date;\n' +
    '  var startReal = RealDate.now();\n' +
    '  var startFixed = ' + FIXED_START + ';\n' +
    '  function nowMs() { return startFixed + (RealDate.now() - startReal); }\n' +
    '  function TestDate() {\n' +
    '    var args = Array.prototype.slice.call(arguments);\n' +
    '    if (args.length === 0) return new RealDate(nowMs());\n' +
    '    return new (Function.prototype.bind.apply(RealDate, [null].concat(args)))();\n' +
    '  }\n' +
    '  TestDate.now = nowMs;\n' +
    '  TestDate.parse = RealDate.parse;\n' +
    '  TestDate.UTC = RealDate.UTC;\n' +
    '  TestDate.prototype = RealDate.prototype;\n' +
    '  window.Date = TestDate;\n' +
    '})();'
  );
}

module.exports = { installNode, installWindow, FIXED_START };
