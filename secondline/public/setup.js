/* Setup: one question per screen, every answer pre-filled where we can.
   Progress is saved on the phone, so a dropped signal loses nothing. */
(function () {
  'use strict';
  var TRADES = JSON.parse(document.getElementById('trades').textContent);
  var ORDER = ['name', 'trade', 'owner', 'phone', 'hours', 'services', 'voice', 'test'];
  var STORE_KEY = 'sl-setup-v1';
  var AGENTS = ['Jamie', 'Sam', 'Alex', 'Taylor', 'Morgan'];
  var DEFAULT_HOURS = { mon: [7, 18], tue: [7, 18], wed: [7, 18], thu: [7, 18], fri: [7, 18], sat: [8, 14], sun: null };

  var state = load() || {};
  if (!state.hours) state.hours = JSON.parse(JSON.stringify(DEFAULT_HOURS));
  if (!state.agentName) state.agentName = 'Jamie';
  try { state.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* keep default */ }

  var params = new URLSearchParams(location.search);
  var resume = params.get('resume');
  // Coming from a personal demo page: fill in what we already know.
  var leadSlug = params.get('lead');
  if (leadSlug && /^[a-z0-9-]{3,60}$/.test(leadSlug)) {
    state.lead = leadSlug;
    fetch('/api/lead/' + leadSlug).then(function (r) { return r.ok ? r.json() : null; }).then(function (l) {
      if (!l) return;
      if (!state.name) state.name = l.name;
      if (!state.trade) state.trade = l.trade;
      if (!state.ownerName && l.ownerName) state.ownerName = l.ownerName;
      save();
      if (ORDER[current] === 'name') show(current);
    }).catch(function () { /* fine, they type it */ });
  }
  if (resume) state.token = resume;

  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var current = 0;
  function show(i) {
    current = Math.max(0, Math.min(ORDER.length - 1, i));
    var key = ORDER[current];
    $$('[data-screen]').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-screen') === key); });
    var stepNo = Math.min(current + 1, 7);
    $('[data-step-label]').textContent = key === 'test' ? 'Step 7 of 7 · Try it' : 'Step ' + stepNo + ' of 7';
    $('[data-bar]').style.width = (key === 'test' ? 100 : (current / 7) * 100) + '%';
    var scr = $('[data-screen="' + key + '"]');
    var err = $('[data-error]', scr); if (err) err.textContent = '';
    enter[key] && enter[key](scr);
    var inp = $('input.input', scr);
    if (inp && window.matchMedia('(pointer:fine)').matches) inp.focus();
    window.scrollTo(0, 0);
    state.at = key; save();
  }

  function greeting() {
    return "Hi, this is " + (state.name || 'your business') + "'s office, " + state.agentName + ' speaking. How can I help?';
  }

  var enter = {
    name: function (s) { $('[data-k="name"]', s).value = state.name || ''; },
    trade: function (s) { $$('[data-trade]', s).forEach(function (t) { t.setAttribute('aria-pressed', t.getAttribute('data-trade') === state.trade); }); },
    owner: function (s) { $('[data-k="ownerName"]', s).value = state.ownerName || ''; echo(); },
    phone: function (s) { $('[data-k="ownerPhone"]', s).value = state.ownerPhone || ''; },
    hours: function () { $('[data-hours-summary]').innerHTML = window.SLHours.summary(state.hours).map(esc).join('<br>'); },
    services: function (s) {
      var all = TRADES[state.trade || 'other'].services.slice();
      (state.services || []).forEach(function (x) { if (all.indexOf(x) < 0) all.push(x); });
      if (!state.services || state.servicesTrade !== state.trade) { state.services = TRADES[state.trade || 'other'].services.slice(); state.servicesTrade = state.trade; }
      window.SLHours.ServiceChips($('[data-services]', s), all, state.services, function () { save(); });
    },
    voice: function (s) {
      var box = $('[data-agent-names]', s); box.innerHTML = '';
      AGENTS.forEach(function (n) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = n;
        c.setAttribute('aria-pressed', n === state.agentName);
        c.onclick = function () { state.agentName = n; save(); enter.voice(s); playGreeting(); };
        box.appendChild(c);
      });
      $('[data-greeting]', s).textContent = greeting();
    },
    test: function (s) {
      var slot = $('[data-test-slot]', s);
      if (slot.getAttribute('data-for') === state.token) return;
      slot.setAttribute('data-for', state.token);
      slot.innerHTML = $('#test-widget').innerHTML;
      var root = $('#test-phone', slot);
      $('[data-biz-name]', root).textContent = state.name;
      $('.avatar', root).textContent = state.agentName[0];
      $('.sub span:last-child', root).textContent = state.agentName + ' answering';
      var c = new window.Convo(root, {
        start: function () { return window.SLpost('/api/biz/' + state.token + '/test-start'); },
        say: function (sess, text) { return window.SLpost('/api/biz/' + state.token + '/test-say', { session: sess, text: text }); },
        agentName: function () { return state.agentName; },
        ownerName: function () { return state.ownerName || 'you'; },
      });
      c.base = ['Need help with ' + ((state.services && state.services[0]) || 'a repair').toLowerCase() + ' this week', 'There\'s water everywhere!', 'Can I talk to ' + (state.ownerName || 'the owner') + '?'];
      c.start();
    },
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function echo() { $$('[data-echo="ownerName"]').forEach(function (e) { e.textContent = state.ownerName || 'you'; }); }
  function digits(s) { var d = String(s || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
  function fail(msg) { var e = $('[data-error]', $('.screen.on')); if (e) e.textContent = msg; }

  var check = {
    name: function () { state.name = $('[data-k="name"]').value.trim(); return state.name ? null : 'Type your business name — the way you say it on the phone.'; },
    owner: function () { state.ownerName = $('[data-k="ownerName"]').value.trim(); return state.ownerName ? null : 'Just your first name.'; },
    phone: function () {
      var d = digits($('[data-k="ownerPhone"]').value);
      if (d.length !== 10) return 'That should be 10 digits, like (555) 123-4567.';
      state.ownerPhone = d; return null;
    },
  };

  function next() {
    var key = ORDER[current];
    var err = check[key] && check[key]();
    if (err) return fail(err);
    save();
    if (key === 'voice') return createBusiness();
    show(current + 1);
  }

  function createBusiness() {
    var btn = $('[data-screen="voice"] [data-next]');
    btn.disabled = true; btn.textContent = 'Setting up…';
    var payload = { lead: state.lead, name: state.name, trade: state.trade, ownerName: state.ownerName, ownerPhone: state.ownerPhone, hours: state.hours, services: state.services, agentName: state.agentName, timezone: state.timezone };
    var req = state.token
      ? window.SLpost('/api/biz/' + state.token + '/update', payload).then(function (r) { if (r.error === 'Link not found.') { state.token = null; return window.SLpost('/api/setup', payload); } return { token: state.token, error: r.error }; })
      : window.SLpost('/api/setup', payload);
    req.then(function (r) {
      btn.disabled = false; btn.textContent = 'Next: try a test call';
      if (!r || r.error) return fail((r && r.error) || 'Something went wrong. Try again.');
      state.token = r.token; save();
      show(ORDER.indexOf('test'));
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Next: try a test call';
      fail('No signal right now. Your answers are saved — try again in a moment.');
    });
  }

  // wiring
  $$('[data-next]').forEach(function (b) { b.addEventListener('click', next); });
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', function () { show(current - 1); }); });
  $$('.screen input.input').forEach(function (i) {
    i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    i.addEventListener('input', function () { if (i.getAttribute('data-k') === 'ownerName') { state.ownerName = i.value.trim(); echo(); } });
  });
  $$('[data-screen="trade"] [data-trade]').forEach(function (t) {
    t.addEventListener('click', function () {
      state.trade = t.getAttribute('data-trade');
      enter.trade($('[data-screen="trade"]'));
      save();
      setTimeout(function () { show(current + 1); }, 180);
    });
  });
  $('[data-edit-hours]').addEventListener('click', function () {
    var ed = $('[data-hours-editor]');
    ed.hidden = !ed.hidden;
    if (!ed.hidden) window.SLHours.HoursEditor(ed, state.hours, function () { save(); enter.hours(); });
  });
  function playGreeting() {
    window.SLpost('/api/voice/preview', { name: state.name, agentName: state.agentName })
      .then(function (r) { window.SLvoice(greeting(), r && r.audio); })
      .catch(function () { window.SLspeak(greeting()); });
  }
  $('[data-play]').addEventListener('click', playGreeting);
  $('[data-golive]').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Turning it on…';
    window.SLpost('/api/biz/' + state.token + '/golive').then(function (r) {
      if (r && r.next) { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } location.href = r.next; }
      else { b.disabled = false; b.textContent = 'Turn on my second line'; fail((r && r.error) || 'Something went wrong. Try again.'); }
    }).catch(function () { b.disabled = false; b.textContent = 'Turn on my second line'; fail('No signal right now. Try again in a moment.'); });
  });

  var startAt = state.token && (resume || state.at === 'test') ? ORDER.indexOf('test') : Math.max(0, ORDER.indexOf(state.at || 'name'));
  if (startAt === ORDER.indexOf('test') && !state.name) startAt = 0;
  show(startAt);
})();
