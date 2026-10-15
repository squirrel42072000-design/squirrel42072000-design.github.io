/* species-art.js — the picture matches the companion you chose (v14).
 *
 * Before v14 every non-plant companion (pets, mythical creatures,
 * spirits, robots, aliens) shared one generic creature drawing, so a
 * user who adopted a Kraken saw a cub. This file draws the chosen
 * species for each stage (egg, nestling, cub, grown) and mood (happy,
 * sleepy, low, celebrate), in the same soft palette as the rest of the
 * art. A few species are hand-drawn; the rest use the species' own
 * emoji on a matching scene, so every species looks like itself.
 *
 * API: RootlingSpeciesArt.src(species, stageId, mood) -> data: URL or ''
 *      RootlingSpeciesArt.speciesOf(state) -> species name or ''
 * No network. Returns '' for plants, so plant art is unchanged.
 */
(function (root) {
  'use strict';

  var INK = '#243324', BLUSH = '#FFB3BA', NOSE = '#FF8FA3';
  var STAGE_SCALE = { egg: 0.62, nestling: 0.78, cub: 0.9, grown: 1 };

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function wrap(inner, label) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="' + esc(label) + '">' + inner + '</svg>';
  }
  function ground() { return '<ellipse cx="100" cy="174" rx="60" ry="10" fill="#E8DCC8"/><ellipse cx="100" cy="171" rx="46" ry="7" fill="#D9C7A5"/>'; }
  function sparkles() {
    return '<g fill="#F6C344"><path d="M34 46 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/><path d="M164 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/></g>' +
      '<circle cx="150" cy="70" r="4" fill="#6BCB77"/><circle cx="48" cy="84" r="3.5" fill="#FF8FA3"/><circle cx="170" cy="96" r="3" fill="#7EC8E3"/>';
  }
  function zzz() { return '<g fill="' + INK + '" opacity="0.55" font-family="sans-serif" font-weight="700"><text x="146" y="58" font-size="18">z</text><text x="160" y="42" font-size="13">z</text></g>'; }
  function eyes(mood, lx, rx, y) {
    if (mood === 'sleepy') return '<path d="M' + (lx - 6) + ' ' + y + ' Q' + lx + ' ' + (y + 5) + ' ' + (lx + 6) + ' ' + y + '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M' + (rx - 6) + ' ' + y + ' Q' + rx + ' ' + (y + 5) + ' ' + (rx + 6) + ' ' + y + '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    if (mood === 'celebrate') return '<path d="M' + (lx - 6) + ' ' + (y + 2) + ' Q' + lx + ' ' + (y - 6) + ' ' + (lx + 6) + ' ' + (y + 2) + '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M' + (rx - 6) + ' ' + (y + 2) + ' Q' + rx + ' ' + (y - 6) + ' ' + (rx + 6) + ' ' + (y + 2) + '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    return '<circle cx="' + lx + '" cy="' + y + '" r="5.5" fill="' + INK + '"/><circle cx="' + rx + '" cy="' + y + '" r="5.5" fill="' + INK + '"/><circle cx="' + (lx + 2) + '" cy="' + (y - 2) + '" r="1.8" fill="#fff"/><circle cx="' + (rx + 2) + '" cy="' + (y - 2) + '" r="1.8" fill="#fff"/>';
  }
  function mouth(mood, x, y) {
    if (mood === 'low') return '<path d="M' + (x - 6) + ' ' + (y + 3) + ' Q' + x + ' ' + (y - 1) + ' ' + (x + 6) + ' ' + (y + 3) + '" stroke="' + INK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    if (mood === 'sleepy') return '<ellipse cx="' + x + '" cy="' + (y + 1) + '" rx="3" ry="2.4" fill="' + INK + '" opacity="0.7"/>';
    if (mood === 'celebrate') return '<path d="M' + (x - 9) + ' ' + y + ' Q' + x + ' ' + (y + 12) + ' ' + (x + 9) + ' ' + y + ' Z" fill="' + INK + '"/><path d="M' + (x - 4) + ' ' + (y + 5) + ' Q' + x + ' ' + (y + 9) + ' ' + (x + 4) + ' ' + (y + 5) + '" fill="' + NOSE + '"/>';
    return '<path d="M' + (x - 7) + ' ' + y + ' Q' + x + ' ' + (y + 7) + ' ' + (x + 7) + ' ' + y + '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
  }
  function scaled(inner, s) {
    if (s === 1) return inner;
    var t = (1 - s) * 100; /* scale around (100, 172): feet stay on the ground */
    return '<g transform="translate(' + t + ' ' + ((1 - s) * 172) + ') scale(' + s + ')">' + inner + '</g>';
  }

  /* ---------------- hand-drawn: Kraken (deep-sea octopus) ---------------- */
  function kraken(stage, mood) {
    var body = '#9AD4E6', dark = '#4FA3C7', belly = '#D6F0F7', spot = '#7CC3DC';
    var arm = function (d) { return '<path d="' + d + '" stroke="' + body + '" stroke-width="15" fill="none" stroke-linecap="round"/>'; };
    var cups = function (pts) { return pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="' + belly + '"/>'; }).join(''); };
    var arms = arm('M70 140 C52 150 40 160 46 170 C50 176 60 172 58 164') + arm('M84 146 C78 160 70 170 76 175') +
      arm('M116 146 C122 160 130 170 124 175') + arm('M130 140 C148 150 160 160 154 170 C150 176 140 172 142 164') +
      arm('M64 128 C44 126 30 134 30 146 C30 154 40 154 42 148') + arm('M136 128 C156 126 170 134 170 146 C170 154 160 154 158 148') +
      cups([[50, 166], [78, 170], [122, 170], [150, 166], [34, 146], [166, 146]]);
    var head = '<ellipse cx="100" cy="104" rx="48" ry="46" fill="' + body + '"/>' +
      '<ellipse cx="100" cy="122" rx="30" ry="18" fill="' + belly + '" opacity="0.85"/>' +
      '<circle cx="76" cy="76" r="6" fill="' + spot + '"/><circle cx="124" cy="72" r="4.5" fill="' + spot + '"/><circle cx="114" cy="86" r="3" fill="' + spot + '"/>' +
      '<ellipse cx="82" cy="80" rx="13" ry="8" fill="#fff" opacity="0.35"/>' +
      /* the Rootling leaf every companion wears */
      '<path d="M100 60 C92 44 80 40 70 42 C74 56 86 62 100 60 Z" fill="#3E9B6B"/><path d="M100 60 C108 44 120 40 130 42 C126 56 114 62 100 60 Z" fill="#6BCB77"/>' +
      '<circle cx="70" cy="114" r="7" fill="' + BLUSH + '" opacity="0.85"/><circle cx="130" cy="114" r="7" fill="' + BLUSH + '" opacity="0.85"/>' +
      eyes(mood, 84, 116, 104) + mouth(mood, 100, 116);
    if (stage === 'grown') head += '<path d="M78 58 l6 -12 8 9 8 -12 8 12 8 -9 6 12 z" fill="#F6C344" stroke="#D9A21E" stroke-width="2" stroke-linejoin="round"/>';
    var bubbles = '<circle cx="158" cy="64" r="6" fill="none" stroke="' + dark + '" stroke-width="2" opacity="0.5"/><circle cx="168" cy="46" r="3.5" fill="none" stroke="' + dark + '" stroke-width="2" opacity="0.45"/>';
    if (stage === 'egg') {
      /* an egg with a little kraken peeking out of the crack */
      var egg = '<ellipse cx="100" cy="112" rx="52" ry="62" fill="#EAF6FA" stroke="' + dark + '" stroke-width="3"/>' +
        '<circle cx="80" cy="140" r="6" fill="' + spot + '" opacity="0.7"/><circle cx="122" cy="150" r="5" fill="' + spot + '" opacity="0.7"/>' +
        '<path d="M52 104 L66 94 L78 106 L92 92 L106 106 L120 92 L134 106 L148 96" stroke="' + dark + '" stroke-width="3" fill="none" stroke-linejoin="round"/>' +
        '<path d="M58 100 C64 66 136 66 142 100 L134 106 L120 92 L106 106 L92 92 L78 106 L66 94 Z" fill="' + body + '"/>' +
        '<path d="M100 72 C94 60 86 58 78 60 C82 70 90 74 100 72 Z" fill="#3E9B6B"/><path d="M100 72 C106 60 114 58 122 60 C118 70 110 74 100 72 Z" fill="#6BCB77"/>' +
        eyes(mood, 86, 114, 88) + '<path d="M44 150 C30 148 28 136 38 134" stroke="' + body + '" stroke-width="10" fill="none" stroke-linecap="round"/>';
      return wrap(ground() + egg + bubbles + (mood === 'celebrate' ? sparkles() : '') + (mood === 'sleepy' ? zzz() : ''), 'Kraken egg');
    }
    var inner = arms + head;
    return wrap(ground() + scaled(inner, STAGE_SCALE[stage] || 1) + bubbles + (mood === 'celebrate' ? sparkles() : '') + (mood === 'sleepy' ? zzz() : ''), 'Kraken companion');
  }

  var HAND = { Kraken: kraken };

  /* ---------------- every other species: its own emoji on a scene ---------------- */
  var SCENE = { pets: ['#CDEAC0', '#3E9B6B'], mythical: ['#E4D7F5', '#8B6CC4'], spirits: ['#DFF3EA', '#4FAF8F'], robots: ['#DDE6EE', '#6C8597'], aliens: ['#E6F7D9', '#7BBF4A'] };
  function emojiArt(entry, cat, stage, mood) {
    var sc = SCENE[cat] || SCENE.pets, s = STAGE_SCALE[stage] || 1;
    var glow = '<circle cx="100" cy="104" r="62" fill="' + sc[0] + '"/><circle cx="100" cy="104" r="62" fill="none" stroke="' + sc[1] + '" stroke-width="3" opacity="0.35"/>';
    var size = Math.round(96 * s);
    var body;
    if (stage === 'egg') {
      body = '<ellipse cx="100" cy="114" rx="50" ry="60" fill="#FFF9EE" stroke="' + sc[1] + '" stroke-width="3"/>' +
        '<path d="M52 108 L66 98 L78 110 L92 96 L106 110 L120 96 L134 110 L148 100" stroke="' + sc[1] + '" stroke-width="3" fill="none" stroke-linejoin="round"/>' +
        '<text x="100" y="100" font-size="58" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">' + entry.emoji + '</text>';
    } else {
      body = glow + '<text x="100" y="' + (110 + (1 - s) * 30) + '" font-size="' + size + '" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">' + entry.emoji + '</text>' +
        '<path d="M100 ' + (54 + (1 - s) * 40) + ' C92 ' + (40 + (1 - s) * 40) + ' 80 ' + (36 + (1 - s) * 40) + ' 72 ' + (38 + (1 - s) * 40) + ' C76 ' + (50 + (1 - s) * 40) + ' 88 ' + (56 + (1 - s) * 40) + ' 100 ' + (54 + (1 - s) * 40) + ' Z" fill="#6BCB77"/>';
      if (stage === 'grown') body += '<path d="M80 ' + 44 + ' l6 -12 8 9 6 -12 6 12 8 -9 6 12 z" fill="#F6C344" stroke="#D9A21E" stroke-width="2" stroke-linejoin="round" transform="translate(0 -6)"/>';
    }
    return wrap(ground() + body + (mood === 'celebrate' ? sparkles() : '') + (mood === 'sleepy' ? zzz() : ''), entry.name + ' companion');
  }

  function findEntry(species) {
    var C = root.RootlingCompanions;
    if (!C || !C.roster || !species) return null;
    for (var cat in C.roster) {
      var list = C.roster[cat] || [];
      for (var i = 0; i < list.length; i++) if (list[i].name === species) return { entry: list[i], cat: cat };
    }
    return null;
  }
  /* Which species is live: the pet state, else the companion registry. */
  function speciesOf(state) {
    if (state && state.species) return state.species;
    try {
      var C = root.RootlingCompanions, reg = C && C.registry ? C.registry() : null;
      if (reg && reg.companions) {
        var live = null; try { live = root.localStorage.getItem('rootling-live-companion-v1'); } catch (e) { /* fine */ }
        var hit = reg.companions.filter(function (c) { return c.id === live; })[0] || reg.companions.filter(function (c) { return c.isMain; })[0];
        if (hit && hit.species) return hit.species;
      }
    } catch (e) { /* fine */ }
    return '';
  }
  var cache = {};
  function src(species, stageId, mood) {
    var f = findEntry(species);
    if (!f || f.cat === 'plants') return '';
    var m = (mood === 'stage' || !mood) ? 'happy' : mood;
    var k = species + '|' + stageId + '|' + m;
    if (cache[k]) return cache[k];
    var svg = HAND[species] ? HAND[species](stageId, m) : emojiArt(f.entry, f.cat, stageId, m);
    return (cache[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }

  var api = { src: src, speciesOf: speciesOf, hand: Object.keys(HAND) };
  root.RootlingSpeciesArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
