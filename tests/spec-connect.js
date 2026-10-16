/* Rootling v17 — Connected-accounts connect honesty (fixes A–C).
 * The source-level pins live in tools/check.js (the release gate).
 * This suite pins the BEHAVIOR in jsdom: with no Supabase session
 * available (the module cannot load here), a Connect tap must land on
 * the honest expired-sign-in message — never the old generic line,
 * never silence — and inside an embedded in-app browser it must
 * refuse to redirect and offer the Open-in-Chrome guidance + Copy
 * link button instead.
 *
 * Run:  NODE_PATH=<jsdom node_modules> node tests/spec-connect.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
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
  /* jsdom 30 ignores the constructor userAgent option — set it on the
   * navigator directly, before any app code reads it. */
  if (userAgent) {
    try { Object.defineProperty(w.navigator, 'userAgent', { value: userAgent, configurable: true }); } catch (e) { /* older jsdom */ }
  }
  w.localStorage.setItem('sprout-state-v1', JSON.stringify({
    version: 2, petName: 'Tester', form: 'plant', profile: 'companion', learningEnabled: false,
    calmMode: false, pauseScreen: 'blank',
    toggles: { celebration: null, promptVariety: null, petEnergy: null, reminderIntensity: null },
    createdDate: '2026-10-15', sunshine: 0, petXp: 0, checkins: {}, careDays: [], learning: null
  }));
  STACK.forEach(f => w.eval(src[f]));
  return dom;
}

(async function main() {
  console.log('— 0. Source: the generic catch-all is gone —');
  assert(appSrc.indexOf('Could not start the connection') === -1,
    'app.js no longer contains the generic "Could not start the connection" line');
  assert(appSrc.indexOf("err.message === 'no session'") !== -1 || appSrc.indexOf('err && err.message') !== -1,
    'the connect catch distinguishes the no-session cause');

  console.log('— 1. No session: honest expired message —');
  {
    const dom = makeApp(); const w = dom.window, d = w.document;
    await tick(300);
    const btn = d.getElementById('connected-connect-btn');
    assert(!!btn, 'the Connected accounts connect button exists');
    btn.click();
    await tick(120);
    const msg = d.getElementById('connected-msg');
    assert(!!msg && msg.textContent === 'Your sign-in expired. Sign in again on this card, then tap Connect.',
      'a tap with no usable session says the sign-in expired (got: "' + (msg ? msg.textContent : '') + '")');
  }

  console.log('— 2. Embedded browser: no redirect, guidance + Copy link —');
  {
    const dom = makeApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/433.0.0.0.0;]');
    const w = dom.window, d = w.document;
    await tick(300);
    d.getElementById('connected-connect-btn').click();
    await tick(60);
    const msg = d.getElementById('connected-msg');
    assert(!!msg && msg.textContent.indexOf('Google blocks sign-in inside the Facebook/Instagram browser.') === 0
      && msg.textContent.indexOf('Open in Chrome') !== -1,
      'inside the Facebook browser the tap explains the block and points to Chrome');
    const copy = d.getElementById('connected-copy-link-btn');
    assert(!!copy && copy.textContent === 'Copy link', 'a Copy link button is offered for the site address');
  }

  console.log('\nSPEC-CONNECT: ' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
