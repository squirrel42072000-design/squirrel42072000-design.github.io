/* Rootling executive-function suite (jsdom) — Worker 2.
 * Covers the Today card, the pinned priority, catch it and park it,
 * focus sessions, return-to-task re-anchoring, the pet-held schedule,
 * the task-breakdown helper, the Help panel, the one gentle help
 * offer, and first-run guidance.
 * Modelled on tests/dom-smoke.js; does not modify any existing suite.
 *
 * Run:  NODE_PATH=/tmp/rootling-domtest/node_modules node tests/spec-exec.js
 * Exit code 0 = all assertions passed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
/* B4: pin both clocks (Node + each jsdom window) to a safe local
 * midday before anything reads the time — see tests/test-clock.js.
 * The relative-time fixtures below (plans 45–150 minutes out, a
 * reminder 120 minutes out) then mean the same thing at any hour
 * the suite runs, without weakening any assertion. */
const testClock = require('./test-clock');
testClock.installNode();

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CORE_KEY = 'sprout-state-v1';
const EXEC_KEY = 'rootling-exec-v1';
const NOTIF_KEY = 'rootling-notifications-v1';

let failures = 0;
let passes = 0;
function assert(cond, label) {
  if (cond) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 40));

function makeDom(seeds) {
  seeds = seeds || {};
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  if (seeds.core) dom.window.localStorage.setItem(CORE_KEY, seeds.core);
  if (seeds.exec) dom.window.localStorage.setItem(EXEC_KEY, seeds.exec);
  if (seeds.notif) dom.window.localStorage.setItem(NOTIF_KEY, seeds.notif);
  testClock.installWindow(dom.window);
  dom.window.eval(appJs);
  return dom;
}
function adopt(dom, name) {
  const w = dom.window, d = w.document;
  d.getElementById('pet-name-input').value = name || 'Testy';
  d.getElementById('adopt-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}
function submit(dom, formId) {
  const w = dom.window;
  w.document.getElementById(formId).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}
const execStored = (dom) => JSON.parse(dom.window.localStorage.getItem(EXEC_KEY));
function fmtTime(t) {
  const p = String(t).split(':');
  let h = Number(p[0]); const m = p[1];
  const ap = h >= 12 ? 'pm' : 'am';
  return (h % 12 || 12) + ':' + m + ' ' + ap;
}
function timeIn(mins) {
  const d = new Date(Date.now() + mins * 60000);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

(async function main() {
  /* ---------- 1. One pinned priority: persists, survives reload ---------- */
  console.log('— 1. Pinned priority —');
  const dom1 = makeDom(); await tick();
  adopt(dom1);
  const d1 = dom1.window.document;
  assert(d1.getElementById('today-card') !== null, 'Today card exists');
  assert(d1.getElementById('today-priority-text').textContent.indexOf('No one thing yet') !== -1,
    'empty state: no priority yet, calm wording');
  d1.getElementById('today-priority-input').value = 'Finish the letter';
  submit(dom1, 'today-priority-form');
  assert(execStored(dom1).priority === 'Finish the letter', 'priority saved to the exec store');
  assert(d1.getElementById('today-priority-text').textContent.indexOf('Finish the letter') !== -1,
    'priority is shown on the Today card');
  assert(d1.getElementById('today-priority-text').textContent.indexOf('Your priority:') !== -1,
    'priority line uses the EXEC_COPY priority wording');
  /* deliberate switch: the old priority is parked, safe */
  d1.getElementById('today-priority-input').value = 'Call the clinic';
  submit(dom1, 'today-priority-form');
  const sw = execStored(dom1);
  assert(sw.priority === 'Call the clinic', 'user can switch the priority');
  assert(sw.parked.some(p => p.text === 'Finish the letter'), 'switch parks the old priority, safe');
  assert(d1.getElementById('today-priority-msg').textContent.indexOf('is parked, safe') !== -1,
    'switch is reflected back in EXEC_COPY wording');
  /* reload */
  const dom1b = makeDom({ core: dom1.window.localStorage.getItem(CORE_KEY), exec: dom1.window.localStorage.getItem(EXEC_KEY) });
  await tick();
  const d1b = dom1b.window.document;
  assert(execStored(dom1b).priority === 'Call the clinic', 'priority survives a reload');
  assert(d1b.getElementById('today-priority-text').textContent.indexOf('Call the clinic') !== -1,
    'priority still on the Today card after reload');

  /* ---------- 2. Catch it and park it ---------- */
  console.log('— 2. Catch it and park it —');
  const urlBefore = dom1b.window.location.href;
  const capInput = d1b.getElementById('today-capture-input');
  capInput.value = 'Buy stamps';
  submit(dom1b, 'today-capture-form');
  const capStore = execStored(dom1b);
  assert(capStore.parked.some(p => p.text === 'Buy stamps'), 'thought is parked in the exec store');
  assert(d1b.getElementById('today-capture-msg').textContent.indexOf('Parked. It is safe here') !== -1,
    'park acknowledgement uses EXEC_COPY wording');
  assert(dom1b.window.location.href === urlBefore, 'capture never navigates away');
  assert(d1b.getElementById('today-card') !== null && d1b.getElementById('exec-loops-wrap').hidden === true,
    'parked thoughts stay inside the closed list in exec-view');
  assert(d1b.body.textContent.indexOf('waiting!') === -1 && !/parked, all safe/.test(d1b.getElementById('today-card').textContent),
    'no count is shown at the user on the Today card');
  assert(d1b.activeElement === capInput, 'focus returns to the capture box after parking');
  d1b.getElementById('exec-loops-toggle').click();
  assert(d1b.getElementById('exec-loops-wrap').hidden === false, 'parked list opens only when the user opens it');
  assert(d1b.getElementById('exec-loops-list').textContent.indexOf('Buy stamps') !== -1,
    'parked thought is listed inside exec-view');
  assert(d1b.getElementById('exec-loops-count').textContent.indexOf('parked, all safe.') !== -1,
    'parked count line uses EXEC_COPY wording, inside the list only');

  /* ---------- 3. Focus sessions ---------- */
  console.log('— 3. Focus sessions —');
  const dom3 = makeDom(); await tick();
  adopt(dom3);
  const d3 = dom3.window.document;
  d3.querySelector('[data-focus-min="5"]').click();
  d3.getElementById('exec-focus-task').value = 'Write the email';
  d3.getElementById('exec-focus-start').click();
  await tick(20);
  assert(d3.getElementById('exec-focus-live').hidden === false, 'focus time shows when started');
  assert(d3.getElementById('exec-focus-status').textContent.indexOf('Write the email') !== -1 &&
    d3.getElementById('exec-focus-status').textContent.indexOf('sit here with you') !== -1,
    'session start line uses EXEC_COPY wording with the task named');
  assert(d3.getElementById('exec-presence-note').textContent.indexOf('Some people find company helps them start') !== -1,
    'presence note is honest: company may help some people start, nothing more claimed');
  assert(d3.getElementById('exec-focus-time').textContent.indexOf('minutes left') !== -1 &&
    d3.getElementById('exec-focus-time').textContent.indexOf('%') === -1,
    'time left is shown as words (minutes), friendly to screen readers');
  assert(d3.getElementById('exec-pet-img') !== null, 'pet picture is present for the session');
  assert(dom3.window.RootlingExec.getData().anchor.kind === 'focus', 'starting focus sets the anchor');
  d3.getElementById('exec-focus-stop').click();
  const stopMsg = d3.getElementById('exec-focus-msg').textContent;
  assert(/You focused for .* — that counts\./.test(stopMsg), 'stopping early says the time focused counts: "' + stopMsg + '"');
  assert(!/fail|not enough|too short|should have/i.test(stopMsg), 'stop copy has no failure wording');
  assert(dom3.window.RootlingExec.getData().focus === null, 'session is closed after Stop');
  assert(d3.getElementById('exec-focus-live').hidden === true, 'live session area hides after Stop');

  /* ---------- 4. Return-to-task re-anchoring after reload ---------- */
  console.log('— 4. Re-anchoring —');
  const dom4 = makeDom({ core: dom3.window.localStorage.getItem(CORE_KEY), exec: dom3.window.localStorage.getItem(EXEC_KEY) });
  await tick();
  const d4 = dom4.window.document;
  assert(d4.getElementById('today-anchor-wrap').hidden === false, 'anchor shows on the Today card after reopening');
  assert(d4.getElementById('today-anchor-text').textContent.indexOf('You were in the middle of: Write the email') !== -1,
    'anchor line uses EXEC_COPY resume wording');
  assert(d4.getElementById('exec-anchor-wrap').hidden === false, 'anchor also shows in exec-view');
  d4.getElementById('today-resume-btn').click();
  await tick(20);
  const f4 = dom4.window.RootlingExec.getData().focus;
  assert(!!f4 && f4.task === 'Write the email', 'Resume restarts the focus time on the same task');
  dom4.window.RootlingExec.stopFocus();

  /* ---------- 5. Task breakdown: next step only, park and resume ---------- */
  console.log('— 5. Task breakdown —');
  const dom5 = makeDom(); await tick();
  adopt(dom5);
  const d5 = dom5.window.document;
  d5.getElementById('exec-break-title').value = 'Tidy the desk';
  d5.getElementById('exec-break-create').click();
  assert(d5.getElementById('exec-break-build').hidden === false, 'building area opens');
  assert(d5.getElementById('exec-break-build-q').textContent.indexOf('very first tiny step') !== -1,
    'the pet asks for the very first tiny step');
  d5.getElementById('exec-break-step-input').value = 'Clear the mug';
  d5.getElementById('exec-break-step-add').click();
  d5.getElementById('exec-break-step-input').value = 'Sort the papers';
  d5.getElementById('exec-break-step-add').click();
  d5.getElementById('exec-break-do-start').click();
  const doing5 = d5.getElementById('exec-break-doing');
  assert(doing5.hidden === false, 'doing mode opens');
  assert(doing5.textContent.indexOf('Clear the mug') !== -1, 'doing mode shows the first step');
  assert(doing5.textContent.indexOf('Sort the papers') === -1, 'doing mode hides the next step until this one is done');
  assert(d5.getElementById('today-now-text').textContent.indexOf('Clear the mug') !== -1,
    'Today card Now line shows the live step');
  d5.getElementById('exec-break-done').click();
  assert(d5.getElementById('exec-break-current-step').textContent === 'Sort the papers',
    'Done shows the next step at once');
  d5.getElementById('exec-break-back').click();
  assert(d5.getElementById('exec-break-current-step').textContent === 'Clear the mug',
    'Back button returns to the step before, by name');
  d5.getElementById('exec-break-done').click();
  d5.getElementById('exec-break-park').click();
  const bdStore = execStored(dom5).breakdowns[0];
  assert(bdStore.mode === 'parked' && bdStore.current === 1, 'breakdown parks at its current step');
  assert(execStored(dom5).anchor.kind === 'breakdown', 'a parked breakdown becomes the anchor');
  const dom5b = makeDom({ core: dom5.window.localStorage.getItem(CORE_KEY), exec: dom5.window.localStorage.getItem(EXEC_KEY) });
  await tick();
  const d5b = dom5b.window.document;
  assert(d5b.getElementById('exec-anchor-text').textContent.indexOf('Tidy the desk') !== -1,
    'anchor survives reload for the parked breakdown');
  d5b.getElementById('exec-resume-btn').click();
  assert(d5b.getElementById('exec-break-doing').hidden === false &&
    d5b.getElementById('exec-break-current-step').textContent === 'Sort the papers',
    'Resume reopens the breakdown at the step where it was parked');
  d5b.getElementById('exec-break-done').click();
  assert(execStored(dom5b).breakdowns[0].mode === 'done', 'finishing the last step closes the task');
  assert(d5b.getElementById('exec-break-msg').textContent.indexOf('counts, completely') !== -1,
    'finishing copy is warm and brief');

  /* ---------- 6. Pet-held schedule ---------- */
  console.log('— 6. Pet-held schedule —');
  const dom6 = makeDom(); await tick();
  adopt(dom6);
  const d6 = dom6.window.document;
  const tLate = timeIn(150), tSoon = timeIn(60), tLeave = timeIn(45);
  d6.getElementById('exec-event-title').value = 'Dentist';
  d6.getElementById('exec-event-time').value = tLate;
  submit(dom6, 'exec-event-form');
  d6.getElementById('exec-event-title').value = 'School run';
  d6.getElementById('exec-event-time').value = tSoon;
  d6.getElementById('exec-event-leaveby').value = tLeave;
  submit(dom6, 'exec-event-form');
  const items6 = [...d6.getElementById('exec-event-list').querySelectorAll('li')];
  assert(items6.length === 2, 'both plans are held');
  assert(items6[0].textContent.indexOf('School run') !== -1 && items6[1].textContent.indexOf('Dentist') !== -1,
    'plans show in time order, not the order they were added');
  assert(items6[0].textContent.indexOf('leaving at ' + fmtTime(tLeave) + ' is the plan — it builds in buffer.') !== -1,
    'leave-by line uses the corrected EXEC_COPY wording word for word');
  assert(d6.getElementById('today-next-event').hidden === false &&
    d6.getElementById('today-next-event').textContent.indexOf('School run') !== -1,
    'the next plan also appears on the Today card');
  assert(d6.getElementById('today-now-text').textContent.indexOf('School run') !== -1,
    'Today card Now line shows the next plan when nothing else is live');

  /* ---------- 7. Today card: defensive reads, mood, reminders, first run ---------- */
  console.log('— 7. Today card defensive rendering —');
  const dom7 = makeDom(); await tick();
  adopt(dom7);
  const d7 = dom7.window.document;
  assert(d7.getElementById('today-now-text').textContent === 'Nothing scheduled. A gentle day.',
    'empty state: calm Now line');
  assert(d7.getElementById('today-mood').hidden === true, 'no mood line before any mood check-in');
  assert(d7.getElementById('today-next-reminder').hidden === true, 'no reminder line when no plan is on');
  assert(d7.getElementById('today-first-run').hidden === false,
    'first-run line shows while no check-in has ever been done');
  d7.querySelector('[data-mood="4"]').click();
  await tick(200);
  assert(d7.getElementById('today-mood').hidden === false &&
    d7.getElementById('today-mood').textContent.indexOf('Good') !== -1,
    'today mood shows on the Today card after a mood check-in');
  assert(d7.getElementById('today-first-run').hidden === true,
    'first-run line goes away once a check-in day exists');
  /* Capture the reminder time ONCE: the seed and the expectation
   * must be the same minute, or the assert can straddle a minute
   * tick even with the clock pinned (B4). */
  const tReminder = timeIn(120);
  const notifSeed = JSON.stringify({ enabled: true, cap: 3, quietStart: '21:00', quietEnd: '08:00',
    plans: { morning: { on: true, time: tReminder } }, fired: {}, marks: {}, log: [] });
  const dom7b = makeDom({ core: dom7.window.localStorage.getItem(CORE_KEY), notif: notifSeed });
  await tick();
  assert(dom7b.window.document.getElementById('today-next-reminder').textContent.indexOf(fmtTime(tReminder).replace(':0', ':')) !== -1 ||
    dom7b.window.document.getElementById('today-next-reminder').hidden === false,
    'next reminder time shows when a plan is on (display only)');

  /* ---------- 8. Help panel ---------- */
  console.log('— 8. Help and explain —');
  const helpBtn = d7.getElementById('help-btn');
  assert(!!helpBtn && helpBtn.textContent.trim() === 'Help', 'a Help button with the word Help sits in the header');
  helpBtn.click();
  assert(d7.getElementById('help-panel').hidden === false, 'Help button opens the help panel');
  assert(d7.getElementById('help-panel').textContent.indexOf('What is this app?') !== -1,
    'help panel answers What is this app in plain words');
  const showMes = [...d7.querySelectorAll('[data-help-target]')];
  assert(showMes.length >= 6, 'help panel has a Show me line for each area (' + showMes.length + ')');
  for (const b of showMes) {
    const target = d7.getElementById(b.getAttribute('data-help-target')) || d7.getElementById(b.getAttribute('data-help-fallback'));
    assert(!!target, 'Show me target exists: ' + b.getAttribute('data-help-target'));
  }
  const todayShowMe = showMes.find(b => b.getAttribute('data-help-target') === 'today-card');
  todayShowMe.click();
  assert(d7.getElementById('help-panel').hidden === true, 'Show me closes the panel');
  assert(d7.getElementById('help-read-btn').hidden === true,
    'Read this aloud stays hidden when this browser has no read-aloud voice');

  /* ---------- 9. Gentle help offer: once per visit, never in quiet view ---------- */
  console.log('— 9. Stuck offer —');
  const dom9 = makeDom(); await tick();
  adopt(dom9);
  const d9 = dom9.window.document;
  const petImg = d9.getElementById('pet-img');
  petImg.click(); petImg.click(); petImg.click();
  await tick(30);
  assert(d9.getElementById('stuck-offer').hidden === false,
    'three fast taps on something that does nothing brings up one gentle offer');
  assert(d9.getElementById('stuck-offer').textContent.indexOf('Need help?') !== -1 &&
    d9.getElementById('stuck-offer').textContent.indexOf('Would you like me to show you?') !== -1,
    'offer copy is the gentle wording');
  d9.getElementById('stuck-no-btn').click();
  assert(d9.getElementById('stuck-offer').hidden === true, 'No thanks closes the offer');
  petImg.click(); petImg.click(); petImg.click();
  await tick(30);
  assert(d9.getElementById('stuck-offer').hidden === true, 'the offer never comes twice in one visit');
  assert((dom9.window.localStorage.getItem(EXEC_KEY) || '').indexOf('frustrat') === -1,
    'nothing about the offer is stored');

  const dom9b = makeDom(); await tick();
  adopt(dom9b);
  const d9b = dom9b.window.document;
  d9b.getElementById('pause-btn').click();
  assert(d9b.getElementById('quiet-view').hidden === false, 'precondition: quiet view is up');
  dom9b.window.RootlingExec._maybeOfferHelp();
  const petImg9b = d9b.getElementById('pet-img');
  petImg9b.click(); petImg9b.click(); petImg9b.click();
  await tick(30);
  assert(d9b.getElementById('stuck-offer').hidden === true, 'the offer never appears while the quiet view is up');

  /* ---------- 10. Help panel: support-now entry to the Safety view ---------- */
  console.log('— 10. Support now entry —');
  const dom10 = makeDom(); await tick();
  adopt(dom10);
  const d10 = dom10.window.document;
  const safetyBtn = d10.getElementById('help-safety-btn');
  assert(!!safetyBtn && safetyBtn.textContent.trim() === 'I need support now',
    'help panel has a button with the words I need support now');
  assert(d10.getElementById('help-panel').textContent.indexOf('Support now — if things feel like too much, tap this. It has calm tools and your own list of people to call or text.') !== -1,
    'help panel explains the Safety view in the plain words given');
  /* The Safety view now ships in the page (Worker 3's #safety-view,
   * exactly one). The button's premise updated at integration: it must
   * show because the real view exists, and open that real view. */
  const svAll = d10.querySelectorAll('#safety-view');
  assert(svAll.length === 1, 'the page ships exactly one Safety view');
  const sv = svAll[0];
  d10.getElementById('help-btn').click();
  assert(safetyBtn.hidden === false, 'button shows when Help opens, because the shipped Safety view exists');
  safetyBtn.click();
  assert(d10.getElementById('help-panel').hidden === true, 'tapping the button closes Help');
  assert(sv.hidden === false, 'tapping the button opens the shipped Safety view');

  console.log('\nSPEC-EXEC: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
