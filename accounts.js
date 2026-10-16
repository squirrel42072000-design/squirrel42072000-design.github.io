/* Rootling — on-device accounts (2026-10-15 rebuild, Daniel's order).
 * Plain vanilla JS. No build step, no network.
 *
 * WHAT THIS IS, HONESTLY: accounts that live on THIS device only, in this
 * browser's storage. There is no server. A password is kept as a salted
 * hash, never as plain text. Signing in keeps other people's companions
 * on a shared device separate from yours. It does NOT send anything
 * anywhere, it does not check your email, and it cannot get your account
 * back if the device is lost. Cloud accounts — with Google, Apple, or
 * Microsoft sign-in and email checks — arrive with the connected version
 * of Rootling. Nothing here pretends to be that.
 *
 * HOW IT WORKS: this file loads before app.js. It wraps the browser's
 * storage calls so every app data key is kept under the signed-in
 * account's own space ("owner" space). Each account's pets, memories,
 * check-ins, and settings are separate. When nobody has made an account
 * on this device yet, storage works exactly as it always did, and the
 * first account created is offered the companions already living here.
 */
(function () {
  'use strict';

  var ACCOUNTS_KEY = 'rootling-accounts-v1';
  var SESSION_KEY = 'rootling-session-v1';

  /* Every app-owned data key that belongs to one account's space. The
   * accounts list and the session marker are device-level and are never
   * put inside an account space. */
  var APP_KEYS = [
    'sprout-state-v1',
    'rootling-notifications-v1',
    'rootling-notifications-v1-push-sub',
    'rootling-appearance-v1',
    'rootling-exec-v1',
    'rootling-well-v1',
    'rootling-consent-v1',
    'rootling-social-v1',
    'rootling-time-v1',
    'rootling-memorybook-v1',
    'rootling-persist-requested-v1',
    'rootling-companions-v1',
    'rootling-vault-v1',
    'rootling-live-companion-v1',
    'rootling-person-state-v1',
    'rootling-startover-pending-v1',
    'rootling-pending-adopt-v1',
    /* v11/v12 stores join the account space: AI permissions, pet chat
     * and the connected flag are one person's, never shared across
     * accounts on a shared device. */
    'rootling-ai-access-v1',
    'rootling-chat-v1',
    'rootling-connected-v1',
    /* Ask your pet, fitness, and mood care stores (v11-v13). */
    'rootling-assistant-v1',
    'rootling-assistant-secrets-v1',
    'rootling-fitness-v1',
    'rootling-mood-v1',
    /* v16: the pet drawings index (blobs live in IndexedDB under the
     * account id, see pet-art.js). */
    'rootling-pet-art-v1',
    /* Pet Playground saves + reward ledger (v17): one key holding a
     * per-pet map, so account spaces keep every pet's games apart. */
    'rootling-playground-v1'
  ];

  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  if (!store) { window.RootlingAccounts = { unavailable: true }; return; }

  /* Raw storage calls, captured before wrapping, for account bookkeeping. */
  var rawGet = Storage.prototype.getItem;
  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;
  function getRaw(k) { try { return rawGet.call(store, k); } catch (e) { return null; } }
  function setRaw(k, v) { try { rawSet.call(store, k, v); } catch (e) { /* storage off */ } }
  function removeRaw(k) { try { rawRemove.call(store, k); } catch (e) { /* storage off */ } }

  /* ------------- account records ------------- */
  function loadAccounts() {
    try {
      var raw = getRaw(ACCOUNTS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.accounts)) return parsed;
    } catch (e) { /* fall through */ }
    return { accounts: [], migratedTo: null };
  }
  function saveAccounts(data) { setRaw(ACCOUNTS_KEY, JSON.stringify(data)); }

  function loadSession() {
    try {
      var raw = getRaw(SESSION_KEY);
      var s = raw ? JSON.parse(raw) : null;
      return (s && s.accountId) ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(accountId) {
    if (accountId) setRaw(SESSION_KEY, JSON.stringify({ accountId: accountId, since: new Date().toISOString() }));
    else removeRaw(SESSION_KEY);
  }
  function currentAccount() {
    var s = loadSession();
    if (!s) return null;
    var data = loadAccounts();
    for (var i = 0; i < data.accounts.length; i++) {
      if (data.accounts[i].id === s.accountId) return data.accounts[i];
    }
    return null;
  }

  function uid() {
    return 'acct-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000000000).toString(36);
  }
  function makeSalt() {
    var s = '';
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var bytes = new Uint8Array(12);
        window.crypto.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) s += ('0' + bytes[i].toString(16)).slice(-2);
        return s;
      }
    } catch (e) { /* fall through */ }
    return 'salt-' + Math.floor(Math.random() * 1e12).toString(36) + '-' + Date.now().toString(36);
  }

  /* Salted password hash. Best path: SHA-256 from the browser. Fallback:
   * an iterated FNV-1a mix, used only where SHA-256 is not offered (old
   * browsers, plain-file pages). Either way the plain password is never
   * stored. This protects against casual reading of device storage; it
   * is not server-grade safety, and the sign-in screens say so. */
  function fnvHash(text, salt) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    var input = salt + '::' + text;
    for (var round = 0; round < 1000; round++) {
      for (var i = 0; i < input.length; i++) {
        h1 ^= input.charCodeAt(i); h1 = Math.imul(h1, 0x01000193);
        h2 = Math.imul(h2 ^ input.charCodeAt(i), 0x85ebca6b);
      }
      input = h1.toString(36) + ':' + h2.toString(36) + ':' + salt;
    }
    return 'fnv1a:' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  function hashPassword(password, salt) {
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        var data = new window.TextEncoder().encode(salt + '::' + password);
        return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
          var bytes = new Uint8Array(buf);
          var hex = '';
          for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
          return 'sha256:' + hex;
        }, function () { return fnvHash(password, salt); });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(fnvHash(password, salt));
  }

  /* ------------- easier sign-in (v13) -------------
   * 1) Password reminder: a hint only the user understands. Never the
   *    password itself (checked), shown only when asked.
   * 2) Face or fingerprint: a passkey (WebAuthn). The phone or computer
   *    checks the face (Face ID, Windows Hello) or finger itself; Rootling
   *    never sees a picture or a fingerprint. Rootling keeps the passkey's
   *    public key and checks its signature on this device.
   * 3) Voice phrase: a secret phrase said out loud. Kept as a salted hash
   *    like a password. It checks the WORDS, not the sound of the voice. */
  function b64u(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) { str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; var s = atob(str), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function rand(n) { var b = new Uint8Array(n); window.crypto.getRandomValues(b); return b; }
  function passkeySupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && window.crypto && window.crypto.subtle && window.isSecureContext);
  }
  function passkeyAvailable() {
    if (!passkeySupported()) return Promise.resolve(false);
    try { return window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; }); } catch (e) { return Promise.resolve(false); }
  }
  function voiceSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function normPhrase(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function updateAccount(id, fn) {
    var d = loadAccounts();
    for (var i = 0; i < d.accounts.length; i++) if (d.accounts[i].id === id) fn(d.accounts[i]);
    saveAccounts(d);
  }
  function hintProblem(hint, pw) {
    var h = String(hint || '').trim();
    if (!h) return 'Please write a password reminder. It helps you remember later.';
    if (h.length < 3) return 'Make the reminder a little longer.';
    if (pw && h.toLowerCase().indexOf(String(pw).toLowerCase()) !== -1) return 'The reminder cannot have your password in it. Write a clue instead, like \u201cmy first pet + the year\u201d.';
    return '';
  }

  /* DER ECDSA signature -> raw r||s (64 bytes) for WebCrypto. */
  function derToRaw(der) {
    var d = new Uint8Array(der), i = 2;
    if (d[1] & 0x80) i += d[1] & 0x7f;
    function readInt() { i++; var len = d[i++]; var v = d.slice(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); var out = new Uint8Array(32); out.set(v, 32 - v.length); return out; }
    var r = readInt(), s = readInt(), raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32); return raw;
  }
  function createPasskey(account) {
    var challenge = rand(32);
    return navigator.credentials.create({ publicKey: {
      rp: { name: 'Rootling', id: location.hostname },
      user: { id: rand(16), name: account.email, displayName: account.name },
      challenge: challenge,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none'
    } }).then(function (cred) {
      if (!cred) throw new Error('none');
      var resp = cred.response, pk = resp.getPublicKey ? resp.getPublicKey() : null, alg = resp.getPublicKeyAlgorithm ? resp.getPublicKeyAlgorithm() : null;
      var rec = { id: b64u(cred.rawId), pk: pk ? b64u(pk) : '', alg: alg, at: new Date().toISOString() };
      updateAccount(account.id, function (a) { a.passkeys = (a.passkeys || []).filter(function (k) { return k.id !== rec.id; }).concat([rec]); });
      return rec;
    });
  }
  function verifyAssertion(rec, cred, challenge) {
    var r = cred.response;
    var cd; try { cd = JSON.parse(new TextDecoder().decode(r.clientDataJSON)); } catch (e) { return Promise.resolve(false); }
    if (cd.type !== 'webauthn.get' || cd.challenge !== b64u(challenge) || cd.origin !== location.origin) return Promise.resolve(false);
    var ad = new Uint8Array(r.authenticatorData);
    if (!(ad[32] & 0x04)) return Promise.resolve(false); /* user verified (face/finger/PIN) */
    if (!rec.pk) return Promise.resolve(true); /* older browser gave no key: the device check above still ran */
    var ec = rec.alg === -7;
    var algo = ec ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    return window.crypto.subtle.digest('SHA-256', r.clientDataJSON).then(function (h) {
      var data = new Uint8Array(ad.length + 32); data.set(ad, 0); data.set(new Uint8Array(h), ad.length);
      return window.crypto.subtle.importKey('spki', unb64u(rec.pk), algo, false, ['verify']).then(function (key) {
        var sig = ec ? derToRaw(r.signature) : r.signature;
        return window.crypto.subtle.verify(ec ? { name: 'ECDSA', hash: 'SHA-256' } : algo, key, sig, data);
      });
    }).catch(function () { return false; });
  }
  function passkeySignIn() {
    var all = [], owner = {};
    loadAccounts().accounts.forEach(function (a) { (a.passkeys || []).forEach(function (k) { all.push({ type: 'public-key', id: unb64u(k.id), transports: ['internal', 'hybrid'] }); owner[k.id] = { account: a, rec: k }; }); });
    if (!all.length) return Promise.reject(new Error('none-set'));
    var challenge = rand(32);
    return navigator.credentials.get({ publicKey: { challenge: challenge, allowCredentials: all, userVerification: 'required', rpId: location.hostname, timeout: 60000 } })
      .then(function (cred) {
        var o = cred && owner[b64u(cred.rawId)];
        if (!o) throw new Error('unknown');
        return verifyAssertion(o.rec, cred, challenge).then(function (ok) { if (!ok) throw new Error('bad'); return o.account; });
      });
  }
  function listenOnce(onText, onFail) {
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec; try { rec = new Ctor(); } catch (e) { onFail('This browser cannot listen.'); return null; }
    rec.lang = 'en-US'; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 3;
    var got = false;
    rec.onresult = function (ev) { got = true; var alts = []; for (var i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript); onText(alts); };
    rec.onerror = function (ev) { got = true; onFail(ev.error === 'not-allowed' ? 'Rootling needs your OK to use the microphone.' : 'I could not hear that. Try again a little closer.'); };
    rec.onend = function () { if (!got) onFail('I did not hear anything. Tap and try again.'); };
    try { rec.start(); } catch (e) { onFail('Listening could not start. Try again.'); }
    return rec;
  }
  function setVoicePhrase(account, phrase) {
    var salt = makeSalt();
    return hashPassword(normPhrase(phrase), salt).then(function (hash) { updateAccount(account.id, function (a) { a.voice = { salt: salt, hash: hash, words: normPhrase(phrase).split(' ').length, at: new Date().toISOString() }; }); });
  }
  function matchVoice(alts) {
    var accts = loadAccounts().accounts.filter(function (a) { return a.voice && a.voice.hash; });
    var tries = [];
    accts.forEach(function (a) { alts.forEach(function (t) { tries.push({ a: a, t: normPhrase(t) }); }); });
    return Promise.all(tries.map(function (x) { return hashPassword(x.t, x.a.voice.salt).then(function (h) { return h === x.a.voice.hash ? x.a : null; }); }))
      .then(function (res) { for (var i = 0; i < res.length; i++) if (res[i]) return res[i]; return null; });
  }

  /* ------------- storage wrapping (per-account spaces) ------------- */
  function activePrefix() {
    var data = loadAccounts();
    var s = loadSession();
    if (!data.accounts.length && !s) return ''; /* no accounts yet: as before */
    if (s && s.accountId) return 'acct:' + s.accountId + ':';
    return 'guest:';
  }
  function wrapKey(key) {
    if (typeof key !== 'string') return key;
    if (key === ACCOUNTS_KEY || key === SESSION_KEY) return key;
    if (APP_KEYS.indexOf(key) === -1) return key;
    var prefix = activePrefix();
    if (!prefix) return key;
    if (key.indexOf(prefix) === 0) return key; /* already inside the space */
    return prefix + key;
  }
  try {
    Storage.prototype.getItem = function (key) {
      if (this === store) return rawGet.call(this, wrapKey(key));
      return rawGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === store) return rawSet.call(this, wrapKey(key), value);
      return rawSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (this === store) return rawRemove.call(this, wrapKey(key));
      return rawRemove.call(this, key);
    };
  } catch (e) { /* if wrapping fails, the app still works as before */ }

  /* ------------- first-account move-in ------------- */
  /* When the very first account is created on a device where companions
   * already live (from before accounts existed), their data moves into
   * that account's space, checked copy-first, so nothing is lost. */
  function migrateLegacyInto(accountId) {
    var data = loadAccounts();
    if (data.migratedTo) return false;
    var prefix = 'acct:' + accountId + ':';
    var hadCore = !!getRaw('sprout-state-v1');
    if (hadCore) {
      APP_KEYS.forEach(function (k) {
        var v = getRaw(k);
        if (v !== null && v !== undefined) setRaw(prefix + k, v);
      });
      var check = getRaw(prefix + 'sprout-state-v1');
      if (check === getRaw('sprout-state-v1')) {
        APP_KEYS.forEach(function (k) { removeRaw(k); });
      }
    }
    data = loadAccounts();
    data.migratedTo = accountId;
    saveAccounts(data);
    return hadCore;
  }

  function removeAccountEverywhere(accountId) {
    var prefix = 'acct:' + accountId + ':';
    var doomed = [];
    try {
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (k && k.indexOf(prefix) === 0) doomed.push(k);
      }
    } catch (e) { /* ignore */ }
    doomed.forEach(removeRaw);
    var data = loadAccounts();
    data.accounts = data.accounts.filter(function (a) { return a.id !== accountId; });
    if (data.migratedTo === accountId) data.migratedTo = data.accounts.length ? data.accounts[0].id : null;
    saveAccounts(data);
    var s = loadSession();
    if (s && s.accountId === accountId) saveSession(null);
  }

  /* ------------- sign-in gate screens ------------- */
  var HONEST_LINE = 'Accounts live on this device only. They keep companions separate for people sharing this device. Cloud accounts — with Google, Apple, or Microsoft sign-in — arrive with the connected version of Rootling.';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function field(labelText, inputType, id, autocomplete) {
    var wrap = el('div', 'gate-field');
    var lab = el('label', '', labelText);
    lab.setAttribute('for', id);
    var input = document.createElement('input');
    input.type = inputType; input.id = id;
    input.setAttribute('autocomplete', autocomplete || 'off');
    wrap.appendChild(lab); wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function voiceSetup(account, status, vBtn) {
    vBtn.disabled = true;
    status.textContent = 'Pick a phrase of 3 or more words that is easy for you and hard to guess, like \u201cblue kite over the barn\u201d. Say it now\u2026';
    listenOnce(function (alts) {
      var first = normPhrase(alts[0]);
      if (first.split(' ').length < 3) { vBtn.disabled = false; status.textContent = 'I heard \u201c' + first + '\u201d. Please use 3 or more words. Tap to try again.'; return; }
      status.textContent = 'I heard \u201c' + first + '\u201d. Say it one more time to be sure\u2026';
      setTimeout(function () {
        listenOnce(function (alts2) {
          var same = alts2.some(function (t) { return normPhrase(t) === first; });
          if (!same) { vBtn.disabled = false; status.textContent = 'The two did not match. Tap to try again.'; return; }
          setVoicePhrase(account, first).then(function () { status.textContent = 'Voice phrase is set. Next time, tap \u201cSign in with my voice phrase\u201d.'; vBtn.textContent = 'Voice phrase is set'; });
        }, function (why) { vBtn.disabled = false; status.textContent = why; });
      }, 400);
    }, function (why) { vBtn.disabled = false; status.textContent = why; });
  }


  var gateApi = null;
  function buildGate() {
    var gate = el('div', 'account-gate');
    gate.id = 'account-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'gate-heading');
    var card = el('div', 'account-gate-card');
    gate.appendChild(card);

    function clear() { card.innerHTML = ''; }
    function heading(text) { var h = el('h2', 'gate-heading', text); h.id = 'gate-heading'; return h; }
    function errorBox() { var p = el('p', 'gate-error'); p.setAttribute('role', 'alert'); return p; }

    function showLanding() {
      clear();
      card.appendChild(el('div', 'gate-mark', '🌱'));
      card.appendChild(heading('Welcome to Rootling'));
      card.appendChild(el('p', 'gate-line', 'Your tiny self-care friend. Adopt a companion, grow together, and take small kind steps each day.'));
      var createBtn = el('button', 'btn btn-primary gate-btn', 'Create Account');
      createBtn.type = 'button';
      createBtn.addEventListener('click', showCreate);
      var signBtn = el('button', 'btn btn-soft gate-btn', 'Sign In');
      signBtn.type = 'button';
      signBtn.addEventListener('click', showSignIn);
      card.appendChild(createBtn);
      card.appendChild(signBtn);
      addQuickButtons(card);
      card.appendChild(el('p', 'fineprint gate-honest', HONEST_LINE));
    }

    function showCreate() {
      clear();
      card.appendChild(heading('Create your account'));
      card.appendChild(el('p', 'gate-line', 'Three small things. Then you meet your companion right away.'));
      var nameF = field('Your name', 'text', 'gate-name', 'name');
      var emailF = field('Your email', 'email', 'gate-email', 'email');
      var pwF = field('Choose a password (6 or more letters)', 'password', 'gate-password', 'new-password');
      var hintF = field('Password reminder \u2014 a clue only you understand (not the password)', 'text', 'gate-hint', 'off');
      hintF.input.maxLength = 80; hintF.input.placeholder = 'Example: my first pet + the year';
      var err = errorBox();
      var btn = el('button', 'btn btn-primary gate-btn', 'Create Account');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var name = nameF.input.value.trim();
        var email = emailF.input.value.trim().toLowerCase();
        var pw = pwF.input.value;
        if (!name) { err.textContent = 'Please write your name.'; return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'That email does not look complete. Check it and try again.'; return; }
        if (!pw || pw.length < 6) { err.textContent = 'Please pick a password with 6 or more letters.'; return; }
        var hp = hintProblem(hintF.input.value, pw); if (hp) { err.textContent = hp; hintF.input.focus(); return; }
        var data = loadAccounts();
        for (var i = 0; i < data.accounts.length; i++) {
          if (data.accounts[i].email === email) {
            err.textContent = 'An account with this email already lives on this device. Try Sign In instead.';
            return;
          }
        }
        btn.disabled = true;
        var salt = makeSalt();
        hashPassword(pw, salt).then(function (hash) {
          var account = {
            id: uid(), name: name, email: email,
            salt: salt, hash: hash,
            hint: hintF.input.value.trim(),
            subscriptionTier: 'Free',
            createdAt: new Date().toISOString()
          };
          var d2 = loadAccounts();
          d2.accounts.push(account);
          saveAccounts(d2);
          saveSession(account.id);
          migrateLegacyInto(account.id);
          showEasier(account);
        });
      });
      var back = el('button', 'btn btn-ghost gate-btn', 'Back');
      back.type = 'button';
      back.addEventListener('click', showLanding);
      card.appendChild(nameF.wrap); card.appendChild(emailF.wrap); card.appendChild(pwF.wrap); card.appendChild(hintF.wrap);
      card.appendChild(err); card.appendChild(btn); card.appendChild(back);
      card.appendChild(el('p', 'fineprint gate-honest', HONEST_LINE));
    }

    function showReset() {
      clear();
      card.appendChild(heading('Reset your password'));
      card.appendChild(el('p', 'gate-line', 'Tip: go back and tap \u201cShow my password reminder\u201d first. It may help you remember.'));
      card.appendChild(el('p', 'gate-line', 'Because this account lives only on this device, the reset happens here too: write your email and the name on the account, then pick a new password. Anyone holding this device could do the same — cloud accounts will check by email instead.'));
      var emailF = field('Your email', 'email', 'gate-reset-email', 'email');
      var nameF = field('Name on the account', 'text', 'gate-reset-name', 'name');
      var pwF = field('New password (6 or more letters)', 'password', 'gate-reset-password', 'new-password');
      var err = errorBox();
      var btn = el('button', 'btn btn-primary gate-btn', 'Set New Password');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var email = emailF.input.value.trim().toLowerCase();
        var name = nameF.input.value.trim().toLowerCase();
        var pw = pwF.input.value;
        if (!pw || pw.length < 6) { err.textContent = 'Please pick a password with 6 or more letters.'; return; }
        var data = loadAccounts();
        var account = null;
        for (var i = 0; i < data.accounts.length; i++) {
          if (data.accounts[i].email === email && data.accounts[i].name.trim().toLowerCase() === name) account = data.accounts[i];
        }
        if (!account) { err.textContent = 'That email and name do not match an account on this device.'; return; }
        btn.disabled = true;
        var salt = makeSalt();
        hashPassword(pw, salt).then(function (hash) {
          var d2 = loadAccounts();
          for (var i = 0; i < d2.accounts.length; i++) {
            if (d2.accounts[i].id === account.id) { d2.accounts[i].salt = salt; d2.accounts[i].hash = hash; }
          }
          saveAccounts(d2);
          saveSession(account.id);
          showHintSetup(account, pw);
        });
      });
      var back = el('button', 'btn btn-ghost gate-btn', 'Back');
      back.type = 'button';
      back.addEventListener('click', showSignIn);
      card.appendChild(emailF.wrap); card.appendChild(nameF.wrap); card.appendChild(pwF.wrap);
      card.appendChild(err); card.appendChild(btn); card.appendChild(back);
    }

    function showSignIn() {
      clear();
      card.appendChild(heading('Sign in'));
      card.appendChild(el('p', 'gate-line', 'Welcome back. Your companions are right where you left them.'));
      var emailF = field('Your email', 'email', 'gate-signin-email', 'email');
      var pwF = field('Your password', 'password', 'gate-signin-password', 'current-password');
      var err = errorBox();
      var btn = el('button', 'btn btn-primary gate-btn', 'Sign In');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var email = emailF.input.value.trim().toLowerCase();
        var pw = pwF.input.value;
        var data = loadAccounts();
        var account = null;
        for (var i = 0; i < data.accounts.length; i++) {
          if (data.accounts[i].email === email) account = data.accounts[i];
        }
        if (!account) { err.textContent = 'No account with this email lives on this device.'; return; }
        btn.disabled = true;
        hashPassword(pw, account.salt).then(function (hash) {
          if (hash === account.hash) {
            saveSession(account.id);
            if (!account.hint) showHintSetup(account, pw);
            else window.location.reload();
          } else {
            btn.disabled = false;
            err.textContent = 'That password does not match this account. Try again, or reset it below.';
          }
        });
      });
      var hintOut = el('p', 'gate-hint-out'); hintOut.setAttribute('role', 'status'); hintOut.hidden = true;
      var hintBtn = el('button', 'btn btn-soft gate-btn', 'Show my password reminder');
      hintBtn.type = 'button';
      hintBtn.addEventListener('click', function () {
        var email = emailF.input.value.trim().toLowerCase(), acc = null;
        loadAccounts().accounts.forEach(function (a) { if (a.email === email) acc = a; });
        hintOut.hidden = false;
        if (!email) { hintOut.textContent = 'Write your email first, then tap this again.'; emailF.input.focus(); return; }
        hintOut.textContent = !acc ? 'No account with this email lives on this device.' : acc.hint ? 'Your reminder: \u201c' + acc.hint + '\u201d' : 'This account has no reminder yet. You can reset your password below.';
      });
      var resetBtn = el('button', 'btn btn-soft gate-btn', 'Forgot your password? Reset it');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', showReset);
      var back = el('button', 'btn btn-ghost gate-btn', 'Back');
      back.type = 'button';
      back.addEventListener('click', showLanding);
      card.appendChild(emailF.wrap); card.appendChild(pwF.wrap);
      card.appendChild(err); card.appendChild(btn);
      /* Password reset sits directly under Sign In (v14, Daniel's
       * order) — a clear labeled button, never buried under extras. */
      card.appendChild(resetBtn);
      addQuickButtons(card);
      card.appendChild(hintBtn); card.appendChild(hintOut); card.appendChild(back);
    }

    /* Face / fingerprint and voice sign-in buttons, shown only when this
     * device has at least one account that set them up. */
    function addQuickButtons(where) {
      var accts = loadAccounts().accounts;
      var anyKey = accts.some(function (a) { return a.passkeys && a.passkeys.length; });
      var anyVoice = accts.some(function (a) { return a.voice && a.voice.hash; });
      var msg = errorBox();
      var added = false;
      if (anyKey && passkeySupported()) {
        var fb = el('button', 'btn btn-soft gate-btn gate-quick', 'Sign in with face or fingerprint');
        fb.type = 'button';
        fb.addEventListener('click', function () {
          msg.textContent = ''; fb.disabled = true;
          passkeySignIn().then(function (acc) { saveSession(acc.id); window.location.reload(); })
            .catch(function (e) { fb.disabled = false; msg.textContent = e && e.name === 'NotAllowedError' ? 'That was cancelled or did not match. Try again, or use your password.' : 'Face or fingerprint sign-in did not work. Use your password this time.'; });
        });
        where.appendChild(fb); added = true;
      }
      if (anyVoice && voiceSupported()) {
        var vb = el('button', 'btn btn-soft gate-btn gate-quick', 'Sign in with my voice phrase');
        vb.type = 'button';
        vb.addEventListener('click', function () {
          msg.textContent = 'Listening\u2026 say your secret phrase now.'; vb.disabled = true;
          listenOnce(function (alts) {
            matchVoice(alts).then(function (acc) {
              vb.disabled = false;
              if (acc) { saveSession(acc.id); window.location.reload(); }
              else msg.textContent = 'That phrase did not match. Try again, or use your password.';
            });
          }, function (why) { vb.disabled = false; msg.textContent = why; });
        });
        where.appendChild(vb); added = true;
      }
      if (added) where.appendChild(msg);
    }

    /* Asked of every account that has no reminder yet. */
    function showHintSetup(account, pw) {
      clear();
      card.appendChild(heading('Set a password reminder'));
      card.appendChild(el('p', 'gate-line', 'A reminder is a clue that helps you remember your password if you forget it. Only write something you would understand.'));
      var hintF = field('Password reminder (not the password)', 'text', 'gate-hint-setup', 'off');
      hintF.input.maxLength = 80; hintF.input.placeholder = 'Example: my first pet + the year';
      var err = errorBox();
      var btn = el('button', 'btn btn-primary gate-btn', 'Save reminder'); btn.type = 'button';
      btn.addEventListener('click', function () {
        var hp = hintProblem(hintF.input.value, pw); if (hp) { err.textContent = hp; return; }
        updateAccount(account.id, function (a) { a.hint = hintF.input.value.trim(); });
        showEasier(account);
      });
      var skip = el('button', 'btn btn-ghost gate-btn', 'Not now'); skip.type = 'button';
      skip.addEventListener('click', function () { showEasier(account); });
      card.appendChild(hintF.wrap); card.appendChild(err); card.appendChild(btn); card.appendChild(skip);
    }

    /* After making an account (or adding a reminder): offer face or
     * fingerprint, and a voice phrase. Each is optional. */
    function showEasier(account) {
      clear();
      card.appendChild(el('div', 'gate-mark', '\ud83d\udd11'));
      card.appendChild(heading('Make signing in easier'));
      card.appendChild(el('p', 'gate-line', 'You can also open your pet with your face, your fingerprint, or a phrase you say out loud. These are optional. Your password still works.'));
      var status = el('p', 'gate-hint-out'); status.setAttribute('role', 'status');
      var faceBtn = el('button', 'btn btn-primary gate-btn', 'Use my face or fingerprint'); faceBtn.type = 'button'; faceBtn.hidden = true;
      passkeyAvailable().then(function (ok) { faceBtn.hidden = !ok; if (!ok) status.textContent = 'Face or fingerprint sign-in is not available on this device or browser.'; });
      faceBtn.addEventListener('click', function () {
        faceBtn.disabled = true; status.textContent = 'Follow your device\u2019s steps (Face ID, Windows Hello, or fingerprint).';
        createPasskey(account).then(function () { status.textContent = 'Done. Next time, tap \u201cSign in with face or fingerprint\u201d.'; faceBtn.textContent = 'Face or fingerprint is set'; })
          .catch(function () { faceBtn.disabled = false; status.textContent = 'That did not finish. You can try again, or set it up later in Settings.'; });
      });
      card.appendChild(faceBtn);
      if (voiceSupported()) {
        var vBtn = el('button', 'btn btn-soft gate-btn', 'Set a voice phrase'); vBtn.type = 'button';
        vBtn.addEventListener('click', function () { voiceSetup(account, status, vBtn); });
        card.appendChild(vBtn);
      }
      card.appendChild(status);
      var go = el('button', 'btn btn-soft gate-btn', 'Meet my companion'); go.type = 'button';
      go.addEventListener('click', function () { window.location.reload(); });
      card.appendChild(go);
      card.appendChild(el('p', 'fineprint gate-honest', 'Face and fingerprint are checked by your own device. Rootling never sees or keeps a picture of your face or your fingerprint. A voice phrase checks the words you say, not the sound of your voice, so say it where nobody can hear. Your browser may send the sound to its maker to turn it into words; Rootling keeps only a scrambled copy of the phrase.'));
    }

    showLanding();
    document.body.appendChild(gate);
    gateApi = { showEasier: showEasier, showHintSetup: showHintSetup };
    document.body.classList.add('account-locked');
  }

  /* ------------- Settings account card ------------- */
  function fillAccountCard() {
    var summary = document.getElementById('account-summary');
    var signOutBtn = document.getElementById('account-signout-btn');
    var deleteBtn = document.getElementById('account-delete-btn');
    if (!summary) return;
    var account = currentAccount();
    if (account) {
      summary.textContent = 'Signed in as ' + account.name + ' (' + account.email + '). Your companions and everything they remember live in your own space on this device.';
    } else {
      summary.textContent = 'You are not signed in on this device right now.';
    }
    if (signOutBtn) {
      signOutBtn.hidden = !account;
      signOutBtn.addEventListener('click', function () {
        saveSession(null);
        window.location.reload();
      });
    }
    if (account) buildSignInOptions(summary, account);
    if (deleteBtn) {
      deleteBtn.hidden = !account;
      deleteBtn.addEventListener('click', function () {
        var ok = window.confirm('Delete this account and ALL of its companions and memories from this device? This cannot be undone.');
        if (!ok) return;
        removeAccountEverywhere(account.id);
        window.location.reload();
      });
    }
  }

  /* Settings → Account: password reminder, face/fingerprint, voice phrase. */
  function buildSignInOptions(after, account) {
    var box = document.getElementById('signin-options');
    if (box) box.remove();
    box = el('div', 'signin-options'); box.id = 'signin-options';
    box.appendChild(el('h4', '', 'Ways to sign in'));
    var status = el('p', 'gentle'); status.setAttribute('role', 'status');
    function fresh() { var a = null; loadAccounts().accounts.forEach(function (x) { if (x.id === account.id) a = x; }); return a || account; }
    function row(title, desc) { var r = el('div', 'signin-row'); r.appendChild(el('p', 'signin-title', title)); r.appendChild(el('p', 'gentle small', desc)); var acts = el('div', 'choice-row'); r.appendChild(acts); box.appendChild(r); return acts; }
    function btn(label, cls, fn) { var b = el('button', 'btn ' + (cls || 'btn-soft'), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function redraw() { buildSignInOptions(after, fresh()); }
    var a = fresh();
    /* reminder */
    var r1 = row('Password reminder', a.hint ? 'Set. It is shown only when you tap \u201cShow my password reminder\u201d on the sign-in screen.' : 'Not set yet. A reminder helps you remember your password.');
    var hin = document.createElement('input'); hin.type = 'text'; hin.maxLength = 80; hin.id = 'signin-hint-input'; hin.placeholder = 'A clue, not the password'; hin.value = a.hint || '';
    var hl = el('label', 'sr-only', 'Password reminder'); hl.setAttribute('for', 'signin-hint-input');
    r1.appendChild(hl); r1.appendChild(hin);
    r1.appendChild(btn(a.hint ? 'Save new reminder' : 'Save reminder', 'btn-soft', function () {
      var hp = hintProblem(hin.value, ''); if (hp) { status.textContent = hp; return; }
      updateAccount(a.id, function (x) { x.hint = hin.value.trim(); }); status.textContent = 'Reminder saved.'; redraw();
    }));
    /* passkey */
    var keys = (a.passkeys || []).length;
    var r2 = row('Face or fingerprint', keys ? 'On for this device. Your device checks your face or finger; Rootling never sees them.' : 'Off. Uses Face ID, Windows Hello, or your fingerprint reader.');
    passkeyAvailable().then(function (ok) {
      if (!ok && !keys) { r2.appendChild(el('span', 'gentle small', 'Not available on this device or browser.')); return; }
      if (ok) r2.appendChild(btn(keys ? 'Add again' : 'Turn on', keys ? 'btn-ghost' : 'btn-primary', function () {
        status.textContent = 'Follow your device\u2019s steps.';
        createPasskey(a).then(function () { status.textContent = 'Face or fingerprint sign-in is on.'; redraw(); }).catch(function () { status.textContent = 'That did not finish. Try again any time.'; });
      }));
      if (keys) r2.appendChild(btn('Turn off', 'btn-ghost', function () { updateAccount(a.id, function (x) { x.passkeys = []; }); status.textContent = 'Face or fingerprint sign-in is off. (You can also remove the passkey in your device settings.)'; redraw(); }));
    });
    /* voice */
    var r3 = row('Voice phrase', a.voice ? 'On. Say your secret phrase to sign in. It checks the words, not the sound of your voice.' : 'Off. Say a secret phrase of 3 or more words to sign in.');
    if (voiceSupported()) r3.appendChild(btn(a.voice ? 'Change phrase' : 'Set a phrase', a.voice ? 'btn-ghost' : 'btn-soft', function (e) { voiceSetup(a, status, e.currentTarget); }));
    else r3.appendChild(el('span', 'gentle small', 'This browser cannot listen. Try Chrome, Edge, or Safari.'));
    if (a.voice) r3.appendChild(btn('Turn off', 'btn-ghost', function () { updateAccount(a.id, function (x) { delete x.voice; }); status.textContent = 'Voice phrase is off.'; redraw(); }));
    box.appendChild(status);
    after.parentNode.insertBefore(box, after.nextSibling);
  }

  function init() {
    var account = currentAccount();
    var session = loadSession();
    if (session && !account) saveSession(null); /* stale session */
    if (!account) buildGate();
    else fillAccountCard();
  }

  window.RootlingAccounts = {
    current: currentAccount,
    accounts: function () { return loadAccounts().accounts.slice(); },
    signOut: function () { saveSession(null); window.location.reload(); },
    deleteAccount: function (id) { removeAccountEverywhere(id || (currentAccount() || {}).id); window.location.reload(); },
    appKeys: APP_KEYS.slice(),
    _test: { hintProblem: hintProblem, normPhrase: normPhrase, derToRaw: derToRaw, matchVoice: matchVoice, setVoicePhrase: setVoicePhrase }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
