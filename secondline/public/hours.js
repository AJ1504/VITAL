/* Shared pieces for setup + settings: the hours editor and the job chips. */
(function () {
  'use strict';
  var DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  function label(h) { var v = h % 12 === 0 ? 12 : h % 12; return v + (h < 12 || h === 24 ? 'am' : 'pm'); }

  function summary(hours) {
    var groups = [];
    DAYS.forEach(function (d) {
      var r = hours[d[0]];
      var v = r ? label(r[0]) + '–' + label(r[1]) : 'Closed';
      var last = groups[groups.length - 1];
      if (last && last.v === v) last.days.push(d[1]); else groups.push({ v: v, days: [d[1]] });
    });
    return groups.map(function (g) { return (g.days.length > 1 ? g.days[0] + '–' + g.days[g.days.length - 1] : g.days[0]) + ' ' + g.v; });
  }

  function select(val, from, to) {
    var s = document.createElement('select');
    for (var h = from; h <= to; h++) {
      var o = document.createElement('option'); o.value = h; o.textContent = label(h);
      if (h === val) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }

  function HoursEditor(box, hours, onChange) {
    box.innerHTML = '';
    DAYS.forEach(function (d) {
      var key = d[0];
      var row = document.createElement('div'); row.className = 'day-row';
      var name = document.createElement('div'); name.className = 'dname'; name.textContent = d[1];
      var times = document.createElement('div'); times.className = 'times';
      function draw() {
        times.innerHTML = '';
        var r = hours[key];
        if (r) {
          var a = select(r[0], 0, 23), b = select(r[1], 1, 24);
          a.setAttribute('aria-label', d[1] + ' start'); b.setAttribute('aria-label', d[1] + ' finish');
          a.onchange = function () { r[0] = +a.value; if (r[1] <= r[0]) { r[1] = Math.min(24, r[0] + 2); } draw(); onChange(hours); };
          b.onchange = function () { r[1] = +b.value; if (r[1] <= r[0]) { r[0] = Math.max(0, r[1] - 2); } draw(); onChange(hours); };
          var to = document.createElement('span'); to.textContent = 'to'; to.className = 'muted';
          var off = document.createElement('button'); off.type = 'button'; off.className = 'x'; off.textContent = '✕';
          off.setAttribute('aria-label', 'Closed on ' + d[1]); off.title = 'Closed this day';
          off.onclick = function () { hours[key] = null; draw(); onChange(hours); };
          times.appendChild(a); times.appendChild(to); times.appendChild(b); times.appendChild(off);
        } else {
          var open = document.createElement('button'); open.type = 'button'; open.className = 'chip'; open.textContent = 'Closed — tap to open';
          open.onclick = function () { hours[key] = [8, 17]; draw(); onChange(hours); };
          times.appendChild(open);
        }
      }
      draw();
      row.appendChild(name); row.appendChild(times);
      box.appendChild(row);
    });
  }

  function ServiceChips(box, all, selected, onChange) {
    function draw() {
      box.innerHTML = '';
      all.forEach(function (s) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = s;
        c.setAttribute('aria-pressed', selected.indexOf(s) >= 0);
        c.onclick = function () {
          var i = selected.indexOf(s);
          if (i >= 0) selected.splice(i, 1); else selected.push(s);
          c.setAttribute('aria-pressed', i < 0);
          onChange(selected);
        };
        box.appendChild(c);
      });
      var add = document.createElement('button'); add.type = 'button'; add.className = 'chip add'; add.textContent = '+ Add a job';
      add.onclick = function () {
        var v = (window.prompt('What job should we add?') || '').trim().slice(0, 40);
        if (v && all.indexOf(v) < 0) { all.push(v); selected.push(v); onChange(selected); draw(); }
      };
      box.appendChild(add);
    }
    draw();
  }

  window.SLHours = { HoursEditor: HoursEditor, ServiceChips: ServiceChips, summary: summary };
})();
