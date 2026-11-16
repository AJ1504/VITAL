/* Owner dashboard + settings. Every change is two taps or less, and every
   change can be undone from the toast that confirms it. */
(function () {
  'use strict';
  var T = window.SL.token;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function post(action, body) {
    return window.fetch('/api/biz/' + T + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  }
  function ssGet(k) { try { var v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return JSON.parse(v || 'null'); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  var toastTimer;
  function toast(text, undo) {
    var t = $('[data-toast]'); if (!t) return;
    $('[data-toast-text]', t).textContent = text;
    var u = $('[data-toast-undo]', t);
    u.hidden = !undo;
    u.onclick = function () { t.classList.remove('on'); if (undo) undo(); };
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, undo ? 8000 : 3000);
  }

  function openSheet(name) { var s = $('[data-sheet="' + name + '"]'); if (s) { s.classList.add('on'); var b = $('button', s); if (b) b.focus(); } }
  function closeSheets() { $$('.sheet-bg.on').forEach(function (s) { s.classList.remove('on'); }); }
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheets); });
  $$('.sheet-bg').forEach(function (bg) { bg.addEventListener('click', function (e) { if (e.target === bg) closeSheets(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheets(); });
  $$('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openSheet(b.getAttribute('data-open')); }); });

  // Status changes reload the page, then show a toast with Undo.
  function act(action, msg, undoAction) {
    return post(action).then(function (r) {
      closeSheets();
      if (r && r.error) return toast(r.error);
      ssSet('sl-toast', { msg: msg, undo: undoAction || null });
      location.reload();
    }).catch(function () { toast('No signal. Try again.'); });
  }
  var MSG = { pause: 'Paused. Calls go to voicemail.', resume: 'Back on. Every call gets answered.', cancel: 'Cancelled. No more charges.', reactivate: 'Welcome back — your line is answering again.' };
  var UNDO = { pause: 'resume', resume: 'pause', cancel: 'reactivate', reactivate: 'cancel' };
  var pending = ssGet('sl-toast');
  if (pending) toast(pending.msg, pending.undo ? function () { act(pending.undo, MSG[pending.undo]); } : null);

  // On/off switch: turning off asks first; turning back on is one tap.
  var sw = $('[data-switch]');
  if (sw) sw.addEventListener('click', function () {
    if (sw.getAttribute('aria-checked') === 'true') openSheet('pause');
    else act('resume', MSG.resume, UNDO.resume);
  });
  $$('[data-confirm]').forEach(function (b) {
    b.addEventListener('click', function () { var a = b.getAttribute('data-confirm'); act(a, MSG[a], UNDO[a]); });
  });
  $$('[data-action]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-action');
      if (a === 'pause') {
        if ($('[data-sheet="pause"]')) return openSheet('pause');
        return act('pause', MSG.pause, UNDO.pause);
      }
      if (a === 'keep') return act('keep', "Thanks! We'll text you a payment link.");
      act(a, MSG[a], UNDO[a]);
    });
  });

  // "Done" on a call-back card hides it, with undo.
  $$('[data-done]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-done');
      var card = b.closest('[data-call]');
      post('call-done/' + id).then(function () {
        card.hidden = true;
        toast('Marked done.', function () { post('call-done/' + id).then(function () { card.hidden = false; }); });
      });
    });
  });

  // ---------- settings ----------
  if (window.SLHours && window.SL.hours) {
    var hours = JSON.parse(JSON.stringify(window.SL.hours));
    var services = window.SL.services.slice();
    var hb = $('[data-hours-editor]');
    if (hb) window.SLHours.HoursEditor(hb, hours, function () {});
    var sb = $('[data-services]');
    if (sb) window.SLHours.ServiceChips(sb, window.SL.allServices.slice(), services, function () {});

    var play = $('[data-play]');
    if (play) play.addEventListener('click', function () { speak($('[data-k="greeting"]').value.trim()); });

    $$('[data-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var keys = btn.getAttribute('data-save').split(',');
        var row = btn.closest('[data-row]');
        var body = {};
        keys.forEach(function (k) {
          if (k === 'hours') body.hours = hours;
          else if (k === 'services') body.services = services;
          else body[k] = $('[data-k="' + k + '"]', row).value;
        });
        // Renaming the receptionist updates the greeting too.
        if (body.agentName && body.greeting && body.greeting.indexOf(window.SL.agentName) >= 0) {
          body.greeting = body.greeting.split(window.SL.agentName).join(body.agentName.trim());
        }
        btn.disabled = true;
        post('update', body).then(function (r) {
          btn.disabled = false;
          var err = $('[data-error]', row);
          if (r.error) { err.textContent = r.error; return; }
          ssSet('sl-saved', { msg: 'Saved.', prev: r.previous });
          location.reload();
        }).catch(function () { btn.disabled = false; toast('No signal. Try again.'); });
      });
    });
  }
  var saved = ssGet('sl-saved');
  if (saved) toast(saved.msg, saved.prev ? function () {
    post('update', saved.prev).then(function () { ssSet('sl-saved', { msg: 'Changed back.', prev: null }); location.reload(); });
  } : null);

  function speak(text) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      var vs = speechSynthesis.getVoices().filter(function (v) { return /^en[-_]US/i.test(v.lang); });
      if (vs.length) u.voice = vs.filter(function (v) { return /Samantha|Google US|Aria|Jenny/.test(v.name); })[0] || vs[0];
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device */ }
  }
})();
