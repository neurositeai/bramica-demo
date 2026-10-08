/* ==========================================================================
   Brâmica demo: shared UI (header, footer, language, gallery, lightbox, forms)
   ========================================================================== */
(function () {
  'use strict';
  var BRM = window.BRM = window.BRM || {};
  var t = function (k, v) { return BRM.i18n.t(k, v); };

  var IS_HOME = /(^|\/)(index\.html)?$/.test(location.pathname) && !!document.getElementById('portfolio');
  var BASE = IS_HOME ? '' : 'index.html';
  var PAGE = document.body.getAttribute('data-page') || '';

  /* ---------- Icons (generic line icons, not brand logos) ---------- */
  var ICON = {
    chat: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    insta: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".6"/></svg>',
    mail: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5l8.5 7 8.5-7"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21z"/><circle cx="12" cy="10" r="2.5"/></svg>'
  };
  BRM.ICON = ICON;

  /* ---------- Header / footer ---------- */
  function renderChrome() {
    var skip = document.createElement('a');
    skip.className = 'skip'; skip.href = '#main'; skip.setAttribute('data-i18n', 'a11y.skip');
    document.body.insertBefore(skip, document.body.firstChild);

    var h = document.getElementById('site-header');
    if (h) {
      h.className = 'site-header';
      h.innerHTML =
        '<div class="container header-inner">' +
          '<a class="logo" href="index.html" data-i18n-attr="aria-label:a11y.home"><img class="logo-img" src="assets/img/logo-dark.webp" width="480" height="104" alt=""></a>' +
          '<nav class="site-nav" id="site-nav" data-i18n-attr="aria-label:a11y.nav">' +
            '<ul>' +
              '<li><a href="' + BASE + '#portfolio" data-i18n="nav.portfolio"></a></li>' +
              '<li><a href="' + BASE + '#workshops" data-i18n="nav.workshops"></a></li>' +
              '<li><a href="' + BASE + '#residencias" data-i18n="nav.residencias"></a></li>' +
              '<li><a href="' + BASE + '#studio" data-i18n="nav.studio"></a></li>' +
              '<li><a href="' + BASE + '#contact" data-i18n="nav.contact"></a></li>' +
            '</ul>' +
            '<a class="btn btn-sm nav-cta" href="booking.html" data-i18n="cta.book"></a>' +
          '</nav>' +
          '<div class="header-tools">' +
            '<div class="lang" role="group" data-i18n-attr="aria-label:a11y.langGroup">' +
              '<button type="button" data-lang="pt" aria-pressed="false" lang="pt-PT" data-i18n-attr="aria-label:a11y.langPt">PT</button>' +
              '<button type="button" data-lang="en" aria-pressed="false" lang="en" data-i18n-attr="aria-label:a11y.langEn">EN</button>' +
            '</div>' +
            '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-i18n-attr="aria-label:a11y.menu"><span></span><span></span><span></span></button>' +
          '</div>' +
        '</div>';
    }

    var f = document.getElementById('site-footer');
    if (f) {
      f.className = 'site-footer';
      f.innerHTML =
        '<div class="container footer-grid">' +
          '<div><a class="logo" href="index.html" data-i18n-attr="aria-label:a11y.home"><img class="logo-img" src="assets/img/logo-light.webp" width="480" height="104" alt="" loading="lazy"></a></div>' +
          '<div style="display:grid;gap:1rem">' +
            '<p class="footer-note"><strong data-i18n="footer.note"></strong></p>' +
            '<p class="footer-small" data-i18n="footer.demo"></p>' +
            '<div class="footer-links">' +
              '<a href="admin-preview.html" data-i18n="road.previewAdmin"></a>' +
              '<a href="manage.html" data-i18n="pay.toManage"></a>' +
              '<button type="button" id="reset-demo" data-i18n="footer.reset"></button>' +
            '</div>' +
            '<p class="footer-small" data-i18n="footer.rights"></p>' +
            '<p class="footer-small" id="reset-msg" role="status"></p>' +
          '</div>' +
        '</div>';
    }
  }

  function bindChrome() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    function closeNav() {
      if (!nav) return;
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', t('a11y.menu'));
    }
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = !nav.classList.contains('open');
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', t(open ? 'a11y.menuClose' : 'a11y.menu'));
      });
      nav.addEventListener('click', function (e) { if (e.target.closest('a')) closeNav(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { closeNav(); toggle.focus(); } });
    }
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.addEventListener('click', function () { BRM.i18n.setLang(b.getAttribute('data-lang')); });
    });
    var hdr = document.getElementById('site-header');
    if (hdr) {
      var onScroll = function () { hdr.classList.toggle('scrolled', window.scrollY > 8); };
      onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    }
    var reset = document.getElementById('reset-demo');
    if (reset) reset.addEventListener('click', function () {
      if (window.confirm(t('footer.resetConfirm'))) {
        BRM.store.reset();
        var m = document.getElementById('reset-msg'); if (m) m.textContent = t('footer.resetDone');
        document.dispatchEvent(new CustomEvent('seatschange'));
        document.dispatchEvent(new CustomEvent('datareset'));
      }
    });
    syncLangButtons();
  }

  function syncLangButtons() {
    var l = BRM.i18n.getLang();
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === l)); });
    var toggle = document.querySelector('.nav-toggle');
    if (toggle) toggle.setAttribute('aria-label', t(toggle.getAttribute('aria-expanded') === 'true' ? 'a11y.menuClose' : 'a11y.menu'));
  }

  /* ---------- Scroll reveal + scroll spy ---------- */
  function initReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.01, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (el, i) {
      el.classList.add('reveal');
      var d = el.getAttribute('data-reveal');
      if (d) el.style.transitionDelay = d + 'ms';
      io.observe(el);
    });
  }

  function initSpy() {
    if (!IS_HOME || !('IntersectionObserver' in window)) return;
    var map = {};
    document.querySelectorAll('.site-nav li a').forEach(function (a) {
      var id = (a.getAttribute('href') || '').split('#')[1];
      if (id) map[id] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = map[en.target.id];
        if (!a) return;
        if (en.isIntersecting) {
          Object.keys(map).forEach(function (k) { map[k].removeAttribute('aria-current'); });
          a.setAttribute('aria-current', 'page');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Portfolio gallery + lightbox ---------- */
  var GALLERY = [
    ['three-heads', 541, 297, 1082, 594], ['pink-vase', 319, 340, 638, 680], ['ceramic-lamp', 420, 524, 840, 1048],
    ['nested-bowls', 286, 225, 572, 450], ['stacked-cups', 300, 571, 600, 1142], ['green-vase', 389, 487, 778, 974],
    ['crackle-heads', 511, 352, 1022, 704], ['twin-figures', 260, 494, 520, 988], ['flared-vase', 227, 284, 454, 568],
    ['spiral-bowls', 296, 196, 592, 392], ['ear-vase', 276, 364, 552, 728], ['teal-bowl', 276, 222, 552, 444],
    ['grey-vase', 227, 307, 454, 614], ['grey-bowl-gold', 319, 251, 638, 502], ['three-cups', 246, 225, 492, 450],
    ['porcelain-bowl', 238, 356, 476, 712], ['brushed-vase', 255, 245, 510, 490], ['bottle-vases', 296, 274, 592, 548],
    ['two-cups', 222, 284, 444, 568], ['white-cups', 220, 191, 440, 382], ['blue-vessel', 215, 268, 430, 536],
    ['perforated-dish', 246, 245, 492, 490], ['faceted-forms', 220, 279, 440, 558], ['speckled-cup', 222, 216, 444, 432],
    ['twelve-cups', 238, 205, 476, 410], ['spiked-vase', 267, 364, 534, 728], ['nested-plates', 215, 216, 430, 432],
    ['plate-bowls', 267, 222, 534, 444], ['plant-cabinet', 321, 509, 642, 1018], ['studio-shelf', 421, 562, 842, 1124]
  ];
  var VISIBLE = 12;
  var lb = { el: null, i: 0, opener: null };

  function initGallery() {
    var root = document.getElementById('gallery');
    if (!root) return;
    var html = '';
    GALLERY.forEach(function (g, i) {
      html += '<figure class="g-item"' + (i >= VISIBLE ? ' hidden data-extra' : '') + '>' +
        '<button type="button" class="g-btn" data-i="' + i + '" aria-haspopup="dialog">' +
        '<img src="assets/img/' + g[0] + '-t.webp" width="' + g[1] + '" height="' + g[2] + '" loading="lazy" decoding="async" data-alt="' + g[0] + '" alt=""></button></figure>';
    });
    root.innerHTML = html;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.g-btn'); if (!b) return;
      openLb(parseInt(b.getAttribute('data-i'), 10), b);
    });
    var more = document.getElementById('gallery-more');
    if (more) {
      var expanded = false;
      more.addEventListener('click', function () {
        expanded = !expanded;
        root.querySelectorAll('[data-extra]').forEach(function (f) { f.hidden = !expanded; });
        more.setAttribute('aria-expanded', String(expanded));
        more.setAttribute('data-i18n', expanded ? 'portfolio.less' : 'portfolio.more');
        more.textContent = t(expanded ? 'portfolio.less' : 'portfolio.more');
      });
    }
    // lightbox shell
    lb.el = document.createElement('div');
    lb.el.className = 'lightbox'; lb.el.setAttribute('role', 'dialog'); lb.el.setAttribute('aria-modal', 'true');
    lb.el.innerHTML =
      '<button class="lb-btn lb-close" type="button" data-i18n-attr="aria-label:a11y.close">&times;</button>' +
      '<button class="lb-btn lb-prev" type="button" data-i18n-attr="aria-label:a11y.prev">&#8592;</button>' +
      '<figure><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><figcaption></figcaption><span class="lb-count" aria-live="polite"></span></figure>' +
      '<button class="lb-btn lb-next" type="button" data-i18n-attr="aria-label:a11y.next">&#8594;</button>';
    document.body.appendChild(lb.el);
    lb.el.setAttribute('aria-label', t('portfolio.lbLabel'));
    lb.el.querySelector('.lb-close').addEventListener('click', closeLb);
    lb.el.querySelector('.lb-prev').addEventListener('click', function () { stepLb(-1); });
    lb.el.querySelector('.lb-next').addEventListener('click', function () { stepLb(1); });
    lb.el.addEventListener('click', function (e) { if (e.target === lb.el) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.el.classList.contains('open')) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') stepLb(-1);
      else if (e.key === 'ArrowRight') stepLb(1);
      else if (e.key === 'Tab') {
        var f = lb.el.querySelectorAll('button'); var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var sx = null;
    lb.el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.el.addEventListener('touchend', function (e) {
      if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
    });
  }

  function paintLb() {
    var g = GALLERY[lb.i];
    var img = lb.el.querySelector('img');
    img.src = 'assets/img/' + g[0] + '-l.webp';
    img.width = g[3]; img.height = g[4];
    img.alt = BRM.i18n.alt(g[0]);
    lb.el.style.setProperty('--lb-max', Math.round(g[3] * 0.9) + 'px');
    lb.el.querySelector('figcaption').textContent = BRM.i18n.alt(g[0]);
    lb.el.querySelector('.lb-count').textContent = t('portfolio.lbCount', { n: lb.i + 1, total: GALLERY.length });
  }
  function openLb(i, opener) {
    lb.i = i; lb.opener = opener; paintLb();
    lb.el.classList.add('open'); document.body.style.overflow = 'hidden';
    lb.el.querySelector('.lb-close').focus();
  }
  function closeLb() {
    lb.el.classList.remove('open'); document.body.style.overflow = '';
    if (lb.opener) lb.opener.focus();
  }
  function stepLb(d) { lb.i = (lb.i + d + GALLERY.length) % GALLERY.length; paintLb(); }

  /* ---------- Hero badge ---------- */
  function paintBadge() {
    var tp = document.getElementById('badge-text');
    if (tp) tp.textContent = t('hero.badge');
  }

  /* ---------- Contact form (front-end validation only) ---------- */
  function setErr(input, key) {
    var err = document.getElementById(input.id + '-err');
    if (key) {
      input.setAttribute('aria-invalid', 'true');
      err.setAttribute('data-i18n', key); err.textContent = t(key);
    } else {
      input.removeAttribute('aria-invalid');
      err.removeAttribute('data-i18n'); err.textContent = '';
    }
  }
  function initContact() {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var name = form.querySelector('#c-name'), email = form.querySelector('#c-email'), msg = form.querySelector('#c-msg');
    var ok = document.getElementById('contact-ok');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      var v1 = name.value.trim().length >= 2; setErr(name, v1 ? null : 'contact.errName'); if (!v1) bad = bad || name;
      var v2 = BRM.validate.email(email.value); setErr(email, v2 ? null : 'contact.errEmail'); if (!v2) bad = bad || email;
      var v3 = msg.value.trim().length >= 10; setErr(msg, v3 ? null : 'contact.errMessage'); if (!v3) bad = bad || msg;
      if (bad) { ok.hidden = true; bad.focus(); return; }
      ok.hidden = false; form.reset();
    });
    [name, email, msg].forEach(function (i) { i.addEventListener('input', function () { if (i.getAttribute('aria-invalid')) setErr(i, null); }); });
  }

  /* ---------- Homepage: next workshop dates + residência buttons ---------- */
  function renderNextDates() {
    var ul = document.getElementById('next-dates-list');
    if (!ul || !BRM.booking) return;
    var dates = BRM.booking.getDates().slice(0, 3);
    ul.innerHTML = dates.map(function (d) {
      var label = BRM.booking.fmtDate(d.iso, { weekday: 'short', day: 'numeric', month: 'long' });
      var s = d.left <= 0 ? t('workshops.full') : (d.left === 1 ? t('workshops.seatsOne') : t('workshops.seatsLeft', { n: d.left }));
      return '<li><span>' + label + '</span><span class="seats' + (d.left <= 0 ? ' full' : '') + '">' + s + '</span></li>';
    }).join('');
  }

  /* ---------- Boot ---------- */
  function rerender() { syncLangButtons(); paintBadge(); renderNextDates(); }

  function boot() {
    renderChrome();
    bindChrome();
    initGallery();
    initContact();
    initReveal();
    initSpy();
    BRM.i18n.apply(document);
    rerender();
    document.addEventListener('langchange', rerender);
    document.addEventListener('seatschange', renderNextDates);
    document.addEventListener('datareset', renderNextDates);
    document.documentElement.classList.add('ready');
  }
  if (document.readyState === 'complete') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
