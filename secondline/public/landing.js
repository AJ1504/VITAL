(function () {
  'use strict';
  var NAMES = { plumbing: ['Riverside Plumbing', 'Mike'], hvac: ['Northside Heating & Air', 'Dave'], electrical: ['Brightline Electric', 'Carlos'], roofing: ['Summit Roofing', 'Jen'], towing: ['Route 9 Towing', 'Rick'], locksmith: ['Keystone Locksmith', 'Tony'] };
  var SUGGEST = {
    plumbing: ['My basement is flooding!', 'My water heater stopped working', 'Can I talk to Mike?', 'How much do you charge?'],
    hvac: ["We've got no heat and it's freezing", 'Need a furnace tune-up', 'Can I talk to Dave?'],
    electrical: ['An outlet is sparking!', 'I want an EV charger put in', 'Can I talk to Carlos?'],
    roofing: ['My roof is leaking into the bedroom', 'Need an inspection after the storm', 'How much is a new roof?'],
    towing: ["I'm stranded on the highway", 'Need a jump start', 'Can I talk to Rick?'],
    locksmith: ["I'm locked out of my house", 'Want my locks rekeyed', 'Can I talk to Tony?'],
  };
  var trade = 'plumbing';
  var root = document.getElementById('demo-phone');
  var convo = new window.Convo(root, {
    start: function () { return window.SLpost('/api/demo/start', { trade: trade }); },
    say: function (s, text) { return window.SLpost('/api/demo/say', { session: s, text: text }); },
    agentName: function () { return 'Jamie'; },
    ownerName: function () { return NAMES[trade][1]; },
  });
  function setTrade(t) {
    trade = t;
    root.querySelector('[data-biz-name]').textContent = NAMES[t][0];
    convo.base = SUGGEST[t];
    convo.start();
  }
  document.querySelectorAll('[data-trade]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-trade]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      setTrade(b.getAttribute('data-trade'));
    });
  });
  setTrade('plumbing');
})();
// Keep the sticky button out of the way while someone is trying the demo or reading the price.
(function () {
  var cta = document.querySelector('.sticky-cta');
  if (!cta || !('IntersectionObserver' in window)) return;
  var visible = new Set();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
    cta.classList.toggle('hide', visible.size > 0);
  }, { threshold: 0.15 });
  ['#demo', '#pricing', '.l-hero .btn.go'].forEach(function (s) { var n = document.querySelector(s); if (n) io.observe(n); });
})();
