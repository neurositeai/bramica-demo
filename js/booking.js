/* ==========================================================================
   Brâmica demo: booking logic (all mocked, localStorage only)
   Sections: store · validation · workshop dates · bookings · emails · ICS · wizard UI · manage UI
   ========================================================================== */
(function () {
  'use strict';
  var BRM = window.BRM = window.BRM || {};
  var t = function (k, v) { return BRM.i18n.t(k, v); };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ------------------------------------------------------------------
     STORE: everything lives in localStorage. No real data is collected.
     TODO(backend): replace with a real database (e.g. Supabase/Postgres).
     ------------------------------------------------------------------ */
  var KEY = 'bramica_demo_v1';
  function blank() { return { bookings: [], packages: [], receipts: [], seatsBooked: {}, draft: null, force: null }; }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* ignore */ }
    return blank();
  }
  function persist(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
  BRM.store = {
    get: load,
    update: function (fn) { var o = load(); fn(o); persist(o); return o; },
    reset: function () {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem('bramica_lookup'); } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------
     VALIDATION + small helpers
     ------------------------------------------------------------------ */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function normPhone(v) {
    var s = String(v || '').replace(/[\s().-]/g, '');
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    return s;
  }
  BRM.validate = {
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); },
    name: function (v) { return String(v || '').trim().length >= 3; },
    /** Portuguese 9-digit number (optionally +351) or international +CC number. Returns normalised string or ''. */
    phone: function (v) {
      var s = normPhone(v);
      if (/^\+351[239]\d{8}$/.test(s)) return s;
      if (/^[239]\d{8}$/.test(s)) return '+351' + s;
      if (/^\+(?!351)\d{8,15}$/.test(s)) return s;
      return '';
    },
    /** MB WAY: 9 digits starting with 9 (the +351 prefix is fixed in the UI). Returns the 9 digits or ''. */
    mbway: function (v) {
      var s = normPhone(v).replace(/^\+351/, '');
      return /^9\d{8}$/.test(s) ? s : '';
    }
  };
  BRM.ui = {
    esc: esc,
    setErr: function (input, key) {
      var err = document.getElementById(input.id + '-err');
      if (!err) return;
      if (key) { input.setAttribute('aria-invalid', 'true'); err.setAttribute('data-i18n', key); err.textContent = t(key); }
      else { input.removeAttribute('aria-invalid'); err.removeAttribute('data-i18n'); err.textContent = ''; }
    },
    fmtPhone: function (p) {
      var s = String(p || '');
      var m = s.match(/^\+351(\d{3})(\d{3})(\d{3})$/);
      return m ? '+351 ' + m[1] + ' ' + m[2] + ' ' + m[3] : s;
    },
    eur: function (n) { return new Intl.NumberFormat(BRM.i18n.locale(), { style: 'currency', currency: 'EUR' }).format(n); }
  };

  /* ------------------------------------------------------------------
     WORKSHOP DATES
     Rule: first Saturday of each month; if it is a Portuguese public holiday,
     use the following Saturday. Next 6 upcoming dates are listed.
     ------------------------------------------------------------------ */
  var MAX_SEATS = 8;
  var MOCK_SEATS = [6, 3, 0, 8, 5, 2]; // mock availability pattern (one full date every 6 months)
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function easter(y) { // Meeus/Jones/Butcher
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  /** Portuguese national public holidays for a year, as a set of ISO strings. */
  function ptHolidays(y) {
    var set = {};
    ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25'].forEach(function (md) { set[y + '-' + md] = true; });
    var e = easter(y);
    set[isoOf(addDays(e, -2))] = true;  // Good Friday
    set[isoOf(e)] = true;               // Easter Sunday
    set[isoOf(addDays(e, 60))] = true;  // Corpus Christi
    // NOTE: municipal holidays (e.g. São João, 24 June, in Porto) are intentionally NOT included.
    // TODO: confirm with the client whether the municipal holiday should also move the workshop.
    return set;
  }
  function firstSaturday(y, m) { // m: 0-11
    var d = new Date(y, m, 1), moved = false;
    while (d.getDay() !== 6) d = addDays(d, 1);
    while (ptHolidays(d.getFullYear())[isoOf(d)]) { d = addDays(d, 7); moved = true; }
    return { date: d, moved: moved };
  }
  function baseSeats(iso) {
    var p = iso.split('-'); var idx = (+p[0]) * 12 + (+p[1] - 1);
    return Math.min(MAX_SEATS, MOCK_SEATS[idx % MOCK_SEATS.length]);
  }
  function seatsLeft(iso, o) {
    o = o || load();
    return Math.max(0, baseSeats(iso) - (o.seatsBooked[iso] || 0));
  }
  function getDates(count, from) {
    count = count || 6;
    var today = from || new Date();
    var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var o = load(), out = [], y = t0.getFullYear(), m = t0.getMonth(), guard = 0;
    while (out.length < count && guard++ < 36) {
      var fs = firstSaturday(y, m);
      if (fs.date > t0) {
        var iso = isoOf(fs.date);
        out.push({ iso: iso, base: baseSeats(iso), left: seatsLeft(iso, o), moved: fs.moved });
      }
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  function fmtDate(iso, opts) {
    return new Intl.DateTimeFormat(BRM.i18n.locale(), opts || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00'));
  }

  /* ------------------------------------------------------------------
     BOOKINGS
     ------------------------------------------------------------------ */
  var REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randStr(n) { var s = ''; for (var i = 0; i < n; i++) s += REF_CHARS.charAt(Math.floor(Math.random() * REF_CHARS.length)); return s; }
  function genRef(o) {
    var ref;
    do { ref = 'BRM-' + new Date().getFullYear() + '-' + randStr(4); } while (o.bookings.some(function (b) { return b.ref === ref; }));
    return ref;
  }
  /** Creates the booking once the deposit is paid and takes a seat. */
  function createBookingAfterDeposit(draft, receipt) {
    var created = null, full = false;
    BRM.store.update(function (o) {
      if (seatsLeft(draft.dateISO, o) <= 0) { full = true; return; }
      o.seatsBooked[draft.dateISO] = (o.seatsBooked[draft.dateISO] || 0) + 1;
      created = {
        ref: genRef(o), name: draft.name, email: draft.email, phone: draft.phone, dateISO: draft.dateISO,
        lang: BRM.i18n.getLang(), createdAt: new Date().toISOString(),
        depositReceipt: receipt.no, remainingPaid: false, remainingReceipt: null, emails: {}
      };
      o.bookings.push(created);
      receipt.ref = created.ref;
      o.receipts = o.receipts.map(function (r) { if (r.no === receipt.no) r.ref = created.ref; return r; });
      o.draft = null;
    });
    if (full) throw new Error('FULL');
    return created;
  }
  function findBooking(ref, email) {
    var r = String(ref || '').trim().toUpperCase(), e = String(email || '').trim().toLowerCase();
    return load().bookings.filter(function (b) { return b.ref === r && b.email.toLowerCase() === e; })[0] || null;
  }
  function getBookingByRef(ref) {
    var r = String(ref || '').trim().toUpperCase();
    return load().bookings.filter(function (b) { return b.ref === r; })[0] || null;
  }
  function markRemainingPaid(ref, receipt) {
    BRM.store.update(function (o) {
      o.bookings.forEach(function (b) { if (b.ref === ref) { b.remainingPaid = true; b.remainingReceipt = receipt.no; } });
      o.receipts.forEach(function (r) { if (r.no === receipt.no) r.ref = ref; });
    });
  }

  /* ------------------------------------------------------------------
     AUTOMATIC EMAILS (mock): shown as example cards, nothing is sent.
     ------------------------------------------------------------------ */
  function buildEmail(kind, b) {
    var d = fmtDate(b.dateISO);
    if (kind === 'confirmation') {
      return { to: b.email, subject: t('emails.confSubject', { date: d }), body: t('emails.confBody', { name: esc(b.name), date: d, ref: b.ref }), when: t('book.emailNow') };
    }
    var rem = addDays(parseISO(b.dateISO), -7);
    return {
      to: b.email, subject: t('emails.remSubject', { date: d }), body: t('emails.remBody', { name: esc(b.name), date: d, ref: b.ref }),
      when: t('book.emailLater', { date: fmtDate(isoOf(rem), { day: 'numeric', month: 'long', year: 'numeric' }) })
    };
  }
  /** TODO(backend): call a real email provider (Resend / Postmark / SendGrid) or an n8n webhook here. */
  function sendConfirmationEmail(booking) {
    return new Promise(function (resolve) {
      BRM.store.update(function (o) { o.bookings.forEach(function (b) { if (b.ref === booking.ref) b.emails.confirmationAt = new Date().toISOString(); }); });
      resolve({ id: 'mock_email_' + randStr(8), status: 'mock-queued' });
    });
  }
  /** TODO(backend): schedule a real job (n8n / cron / queue) to email the remaining-payment reminder. */
  function scheduleReminder(booking) {
    return new Promise(function (resolve) {
      var at = isoOf(addDays(parseISO(booking.dateISO), -7));
      BRM.store.update(function (o) { o.bookings.forEach(function (b) { if (b.ref === booking.ref) b.emails.reminderAt = at; }); });
      resolve({ id: 'mock_job_' + randStr(8), runAt: at, status: 'mock-scheduled' });
    });
  }

  /* ------------------------------------------------------------------
     CALENDAR (.ics)
     ------------------------------------------------------------------ */
  function icsEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); }
  function buildICS(b) {
    var d = b.dateISO.replace(/-/g, '');
    var now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bramica//Workshop demo//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:Europe/Lisbon',
      'BEGIN:STANDARD', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:WET', 'END:STANDARD',
      'BEGIN:DAYLIGHT', 'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:WEST', 'END:DAYLIGHT',
      'END:VTIMEZONE',
      'BEGIN:VEVENT', 'UID:' + b.ref + '@bramica-demo', 'DTSTAMP:' + now,
      'DTSTART;TZID=Europe/Lisbon:' + d + 'T090000', 'DTEND;TZID=Europe/Lisbon:' + d + 'T130000',
      'SUMMARY:' + icsEsc(t('book.icsTitle')), 'LOCATION:' + icsEsc(t('book.placeName')),
      'DESCRIPTION:' + icsEsc(t('book.icsDesc', { ref: b.ref })),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(t('book.icsTitle')), 'TRIGGER:-P1D', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function downloadICS(b) {
    var blob = new Blob([buildICS(b)], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bramica-workshop-' + b.dateISO + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  BRM.booking = {
    MAX_SEATS: MAX_SEATS, getDates: getDates, fmtDate: fmtDate, firstSaturday: firstSaturday, ptHolidays: ptHolidays, seatsLeft: seatsLeft,
    createBookingAfterDeposit: createBookingAfterDeposit, findBooking: findBooking, getBookingByRef: getBookingByRef, markRemainingPaid: markRemainingPaid,
    buildEmail: buildEmail, sendConfirmationEmail: sendConfirmationEmail, scheduleReminder: scheduleReminder, buildICS: buildICS, downloadICS: downloadICS,
    isoOf: isoOf, parseISO: parseISO, addDays: addDays, genRef: genRef
  };

  /* ==================================================================
     WIZARD UI (booking.html)
     ================================================================== */
  function initBooking() {
    var wizard = $('#wizard');
    if (!wizard) return;
    var state = { step: 1, dateISO: null, booking: null, receipt: null, handle: null };
    var saved = load().draft;
    if (saved) state.dateISO = saved.dateISO || null;

    function renderProgress() {
      var names = t('book.steps');
      $('#progress').innerHTML = names.map(function (n, i) {
        var cls = i + 1 < state.step ? 'done' : '';
        var cur = i + 1 === state.step ? ' aria-current="step"' : '';
        return '<li class="' + cls + '"' + cur + '><span class="sr-only">' + t('book.stepLabel', { n: i + 1, name: n }) + ': </span>' + esc(n) + '</li>';
      }).join('');
    }

    function renderDates() {
      var fs = $('#dates'), list = getDates();
      fs.innerHTML = '<legend class="sr-only">' + t('book.s1t') + '</legend>' + list.map(function (d) {
        var full = d.left <= 0, low = !full && d.left <= 3;
        var seat = full ? 'Esgotado / Full' : (d.left === 1 ? t('book.seatsOne') : t('book.seatsLeft', { n: d.left }));
        var dt = parseISO(d.iso);
        var fm = function (o) { return new Intl.DateTimeFormat(BRM.i18n.locale(), o).format(dt); };
        return '<label class="date-card"><input type="radio" name="date" value="' + d.iso + '"' + (full ? ' disabled' : '') + (state.dateISO === d.iso && !full ? ' checked' : '') + '>' +
          '<span class="box"><span class="dow">' + fm({ weekday: 'long' }) + '</span><span class="day">' + dt.getDate() + '</span><span class="mon">' + fm({ month: 'long' }) + ' ' + dt.getFullYear() + '</span>' +
          '<span class="seat' + (full ? ' none' : low ? ' low' : '') + '">' + seat + '</span></span></label>';
      }).join('');
      if (state.dateISO && seatsLeft(state.dateISO) <= 0) state.dateISO = null;
      $('#to-2').disabled = !state.dateISO;
    }

    function setStep(n, initial) {
      state.step = n;
      var bl = $('#book-layout'); if (bl) bl.classList.toggle('is-pay', n === 3);
      for (var i = 1; i <= 4; i++) { var s = $('#step-' + i); if (s) s.hidden = i !== n; }
      renderProgress();
      if (initial) return;
      var h = $('#h-' + n); if (h) h.focus({ preventScroll: true });
      var top = $('.progress'); if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* Step 1 */
    $('#dates').addEventListener('change', function (e) {
      if (e.target.name === 'date') { state.dateISO = e.target.value; $('#to-2').disabled = false; $('#date-err').textContent = ''; }
    });
    $('#to-2').addEventListener('click', function () {
      if (!state.dateISO || seatsLeft(state.dateISO) <= 0) { var er = $('#date-err'); er.setAttribute('data-i18n', 'book.errDate'); er.textContent = t('book.errDate'); renderDates(); return; }
      setStep(2);
      $('#b-name').focus();
    });

    /* Step 2 */
    var nameI = $('#b-name'), mailI = $('#b-email'), telI = $('#b-phone');
    if (saved) { nameI.value = saved.name || ''; mailI.value = saved.email || ''; telI.value = saved.phone || ''; }
    [nameI, mailI, telI].forEach(function (i) { i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) BRM.ui.setErr(i, null); }); });
    $('#back-1').addEventListener('click', function () { setStep(1); });
    $('#details').addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      var okN = BRM.validate.name(nameI.value); BRM.ui.setErr(nameI, okN ? null : 'book.errName'); if (!okN) bad = bad || nameI;
      var okE = BRM.validate.email(mailI.value); BRM.ui.setErr(mailI, okE ? null : 'book.errEmail'); if (!okE) bad = bad || mailI;
      var ph = BRM.validate.phone(telI.value); BRM.ui.setErr(telI, ph ? null : 'book.errPhone'); if (!ph) bad = bad || telI;
      if (bad) { bad.focus(); return; }
      var draft = { dateISO: state.dateISO, name: nameI.value.trim(), email: mailI.value.trim(), phone: ph };
      BRM.store.update(function (o) { o.draft = draft; });
      startPayment(draft);
    });

    /* Step 3: checkout (shared module in payment-demo.js) */
    function startPayment(draft) {
      if (state.handle) { state.handle.destroy(); state.handle = null; }
      var order = {
        type: 'deposit', amount: 30, remaining: 30,
        item: { key: 'pay.itemDeposit' }, detail: { label: 'book.sumDate', value: fmtDate(draft.dateISO) }
      };
      setStep(3);
      state.handle = BRM.pay.mountCheckout($('#checkout'), order, {
        continueLabel: 'book.next',
        onSuccess: function (receipt) {
          try {
            state.booking = createBookingAfterDeposit(draft, receipt);
          } catch (err) {
            state.booking = null;
          }
          if (state.booking) {
            state.receipt = BRM.store.get().receipts.filter(function (r) { return r.no === receipt.no; })[0] || receipt;
            sendConfirmationEmail(state.booking); scheduleReminder(state.booking);
            document.dispatchEvent(new CustomEvent('seatschange'));
          }
        },
        onContinue: function () { if (state.booking) { setStep(4); renderConfirm(); } else { setStep(1); renderDates(); } }
      });
    }
    $('#back-2').addEventListener('click', function () {
      if (state.handle) { state.handle.destroy(); state.handle = null; }
      setStep(2);
    });

    /* Step 4 */
    function renderConfirm() {
      var b = state.booking; if (!b) return;
      var box = $('#confirm');
      var rcp = state.receipt || BRM.store.get().receipts.filter(function (r) { return r.no === b.depositReceipt; })[0];
      var conf = buildEmail('confirmation', b), rem = buildEmail('reminder', b);
      function mail(label, m) {
        return '<span class="mail-label">' + esc(label) + '</span><div class="mail" role="group" aria-label="' + esc(label) + '">' +
          '<div class="mail-head"><b>' + t('book.emailSubject') + ': ' + esc(m.subject) + '</b><span>' + t('book.emailTo') + ': ' + esc(m.to) + '</span><span>' + t('book.emailWhen') + ': ' + esc(m.when) + '</span></div>' +
          '<div class="mail-body">' + m.body + '</div><div class="mail-foot">' + t('emails.footer') + '</div></div>';
      }
      box.innerHTML =
        '<p class="sub">' + t('book.s4d', { name: esc(b.name) }) + '</p>' +
        '<div class="ref-box"><span>' + t('book.refT') + '</span><strong>' + esc(b.ref) + '</strong></div>' +
        '<h3>' + t('book.summary') + '</h3>' +
        '<dl class="summary">' +
          '<div><dt>' + t('book.sumDate') + '</dt><dd>' + esc(fmtDate(b.dateISO)) + '</dd></div>' +
          '<div><dt>' + t('book.sumTime') + '</dt><dd>9:00–13:00</dd></div>' +
          '<div><dt>' + t('book.sumPlace') + '</dt><dd>' + esc(t('book.placeName')) + '</dd></div>' +
          '<div><dt>' + t('book.sumPaid') + '</dt><dd>' + BRM.ui.eur(30) + '</dd></div>' +
          '<div><dt>' + t('book.sumRemaining') + '</dt><dd>' + BRM.ui.eur(30) + '</dd></div>' +
          '<div><dt>' + t('book.sumContact') + '</dt><dd>' + esc(b.email) + '<br>' + esc(BRM.ui.fmtPhone(b.phone)) + '</dd></div>' +
        '</dl>' +
        '<div class="btn-row"><button class="btn" type="button" id="ics-btn">' + t('book.calendar') + '</button>' +
        '<a class="btn btn-ghost" href="manage.html?ref=' + encodeURIComponent(b.ref) + '">' + t('book.manage') + '</a></div>' +
        '<details class="mt"><summary class="btn-link">' + t('book.receipt') + '</summary><div id="conf-receipt"></div></details>' +
        '<h3 class="mt">' + t('book.emailsT') + '</h3><p class="note">' + t('book.emailsD') + '</p>' +
        mail(t('book.emailConfirm'), conf) + mail(t('book.emailReminder'), rem) +
        '<div class="teaser"><span class="chip">' + t('common.planned') + '</span><h3>' + t('book.teaserT') + '</h3><p>' + t('book.teaserD') + '</p><a class="btn btn-ghost btn-sm" href="index.html#roadmap">' + t('book.teaserLink') + '</a></div>';
      $('#ics-btn').addEventListener('click', function () { downloadICS(b); });
      if (rcp && BRM.pay) $('#conf-receipt').appendChild(BRM.pay.renderReceipt(rcp));
    }

    /* deep link: booking.html?ref=XXXX shows the confirmation of an existing demo booking */
    var qref = new URLSearchParams(location.search).get('ref');
    var existing = qref ? getBookingByRef(qref) : null;

    renderProgress(); renderDates();
    if (existing) { state.booking = existing; setStep(4, true); renderConfirm(); }
    else setStep(1, true);

    document.addEventListener('langchange', function () {
      renderProgress(); if (state.step === 1) renderDates(); if (state.step === 4) renderConfirm();
    });
    document.addEventListener('seatschange', function () { if (state.step === 1) renderDates(); });
    document.addEventListener('datareset', function () { state.booking = null; state.dateISO = null; if (state.handle) { state.handle.destroy(); state.handle = null; } setStep(1); renderDates(); });
  }

  /* ==================================================================
     MANAGE UI (manage.html)
     ================================================================== */
  function initManage() {
    var form = $('#lookup');
    if (!form) return;
    var refI = $('#m-ref'), mailI = $('#m-email'), out = $('#result'), errEl = $('#lookup-err'), cur = null, justPaid = false;

    function show(b) {
      cur = b;
      if (!b) { out.innerHTML = ''; return; }
      var paid = b.remainingPaid;
      out.innerHTML =
        '<section class="panel" aria-live="polite"><h2>' + t('manage.found') + '</h2>' +
        (justPaid ? '<p class="form-ok" role="status">' + t('manage.justPaid') + '</p>' : '') +
        '<dl class="summary">' +
          '<div><dt>' + t('book.refT') + '</dt><dd><strong>' + esc(b.ref) + '</strong></dd></div>' +
          '<div><dt>' + t('manage.name') + '</dt><dd>' + esc(b.name) + '</dd></div>' +
          '<div><dt>' + t('manage.date') + '</dt><dd>' + esc(fmtDate(b.dateISO)) + '</dd></div>' +
          '<div><dt>' + t('manage.status') + '</dt><dd><span class="status ' + (paid ? 'paid' : 'dep') + '">' + (paid ? t('manage.paidFull') : t('manage.depositPaid')) + '</span></dd></div>' +
          (paid ? '' : '<div><dt>' + t('book.sumRemaining') + '</dt><dd>' + BRM.ui.eur(30) + '</dd></div>') +
        '</dl>' +
        '<div class="btn-row">' + (paid ? '' : '<a class="btn" href="payment.html?order=remaining&ref=' + encodeURIComponent(b.ref) + '">' + t('manage.payRemaining') + '</a>') +
        '<button class="btn btn-ghost" type="button" id="m-ics">' + t('book.calendar') + '</button>' +
        '<a class="btn btn-ghost" href="booking.html?ref=' + encodeURIComponent(b.ref) + '">' + t('book.summary') + '</a></div></section>';
      $('#m-ics').addEventListener('click', function () { downloadICS(b); });
    }

    function renderPackages() {
      var box = $('#pkgs'), list = BRM.store.get().packages;
      if (!list.length) { box.innerHTML = '<p>' + t('manage.packagesNone') + ' <a href="index.html#residencias">' + t('manage.buyOne') + '</a></p>'; return; }
      box.innerHTML = '';
      list.slice().reverse().forEach(function (p) { box.appendChild(BRM.pay.renderPackageCard(p, { onChange: renderPackages })); });
    }

    function lookup(ref, email) {
      var b = findBooking(ref, email);
      if (!b) { errEl.setAttribute('data-i18n', 'manage.errNotFound'); errEl.textContent = t('manage.errNotFound'); show(null); return false; }
      errEl.removeAttribute('data-i18n'); errEl.textContent = '';
      try { sessionStorage.setItem('bramica_lookup', JSON.stringify({ ref: b.ref, email: email })); } catch (e) { /* ignore */ }
      show(b); return true;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault(); justPaid = false;
      if (!refI.value.trim() || !mailI.value.trim()) { errEl.setAttribute('data-i18n', 'manage.errFields'); errEl.textContent = t('manage.errFields'); show(null); return; }
      lookup(refI.value, mailI.value);
    });

    var latest = load().bookings.slice(-1)[0];
    var useBtn = $('#use-latest');
    if (latest) {
      useBtn.hidden = false;
      useBtn.addEventListener('click', function () { refI.value = latest.ref; mailI.value = latest.email; form.requestSubmit(); });
    }

    // returning from the checkout, or deep link ?ref=
    var q = new URLSearchParams(location.search), qref = q.get('ref');
    if (qref) {
      refI.value = qref;
      var lk = null; try { lk = JSON.parse(sessionStorage.getItem('bramica_lookup') || 'null'); } catch (e) { /* ignore */ }
      var bk = getBookingByRef(qref);
      var email = lk && lk.ref === qref ? lk.email : (bk ? bk.email : '');
      if (bk && email) { mailI.value = email; justPaid = q.get('paid') === '1'; lookup(qref, email); }
    }

    renderPackages();
    document.addEventListener('langchange', function () { if (cur) show(findBooking(cur.ref, cur.email)); renderPackages(); });
    document.addEventListener('datareset', function () { show(null); renderPackages(); });
  }

  function boot() { initBooking(); initManage(); }
  if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
