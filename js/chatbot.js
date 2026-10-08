/* ==========================================================================
   Brâmica demo: "Chatbot preview" (scripted answers only: NO AI, NO backend)
   Reuses the mock booking + payment functions (booking.js / payment-demo.js).
   ========================================================================== */
(function () {
  'use strict';
  var BRM = window.BRM = window.BRM || {};
  var t = function (k, v) { return BRM.i18n.t(k, v); };
  var esc = function (s) { return BRM.ui.esc(s); };
  var el = {}, flow = null, started = false;

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var TOPICS = [
    ['book', ['reservar', 'reserva', 'book', 'marcar', 'inscri', 'inscrever', 'sign up']],
    ['resid', ['residenc', 'residen', 'pacote', 'package', 'horas', 'hours of']],
    ['deposit', ['sinal', 'deposit', 'mbway', 'mb way', 'pagar', 'pagamento', 'payment', 'pay']],
    ['price', ['preco', 'price', 'custa', 'cost', 'quanto', 'how much', 'valor', 'iva', 'vat']],
    ['hours', ['horario', 'hours', 'aberto', 'open', 'abre', 'quando', 'when']],
    ['address', ['morada', 'onde', 'address', 'where', 'localizacao', 'location', 'mapa', 'map']]
  ];

  function scroll() { el.log.scrollTop = el.log.scrollHeight; }
  function msg(html, who) {
    var d = document.createElement('div');
    d.className = 'msg ' + (who || 'bot'); d.innerHTML = html; el.log.appendChild(d); scroll(); return d;
  }
  function opts(items, onPick) {
    var d = document.createElement('div'); d.className = 'chat-opts';
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = it.label; if (it.disabled) b.disabled = true;
      b.addEventListener('click', function () { if (d.parentNode) d.remove(); msg(esc(it.label), 'me'); onPick(it.value); });
      d.appendChild(b);
    });
    el.log.appendChild(d); scroll(); return d;
  }
  function chips() {
    var c = t('chat.chips');
    opts(['price', 'hours', 'address', 'deposit', 'resid', 'book'].map(function (k) { return { label: c[k], value: k }; }), answer);
  }
  function answer(topic) {
    if (topic === 'book') return startBooking();
    msg(t('chat.a_' + topic)); setTimeout(chips, 200);
  }

  /* ---------- guided booking (reuses mock booking logic) ---------- */
  function startBooking() {
    flow = { step: 'date', data: {} };
    var dates = BRM.booking.getDates();
    if (!dates.length) { msg(t('chat.bookNoDates')); flow = null; return; }
    msg(t('chat.bookStart'));
    opts(dates.map(function (d) {
      var seats = d.left <= 0 ? t('chat.bookFull') : (d.left === 1 ? t('workshops.seatsOne') : t('workshops.seatsLeft', { n: d.left }));
      return { label: BRM.booking.fmtDate(d.iso, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + seats, value: d.iso, disabled: d.left <= 0 };
    }), function (iso) { flow.data.dateISO = iso; flow.step = 'name'; msg(t('chat.bookName')); focusInput(); });
  }
  function focusInput() { setTimeout(function () { el.input.focus(); }, 50); }

  function handleFlow(text) {
    var d = flow.data;
    if (flow.step === 'name') {
      if (!BRM.validate.name(text)) return msg(t('chat.bookBad'));
      d.name = text.trim(); flow.step = 'email'; return msg(t('chat.bookEmail'));
    }
    if (flow.step === 'email') {
      if (!BRM.validate.email(text)) return msg(t('chat.bookBad'));
      d.email = text.trim(); flow.step = 'phone'; return msg(t('chat.bookPhone'));
    }
    if (flow.step === 'phone') {
      var p = BRM.validate.phone(text); if (!p) return msg(t('chat.bookBad'));
      d.phone = p; flow.step = 'pay';
      msg(t('chat.bookSummary', { date: esc(BRM.booking.fmtDate(d.dateISO)), name: esc(d.name) }));
      return opts([{ label: t('chat.bookPaySuccess'), value: 'ok' }, { label: t('chat.bookPayFail'), value: 'fail' }], pay);
    }
  }

  function pay(choice) {
    var d = flow.data, number = choice === 'ok' ? '4242424242424242' : '4000000000000002';
    var order = { type: 'deposit', amount: 30, item: { key: 'pay.itemDeposit' } };
    var wait = msg('…');
    BRM.pay.createPaymentIntent(order)
      .then(function (intent) { return BRM.pay.confirmPayment(intent, 'card', { number: number, ignoreForce: true }); })
      .then(function (res) {
        wait.remove();
        if (res.status !== 'succeeded') {
          msg(t('chat.bookFail'));
          return opts([{ label: t('chat.bookPaySuccess'), value: 'ok' }, { label: t('chat.bookPayFail'), value: 'fail' }], pay);
        }
        var receipt = BRM.pay.createReceipt(order, 'card', { number: number });
        var b;
        try { b = BRM.booking.createBookingAfterDeposit(d, receipt); } catch (e) { msg(t('chat.bookFull')); flow = null; return; }
        BRM.booking.sendConfirmationEmail(b); BRM.booking.scheduleReminder(b);
        document.dispatchEvent(new CustomEvent('seatschange'));
        flow = null;
        msg(t('chat.bookOk', { ref: esc(b.ref) }) + '<br><a href="booking.html?ref=' + encodeURIComponent(b.ref) + '">' + t('chat.bookOpen') + '</a>');
        setTimeout(chips, 200);
      });
  }

  /* ---------- free text ---------- */
  function onSubmit(e) {
    e.preventDefault();
    var text = el.input.value.trim(); if (!text) return;
    el.input.value = ''; msg(esc(text), 'me');
    if (flow && flow.step !== 'date' && flow.step !== 'pay') return handleFlow(text);
    var n = norm(text);
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i][1].some(function (k) { return n.indexOf(k) !== -1; })) return answer(TOPICS[i][0]);
    }
    msg(t('chat.a_fallback')); setTimeout(chips, 200);
  }

  /* ---------- UI shell ---------- */
  function paintStatic() {
    el.bubble.setAttribute('aria-label', t('chat.bubble'));
    el.title.textContent = t('chat.title'); el.tag.textContent = t('chat.tag'); el.tagline.textContent = t('chat.tagLine');
    el.close.setAttribute('aria-label', t('chat.close')); el.input.setAttribute('placeholder', t('chat.placeholder')); el.input.setAttribute('aria-label', t('chat.placeholder'));
    el.send.textContent = t('chat.send'); el.panel.setAttribute('aria-label', t('chat.title') + ' · ' + t('chat.tag'));
  }
  function open() {
    el.panel.classList.add('open'); el.bubble.setAttribute('aria-expanded', 'true');
    if (!started) { started = true; msg(t('chat.hello')); chips(); }
    focusInput();
  }
  function close() { el.panel.classList.remove('open'); el.bubble.setAttribute('aria-expanded', 'false'); el.bubble.focus(); }

  function boot() {
    var b = document.createElement('button');
    b.className = 'chat-bubble'; b.type = 'button'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'chat-panel');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
    var p = document.createElement('div');
    p.className = 'chat-panel'; p.id = 'chat-panel'; p.setAttribute('role', 'dialog');
    p.innerHTML =
      '<div class="chat-head"><div><span class="chat-tag"></span><strong></strong><small></small></div><button type="button" class="chat-x">&times;</button></div>' +
      '<div class="chat-log" role="log" aria-live="polite"></div>' +
      '<form class="chat-form" novalidate><input type="text" autocomplete="off"><button type="submit"></button></form>';
    document.body.appendChild(b); document.body.appendChild(p);
    el = { bubble: b, panel: p, tag: p.querySelector('.chat-tag'), title: p.querySelector('strong'), tagline: p.querySelector('small'), close: p.querySelector('.chat-x'), log: p.querySelector('.chat-log'), input: p.querySelector('input'), send: p.querySelector('.chat-form button') };
    paintStatic();
    b.addEventListener('click', function () { el.panel.classList.contains('open') ? close() : open(); });
    el.close.addEventListener('click', close);
    p.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    p.querySelector('form').addEventListener('submit', onSubmit);
    document.addEventListener('langchange', paintStatic);
  }
  if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
