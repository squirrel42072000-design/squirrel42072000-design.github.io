#!/usr/bin/env node
/* tools/check.js — Rootling integrity check (see TEAM.md).
 * Run before every push:  node tools/check.js
 * No packages needed. Exits 1 if anything is missing or broken. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(R, f), 'utf8');
const fails = [], notes = [];
const fail = m => fails.push(m), ok = m => notes.push(m);

/* 1. Every JS file parses. */
const jsFiles = fs.readdirSync(R).filter(f => f.endsWith('.js'));
jsFiles.forEach(f => { try { new vm.Script(read(f), { filename: f }); } catch (e) { fail(`${f}: syntax error — ${e.message}`); } });
ok(`${jsFiles.length} JS files parse`);

/* 2. Protected element ids (TEAM.md). */
const html = read('index.html');
const PROTECTED = {
  Computer: ['ask-card', 'ask-log', 'ask-form', 'ask-input', 'ask-chips', 'ask-google-btn', 'ask-settings-card', 'fit-card', 'mood-card', 'mood-dots', 'mood-status', 'mood-watch'],
  Muse: ['pet-xp-line', 'connected-card', 'ai-access-card', 'privacy-mode-toggle', 'topics-card', 'topics-list', 'account-card', 'account-summary', 'today-card', 'brief-card']
};
const HIDDEN_OK = ['chat-card', 'fitness-card'];
for (const [lane, ids] of Object.entries(PROTECTED)) ids.forEach(id => {
  const m = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`));
  if (!m) fail(`index.html: missing #${id} (${lane} lane). Do not remove another lane's piece — see TEAM.md.`);
  else if (/\shidden(\s|>|=)/.test(m[0]) && !/mood-|ask-timer/.test(id)) fail(`index.html: #${id} (${lane} lane) is hidden. Ask in TEAM.md first.`);
});
ok('protected ids present');

/* 3. Scripts: every script tag exists, every module is loaded and cached. */
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].replace(/^\.\//, ''));
scripts.forEach(s => { if (!fs.existsSync(path.join(R, s))) fail(`index.html loads ${s}, but the file is missing`); });
const REQUIRED_SCRIPTS = ['accounts.js', 'app.js', 'species-art.js', 'config.js', 'research.js', 'fitness.js', 'mood.js', 'assistant.js', 'trust.js', 'pet-brain.js', 'traits.js', 'companion-ux.js'];
REQUIRED_SCRIPTS.forEach(s => { if (scripts.indexOf(s) === -1) fail(`index.html no longer loads ${s}`); });
const order = (a, b) => scripts.indexOf(a) < scripts.indexOf(b);
if (!order('accounts.js', 'app.js')) fail('accounts.js must load before app.js');
if (!order('species-art.js', 'companions.js') || !order('species-art.js', 'app.js')) fail('species-art.js must load before companions.js and app.js (painted portraits, v15)');
if (!order('research.js', 'assistant.js') || !order('mood.js', 'assistant.js') || !order('fitness.js', 'assistant.js')) fail('research.js, fitness.js, mood.js must load before assistant.js');
const sw = read('sw.js');
const ver = (sw.match(/CACHE_VERSION = 'rootling-v(\d+)'/) || [])[1];
if (!ver) fail('sw.js: CACHE_VERSION not found'); else ok(`cache rootling-v${ver}`);
scripts.forEach(s => { if (sw.indexOf(`'./${s}'`) === -1) fail(`sw.js APP_SHELL is missing ./${s} (offline would break)`); });

/* 4. Store keys are registered everywhere (accounts + delete lists). */
const acc = read('accounts.js'), app = read('app.js');
const STORE_KEYS = ['rootling-assistant-v1', 'rootling-assistant-secrets-v1', 'rootling-fitness-v1', 'rootling-mood-v1', 'rootling-ai-access-v1', 'rootling-connected-v1'];
STORE_KEYS.forEach(k => { if (acc.indexOf(`'${k}'`) === -1) fail(`accounts.js APP_KEYS is missing '${k}' (data would leak across accounts)`); });
['rootling-assistant-v1', 'rootling-fitness-v1', 'rootling-mood-v1'].forEach(k => {
  const n = app.split(`'${k}'`).length - 1;
  if (n < 3) fail(`app.js: '${k}' should appear in MODULE_STORE_KEYS, ALL_KEYS, and AREA_KEYS (found ${n})`);
});
['ask-card', 'fit-card', 'mood-card'].forEach(id => { if (app.indexOf(`'${id}': 'home'`) === -1) fail(`app.js VIEW_OF_ID is missing '${id}': 'home'`); });
if (app.indexOf('RootlingSpeciesArt') === -1) fail('app.js no longer uses species-art.js (pets would show generic art again)');
if (app.indexOf('buildSupportPicker(') === -1 && app.indexOf('readProfileGroup(') === -1) fail('app.js: support styles must stay multi-select (Daniel, v14)');
if (app.indexOf('view-back-bar') === -1) fail('app.js: page Back bar is gone (Daniel, v14)');
/* v15: every painted species has its portrait, thumbnail and (animals) egg. */
{
  const SA = require(path.join(R, 'species-art.js'));
  const dir = path.join(R, 'assets', 'pets');
  SA.painted.forEach(slug => {
    ['', '-sm'].forEach(sfx => { if (!fs.existsSync(path.join(dir, `${slug}${sfx}.webp`))) fail(`assets/pets/${slug}${sfx}.webp is missing`); });
  });
  if (!SA.src('Kraken', 'egg', 'stage').endsWith('kraken-egg.webp')) fail('species-art.js: Kraken egg art path is wrong');
  SA.painted.forEach(slug => { const u = SA.src(slug, 'egg', 'stage'); if (/-egg\.webp$/.test(u) && !fs.existsSync(path.join(R, u))) fail(`${u} is missing`); });
  ok(`${SA.painted.length} painted species`);
}
if (app.indexOf('addExperience: function') === -1) fail('app.js: RootlingApp.addExperience is gone (pet growth from abilities depends on it)');

/* 5. Guardrails. */
const asst = read('assistant.js'), brain = read('pet-brain.js');
if (!/988/.test(asst) || !/988/.test(brain)) fail('988 crisis line missing from assistant.js or pet-brain.js');
if (!/911/.test(asst)) fail('911 body-emergency line missing from assistant.js');
if (!/not a diagnosis/i.test(asst) || !/not a diagnosis/i.test(html)) fail('mood check must say "not a diagnosis"');
ok('guardrail lines present');

/* 6. Research library: sources resolve; behavior unit tests. */
const RS = require(path.join(R, 'research.js'));
const srcIds = Object.keys(RS.SOURCES || {});
(RS.TOPICS || []).forEach(t => {
  (t.sources || []).concat(t.proSrc || []).concat((t.helps || []).map(h => h.src)).forEach(s => { if (s && srcIds.indexOf(s) === -1) fail(`research.js topic ${t.id} cites unknown source ${s}`); });
});
srcIds.forEach(s => { if (!/^https:\/\//.test(RS.SOURCES[s].url || '')) fail(`research.js source ${s} needs an https URL`); });
const expect = (q, id) => { const hit = RS.search(q, 1)[0]; if (!hit || hit.id !== id) fail(`research search "${q}" should find ${id}, got ${hit ? hit.id : 'nothing'}`); };
expect('depression', 'lowmood'); expect('what is copd', 'copd'); expect('adhd', 'adhd');
const M = require(path.join(R, 'mood.js'));
const ks = M.lastKeys(14), low = {}; ks.forEach((k, i) => low[k] = i % 2 ? 1 : 2);
if (M.detect({ moods: low }).level === 'none') fail('mood.js: two weeks of low faces should be noticed');
if (M.detect({}).level !== 'none') fail('mood.js: no data must mean no concern');
if (!M.detect({ checks: [{ at: Date.now(), type: 'phq9', score: 3, item9: 1 }] }).crisis) fail('mood.js: PHQ-9 item 9 above 0 must flag crisis');
if (M.phq9Band(10).band !== 'moderate' || M.phq9Band(20).band !== 'severe') fail('mood.js: PHQ-9 bands are wrong');
ok(`${(RS.TOPICS || []).length} research topics, ${srcIds.length} sources`);

notes.forEach(n => console.log('  ok  ' + n));
if (fails.length) { console.error('\nRootling check FAILED:'); fails.forEach(f => console.error('  x  ' + f)); console.error('\nSee TEAM.md.'); process.exit(1); }
console.log('\nRootling check passed.');
