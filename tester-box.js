/* tester-box.js — Rootling tester report box (Computer's lane, v19).
 *
 * Hidden from normal users. It turns on only when the app is opened with
 * ?tester=1 (stays on for that browser tab; ?tester=0 turns it off).
 * Testers (people, or AI agents that can use a browser) send reports here;
 * builders (Muse, Computer, others) read the same feed and fix issues.
 * Backend: Supabase edge function `tester-report` (table public.tester_reports).
 * The feed is public, so the box asks testers not to type personal info.
 * Uses sessionStorage only (no localStorage keys), and never touches app state.
 */
(function () {
  'use strict';
  var ENDPOINT = 'https://gfjrzqlmtqzimgjgeacv.supabase.co/functions/v1/tester-report';
  var FLAG = 'rootling-tester-mode';
  var NAME = 'rootling-tester-name';
  var errors = [];

  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; }
  }
  var q = '';
  try { q = new URLSearchParams(location.search).get('tester'); } catch (e) { q = null; }
  if (q === '1' || /(^|[#&])tester(=1)?($|&)/.test(location.hash.slice(1))) ss(FLAG, '1');
  if (q === '0') ss(FLAG, null);
  if (ss(FLAG) !== '1') return;

  function note(msg) { errors.push(new Date().toISOString().slice(11, 19) + ' ' + String(msg).slice(0, 300)); if (errors.length > 10) errors.shift(); }
  window.addEventListener('error', function (e) { note((e.message || 'error') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')); });
  window.addEventListener('unhandledrejection', function (e) { note('promise: ' + ((e.reason && (e.reason.message || e.reason)) || 'rejected')); });
  var origErr = console.error;
  console.error = function () { try { note('console: ' + Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return origErr.apply(console, arguments); };

  function currentView() {
    var b = document.querySelector('[data-nav-view][aria-current="page"]');
    return (b && b.getAttribute('data-nav-view')) || (location.hash || '#home').slice(1, 40);
  }
  var appVersion = '';
  try { if (window.caches) caches.keys().then(function (k) { appVersion = (k.filter(function (n) { return /^rootling-v\d+/.test(n); }).sort().pop()) || ''; }); } catch (e) {}

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var a in (attrs || {})) n.setAttribute(a, attrs[a]);
    if (text != null) n.textContent = text;
    return n;
  }

  var css = '' +
    '#tbx-btn{position:fixed;right:12px;top:12px;z-index:99990;background:#2e7d5b;color:#fff;border:0;border-radius:999px;padding:8px 14px;font:600 14px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer}' +
    '#tbx{position:fixed;right:12px;top:56px;z-index:99991;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 72px);overflow:auto;background:#fffdf7;color:#1f2a24;border:2px solid #2e7d5b;border-radius:14px;padding:12px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)}' +
    '#tbx[hidden]{display:none}#tbx h2{font-size:16px;margin:0 0 4px}#tbx p.tbx-warn{margin:0 0 8px;font-size:12px;color:#7a4b00;background:#fff2cc;padding:6px 8px;border-radius:8px}' +
    '#tbx label{display:block;font-weight:600;margin:6px 0 2px}#tbx input,#tbx select,#tbx textarea{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid #9bb5a7;border-radius:8px;background:#fff;color:#1f2a24}' +
    '#tbx textarea{min-height:64px;resize:vertical}#tbx .tbx-row{display:flex;gap:8px;margin-top:8px}#tbx button.tbx-send{flex:1;background:#2e7d5b;color:#fff;border:0;border-radius:8px;padding:8px;font-weight:600;cursor:pointer}' +
    '#tbx button.tbx-close{background:#e8efe9;color:#1f2a24;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}#tbx .tbx-msg{margin:6px 0 0;min-height:1em;font-weight:600}' +
    '#tbx .tbx-feed{margin-top:12px;border-top:1px solid #cfdcd3;padding-top:8px}#tbx .tbx-item{border:1px solid #dbe5de;border-radius:10px;padding:8px;margin:6px 0;background:#fff}' +
    '#tbx .tbx-meta{font-size:12px;color:#4d5d54}#tbx .tbx-chip{display:inline-block;font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px;background:#e8efe9;margin-left:4px}' +
    '#tbx .tbx-chip.s-fixed{background:#cdeccf}#tbx .tbx-chip.s-fixing{background:#fff2cc}#tbx .tbx-chip.s-new{background:#f6d6d6}#tbx .tbx-note{margin-top:4px;font-size:13px;background:#f1f7f2;padding:4px 6px;border-radius:6px}' +
    '.tbx-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}';

  function build() {
    if (document.getElementById('tbx-btn')) return;
    document.head.appendChild(el('style', { id: 'tbx-style' }, css));
    var btn = el('button', { id: 'tbx-btn', type: 'button', 'aria-controls': 'tbx', 'aria-expanded': 'false' }, 'Tester report');
    var box = el('section', { id: 'tbx', role: 'dialog', 'aria-label': 'Tester reports', hidden: '' });
    box.appendChild(el('h2', null, 'Tester reports'));
    box.appendChild(el('p', { 'class': 'tbx-warn' }, 'Builders read every report and fix what they can. Everyone can read this list, so please do not type real names, emails, health details, or passwords.'));
    var form = el('form', { novalidate: '' });
    function field(label, node) { var id = 'tbx-' + Math.random().toString(36).slice(2, 8); node.id = id; form.appendChild(el('label', { 'for': id }, label)); form.appendChild(node); return node; }
    var who = field('Who is testing (e.g. Gemini, Copilot, Daniel)', el('input', { maxlength: '40', autocomplete: 'off' }));
    who.value = ss(NAME) || '';
    var kind = field('Type', el('select'));
    [['bug', 'Something is broken'], ['confusing', 'Something is confusing'], ['idea', 'Idea to make it better'], ['works', 'I checked it and it works']].forEach(function (o) { var op = el('option', { value: o[0] }, o[1]); kind.appendChild(op); });
    var doing = field('What were you doing?', el('textarea', { maxlength: '600', rows: '2' }));
    var happened = field('What happened? (required)', el('textarea', { maxlength: '2000', rows: '3', required: '' }));
    var expected = field('What did you expect?', el('textarea', { maxlength: '600', rows: '2' }));
    var hp = el('input', { 'class': 'tbx-hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', name: 'website' });
    form.appendChild(hp);
    var row = el('div', { 'class': 'tbx-row' });
    var send = el('button', { type: 'submit', 'class': 'tbx-send' }, 'Send report');
    var close = el('button', { type: 'button', 'class': 'tbx-close' }, 'Close');
    row.appendChild(send); row.appendChild(close); form.appendChild(row);
    var msg = el('p', { 'class': 'tbx-msg', role: 'status', 'aria-live': 'polite' });
    form.appendChild(msg);
    box.appendChild(form);
    var feed = el('div', { 'class': 'tbx-feed' });
    box.appendChild(feed);
    document.body.appendChild(btn); document.body.appendChild(box);

    var timer = null;
    function render(list) {
      feed.textContent = '';
      feed.appendChild(el('h2', null, 'Recent reports'));
      if (!list || !list.length) { feed.appendChild(el('p', null, 'No reports yet.')); return; }
      list.slice(0, 25).forEach(function (r) {
        var it = el('div', { 'class': 'tbx-item' });
        var meta = el('div', { 'class': 'tbx-meta' }, '#' + r.id + ' · ' + (r.tester || '') + ' · ' + (r.view || '') + ' · ' + new Date(r.created_at).toLocaleString());
        meta.appendChild(el('span', { 'class': 'tbx-chip' }, r.kind));
        meta.appendChild(el('span', { 'class': 'tbx-chip s-' + r.status }, r.status));
        it.appendChild(meta);
        it.appendChild(el('div', null, r.happened));
        if (r.builder_note) it.appendChild(el('div', { 'class': 'tbx-note' }, (r.handled_by ? r.handled_by + ': ' : '') + r.builder_note));
        feed.appendChild(it);
      });
    }
    function load() {
      fetch(ENDPOINT + '?limit=25').then(function (r) { return r.json(); }).then(function (o) { render(o.reports); })
        .catch(function () { feed.textContent = 'Could not load reports right now.'; });
    }
    function open(v) {
      box.hidden = !v; btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (v) { load(); timer = setInterval(load, 60000); (who.value ? happened : who).focus(); } else { clearInterval(timer); }
    }
    btn.addEventListener('click', function () { open(box.hidden); });
    close.addEventListener('click', function () { open(false); btn.focus(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (happened.value.trim().length < 3) { msg.textContent = 'Please say what happened.'; happened.focus(); return; }
      ss(NAME, who.value.trim());
      send.disabled = true; msg.textContent = 'Sending…';
      fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tester: who.value, kind: kind.value, doing: doing.value, happened: happened.value, expected: expected.value,
          view: currentView(), app_version: appVersion, errors: errors.join('\n'), website: hp.value })
      }).then(function (r) { return r.json().then(function (o) { return { ok: r.ok, o: o }; }); })
        .then(function (res) {
          if (res.ok && res.o.ok) { msg.textContent = 'Sent. Thank you. Report #' + (res.o.report ? res.o.report.id : '') + ' is in the list below.'; doing.value = happened.value = expected.value = ''; load(); }
          else msg.textContent = (res.o && res.o.error) || 'Could not send. Try again in a bit.';
        })
        .catch(function () { msg.textContent = 'Could not reach the report server. Check the connection and try again.'; })
        .then(function () { send.disabled = false; });
    });
    window.RootlingTesterBox = { open: function () { open(true); }, errors: errors, endpoint: ENDPOINT };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
