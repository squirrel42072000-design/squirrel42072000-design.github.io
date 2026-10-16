// spec-tester-box: the tester report box stays hidden for normal users, shows with ?tester=1,
// renders the feed, sends a report with view/version/errors, and never writes localStorage.
const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tester-box.js'), 'utf8');
let pass = 0, fail = 0; const assert = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL  ' + m); } };
function mk(url) {
  const d = new JSDOM('<!doctype html><body><nav><button data-nav-view="mood" aria-current="page"></button></nav></body>', { url, runScripts: 'outside-only' });
  const sent = [];
  d.window.fetch = (u, o) => { if (o && o.method === 'POST') { sent.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, report: { id: 7 } }) }); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ reports: [{ id: 3, tester: 'Gemini', view: 'home', created_at: '2026-10-16T12:00:00Z', kind: 'bug', status: 'fixed', happened: 'x', builder_note: 'done', handled_by: 'Muse' }] }) }); };
  d.window.eval(src); return { d, sent };
}
const tick = () => new Promise(r => setTimeout(r, 30));
(async () => {
  const off = mk('https://x.io/'); await tick();
  assert(!off.d.window.document.getElementById('tbx-btn'), 'no tester button for normal users');
  const on = mk('https://x.io/?tester=1'); await tick();
  const doc = on.d.window.document, btn = doc.getElementById('tbx-btn');
  assert(btn, 'tester button appears with ?tester=1');
  assert(on.d.window.sessionStorage.getItem('rootling-tester-mode') === '1', 'tester mode remembered for the tab');
  assert(on.d.window.localStorage.length === 0, 'no localStorage keys written');
  btn.click(); await tick();
  assert(!doc.getElementById('tbx').hidden, 'box opens');
  assert(doc.querySelectorAll('.tbx-item').length === 1, 'feed renders reports');
  assert(/Muse: done/.test(doc.querySelector('.tbx-note').textContent), 'builder note shows');
  on.d.window.eval("console.error('boom')");
  const tas = doc.querySelectorAll('#tbx textarea'); tas[1].value = 'The save button did nothing';
  doc.querySelector('#tbx form').dispatchEvent(new on.d.window.Event('submit', { cancelable: true })); await tick(); await tick();
  assert(on.sent.length === 1, 'report sent');
  assert(on.sent[0] && on.sent[0].view === 'mood', 'current view attached');
  assert(on.sent[0] && /boom/.test(on.sent[0].errors), 'console errors attached');
  assert(/#7/.test(doc.querySelector('.tbx-msg').textContent), 'confirmation shows report number');
  const off2 = mk('https://x.io/?tester=0'); await tick();
  assert(!off2.d.window.document.getElementById('tbx-btn'), '?tester=0 keeps it off');
  console.log(`SPEC-TESTER-BOX: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
