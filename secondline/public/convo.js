/* The conversation widget: used for the landing-page demo and the setup test call.
   Tap-through quick replies mean anyone can finish a full call in under a minute. */
(function () {
  'use strict';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function quickReplies(agentText, firstTurn, base) {
    var t = agentText.toLowerCase();
    if (firstTurn) return base;
    if (/which works better\?$/.test(t) && /call you back/.test(t)) return ['Book me in', 'Just call me back'];
    if (/would you like a call back/.test(t)) return ['Book a visit', 'Call me back'];
    if (/i've got .* or .*which works better/.test(t)) return ['The first one', 'The second one', 'Neither — Friday morning?'];
    if (/does that work\?/.test(t)) return ['Yes', 'No'];
    if (/what day and time/.test(t)) return ['Tomorrow morning', 'Friday afternoon', 'Whenever is soonest'];
    if (/your name|name one more time/.test(t)) return ['Dana Lopez'];
    if (/address|street address/.test(t)) return ['42 Elm Street'];
    if (/best one to reach you\?|reach you at the number/.test(t)) return ['Yes', 'No, use a different number'];
    if (/best number to reach you|full number|what was that number/.test(t)) return ['555-201-4321'];
    if (/anything else/.test(t)) return ["No, that's it", 'The side gate is locked'];
    if (/what can we help|what's going on/.test(t)) return base;
    return [];
  }

  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    var vs = window.speechSynthesis.getVoices().filter(function (v) { return /^en[-_]US/i.test(v.lang); });
    var pref = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Allison', 'Ava'];
    for (var i = 0; i < pref.length; i++) {
      for (var j = 0; j < vs.length; j++) if (vs[j].name.indexOf(pref[i]) >= 0) return vs[j];
    }
    return vs[0] || null;
  }

  // Natural voice clips from the server, played one after another.
  var current = null;
  function playClips(urls, fallbackText) {
    stopAll();
    var i = 0;
    function next() {
      if (i >= urls.length) { current = null; return; }
      var a = new Audio(urls[i++]);
      current = a;
      a.onended = next;
      a.play().catch(function () { current = null; if (fallbackText) speak(fallbackText); });
    }
    next();
  }
  function stopAll() {
    if (current) { try { current.pause(); } catch (e) { /* ignore */ } current = null; }
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
  function voice(text, audio) {
    if (audio && audio.length) playClips(audio, text); else speak(text);
  }

  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.replace(/—/g, ',').replace(/…/g, '...'));
      var v = pickVoice();
      if (v) u.voice = v;
      u.rate = 0.98; u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device */ }
  }
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = function () {};

  function Convo(root, opts) {
    this.root = root;
    this.opts = opts;
    this.convo = root.querySelector('[data-convo]');
    this.suggest = root.querySelector('[data-suggest]');
    this.form = root.querySelector('[data-form]');
    this.input = root.querySelector('[data-input]');
    this.result = root.nextElementSibling && root.nextElementSibling.matches('[data-result]') ? root.nextElementSibling : null;
    this.voiceBtn = root.querySelector('[data-voice]');
    this.base = Array.prototype.map.call(this.suggest.querySelectorAll('.chip'), function (c) { return c.textContent; });
    this.session = null;
    this.busy = false;
    this.ended = false;
    this.turns = 0;
    var self = this;

    this.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = self.input.value.trim();
      if (v) self.send(v);
    });
    this.suggest.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (b) self.send(b.textContent);
    });
    root.querySelector('[data-restart]').addEventListener('click', function () { self.start(); });
    this.voiceBtn.addEventListener('click', function () {
      var on = self.voiceBtn.getAttribute('aria-pressed') !== 'true';
      self.voiceBtn.setAttribute('aria-pressed', on);
      self.voiceBtn.textContent = on ? '🔊' : '🔈';
      if (on) {
        var last = self.convo.querySelectorAll('.bubble.agent');
        if (last.length) { var lb = last[last.length - 1]; voice(lb.lastChild.textContent, JSON.parse(lb.getAttribute('data-audio') || '[]')); }
      } else stopAll();
    });
  }

  Convo.prototype.add = function (who, text, audio) {
    var b = el('div', 'bubble ' + who);
    b.appendChild(el('span', 'who', who === 'agent' ? (this.opts.agentName() || 'Receptionist') : 'You'));
    b.appendChild(document.createTextNode(text));
    this.convo.appendChild(b);
    this.convo.scrollTop = this.convo.scrollHeight;
    if (who === 'agent') {
      b.setAttribute('data-audio', JSON.stringify(audio || []));
      if (this.voiceBtn.getAttribute('aria-pressed') === 'true') voice(text, audio);
    }
  };

  Convo.prototype.typing = function (on) {
    var t = this.convo.querySelector('.typing');
    if (on && !t) {
      t = el('div', 'typing');
      t.innerHTML = '<i></i><i></i><i></i>';
      t.setAttribute('aria-label', 'Receptionist is replying');
      this.convo.appendChild(t);
      this.convo.scrollTop = this.convo.scrollHeight;
    } else if (!on && t) t.remove();
  };

  Convo.prototype.setSuggestions = function (list) {
    this.suggest.innerHTML = '';
    var self = this;
    list.forEach(function (s) { var c = el('button', 'chip', s); c.type = 'button'; self.suggest.appendChild(c); });
    this.suggest.hidden = !list.length;
  };

  Convo.prototype.start = function () {
    var self = this;
    this.convo.innerHTML = '';
    if (this.result) this.result.innerHTML = '';
    this.ended = false; this.turns = 0;
    this.input.disabled = false;
    this.typing(true);
    return this.opts.start().then(function (r) {
      self.typing(false);
      if (!r || r.error) throw new Error(r && r.error);
      self.session = r.session;
      self.add('agent', r.say, r.audio);
      self.setSuggestions(self.base);
    }).catch(function (e) {
      self.typing(false);
      self.add('agent', (e && e.message) || 'No signal right now. Tap ↻ to try again.');
    });
  };

  Convo.prototype.send = function (text) {
    if (this.busy || this.ended || !this.session) return;
    var self = this;
    this.busy = true;
    this.input.value = '';
    this.add('caller', text);
    this.setSuggestions([]);
    this.typing(true);
    var started = Date.now();
    this.opts.say(this.session, text).then(function (r) {
      // A short beat, like someone checking the book.
      var wait = Math.max(0, 650 - (Date.now() - started));
      setTimeout(function () {
        self.typing(false);
        self.busy = false;
        if (!r || r.error) { self.add('agent', (r && r.error) || 'Sorry, the line dropped. Tap ↻ to start again.'); return; }
        self.turns++;
        self.add('agent', r.say, r.audio);
        if (r.ownerText) self.showResult(r);
        if (r.end) {
          self.ended = true;
          self.input.disabled = true;
          self.setSuggestions([]);
          if (self.opts.onEnd) self.opts.onEnd(r);
        } else {
          self.setSuggestions(quickReplies(r.say, false, self.base));
        }
      }, wait);
    }).catch(function () {
      self.typing(false); self.busy = false;
      self.add('agent', 'No signal right now. Try that again.');
    });
  };

  Convo.prototype.showResult = function (r) {
    if (!this.result || this.result.getAttribute('data-shown') === this.session) return;
    this.result.setAttribute('data-shown', this.session);
    this.result.innerHTML = '';
    var owner = this.opts.ownerName();
    if (r.booking) {
      var bk = el('div', 'booked');
      var c = el('div', 'cal');
      c.appendChild(el('b', null, r.booking.mon));
      c.appendChild(el('span', null, String(r.booking.day)));
      var txt = el('div');
      txt.appendChild(el('strong', null, 'Added to ' + owner + "'s calendar"));
      txt.appendChild(el('span', null, r.booking.when + ' · ' + (r.booking.name || '')));
      txt.lastChild.style.display = 'block';
      bk.appendChild(c); bk.appendChild(txt);
      this.result.appendChild(bk);
    }
    var sms = el('div', 'sms');
    sms.appendChild(el('div', 'head', '💬 The text ' + owner + ' gets · just now'));
    var t = el('div', 'text', r.ownerText);
    if (r.outcome === 'urgent') t.style.background = 'var(--red)';
    sms.appendChild(t);
    this.result.appendChild(sms);
    if (r.callerText) {
      var s2 = el('div', 'sms');
      s2.appendChild(el('div', 'head', '💬 The text the customer gets'));
      s2.appendChild(el('div', 'text plain', r.callerText));
      this.result.appendChild(s2);
    }
    if (this.opts.onResult) this.opts.onResult(r);
  };

  window.Convo = Convo;
  window.SLspeak = speak;
  window.SLvoice = voice;
  window.SLpost = function (url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  };
})();
