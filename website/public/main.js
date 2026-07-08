// Speci docs — progressive enhancement (vanilla, zero-dependency)
(function () {
  'use strict';

  var prefersReduced =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Sticky header shadow on scroll ---- */
  var header = document.getElementById('site-header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Logo typewriter: cycle through speci subcommands ---- */
  var typedEl = document.getElementById('logo-typed');
  var caretEl = document.querySelector('.logo-caret');
  if (typedEl && !prefersReduced) {
    var cmds = [
      'init',
      'plan',
      'task',
      'run',
      'refactor',
      'status',
      'yolo',
      'clean',
    ];
    var ci = 0;
    var pos = 0;
    var deleting = false;
    var typeTick = function () {
      var word = cmds[ci];
      if (!deleting) {
        pos += 1;
        typedEl.textContent = word.slice(0, pos);
        if (caretEl) caretEl.classList.add('is-typing');
        if (pos === word.length) {
          deleting = true;
          if (caretEl) caretEl.classList.remove('is-typing');
          return window.setTimeout(typeTick, 1500);
        }
        return window.setTimeout(typeTick, 105);
      }
      pos -= 1;
      typedEl.textContent = word.slice(0, pos);
      if (caretEl) caretEl.classList.add('is-typing');
      if (pos === 0) {
        deleting = false;
        ci = (ci + 1) % cmds.length;
        if (caretEl) caretEl.classList.remove('is-typing');
        return window.setTimeout(typeTick, 450);
      }
      return window.setTimeout(typeTick, 55);
    };
    window.setTimeout(typeTick, 900);
  }

  /* ---- Mobile nav toggle (full-screen console overlay) ---- */
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open'))
        setOpen(false);
    });
  }

  /* ---- Scroll reveal ---- */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (!prefersReduced && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry, i) {
            if (entry.isIntersecting) {
              var el = entry.target;
              el.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
              el.classList.add('is-visible');
              io.unobserve(el);
            }
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
      );
      revealEls.forEach(function (el) {
        io.observe(el);
      });
    } else {
      revealEls.forEach(function (el) {
        el.classList.add('is-visible');
      });
    }
  }

  /* ---- Hero boot console: reveal lines in sequence ---- */
  var consoleEl = document.getElementById('boot-console');
  if (consoleEl) {
    var lines = consoleEl.querySelectorAll('.cl');
    if (prefersReduced || !('IntersectionObserver' in window)) {
      consoleEl.classList.add('is-done');
    } else {
      var booted = false;
      var bootIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || booted) return;
            booted = true;
            bootIo.disconnect();
            var idx = 0;
            var step = function () {
              if (idx >= lines.length) {
                consoleEl.classList.add('is-done');
                return;
              }
              lines[idx].classList.add('cl--in');
              idx += 1;
              window.setTimeout(step, 360);
            };
            step();
          });
        },
        { threshold: 0.35 }
      );
      bootIo.observe(consoleEl);
    }
  }

  /* ---- Copy-to-clipboard on code blocks ---- */
  if (navigator.clipboard) {
    var blocks = document.querySelectorAll('.prose pre');
    blocks.forEach(function (pre) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code') || pre;
        navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')).then(
          function () {
            btn.textContent = 'copied';
            btn.classList.add('is-copied');
            window.setTimeout(function () {
              btn.textContent = 'copy';
              btn.classList.remove('is-copied');
            }, 1600);
          },
          function () {
            btn.textContent = 'error';
          }
        );
      });
      pre.appendChild(btn);
    });
  }

  /* ---- Wrap wide tables for horizontal scroll on small screens ---- */
  var tables = document.querySelectorAll('.prose > table');
  tables.forEach(function (table) {
    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  /* ---- Pointer spotlight over the blueprint grid ---- */
  var spot = document.getElementById('bg-spot');
  var finePointer =
    window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (spot && finePointer && !prefersReduced) {
    var ticking = false;
    var px = 50;
    var py = 0;
    window.addEventListener(
      'mousemove',
      function (e) {
        px = (e.clientX / window.innerWidth) * 100;
        py = (e.clientY / window.innerHeight) * 100;
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(function () {
            spot.style.setProperty('--mx', px + '%');
            spot.style.setProperty('--my', py + '%');
            ticking = false;
          });
        }
      },
      { passive: true }
    );
  }
})();
