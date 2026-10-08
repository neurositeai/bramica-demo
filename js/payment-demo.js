/* ==========================================================================
   Brâmica demo: FULLY FAKE payment checkout
   - Never collects, sends or stores real card data. Card fields live only in the
     DOM while typing; only brand + last4 of the listed TEST cards are kept.
   - Mock "backend" functions (createPaymentIntent, confirmPayment, createReceipt…)
     are marked with TODO comments showing where Stripe / a real backend plugs in.
   ========================================================================== */
(function () {
  'use strict';
  var BRM = window.BRM = window.BRM || {};
  var t = function (k, v) { return BRM.i18n.t(k, v); };
  var esc = function (s) { return BRM.ui.esc(s); };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var PACKAGES = {
    A: { key: 'A', hours: 12, price: 60, months: 1 },
    B: { key: 'B', hours: 30, price: 135, months: 3 },
    C: { key: 'C', hours: 60, price: 220, months: 6 }
  };
  var TEST_CARDS = { '4242424242424242': 'success', '4000000000000002': 'declined', '4000000000003220': '3ds' };
  var MBWAY_SECONDS = 240;
  var METHODS = ['mbway', 'card', 'paypal', 'revolut'];

  function money(n) { return new Intl.NumberFormat(BRM.i18n.locale(), { style: 'currency', currency: 'EUR' }).format(n); }
  function rnd(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
  function rid(n) { var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }

  /* ==================================================================
     MOCK BACKEND (replace these with real calls)
     ================================================================== */

  /**
   * TODO(Stripe): create a PaymentIntent on YOUR server (never in the browser):
   *   stripe.paymentIntents.create({ amount, currency: 'eur',
   *     payment_method_types: ['card', 'mb_way', 'paypal', 'revolut_pay'], metadata: { bookingRef } })
   * and return its client_secret. Here we just fabricate an id.
   */
  function createPaymentIntent(order) {
    return Promise.resolve({
      id: 'pi_demo_' + rid(10), client_secret: 'demo_secret_' + rid(12),
      amount: Math.round(order.amount * 100), currency: 'eur', status: 'requires_payment_method', type: order.type
    });
  }

  /** Reads and clears the "force next outcome" demo control. */
  function consumeForce() {
    var f = BRM.store.get().force || null;
    if (f) BRM.store.update(function (o) { o.force = null; });
    document.dispatchEvent(new CustomEvent('forcechange'));
    return f;
  }

  /**
   * TODO(Stripe): confirm on the client with Stripe.js (stripe.confirmCardPayment / confirmMbWayPayment /
   * confirmPayPalPayment / confirmRevolutPayPayment) and listen to the webhook `payment_intent.succeeded`
   * on the server before marking anything as paid. Here the outcome is simulated:
   *   method: 'card' | 'card-3ds' | 'mbway' | 'paypal' | 'revolut'
   *   input : { number?, action?: 'approve'|'reject'|'cancel', code?, ignoreForce? }
   * Resolves { status: 'succeeded' | 'requires_action' | 'failed' | 'cancelled' | 'timeout', reason? }
   */
  function confirmPayment(intent, method, input) {
    input = input || {};
    return new Promise(function (resolve) {
      if (input.action === 'reject') { return setTimeout(function () { resolve({ status: 'failed', reason: 'rejected' }); }, 500); }
      if (input.action === 'cancel') { return setTimeout(function () { resolve({ status: 'cancelled' }); }, 300); }
      var forced = input.ignoreForce ? null : consumeForce();
      var delay = 1300 + Math.random() * 900;
      setTimeout(function () {
        if (method === 'card') {
          var base = TEST_CARDS[input.number] || 'declined';
          var mode = forced || (base === 'success' ? 'success' : base === 'declined' ? 'declined' : '3ds');
          if (mode === 'success') return resolve({ status: 'succeeded' });
          if (mode === 'declined') return resolve({ status: 'failed', reason: 'declined' });
          if (mode === 'timeout') return resolve({ status: 'timeout' });
          return resolve({ status: 'requires_action', action: '3ds' });
        }
        if (method === 'card-3ds') {
          if (forced === 'declined') return resolve({ status: 'failed', reason: '3ds' });
          if (forced === 'timeout') return resolve({ status: 'timeout' });
          return resolve({ status: 'succeeded' });
        }
        // mbway / paypal / revolut approvals
        if (forced === 'declined') return resolve({ status: 'failed', reason: 'funds' });
        if (forced === 'timeout') return resolve({ status: 'timeout' });
        return resolve({ status: 'succeeded' });
      }, delay);
    });
  }

  /**
   * TODO(backend): receipts/invoices should be issued by your billing system (e.g. Stripe + InvoiceXpress/Moloni
   * for Portuguese fiscal invoices). This stores a demo receipt in localStorage.
   */
  function createReceipt(order, method, input) {
    var number = input && input.number;
    var rcp = {
      no: 'RCP-' + new Date().getFullYear() + '-' + rnd(6), amount: order.amount, currency: 'EUR', method: method,
      brand: null, last4: null, at: new Date().toISOString(), type: order.type,
      itemKey: order.item.key, itemVars: order.item.vars || null, ref: order.ref || null
    };
    if (method === 'card' && number && TEST_CARDS[number]) { rcp.brand = cardBrand(number); rcp.last4 = number.slice(-4); }
    BRM.store.update(function (o) { o.receipts.push(rcp); });
    return rcp;
  }

  function addMonths(d, n) {
    var r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    if (r.getDate() !== d.getDate()) r = new Date(d.getFullYear(), d.getMonth() + n + 1, 0);
    return r;
  }
  /** TODO(backend): packages and hours tracking belong in the admin database. */
  function createPackage(pkgKey, receipt) {
    var def = PACKAGES[pkgKey];
    var pkg = { id: 'PKG-' + rid(6), key: def.key, hours: def.hours, price: def.price, months: def.months, used: 0, purchasedAt: new Date().toISOString(), firstHourAt: null, receipt: receipt.no };
    BRM.store.update(function (o) { o.packages.push(pkg); });
    return pkg;
  }

  /* ---------- card helpers ---------- */
  function cardBrand(d) {
    d = String(d).replace(/\D/g, '');
    if (/^4/.test(d)) return 'visa';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'mastercard';
    if (/^3[47]/.test(d)) return 'amex';
    return '';
  }
  function luhn(d) {
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = +d.charAt(i);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return d.length > 0 && sum % 10 === 0;
  }
  function groupCard(d, brand) {
    if (brand === 'amex') return (d.slice(0, 4) + ' ' + d.slice(4, 10) + ' ' + d.slice(10, 15)).trim();
    return d.replace(/(.{4})/g, '$1 ').trim();
  }
  function expiryOk(v) {
    var m = String(v).match(/^(\d{2})\/(\d{2})$/); if (!m) return false;
    var mo = +m[1], yr = 2000 + +m[2];
    if (mo < 1 || mo > 12) return false;
    return new Date(yr, mo, 0, 23, 59, 59) >= new Date();
  }
  function reformat(el, fn) {
    var pos = el.selectionStart, before = el.value.slice(0, pos).replace(/\D/g, '').length;
    el.value = fn(el.value.replace(/\D/g, ''));
    var n = 0, i = 0;
    for (; i < el.value.length && n < before; i++) { if (/\d/.test(el.value.charAt(i))) n++; }
    try { el.setSelectionRange(i, i); } catch (e) { /* ignore */ }
  }

  /* ==================================================================
     RECEIPT + PACKAGE CARD (shared UI)
     ================================================================== */
  function methodLabel(r) {
    var base = t('pay.' + r.method);
    if (r.method === 'card' && r.last4) base += ' ' + (r.brand ? r.brand.toUpperCase() + ' ' : '') + '•••• ' + r.last4;
    return base;
  }
  function renderReceipt(r) {
    var el = document.createElement('div');
    el.className = 'receipt';
    el.innerHTML =
      '<h3>' + t('pay.receiptT') + '</h3><dl>' +
      '<div><dt>' + t('pay.receiptNo') + '</dt><dd>' + esc(r.no) + '</dd></div>' +
      '<div><dt>' + t('pay.receiptItem') + '</dt><dd>' + esc(t(r.itemKey, r.itemVars || undefined)) + '</dd></div>' +
      (r.ref ? '<div><dt>' + t('pay.receiptRef') + '</dt><dd>' + esc(r.ref) + '</dd></div>' : '') +
      '<div><dt>' + t('pay.receiptAmount') + '</dt><dd><strong>' + money(r.amount) + '</strong></dd></div>' +
      '<div><dt>' + t('pay.receiptMethod') + '</dt><dd>' + esc(methodLabel(r)) + '</dd></div>' +
      '<div><dt>' + t('pay.receiptDate') + '</dt><dd>' + esc(new Intl.DateTimeFormat(BRM.i18n.locale(), { dateStyle: 'long', timeStyle: 'short' }).format(new Date(r.at))) + '</dd></div>' +
      '</dl><p class="rnote">' + t('pay.receiptNote') + '</p>' +
      '<div class="btn-row no-print" style="justify-content:center"><button type="button" class="btn btn-ghost btn-sm" data-print>' + t('pay.print') + '</button></div>';
    el.querySelector('[data-print]').addEventListener('click', function () { window.print(); });
    return el;
  }

  function renderPackageCard(pkg, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'pkg-card';
    var remaining = Math.max(0, pkg.hours - pkg.used);
    var expiry = pkg.firstHourAt ? addMonths(new Date(pkg.firstHourAt), pkg.months) : null;
    var expired = expiry && expiry < new Date();
    var monthsLabel = t('pay.pkgMonth' + pkg.months);
    var fmt = function (d) { return new Intl.DateTimeFormat(BRM.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d); };
    var expiryLine = expiry
      ? '<p class="pkg-meta"><strong>' + t('pay.pkgExpiry') + ':</strong> ' + fmt(expiry) + (expired ? ' · <span class="status dep">' + t('pay.pkgExpired') + '</span>' : '') + '</p>'
      : '<p class="pkg-meta">' + t('pay.pkgExpiryPending', { months: monthsLabel, date: fmt(addMonths(new Date(), pkg.months)) }) + '</p>';
    el.innerHTML =
      '<h3>' + (opts.title === false ? '' : t('pay.pkgDone') + ' · ') + t('resid.option' + pkg.key) + ' · ' + t('resid.hours', { n: pkg.hours }) + '</h3>' +
      '<p class="pkg-hours">' + remaining + '<small> ' + t('pay.pkgHours') + ' ' + t('pay.pkgOf', { n: pkg.hours }) + '</small></p>' +
      '<div class="meter" role="img" aria-label="' + remaining + '/' + pkg.hours + 'h"><i style="width:' + Math.round(remaining / pkg.hours * 100) + '%"></i></div>' +
      '<p class="pkg-meta">' + t('pay.pkgUsed', { n: pkg.used }) + ' · ' + t('pay.pkgPurchased', { date: fmt(new Date(pkg.purchasedAt)) }) + '</p>' +
      expiryLine +
      '<div class="btn-row"><button type="button" class="btn btn-sm" data-log' + (remaining <= 0 || expired ? ' disabled' : '') + '>' + (remaining <= 0 ? t('pay.pkgNone') : t('pay.pkgLog')) + '</button></div>' +
      '<p class="pkg-meta" style="margin-top:.8rem">' + t('pay.pkgLogHint') + '</p>';
    el.querySelector('[data-log]').addEventListener('click', function () {
      BRM.store.update(function (o) {
        o.packages.forEach(function (p) { if (p.id === pkg.id && p.used < p.hours) { p.used += 1; if (!p.firstHourAt) p.firstHourAt = new Date().toISOString(); } });
      });
      var upd = BRM.store.get().packages.filter(function (p) { return p.id === pkg.id; })[0];
      var fresh = renderPackageCard(upd, opts);
      el.replaceWith(fresh);
      var b = fresh.querySelector('[data-log]'); if (b && !b.disabled) b.focus();
      if (opts.onChange) opts.onChange(upd);
    });
    return el;
  }

  /* ==================================================================
     CHECKOUT UI
     mountCheckout(container, order, opts) -> { destroy() }
       order: { type, amount, remaining?, item:{key,vars?}, detail?:{label,value}, ref? , pkgKey? }
       opts : { onSuccess(receipt) -> {pkg?}, onContinue(), continueLabel, successActions:[{href,label,primary}] }
     ================================================================== */
  function mountCheckout(container, order, opts) {
    opts = opts || {};
    var S = { view: 'form', method: 'mbway', fail: '', timers: [], mb: null, intent: null, receipt: null, extra: null, overlay: null, dead: false };

    container.innerHTML =
      '<div class="pay-banner" role="note"><span aria-hidden="true">⚠ </span>' + '<span data-i18n="pay.banner"></span></div>' +
      '<div class="pay-layout">' +
        '<div><div class="panel" id="co-panel"><h2 id="co-h" tabindex="-1" data-i18n="pay.title"></h2><div id="co-main"></div></div>' +
        '<details class="demo-controls" id="demo-controls"><summary data-i18n="pay.demoT"></summary><div class="inner" id="demo-inner"></div></details></div>' +
        '<aside class="summary-col" aria-label="" id="co-side"></aside>' +
      '</div>';
    var main = $('#co-main', container), side = $('#co-side', container);

    /* ----- order summary (always visible) ----- */
    function renderSide() {
      var rem = order.remaining ? '<div class="line later"><span>' + t('pay.remaining') + '</span><span>' + money(order.remaining) + '</span></div>' : '';
      var det = order.detail ? '<div class="line"><span>' + t(order.detail.label) + '</span><span style="text-align:right">' + esc(order.detail.value) + '</span></div>' : '';
      var vat = order.type === 'package'
        ? t('pay.vatPkg')
        : t('pay.vatNote');
      side.setAttribute('aria-label', t('pay.order'));
      side.innerHTML =
        '<div class="summary-card"><h2>' + t('pay.order') + '</h2>' +
        '<div class="line"><span>' + esc(t(order.item.key, order.item.vars)) + '</span><span>' + money(order.amount) + '</span></div>' + det +
        '<div class="line due"><span>' + t('pay.dueNow') + '</span><span>' + money(order.amount) + '</span></div>' + rem +
        '<p class="vat">' + vat + '<br><span class="ph">' + t('pay.vatPlaceholder') + '</span></p></div>';
    }

    /* ----- demo controls ----- */
    function renderDemo() {
      var f = BRM.store.get().force || 'auto';
      var opt = function (v, label) { return '<label><input type="radio" name="force" value="' + v + '"' + (f === v ? ' checked' : '') + '> ' + label + '</label>'; };
      $('#demo-inner', container).innerHTML = '<p>' + t('pay.demoD') + '</p>' +
        opt('auto', t('pay.demoAuto')) + opt('success', t('pay.demoSuccess')) + opt('declined', t('pay.demoDeclined')) + opt('timeout', t('pay.demoTimeout')) +
        '<p class="demo-state" role="status">' + (f === 'auto' ? t('pay.demoNone') : t('pay.demoNext', { x: t('pay.demo' + f.charAt(0).toUpperCase() + f.slice(1)) })) + '</p>';
    }
    container.addEventListener('change', function (e) {
      if (e.target.name === 'force') { var v = e.target.value; BRM.store.update(function (o) { o.force = v === 'auto' ? null : v; }); renderDemo(); }
    });
    function onForce() { if (!S.dead) renderDemo(); }
    document.addEventListener('forcechange', onForce);

    /* ----- helpers ----- */
    function clearTimers() { S.timers.forEach(function (id) { clearInterval(id); clearTimeout(id); }); S.timers = []; }
    function snapshot() { var o = {}; main.querySelectorAll('input[id]').forEach(function (i) { if (i.type !== 'radio') o[i.id] = i.value; }); return o; }
    function restore(o) { Object.keys(o).forEach(function (id) { var el = document.getElementById(id); if (el && el.type !== 'radio' && o[id]) el.value = o[id]; }); }
    function setView(v, focus) {
      clearTimers(); S.view = v; render();
      if (focus) { var h = main.querySelector('[data-focus]') || $('#co-h', container); if (h) h.focus({ preventScroll: false }); }
    }
    function field(id, labelKey, inner, hintKey) {
      return '<div class="field"><label for="' + id + '">' + t(labelKey) + '</label>' + inner +
        (hintKey ? '<span class="hint" id="' + id + '-hint">' + t(hintKey) + '</span>' : '') + '<p class="err" id="' + id + '-err" role="alert"></p></div>';
    }
    function amountTxt() { return money(order.amount); }

    /* ----- views ----- */
    function viewForm() {
      var radios = METHODS.map(function (m) {
        return '<label class="method"><input type="radio" name="method" value="' + m + '"' + (S.method === m ? ' checked' : '') + '>' +
          '<span class="m-box"><span class="m-name"><span class="m-chip ' + m + '" aria-hidden="true">' + { mbway: 'MB', card: '▭', paypal: 'PP', revolut: 'R' }[m] + '</span>' + t('pay.' + m) + '</span>' +
          '<span class="m-sub">' + t('pay.' + m + 'D') + '</span></span></label>';
      }).join('');
      return '<fieldset class="methods"><legend>' + t('pay.method') + '</legend>' + radios + '</fieldset><div class="pay-panel" id="method-panel">' + methodPanel() + '</div>';
    }
    function methodPanel() {
      if (S.method === 'mbway') {
        return '<form id="f-mb" novalidate>' +
          field('mb-phone', 'pay.mbPhone', '<div class="input-prefix"><span>+351</span><input id="mb-phone" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="9XX XXX XXX" aria-describedby="mb-phone-hint mb-phone-err"></div>', 'pay.mbPhoneHint') +
          '<div class="pay-actions"><button class="btn btn-block" type="submit">' + t('pay.mbSend') + '</button></div></form>';
      }
      if (S.method === 'card') {
        return '<div class="testcards"><b>' + t('pay.cardHintT') + '</b>' +
          '<button type="button" data-test="4242424242424242"><code>4242 4242 4242 4242</code><span>' + t('pay.cardHintOk') + '</span></button>' +
          '<button type="button" data-test="4000000000000002"><code>4000 0000 0000 0002</code><span>' + t('pay.cardHintDecl') + '</span></button>' +
          '<button type="button" data-test="4000000000003220"><code>4000 0000 0000 3220</code><span>' + t('pay.cardHint3ds') + '</span></button></div>' +
          '<form id="f-card" novalidate autocomplete="off">' +
          field('c-num', 'pay.cardNumber', '<div class="card-wrap"><input id="c-num" inputmode="numeric" autocomplete="off" maxlength="23" placeholder="0000 0000 0000 0000" aria-describedby="c-num-err"><span class="brand-tag" id="c-brand" hidden></span></div>') +
          '<div class="row2">' + field('c-exp', 'pay.cardExpiry', '<input id="c-exp" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="MM/AA" aria-describedby="c-exp-err">') +
          field('c-cvc', 'pay.cardCvc', '<input id="c-cvc" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="123" aria-describedby="c-cvc-err">') + '</div>' +
          field('c-name', 'pay.cardName', '<input id="c-name" autocomplete="off" aria-describedby="c-name-err">') +
          '<p class="note">' + t('pay.cardWarn') + '</p>' +
          '<div class="pay-actions"><button class="btn btn-block" type="submit">' + t('pay.pay', { amount: amountTxt() }) + '</button></div></form>';
      }
      var title = S.method === 'paypal' ? 'ppTitle' : 'revTitle';
      return '<p>' + t('pay.popLoginD') + '</p><div class="pay-actions"><button class="btn btn-block" type="button" id="open-pop">' + t('pay.pay', { amount: amountTxt() }) + ' · ' + t('pay.' + title) + '</button></div>';
    }
    function viewWait() {
      var m = S.mb;
      return '<div class="pay-status"><div class="status-icon" style="background:#d1161b;font-size:1.2rem;font-weight:700;letter-spacing:.04em" aria-hidden="true">MB</div>' +
        '<h2 tabindex="-1" data-focus>' + t('pay.mbWaitT') + '</h2><p>' + t('pay.mbWaitD', { amount: amountTxt(), phone: esc(m.phoneFmt) }) + '</p>' +
        '<p class="sr-only">' + t('pay.mbTimer') + '</p><div class="timer" id="mb-timer" role="timer" aria-label="' + t('pay.mbTimer') + '">4:00</div>' +
        '<div class="bar"><i id="mb-bar"></i></div>' +
        '<div class="btn-row"><button class="btn" type="button" id="mb-approve">' + t('pay.mbApprove') + '</button>' +
        '<button class="btn btn-ghost" type="button" id="mb-reject">' + t('pay.mbReject') + '</button></div>' +
        '<p><button class="btn-link" type="button" id="mb-cancel">' + t('pay.mbCancel') + '</button></p></div>';
    }
    function viewProcessing() {
      return '<div class="pay-status" role="status"><div class="spinner" aria-hidden="true"></div><h2 tabindex="-1" data-focus>' + t('pay.processing') + '</h2><p>' + t('pay.processingD') + '</p></div>';
    }
    function viewOk() {
      var r = S.receipt, ex = S.extra || {};
      var acts = '';
      if (opts.onContinue) acts += '<button class="btn" type="button" id="co-continue">' + t(opts.continueLabel || 'book.next') + '</button>';
      (opts.successActions || []).forEach(function (a) { acts += '<a class="btn' + (a.primary ? '' : ' btn-ghost') + '" href="' + esc(a.href) + '">' + t(a.label) + '</a>'; });
      return '<div class="pay-status" role="status"><div class="status-icon ok" aria-hidden="true">✓</div><h2 tabindex="-1" data-focus>' + t('pay.okT') + '</h2>' +
        '<p>' + t('pay.okD', { amount: money(r.amount) }) + '</p></div><div id="ok-extra"></div><div class="btn-row" style="justify-content:center">' + acts + '</div>';
    }
    function viewFail() {
      return '<div class="pay-status"><div class="status-icon fail" aria-hidden="true">!</div><h2 tabindex="-1" data-focus>' + t('pay.failT') + '</h2>' +
        '<p role="alert">' + t(S.fail) + '</p><div class="btn-row"><button class="btn" type="button" id="co-retry">' + t('pay.retry') + '</button>' +
        '<button class="btn btn-ghost" type="button" id="co-other">' + t('pay.another') + '</button></div></div>';
    }
    function viewCancel() {
      return '<div class="pay-status"><div class="status-icon cancel" aria-hidden="true">×</div><h2 tabindex="-1" data-focus>' + t('pay.cancelledT') + '</h2>' +
        '<p role="status">' + t('pay.cancelledD') + '</p><div class="btn-row"><button class="btn" type="button" id="co-back">' + t('pay.backToPay') + '</button></div></div>';
    }

    function render() {
      clearTimers();
      renderSide();
      var hd = $('#co-h', container);
      hd.hidden = S.view !== 'form';
      main.innerHTML = { form: viewForm, mbwait: viewWait, processing: viewProcessing, ok: viewOk, fail: viewFail, cancel: viewCancel }[S.view]();
      bindView();
      BRM.i18n.apply(container);
    }

    /* ----- behaviour ----- */
    function startMbTimer() {
      var m = S.mb, timerEl = $('#mb-timer', main), bar = $('#mb-bar', main);
      function tick() {
        if (m.fast) m.endsAt -= 12000;
        var left = Math.max(0, Math.round((m.endsAt - Date.now()) / 1000));
        var mm = Math.floor(left / 60), ss = left % 60;
        if (timerEl) timerEl.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
        if (bar) bar.style.width = Math.round(left / MBWAY_SECONDS * 100) + '%';
        if (left <= 0) { clearTimers(); fail('pay.errTimeout'); }
      }
      tick();
      S.timers.push(setInterval(tick, m.fast ? 250 : 500));
    }

    function fail(key) { S.fail = key; setView('fail', true); }

    function succeed(method, input) {
      var rcp = createReceipt(order, method, input);
      S.receipt = rcp;
      try { S.extra = opts.onSuccess ? (opts.onSuccess(rcp) || null) : null; } catch (e) { S.extra = null; }
      // onSuccess may have updated the receipt (e.g. added booking ref)
      var stored = BRM.store.get().receipts.filter(function (x) { return x.no === rcp.no; })[0];
      if (stored) S.receipt = stored;
      setView('ok', true);
      var slot = $('#ok-extra', main);
      if (slot) {
        slot.appendChild(renderReceipt(S.receipt));
        if (S.extra && S.extra.pkg) { var pc = renderPackageCard(S.extra.pkg, {}); slot.insertBefore(pc, slot.firstChild); }
      }
      var c = $('#co-continue', main); if (c) c.addEventListener('click', function () { if (opts.onContinue) opts.onContinue(S.receipt); });
    }

    function handle(res, method, input) {
      if (S.dead) return;
      if (res.status === 'succeeded') return succeed(method === 'card-3ds' ? 'card' : method, input);
      if (res.status === 'requires_action') return open3ds(input);
      if (res.status === 'cancelled') { closeOverlay(); return setView('cancel', true); }
      if (res.status === 'timeout') {
        if (method === 'mbway' && S.mb) { S.mb.fast = true; setView('mbwait', true); return; }
        return fail('pay.errTimeout');
      }
      var map = { declined: 'pay.errDeclined', funds: 'pay.errFunds', rejected: 'pay.errRejected', '3ds': 'pay.err3ds' };
      fail(map[res.reason] || 'pay.errGeneric');
    }

    function runConfirm(method, input) {
      closeOverlay(); setView('processing', true);
      var p = S.intent ? Promise.resolve(S.intent) : createPaymentIntent(order);
      p.then(function (intent) { S.intent = intent; return confirmPayment(intent, method, input); })
        .then(function (res) { handle(res, method, input); })
        .catch(function () { fail('pay.errGeneric'); });
    }

    /* overlay (PayPal / Revolut / 3-D Secure) */
    function openOverlay(html, onEsc) {
      closeOverlay();
      var prev = document.activeElement;
      var ov = document.createElement('div');
      ov.className = 'overlay'; ov.innerHTML = '<div class="popup" role="dialog" aria-modal="true" aria-labelledby="pop-h">' + html + '</div>';
      document.body.appendChild(ov);
      BRM.i18n.apply(ov);
      var dlg = ov.firstChild;
      S.overlay = { el: ov, prev: prev };
      var first = dlg.querySelector('input:not([readonly]), button:not(.sec)'); if (first) first.focus();
      ov.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); onEsc(); }
        else if (e.key === 'Tab') {
          var f = dlg.querySelectorAll('button, input:not([readonly])'); if (!f.length) return;
          var a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
      });
      return dlg;
    }
    function closeOverlay() {
      if (!S.overlay) return;
      var o = S.overlay; S.overlay = null; o.el.remove();
      if (o.prev && document.contains(o.prev)) o.prev.focus();
    }

    function openPopup(method) {
      var brand = method; var name = method === 'paypal' ? 'PayPal' : 'Revolut Pay';
      var url = method === 'paypal' ? 'checkout.paypal-simulado.example' : 'pay.revolut-simulado.example';
      var bar = '<div class="pop-bar"><span>🔒 ' + url + '</span><span>' + t('pay.popWindow') + '</span></div>';
      var head = '<div class="pop-head ' + brand + '">' + name + ' <span style="font-weight:400;font-size:.7rem;margin-left:auto;opacity:.85">DEMO</span></div>';
      var dlg = openOverlay(bar + head +
        '<div class="pop-body" id="pop-step"></div>', function () { cancelPopup(); });
      function stepLogin() {
        $('#pop-step', dlg).innerHTML = '<h3 id="pop-h">' + t('pay.popLogin') + '</h3><p>' + t('pay.popLoginD') + '</p>' +
          '<div class="field"><label for="pop-email">' + t('pay.popEmail') + '</label><input id="pop-email" type="email" value="cliente.demo@example.com" readonly></div>' +
          '<button class="pop-btn ' + brand + '" type="button" id="pop-continue">' + t('pay.popContinue') + '</button>' +
          '<button class="pop-btn sec" type="button" id="pop-cancel">' + t('pay.popCancel') + '</button>';
        $('#pop-continue', dlg).addEventListener('click', stepApprove);
        $('#pop-cancel', dlg).addEventListener('click', cancelPopup);
        $('#pop-continue', dlg).focus();
      }
      function stepApprove() {
        $('#pop-step', dlg).innerHTML = '<h3 id="pop-h">' + t('pay.popApproveT') + '</h3><p>' + t('pay.popApproveD', { amount: amountTxt() }) + '</p>' +
          '<div class="pop-amount">' + amountTxt() + '</div>' +
          '<button class="pop-btn ' + brand + '" type="button" id="pop-ok">' + t('pay.popApprove') + '</button>' +
          '<button class="pop-btn sec" type="button" id="pop-cancel">' + t('pay.popCancel') + '</button>';
        $('#pop-ok', dlg).addEventListener('click', function () { runConfirm(method, { action: 'approve' }); });
        $('#pop-cancel', dlg).addEventListener('click', cancelPopup);
        $('#pop-ok', dlg).focus();
      }
      function cancelPopup() { closeOverlay(); confirmPayment({}, method, { action: 'cancel' }).then(function (r) { handle(r, method, {}); }); }
      stepLogin();
    }

    function open3ds(cardInput) {
      var dlg = openOverlay(
        '<div class="pop-bar"><span>🔒 3ds.banco-simulado.example</span><span>' + t('pay.popWindow') + '</span></div>' +
        '<div class="pop-head bank">' + t('pay.tdsBank') + '</div>' +
        '<form class="pop-body" id="tds-form" novalidate><h3 id="pop-h">' + t('pay.tdsT') + '</h3><p>' + t('pay.tdsD') + '</p>' +
        '<div class="pop-amount">' + amountTxt() + '</div>' +
        '<div class="field"><label for="tds-code">' + t('pay.tdsCode') + '</label><input id="tds-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-describedby="tds-code-err"><p class="err" id="tds-code-err" role="alert"></p></div>' +
        '<button class="pop-btn bank" type="submit">' + t('pay.tdsConfirm') + '</button>' +
        '<button class="pop-btn sec" type="button" id="tds-cancel">' + t('pay.tdsCancel') + '</button></form>',
        function () { cancel3ds(); });
      var code = $('#tds-code', dlg);
      code.addEventListener('input', function () { code.value = code.value.replace(/\D/g, ''); code.removeAttribute('aria-invalid'); $('#tds-code-err', dlg).textContent = ''; });
      $('#tds-form', dlg).addEventListener('submit', function (e) {
        e.preventDefault();
        if (!/^\d{6}$/.test(code.value)) { code.setAttribute('aria-invalid', 'true'); $('#tds-code-err', dlg).textContent = t('pay.tdsErr'); code.focus(); return; }
        runConfirm('card-3ds', cardInput);
      });
      $('#tds-cancel', dlg).addEventListener('click', cancel3ds);
      function cancel3ds() { closeOverlay(); setView('cancel', true); }
    }

    function bindView() {
      if (S.view === 'form') {
        main.querySelectorAll('input[name="method"]').forEach(function (r) {
          r.addEventListener('change', function () { S.method = r.value; $('#method-panel', main).innerHTML = methodPanel(); bindPanel(); BRM.i18n.apply(main); });
        });
        bindPanel();
      } else if (S.view === 'mbwait') {
        $('#mb-approve', main).addEventListener('click', function () {
          var phone = S.mb.phone; clearTimers();
          // keep the countdown visible only until processing finishes
          var m = S.mb; setView('processing', true);
          confirmPayment(S.intent, 'mbway', { action: 'approve' }).then(function (res) {
            if (res.status === 'timeout') { S.mb = m; m.fast = true; setView('mbwait', true); return; }
            handle(res, 'mbway', { phone: phone });
          });
        });
        $('#mb-reject', main).addEventListener('click', function () {
          clearTimers(); setView('processing', true);
          confirmPayment(S.intent, 'mbway', { action: 'reject' }).then(function (res) { handle(res, 'mbway', {}); });
        });
        $('#mb-cancel', main).addEventListener('click', function () { clearTimers(); setView('cancel', true); });
        startMbTimer();
      } else if (S.view === 'fail') {
        $('#co-retry', main).addEventListener('click', function () { setView('form', true); });
        $('#co-other', main).addEventListener('click', function () {
          S.method = METHODS[(METHODS.indexOf(S.method) + 1) % METHODS.length]; setView('form', true);
          var r = main.querySelector('input[name="method"]:checked'); if (r) r.focus();
        });
      } else if (S.view === 'cancel') {
        $('#co-back', main).addEventListener('click', function () { setView('form', true); });
      }
    }

    function bindPanel() {
      if (S.method === 'mbway') {
        var ph = $('#mb-phone', main);
        ph.addEventListener('input', function () { reformat(ph, function (d) { d = d.slice(0, 9); return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim(); }); BRM.ui.setErr(ph, null); });
        $('#f-mb', main).addEventListener('submit', function (e) {
          e.preventDefault();
          var v = BRM.validate.mbway(ph.value);
          if (!v) { BRM.ui.setErr(ph, 'pay.mbPhoneErr'); ph.focus(); return; }
          BRM.ui.setErr(ph, null);
          S.mb = { phone: v, phoneFmt: v.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'), endsAt: Date.now() + MBWAY_SECONDS * 1000, fast: false };
          createPaymentIntent(order).then(function (i) { S.intent = i; setView('mbwait', true); });
        });
      } else if (S.method === 'card') {
        var num = $('#c-num', main), exp = $('#c-exp', main), cvc = $('#c-cvc', main), nm = $('#c-name', main), tag = $('#c-brand', main);
        function paintBrand() {
          var d = num.value.replace(/\D/g, ''), b = cardBrand(d);
          tag.hidden = !b; tag.textContent = b === 'mastercard' ? 'Mastercard' : b.toUpperCase();
          cvc.maxLength = b === 'amex' ? 4 : 3;
        }
        num.addEventListener('input', function () {
          var b = cardBrand(num.value);
          reformat(num, function (d) { d = d.slice(0, b === 'amex' ? 15 : 16); return groupCard(d, b); });
          paintBrand(); BRM.ui.setErr(num, null);
        });
        exp.addEventListener('input', function () { reformat(exp, function (d) { d = d.slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }); BRM.ui.setErr(exp, null); });
        cvc.addEventListener('input', function () { cvc.value = cvc.value.replace(/\D/g, ''); BRM.ui.setErr(cvc, null); });
        nm.addEventListener('input', function () { BRM.ui.setErr(nm, null); });
        main.querySelectorAll('[data-test]').forEach(function (b) {
          b.addEventListener('click', function () {
            var n = b.getAttribute('data-test');
            num.value = groupCard(n, cardBrand(n)); exp.value = '12/34'; cvc.value = '123'; if (!nm.value) nm.value = 'Cliente Demo';
            ['c-num', 'c-exp', 'c-cvc', 'c-name'].forEach(function (id) { BRM.ui.setErr(document.getElementById(id), null); });
            paintBrand(); $('#f-card button[type="submit"]', main).focus();
          });
        });
        paintBrand();
        $('#f-card', main).addEventListener('submit', function (e) {
          e.preventDefault();
          var d = num.value.replace(/\D/g, ''), bad = null;
          var errNum = null;
          if (!luhn(d) || d.length < 13) errNum = 'pay.errCardNumber';
          else if (!TEST_CARDS[d]) errNum = 'pay.errCardDemo';
          BRM.ui.setErr(num, errNum); if (errNum) bad = bad || num;
          var eOk = expiryOk(exp.value); BRM.ui.setErr(exp, eOk ? null : 'pay.errCardExpiry'); if (!eOk) bad = bad || exp;
          var need = cardBrand(d) === 'amex' ? 4 : 3, cOk = cvc.value.length === need; BRM.ui.setErr(cvc, cOk ? null : 'pay.errCardCvc'); if (!cOk) bad = bad || cvc;
          var nOk = nm.value.trim().length >= 2; BRM.ui.setErr(nm, nOk ? null : 'pay.errCardName'); if (!nOk) bad = bad || nm;
          if (bad) { bad.focus(); return; }
          var input = { number: d };            // lives only in this closure; never persisted
          runConfirm('card', input);
        });
      } else {
        $('#open-pop', main).addEventListener('click', function () { openPopup(S.method); });
      }
    }

    /* ----- language / reset reactions ----- */
    function onLang() {
      if (S.dead) return;
      var snap = snapshot();
      var ov = S.overlay;
      if (S.view === 'form') { render(); restore(snap); var c = $('#c-num', main); if (c) c.dispatchEvent(new Event('input')); }
      else if (S.view === 'ok') { var r = S.receipt, ex = S.extra; render(); var slot = $('#ok-extra', main); if (slot) { if (ex && ex.pkg) slot.appendChild(renderPackageCard(BRM.store.get().packages.filter(function (p) { return p.id === ex.pkg.id; })[0] || ex.pkg, {})); slot.appendChild(renderReceipt(r)); } var cb = $('#co-continue', main); if (cb) cb.addEventListener('click', function () { opts.onContinue(S.receipt); }); }
      else { var keep = S.mb; render(); }
      renderDemo();
      if (ov) { /* overlay texts are re-read on next open; keep it simple */ }
    }
    document.addEventListener('langchange', onLang);

    render(); renderDemo();

    return {
      destroy: function () {
        S.dead = true; clearTimers(); closeOverlay();
        document.removeEventListener('langchange', onLang); document.removeEventListener('forcechange', onForce);
        container.innerHTML = '';
      }
    };
  }

  /* ==================================================================
     payment.html controller: packages + remaining balance
     ================================================================== */
  function initPaymentPage() {
    var box = $('#checkout');
    if (!box || document.body.getAttribute('data-page') !== 'payment') return;
    var q = new URLSearchParams(location.search), type = q.get('order');
    var order = null, opts = {};

    if (type === 'package' && PACKAGES[q.get('pkg')]) {
      var def = PACKAGES[q.get('pkg')];
      order = { type: 'package', amount: def.price, remaining: 0, item: { key: 'pay.itemPackage', vars: { n: def.hours } }, detail: null, pkgKey: def.key };
      opts.onSuccess = function (receipt) { return { pkg: createPackage(def.key, receipt) }; };
      opts.successActions = [{ href: 'manage.html', label: 'pay.toManage', primary: true }, { href: 'index.html', label: 'pay.toHome' }];
    } else if (type === 'remaining') {
      var b = BRM.booking.getBookingByRef(q.get('ref'));
      if (b && !b.remainingPaid) {
        order = { type: 'remaining', amount: 30, remaining: 0, ref: b.ref, item: { key: 'pay.itemRemaining' }, detail: { label: 'book.sumDate', value: BRM.booking.fmtDate(b.dateISO) } };
        opts.onSuccess = function (receipt) { receipt.ref = b.ref; BRM.booking.markRemainingPaid(b.ref, receipt); return null; };
        opts.successActions = [{ href: 'manage.html?ref=' + encodeURIComponent(b.ref) + '&paid=1', label: 'pay.toManage', primary: true }];
      } else if (b && b.remainingPaid) {
        box.innerHTML = '<div class="panel pay-status"><div class="status-icon ok" aria-hidden="true">✓</div><h2 data-i18n="pay.paidFull"></h2><p><a class="btn" href="manage.html?ref=' + encodeURIComponent(b.ref) + '&paid=1" data-i18n="pay.toManage"></a></p></div>';
        BRM.i18n.apply(box); return;
      }
    }
    if (!order) {
      box.innerHTML = '<div class="panel pay-status"><div class="status-icon fail" aria-hidden="true">!</div><h2 data-i18n="pay.failT"></h2><p data-i18n="pay.invalidOrder"></p><p><a class="btn" href="index.html" data-i18n="pay.toHome"></a></p></div>';
      BRM.i18n.apply(box); return;
    }
    mountCheckout(box, order, opts);
  }

  BRM.pay = {
    PACKAGES: PACKAGES, TEST_CARDS: TEST_CARDS,
    createPaymentIntent: createPaymentIntent, confirmPayment: confirmPayment, createReceipt: createReceipt, createPackage: createPackage,
    mountCheckout: mountCheckout, renderReceipt: renderReceipt, renderPackageCard: renderPackageCard, luhn: luhn, cardBrand: cardBrand, expiryOk: expiryOk, addMonths: addMonths
  };

  if (document.readyState === 'complete') initPaymentPage(); else document.addEventListener('DOMContentLoaded', initPaymentPage);
})();
