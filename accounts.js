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
    'rootling-pending-adopt-v1'
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
      card.appendChild(el('p', 'fineprint gate-honest', HONEST_LINE));
    }

    function showCreate() {
      clear();
      card.appendChild(heading('Create your account'));
      card.appendChild(el('p', 'gate-line', 'Three small things. Then you meet your companion right away.'));
      var nameF = field('Your name', 'text', 'gate-name', 'name');
      var emailF = field('Your email', 'email', 'gate-email', 'email');
      var pwF = field('Choose a password (6 or more letters)', 'password', 'gate-password', 'new-password');
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
            subscriptionTier: 'Free',
            createdAt: new Date().toISOString()
          };
          var d2 = loadAccounts();
          d2.accounts.push(account);
          saveAccounts(d2);
          saveSession(account.id);
          migrateLegacyInto(account.id);
          window.location.reload();
        });
      });
      var back = el('button', 'btn btn-ghost gate-btn', 'Back');
      back.type = 'button';
      back.addEventListener('click', showLanding);
      card.appendChild(nameF.wrap); card.appendChild(emailF.wrap); card.appendChild(pwF.wrap);
      card.appendChild(err); card.appendChild(btn); card.appendChild(back);
      card.appendChild(el('p', 'fineprint gate-honest', HONEST_LINE));
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
            window.location.reload();
          } else {
            btn.disabled = false;
            err.textContent = 'That password does not match this account. Try again, or reset it below.';
          }
        });
      });
      var resetBtn = el('button', 'btn btn-ghost gate-btn', 'I forgot my password');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', showReset);
      var back = el('button', 'btn btn-ghost gate-btn', 'Back');
      back.type = 'button';
      back.addEventListener('click', showLanding);
      card.appendChild(emailF.wrap); card.appendChild(pwF.wrap);
      card.appendChild(err); card.appendChild(btn); card.appendChild(resetBtn); card.appendChild(back);
    }

    function showReset() {
      clear();
      card.appendChild(heading('Reset your password'));
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
          window.location.reload();
        });
      });
      var back = el('button', 'btn btn-ghost gate-btn', 'Back');
      back.type = 'button';
      back.addEventListener('click', showSignIn);
      card.appendChild(emailF.wrap); card.appendChild(nameF.wrap); card.appendChild(pwF.wrap);
      card.appendChild(err); card.appendChild(btn); card.appendChild(back);
    }

    showLanding();
    document.body.appendChild(gate);
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
    appKeys: APP_KEYS.slice()
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
