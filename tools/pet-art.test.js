#!/usr/bin/env node
/* tools/pet-art.test.js — unit tests for pet-art.js pure parts (no browser).
 * Run: node tools/pet-art.test.js   (tools/check.js runs it too) */
'use strict';
const path = require('path');
const PA = require(path.join(__dirname, '..', 'pet-art.js'));
const fails = [];
let n = 0;
const eq = (a, b, m) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/* format: magic bytes beat file names */
eq(PA.sniffType(Uint8Array.from([0x89,0x50,0x4E,0x47,13,10,26,10,0,0,0,13])), 'image/png', 'png magic');
eq(PA.sniffType(Uint8Array.from([0xFF,0xD8,0xFF,0xE0,0,0,0,0,0,0,0,0])), 'image/jpeg', 'jpeg magic');
eq(PA.sniffType(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), 'image/webp', 'webp magic');
eq(PA.sniffType(Uint8Array.from(Buffer.from('<svg xmlns="ht'))), '', 'svg refused');
eq(PA.checkInput({ type: 'image/svg+xml', size: 10 }).ok, false, 'svg type refused');
eq(PA.checkInput({ type: 'image/png', size: 9 * 1024 * 1024 }).ok, false, 'over 8 MB refused');
eq(PA.checkInput({ type: 'image/png', size: 1000, width: 40, height: 400 }).ok, false, 'tiny side refused');
eq(PA.checkInput({ type: 'image/jpeg', size: 1000, width: 1200, height: 900 }).ok, true, 'normal photo ok');
if (/!/.test(PA.checkInput({ type: 'x', size: 1 }).reason)) fails.push('reasons must not use exclamation points');

/* normalize math: contain-fit in the 512 frame */
eq(PA.fitRect(1024, 512, 512), { x: 0, y: 128, w: 512, h: 256 }, 'wide fit');
eq(PA.fitRect(300, 600, 512), { x: 128, y: 0, w: 256, h: 512 }, 'tall fit');

/* loops: ADHD -> focus, COPD -> breath, both -> mixed (breath pacing wins) */
eq(PA.loopFor({ profile: 'focus' }), 'focus', 'focus profile');
eq(PA.loopFor({ profiles: ['calm'], topics: ['copd'] }), 'breath', 'copd topic');
eq(PA.loopFor({ profile: 'mixed', profiles: ['focus', 'lowdemand'], topics: ['copd'] }), 'mixed', 'adhd + copd');
eq(PA.loopFor({ profile: 'companion' }), 'steady', 'default');
const f = PA.loopConfig('focus'), b = PA.loopConfig('breath'), m = PA.loopConfig('mixed');
eq([f.sprintSec, f.breathInSec], [90, 0], 'focus has sprint, no breath ring');
eq([b.sprintSec, b.breathInSec, b.breathOutSec, b.minTarget >= 56], [0, 2, 4, true], 'breath: no timer, 2/4 pacing, big targets');
eq([m.sprintSec, m.breathInSec, m.palette.length], [0, 2, 4], 'mixed: no timer, breath pacing, short palette');
eq(PA.loopConfig('focus', { calm: true }).motion, false, 'calm mode stops motion');

/* game state: 5 points once a day, only for a real drawing */
const today = new Date(2026, 9, 16);
eq(PA.awardFor({ lastAwardDay: '' }, { strokes: 5, source: 'drawn' }, today), 5, 'first drawing today');
eq(PA.awardFor({ lastAwardDay: '2026-10-16' }, { strokes: 5, source: 'drawn' }, today), 0, 'second drawing today');
eq(PA.awardFor({ lastAwardDay: '' }, { strokes: 1, source: 'drawn' }, today), 0, 'a single dot does not count');
eq(PA.awardFor({ lastAwardDay: '' }, { strokes: 0, source: 'upload' }, today), 5, 'an added picture counts');

/* render: only when chosen, only for the matching species */
PA._setIndex({ version: 1, items: [{ id: 'a1', species: 'Kraken' }], activeId: 'a1', asPortrait: false, lastAwardDay: '', syncOn: false });
PA._urls['a1:full'] = 'blob:x';
eq(PA.portraitSrc('Kraken', 'cub'), '', 'not shown until the user picks Show on Home');
PA._setIndex({ version: 1, items: [{ id: 'a1', species: 'Kraken' }], activeId: 'a1', asPortrait: true, lastAwardDay: '', syncOn: false });
eq(PA.portraitSrc('Kraken', 'cub'), 'blob:x', 'shown for its species');
eq(PA.portraitSrc('Dog', 'cub'), '', 'not shown on a different species');

if (fails.length) { console.error('pet-art tests FAILED:'); fails.forEach(x => console.error('  x  ' + x)); process.exit(1); }
console.log('  ok  pet-art.js unit tests (' + n + ' checks)');
