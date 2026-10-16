/* Rootling v18 B3 — Pre-connect explainer, Ask (Home) path.
 * The "Connect Gmail + Calendar" button in the Ask card must explain,
 * in plain words, what access is asked for and that Google opens next
 * BEFORE any Google jump: no Google sign-in script may load until the
 * user taps "Yes, open Google". "Not now" connects nothing.
 *
 * Run:  NODE_PATH=<jsdom node_modules> node tests/spec-connect-explain.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const STACK = ['accounts.js', 'species-art.js', 'pet-art.js', 'companions.js', 'traits.js', 'burnoutEngine.js', 'companion-ux.js',
  'trust.js', 'pet-brain.js', 'config.js', 'research.js', 'app.js',
  'notifications.js', 'fitness.js', 'mood.js', 'assistant.js'];
const src = {};
STACK.forEach(f => { src[f] = fs.readFileSync(path.join(root, f), 'utf8'); });

let failures = 0, passes = 0;
function assert(cond, label) {
  if (cond) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label); }
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 60));

function makeApp(userAgent) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (userAgent) {
    try { Object.defineProperty(w.navigator, 'userAgent', { value: userAgent, configurable: true }); } catch (e) { /* older jsdom */ }
  }
  w.localStorage.setItem('sprout-state-v1', JSON.stringify({
    version: 2, petName: 'Tester', form: 'plant', profile: 'companion', learningEnabled: false,
    calmMode: false, pauseScreen: 'blank',
    toggles: { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null },
    createdDate: '2026-10-15', sunshine: 0, petXp: 0, checkins: {}, careDays: [], learning: null
  }));
  /* A Google Client ID on file, so the button takes the connect path
   * (without one it shows setup help instead — no Google jump either). */
  w.localStorage.setItem('rootling-assistant-secrets-v1', JSON.stringify({ googleClientId: 'test-client-id' }));
  STACK.forEach(f => w.eval(src[f]));
  return dom;
}
function gisScripts(d) {
  return Array.prototype.filter.call(d.querySelectorAll('script'), function (s) {
    return (s.src || '').indexOf('accounts.google.com') !== -1;
  });
}
function logButtons(d, label) {
  return Array.prototype.filter.call(d.querySelectorAll('#ask-log button'), function (b) {
    return b.textContent === label;
  });
}

(async function main() {
  console.log('— 1. Ask Connect: explainer first, no Google script until Yes —');
  {
    const dom = makeApp(); const w = dom.window, d = w.document;
    await tick(300);
    d.getElementById('ask-google-btn').click();
    await tick(80);
    const log = d.getElementById('ask-log');
    assert(!!log && log.textContent.indexOf('Before we connect: Google will open next') !== -1,
      'B3: the Ask Connect tap first explains, in plain words, that Google opens next');
    assert(!!log && log.textContent.indexOf('I never send email') !== -1,
      'B3: the explainer says what access is asked for');
    assert(gisScripts(d).length === 0, 'B3: no Google sign-in script loads before the user says yes');
    const yes = logButtons(d, 'Yes, open Google');
    assert(yes.length === 1, 'B3: the explainer offers one clear "Yes, open Google" button');
    yes[0].click();
    await tick(80);
    assert(gisScripts(d).length === 1, 'B3: only after Yes does the Google sign-in script load');
    yes[0].click();
    await tick(80);
    assert(gisScripts(d).length === 1, 'B3 QA: a second tap on the still-live Yes button opens no second Google window (queue drained at entry)');
  }

  console.log('— 2. Ask Connect: "Not now" connects nothing —');
  {
    const dom = makeApp(); const w = dom.window, d = w.document;
    await tick(300);
    d.getElementById('ask-google-btn').click();
    await tick(80);
    const no = logButtons(d, 'Not now');
    assert(no.length >= 1, 'B3: the explainer offers "Not now"');
    no[no.length - 1].click();
    await tick(80);
    const log = d.getElementById('ask-log');
    assert(!!log && log.textContent.indexOf('Okay — nothing was connected.') !== -1,
      'B3: "Not now" says plainly that nothing was connected');
    assert(gisScripts(d).length === 0, 'B3: "Not now" never loads the Google sign-in script');
  }

  console.log('— 3. Embedded browser: refusal + Chrome guidance, no explainer, no script (v18 B3 QA) —');
  {
    const dom = makeApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/433.0.0.0.0;]');
    const w = dom.window, d = w.document;
    await tick(300);
    d.getElementById('ask-google-btn').click();
    await tick(80);
    const log = d.getElementById('ask-log');
    assert(!!log && log.textContent.indexOf('Open in Chrome') !== -1 && log.textContent.indexOf('Nothing was shared.') !== -1,
      'B3 QA: inside the Facebook browser the Ask Connect tap refuses and points to Chrome');
    assert(!!log && log.textContent.indexOf('Before we connect:') === -1,
      'B3 QA: no consent explainer is shown where Google would refuse the jump anyway');
    assert(gisScripts(d).length === 0, 'B3 QA: no Google sign-in script loads inside the embedded browser');
  }

  console.log('\nSPEC-CONNECT-EXPLAIN: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
