(function () {
  'use strict';
  var L = window.SL_LEAD;
  var c = new window.Convo(document.getElementById('lead-phone'), {
    start: function () { return window.SLpost('/api/lead/' + L.slug + '/start'); },
    say: function (s, text) { return window.SLpost('/api/demo/say', { session: s, text: text }); },
    agentName: function () { return 'Jamie'; },
    ownerName: function () { return L.owner === 'the owner' ? 'you' : L.owner; },
  });
  c.start();
})();
