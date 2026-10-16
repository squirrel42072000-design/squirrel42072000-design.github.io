/* species-art.js — painted companion portraits (v15).
 *
 * Daniel: "That's not the pet I chose" and then "recreate the pets
 * images, but make them more artistic and detailed". Every species in the
 * roster (pets, mythical, spirits, robots, aliens, and plants) has its own
 * painted portrait in assets/pets/, all made in one storybook gouache
 * style with the Rootling two-leaf sprout.
 *
 *   assets/pets/<slug>.webp      512px portrait
 *   assets/pets/<slug>-egg.webp  egg stage: the baby peeking out of a shell
 *   assets/pets/<slug>-sm.webp   192px thumbnail for pickers and the shelf
 *
 * Stage shows as size (small baby -> full grown, with a soft glow when
 * grown). Mood shows as a gentle overlay (sleepy z's, a small cloud for low
 * days, sparkles for celebrations). In calm mode the overlay never moves.
 *
 * API: RootlingSpeciesArt.src(species, stageId, mood) -> URL or ''
 *      RootlingSpeciesArt.thumb(species) -> URL or ''
 *      RootlingSpeciesArt.decorate(img, species, stageId, mood)
 *      RootlingSpeciesArt.speciesOf(state) -> species name or ''
 * No network beyond this site. Unknown species return '' so the old art
 * stays as a fallback.
 */
(function (root) {
  'use strict';

  /* Painted species (slug = lowercase name, spaces -> _). Keep in step
   * with assets/pets/ and the roster in companions.js. */
  var PAINTED = ['dog', 'cat', 'rabbit', 'hamster', 'fox', 'owl', 'panda', 'wolf', 'tiger', 'red_panda', 'arctic_fox',
    'dragon', 'phoenix', 'griffin', 'unicorn', 'kraken', 'fairy_dragon', 'pegasus', 'shadow_dragon',
    'forest_spirit', 'guardian_spirit', 'water_spirit', 'fire_spirit', 'moon_spirit',
    'assistant_bot', 'exploration_bot', 'learning_bot', 'builder_bot', 'research_bot',
    'glow_slime', 'star_creature', 'cosmic_bloom', 'nebula_pet',
    'bonsai', 'cactus', 'venus_flytrap', 'sunflower', 'oak_tree', 'cherry_blossom', 'bamboo', 'rose', 'orchid', 'lavender',
    'mystic_tree', 'crystal_flower', 'moon_blossom', 'spirit_tree', 'fire_bloom'];
  var PLANT_SLUGS = ['bonsai', 'cactus', 'venus_flytrap', 'sunflower', 'oak_tree', 'cherry_blossom', 'bamboo', 'rose', 'orchid', 'lavender', 'mystic_tree', 'crystal_flower', 'moon_blossom', 'spirit_tree', 'fire_bloom'];
  var BASE = 'assets/pets/';

  /* Size by stage, as a share of the portrait frame. */
  var SCALE = { egg: 1, nestling: 0.74, cub: 0.87, grown: 1, seed: 0.62, sprout: 0.74, bud: 0.87, bloom: 1 };
  var GROWN = { grown: 1, bloom: 1 };

  function slugOf(species) { return String(species || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  function has(species) { return PAINTED.indexOf(slugOf(species)) !== -1; }
  function isPlant(species) { return PLANT_SLUGS.indexOf(slugOf(species)) !== -1; }

  function src(species, stageId, mood) {
    if (!has(species)) return '';
    var s = slugOf(species);
    if (stageId === 'egg' && !isPlant(species)) return BASE + s + '-egg.webp';
    return BASE + s + '.webp';
  }
  function thumb(species) { return has(species) ? BASE + slugOf(species) + '-sm.webp' : ''; }

  /* Gentle mood overlays. Plain SVG, no text, decorative only. */
  var FX = {
    sleepy: '<svg viewBox="0 0 60 60" class="fx-z" aria-hidden="true"><text x="8" y="44" font-size="20" font-weight="700" fill="#5b6f86" font-family="sans-serif">z</text><text x="26" y="30" font-size="15" font-weight="700" fill="#7c8ea3" font-family="sans-serif">z</text><text x="40" y="18" font-size="11" font-weight="700" fill="#9aabbd" font-family="sans-serif">z</text></svg>',
    low: '<svg viewBox="0 0 70 50" class="fx-cloud" aria-hidden="true"><path d="M18 34 C6 34 6 20 17 19 C18 9 33 7 37 15 C42 8 56 11 55 22 C64 23 64 34 54 34 Z" fill="#e7edf3" stroke="#b8c6d4" stroke-width="2"/><path d="M28 39 q-2 5 0 7 q2 -2 0 -7z" fill="#9fc3e0"/><path d="M42 40 q-2 4 0 6 q2 -2 0 -6z" fill="#9fc3e0"/></svg>',
    celebrate: '<svg viewBox="0 0 200 200" class="fx-sparkle" aria-hidden="true"><g fill="#F6C344"><path d="M30 40 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z"/><path d="M168 34 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z"/><path d="M174 132 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/></g><circle cx="150" cy="70" r="4" fill="#6BCB77"/><circle cx="44" cy="120" r="4" fill="#FF8FA3"/><circle cx="160" cy="100" r="3" fill="#7EC8E3"/><circle cx="60" cy="168" r="3" fill="#F6C344"/></svg>',
    happy: '<svg viewBox="0 0 60 60" class="fx-heart" aria-hidden="true"><path d="M30 50 C10 36 6 24 14 17 C20 12 27 15 30 21 C33 15 40 12 46 17 C54 24 50 36 30 50 Z" fill="#FF9FB1" stroke="#f07d95" stroke-width="2"/></svg>'
  };

  function decorate(img, species, stageId, mood) {
    if (!img) return;
    var on = has(species);
    img.classList.toggle('has-art', on);
    var wrap = img.parentNode;
    var fx = wrap && wrap.querySelector ? wrap.querySelector('.pet-fx') : null;
    if (!on) {
      img.style.removeProperty('--art-scale');
      img.removeAttribute('data-art-mood');
      if (wrap && wrap.classList) wrap.classList.remove('art-grown');
      if (fx) fx.innerHTML = '';
      return;
    }
    var m = (mood === 'stage' || !mood) ? '' : mood;
    img.style.setProperty('--art-scale', String(SCALE[stageId] || 1));
    img.setAttribute('data-art-mood', m || 'stage');
    img.alt = 'Your ' + species + ' companion' + (stageId ? ', ' + stageId + ' stage' : '') + (m ? ', ' + ({ low: 'feeling a bit low', celebrate: 'celebrating', sleepy: 'feeling sleepy', happy: 'feeling happy' }[m] || 'feeling ' + m) : '');
    if (wrap && wrap.classList) {
      wrap.classList.add('pet-art-wrap');
      wrap.classList.toggle('art-grown', !!GROWN[stageId]);
      if (!fx) { fx = document.createElement('span'); fx.className = 'pet-fx'; fx.setAttribute('aria-hidden', 'true'); wrap.appendChild(fx); }
      fx.className = 'pet-fx' + (m ? ' fx-' + m : '');
      fx.innerHTML = FX[m] || '';
    }
    /* The painted portrait already shows the species, so the small
     * species badge is no longer needed on Home. */
    var badge = document.getElementById('pet-species-badge');
    if (badge && img.id === 'pet-img') badge.hidden = true;
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

  var api = { src: src, thumb: thumb, decorate: decorate, speciesOf: speciesOf, has: has, slugOf: slugOf, painted: PAINTED.slice(), findEntry: findEntry };
  root.RootlingSpeciesArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
