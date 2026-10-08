/* ==========================================================================
   Brâmica demo: ADMIN PREVIEW (static, non-functional, clearly fake sample data)
   Nothing here reads or writes real data.
   ========================================================================== */
(function () {
  'use strict';
  var BRM = window.BRM = window.BRM || {};
  var t = function (k, v) { return BRM.i18n.t(k, v); };

  // ---- sample data (fake on purpose) ----
  var BOOKINGS = [
    ['Maria Exemplo', 'SAMPLE-0001', 0, 'paid'], ['João Exemplo', 'SAMPLE-0002', 0, 'deposit'], ['Ana Exemplo', 'SAMPLE-0003', 1, 'deposit'],
    ['Rui Exemplo', 'SAMPLE-0004', 1, 'pending'], ['Sara Exemplo', 'SAMPLE-0005', 1, 'paid'], ['Tiago Exemplo', 'SAMPLE-0006', 3, 'deposit']
  ];
  var LEADS = [
    ['Contacto exemplo 01', 'form', 'newl'], ['Contacto exemplo 02', 'chat', 'contacted'], ['Contacto exemplo 03', 'ig', 'newl'],
    ['Contacto exemplo 04', 'wa', 'booked'], ['Contacto exemplo 05', 'chat', 'cold'], ['Contacto exemplo 06', 'form', 'booked']
  ];
  var SEATS = [3, 5, 0, 7];   // seats left (sample)
  var CHART = [4, 7, 5, 8, 6, 3]; // sample bookings per month (heights)
  var PKG = [['A · 12h', 12, 4], ['B · 30h', 30, 18], ['C · 60h', 60, 22]];

  function pill(cls, txt) { return '<span class="pill ' + cls + '">' + txt + '</span>'; }
  var esc = function (s) { return BRM.ui.esc(s); };

  function render() {
    var A = function (k) { return t('admin.' + k); };
    var navs = t('admin.navs');
    document.getElementById('admin-nav').innerHTML = navs.map(function (n, i) { return '<li><span aria-disabled="true"' + (i === 0 ? ' aria-current="page"' : '') + '>' + esc(n) + '</span></li>'; }).join('');

    document.getElementById('kpis').innerHTML =
      [[A('kpi1'), '14'], [A('kpi2'), '€420'], [A('kpi3'), '€270'], [A('kpi4'), '9']].map(function (k) { return '<div class="kpi"><small>' + esc(k[0]) + '</small><b>' + k[1] + '</b></div>'; }).join('');

    var dates = BRM.booking.getDates(4);
    document.getElementById('t-up').innerHTML =
      '<thead><tr><th>' + A('colDate') + '</th><th>' + A('colSeats') + '</th><th>' + A('colStatus') + '</th></tr></thead><tbody>' +
      dates.map(function (d, i) {
        var left = SEATS[i], used = 8 - left;
        var st = left === 0 ? pill('red', A('full')) : left <= 3 ? pill('amber', A('low')) : pill('green', A('open'));
        return '<tr><td>' + esc(BRM.booking.fmtDate(d.iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) + '</td>' +
          '<td><div class="seatbar"><i style="--w:' + (used / 8 * 100) + '%"></i><span>' + used + '/8</span></div></td><td>' + st + '</td></tr>';
      }).join('') + '</tbody>';

    document.getElementById('chart').innerHTML = CHART.map(function (v, i) {
      var m = new Date(2026, 5 + i, 1);
      return '<div style="height:' + (v / 8 * 100) + '%"><span>' + new Intl.DateTimeFormat(BRM.i18n.locale(), { month: 'short' }).format(m) + '</span></div>';
    }).join('');

    var payPill = { paid: pill('green', A('paid')), deposit: pill('amber', A('deposit')), pending: pill('grey', A('pending')) };
    document.getElementById('t-bk').innerHTML =
      '<thead><tr><th>' + A('colName') + '</th><th>' + A('colRef') + '</th><th>' + A('colWs') + '</th><th>' + A('colPay') + '</th></tr></thead><tbody>' +
      BOOKINGS.map(function (b) {
        var d = dates[b[2]] || dates[0];
        return '<tr><td>' + esc(b[0]) + '</td><td>' + b[1] + '</td><td>' + esc(BRM.booking.fmtDate(d.iso, { day: 'numeric', month: 'short' })) + '</td><td>' + payPill[b[3]] + '</td></tr>';
      }).join('') + '</tbody>';

    var srcs = t('admin.sources'), sts = t('admin.leadStatus'), stCls = { newl: 'blue', contacted: 'amber', booked: 'green', cold: 'grey' };
    document.getElementById('t-ld').innerHTML =
      '<thead><tr><th>' + A('colLead') + '</th><th>' + A('colSource') + '</th><th>' + A('colLeadStatus') + '</th></tr></thead><tbody>' +
      LEADS.map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(srcs[l[1]]) + '</td><td>' + pill(stCls[l[2]], esc(sts[l[2]])) + '</td></tr>'; }).join('') + '</tbody>';

    document.getElementById('t-pk').innerHTML =
      '<thead><tr><th>' + 'Pacote' + '</th><th>' + A('pkgCol') + '</th></tr></thead><tbody>' +
      PKG.map(function (p) { return '<tr><td>' + p[0] + '</td><td><div class="seatbar"><i style="--w:' + (p[2] / p[1] * 100) + '%"></i><span>' + p[2] + '/' + p[1] + 'h</span></div></td></tr>'; }).join('') + '</tbody>';
  }

  function boot() { render(); document.addEventListener('langchange', render); }
  if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
