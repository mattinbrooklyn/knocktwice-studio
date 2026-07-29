/* Knock Twice — Shared cursor system
   Injects the 3-state pixel cursor and exposes window.KT.setCursor(state).

   States:
     'default' — pixel pointer hand (always on)
     'hover'   — open hand (hovering over a draggable element)
     'drag'    — closed hand (actively dragging)

   Usage in page JS:
     KT.setCursor('hover');   // mouseenter on draggable
     KT.setCursor('default'); // mouseleave from draggable
     KT.setCursor('drag');    // mousedown on draggable
*/

(function () {
  // ── Device detection ─────────────────────────────────────────────
  // True only on devices with a fine pointer (mouse/trackpad) AND hover
  // capability. Touch-only devices (phones, tablets) get native cursor.
  window.KT = window.KT || {};
  var mq = window.matchMedia('(hover: hover) and (pointer: fine)');
  window.KT.isDesktop = mq.matches;

  // ── Cursor — desktop only ──────────────────────────────────────
  if (!window.KT.isDesktop) {
    // Touch device: expose a no-op setCursor and add body class
    document.documentElement.classList.add('is-touch');
    window.KT.setCursor = function () {};
    return;
  }

  // ── Inject cursor element ─────────────────────────────────────────
  var div = document.createElement('div');
  div.id  = 'custom-cursor';
  div.innerHTML =
    '<img id="cursor-default" src="/assets/cursor-pointer.svg" alt="">' +
    '<img id="cursor-hover"   src="/assets/cursor-open.svg"   alt="">' +
    '<img id="cursor-drag"    src="/assets/cursor-closed.svg" alt="">';
  document.body.appendChild(div);

  // ── Hotspot offsets ───────────────────────────────────────────────
  // The pixel on the cursor image that aligns with the mouse position.
  // default: fingertip of pointer (≈31% from left, 8% from top of 45×49 display)
  // hover/drag: palm top-centre of open/closed hand
  var hotspot = {
    default: [14, 4],
    hover:   [24, 0],
    drag:    [24, 0]
  };

  // ── Public API ────────────────────────────────────────────────────
  window.KT.setCursor = function (state) {
    document.body.dataset.cursor = (state === 'default') ? '' : state;
  };

  // ── Position tracking (rAF-throttled) ─────────────────────────────
  var cursorX = -200, cursorY = -200;
  var cursorRaf = 0;

  function updateCursor() {
    cursorRaf = 0;
    var state = document.body.dataset.cursor || 'default';
    var off   = hotspot[state] || hotspot.default;
    div.style.transform = 'translate(' + (cursorX - off[0]) + 'px,' + (cursorY - off[1]) + 'px)';
  }

  document.addEventListener('pointermove', function (e) {
    cursorX = e.clientX;
    cursorY = e.clientY;
    if (!cursorRaf) cursorRaf = requestAnimationFrame(updateCursor);
  }, { passive: true });
}());

// ── Logo iris tracking (rAF-throttled) ──────────────────────────
(function () {
  if (!window.KT.isDesktop) return;

  var iris  = null;
  var restX = 27.325, restY = 19.055;
  var maxX  = 2.5,    maxY  = 1.5;
  var raf   = 0;
  var mx    = 0, my = 0;

  function updateIris() {
    raf = 0;
    if (!iris) iris = document.getElementById('logo-iris');
    if (!iris) return;

    var rect = iris.ownerSVGElement.getBoundingClientRect();
    var eyeX = rect.left + rect.width  * 0.53;
    var eyeY = rect.top  + rect.height * 0.19;

    var dx   = mx - eyeX;
    var dy   = my - eyeY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { iris.setAttribute('cx', restX); iris.setAttribute('cy', restY); return; }

    var strength = Math.min(dist / 400, 1);
    iris.setAttribute('cx', restX + (dx / dist) * maxX * strength);
    iris.setAttribute('cy', restY + (dy / dist) * maxY * strength);
  }

  document.addEventListener('pointermove', function (e) {
    mx = e.clientX;
    my = e.clientY;
    if (!raf) raf = requestAnimationFrame(updateIris);
  }, { passive: true });
}());

// ── Mobile navigation (hamburger + overlay) ───────────────────────
(function () {
  var trigger = document.getElementById('nav-mobile-trigger');
  var overlay = document.getElementById('nav-mobile-overlay');
  if (!trigger || !overlay) return;

  var close = overlay.querySelector('.nav-mobile-close');

  function open() {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  }

  function shut() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  }

  trigger.addEventListener('click', open);
  if (close) close.addEventListener('click', shut);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) shut();
  });

  overlay.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', shut);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') shut();
  });
}());

// ── Swipe stack (mobile card deck) ────────────────────────────────
/* KT.swipeStack(container, opts)
   Turns a .swipe-stack container of .swipe-card children into a touch-driven
   card deck. Top card = last DOM child. Direction is meaningful:

     swipe LEFT  → next: the top card flies off to the left and is re-inserted
                   as the first child (bottom of the pile) — the deck loops.
     swipe RIGHT → previous: the bottom card is promoted to the top and pulled
                   back in from off-screen left, following the finger. Both
                   directions move the photos the same way the finger moves.

   A tap (press + release with no drag) opens the shared lightbox at that
   card's original index — see KT.lightbox.

   Uses Pointer Events so the same code works for touch and for mouse when the
   mobile layout is active (e.g. desktop browser resized to ≤768px). Each
   gesture re-checks swipeLayoutActive(); wide desktop does not capture drags.

   Options (all optional):
     threshold         px drag distance to commit  (default 80)
     velocityThreshold px/ms to commit              (default 0.4)
     duration          off-screen fly-out ms        (default 400)
     snapDuration      snap-back ms                 (default 280)
     lightbox          false to disable tap-to-open (default true)
     onChange(i)       fires with the new top card's original index

   Returns { destroy } to remove listeners. */
(function () {
  window.KT = window.KT || {};

  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  /** True when swipe UX should respond (mobile breakpoint, coarse pointer, or touch-capable). Checked per gesture so resize Desktop→narrow works. */
  function swipeLayoutActive() {
    try {
      if (window.matchMedia('(max-width: 768px)').matches) return true;
      if (window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) { /* matchMedia unavailable */ }
    return 'ontouchstart' in window;
  }

  window.KT.swipeStack = function (container, opts) {
    if (!container) return { destroy: function () {} };

    opts = opts || {};
    var threshold         = opts.threshold         != null ? opts.threshold         : 80;
    var velocityThreshold = opts.velocityThreshold != null ? opts.velocityThreshold : 0.4;
    var duration          = opts.duration          != null ? opts.duration          : 400;
    var snapDuration      = opts.snapDuration      != null ? opts.snapDuration      : 280;
    var useLightbox       = opts.lightbox !== false;
    var onChange          = typeof opts.onChange === 'function' ? opts.onChange : null;

    // Original DOM order is the slideshow order — the deck reorders itself as
    // it loops, so freeze the sequence once at init and tag each card with it.
    var ordered = [].slice.call(container.querySelectorAll('.swipe-card'));
    ordered.forEach(function (card, i) { card.setAttribute('data-kt-index', i); });

    var top = null;
    var incoming = null;  // card promoted to the top for a backwards (right) drag
    var dirLock = 0;      // -1 = next (left), +1 = previous (right)
    var activePointerId = null;
    var downCard = null;
    var downT = 0;
    var startX = 0, startY = 0;
    var lastX = 0, lastT = 0;
    var prevX = 0, prevT = 0;
    var dragging = false;
    var locked = false;   // true once we've claimed the gesture as horizontal
    var animating = false;

    function getTop() {
      var cards = container.querySelectorAll('.swipe-card');
      return cards.length ? cards[cards.length - 1] : null;
    }

    function getBottom() {
      var cards = container.querySelectorAll('.swipe-card');
      return cards.length ? cards[0] : null;
    }

    /** Off-screen distance for fly-out / pull-in. Viewport-based so a card
        always clears the screen regardless of stack width. */
    function fly() {
      return (window.innerWidth || 800) * 1.2;
    }

    function setTransform(el, dx, rot, withTransition, ms) {
      el.style.transition = withTransition
        ? 'transform ' + ms + 'ms ' + EASE
        : 'none';
      el.style.transform = 'translate3d(' + dx + 'px, 0, 0) rotate(' + rot + 'deg)';
    }

    function clearTransform(el) {
      el.style.transition = 'none';
      el.style.transform = '';
      /* eslint-disable no-unused-expressions */
      el.offsetHeight;   // reflow so the next drag starts clean
      /* eslint-enable no-unused-expressions */
      el.style.transition = '';
    }

    /** Run cb once the transition ends, with a timeout fallback for the cases
        where the target transform equals the current one (no transitionend). */
    function afterTransition(el, ms, cb) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', finish);
        clearTimeout(timer);
        cb();
      }
      var timer = setTimeout(finish, ms + 80);
      el.addEventListener('transitionend', finish);
    }

    function announce() {
      if (!onChange) return;
      var t = getTop();
      onChange(t ? parseInt(t.getAttribute('data-kt-index'), 10) : -1);
    }

    function hideHint() {
      var hint = container.querySelector('.swipe-hint-overlay');
      if (hint) hint.classList.add('is-hidden');
    }

    // ── Forward (swipe left): throw the top card off, recycle to bottom ──
    function commitNext(card) {
      animating = true;
      setTransform(card, -fly(), -18, true, duration);
      afterTransition(card, duration, function () {
        container.insertBefore(card, container.firstChild);
        clearTransform(card);
        animating = false;
        announce();
      });
    }

    // ── Backward (swipe right): pull the bottom card back in from the left ──
    function promotePrev() {
      var card = getBottom();
      if (!card || card === getTop()) return null;
      container.appendChild(card);           // stickers keep their own z-index
      setTransform(card, -fly(), -18, false, 0);
      /* eslint-disable no-unused-expressions */
      card.offsetHeight;
      /* eslint-enable no-unused-expressions */
      return card;
    }

    function commitPrev(card) {
      animating = true;
      setTransform(card, 0, 0, true, duration);
      afterTransition(card, duration, function () {
        clearTransform(card);
        animating = false;
        announce();
      });
    }

    function cancelPrev(card) {
      animating = true;
      setTransform(card, -fly(), -18, true, snapDuration);
      afterTransition(card, snapDuration, function () {
        container.insertBefore(card, container.firstChild);
        clearTransform(card);
        animating = false;
      });
    }

    function snapBack(card) {
      setTransform(card, 0, 0, true, snapDuration);
      afterTransition(card, snapDuration, function () { clearTransform(card); });
    }

    function openLightbox(card) {
      if (!useLightbox || !window.KT.lightbox) return;
      // Deck order is DOM order reversed (last child = top card), so the
      // lightbox runs top-card-first: swiping it forward shows the same photo
      // swiping the deck forward would reveal.
      var deck = ordered.slice().reverse();
      var sources = [];   // cards that actually carry a photo (skips placeholders)
      var items = [];
      deck.forEach(function (c) {
        var img = c.querySelector('img');
        if (!img) return;
        sources.push(c);
        items.push({
          src: img.getAttribute('data-full') || img.currentSrc || img.src,
          alt: img.getAttribute('alt') || ''
        });
      });
      if (!items.length) return;
      var i = sources.indexOf(card);
      window.KT.lightbox.open(items, i < 0 ? 0 : i);
    }

    function releasePointer(id) {
      try {
        container.releasePointerCapture(id);
      } catch (err) { /* ignore */ }
    }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!swipeLayoutActive()) return;
      if (animating) return;
      if (activePointerId !== null) return;
      top = getTop();
      if (!top) return;
      activePointerId = e.pointerId;
      try {
        container.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      downCard = e.target && e.target.closest ? e.target.closest('.swipe-card') : null;
      startX = lastX = prevX = e.clientX;
      startY = e.clientY;
      downT = lastT = prevT = e.timeStamp || Date.now();
      dragging = true;
      locked = false;
      dirLock = 0;
      incoming = null;
      top.style.transition = 'none';
    }

    function onPointerMove(e) {
      if (e.pointerId !== activePointerId) return;
      if (!dragging || !top) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      if (!locked) {
        // Claim the gesture only when horizontal intent is clear.
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical scroll wins — release the gesture.
          dragging = false;
          activePointerId = null;
          releasePointer(e.pointerId);
          top.style.transition = '';
          top.style.transform = '';
          return;
        }
        locked = true;
        hideHint();

        // Direction is decided once, at lock, and holds for the whole gesture.
        dirLock = dx > 0 ? 1 : -1;
        if (dirLock === 1) {
          incoming = promotePrev();
          if (!incoming) dirLock = -1;   // single-card stack: fall back to a throw
        }
      }

      e.preventDefault();
      prevX = lastX; prevT = lastT;
      lastX = e.clientX;
      lastT = e.timeStamp || Date.now();

      if (dirLock === 1 && incoming) {
        // Pull-in: half the stack width of travel brings the card fully home.
        var travel = Math.max(80, container.offsetWidth * 0.5);
        var p = Math.min(Math.max(dx / travel, 0), 1);
        setTransform(incoming, -fly() * (1 - p), -18 * (1 - p), false, 0);
      } else {
        setTransform(top, Math.min(dx, 0), Math.min(dx, 0) * 0.04, false, 0);
      }
    }

    function onPointerUp(e) {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      releasePointer(e.pointerId);
      if (!dragging || !top) { dragging = false; return; }
      dragging = false;

      var dx = lastX - startX;
      var dt = Math.max(1, lastT - prevT);
      var v = (lastX - prevX) / dt;
      var elapsed = (e.timeStamp || Date.now()) - downT;

      if (!locked) {
        top.style.transition = '';
        top.style.transform = '';
        // No horizontal claim + barely moved + quick = a tap, not a drag.
        if (downCard && Math.abs(dx) < 6 && Math.abs(e.clientY - startY) < 6 && elapsed < 500) {
          openLightbox(downCard);
        }
        return;
      }

      if (dirLock === 1 && incoming) {
        if (dx > threshold || v > velocityThreshold) commitPrev(incoming);
        else cancelPrev(incoming);
        incoming = null;
        return;
      }

      if (Math.abs(dx) > threshold || Math.abs(v) > velocityThreshold) commitNext(top);
      else snapBack(top);
    }

    function onPointerCancel() {
      if (activePointerId !== null) {
        releasePointer(activePointerId);
        activePointerId = null;
      }
      if (!dragging || !top) { dragging = false; return; }
      dragging = false;
      if (locked && dirLock === 1 && incoming) {
        cancelPrev(incoming);
        incoming = null;
      } else if (locked) {
        snapBack(top);
      } else {
        top.style.transition = '';
        top.style.transform = '';
      }
    }

    container.addEventListener('pointerdown', onPointerDown, { passive: true });
    container.addEventListener('pointermove', onPointerMove, { passive: false });
    container.addEventListener('pointerup', onPointerUp, { passive: true });
    container.addEventListener('pointercancel', onPointerCancel, { passive: true });
    container.addEventListener('lostpointercapture', onPointerCancel, { passive: true });

    return {
      destroy: function () {
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerCancel);
        container.removeEventListener('lostpointercapture', onPointerCancel);
      }
    };
  };
}());

// ── Lightbox (editorial slideshow) ────────────────────────────────
/* KT.lightbox.open(items, index)
     items — [{ src, alt }] in slideshow order
     index — slide to open on (clamped)

   One overlay is built lazily and reused by every stack on the page. Swipe or
   drag horizontally to move between slides, arrow keys on desktop, Esc / the
   X / a click on the backdrop to close. Clamped at both ends (not looped) so
   the counter always tells you where you are.

   KT.lightbox.close() closes it. */
(function () {
  window.KT = window.KT || {};

  var EASE     = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var SLIDE_MS = 380;

  var root = null, track = null, counter = null, closeBtn = null;
  var prevBtn = null, nextBtn = null;

  var items = [];
  var index = 0;
  var width = 0;
  var isOpen = false;
  var lastFocus = null;

  var pointerId = null;
  var startX = 0, startY = 0;
  var lastX = 0, lastT = 0, prevX = 0, prevT = 0;
  var dragging = false, locked = false;

  var X_SVG =
    '<svg viewBox="0 0 16.4142 16.4142" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M15.7071 0.707107L0.707107 15.7071" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M0.707107 0.707107L15.7071 15.7071" stroke="currentColor" stroke-width="2"/>' +
    '</svg>';

  function chevron(dir) {
    var d = dir < 0 ? 'M11 1L1 10L11 19' : 'M1 1L11 10L1 19';
    return '<svg viewBox="0 0 12 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
             '<path d="' + d + '" stroke="currentColor" stroke-width="2"/>' +
           '</svg>';
  }

  function build() {
    root = document.createElement('div');
    root.className = 'kt-lightbox';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Image viewer');
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('tabindex', '-1');
    root.innerHTML =
      '<div class="kt-lightbox__track"></div>' +
      '<button class="kt-lightbox__close" type="button" aria-label="Close image viewer">' + X_SVG + '</button>' +
      '<button class="kt-lightbox__nav kt-lightbox__nav--prev" type="button" aria-label="Previous image">' + chevron(-1) + '</button>' +
      '<button class="kt-lightbox__nav kt-lightbox__nav--next" type="button" aria-label="Next image">' + chevron(1) + '</button>' +
      '<p class="kt-lightbox__counter" aria-live="polite"></p>';
    document.body.appendChild(root);

    track    = root.querySelector('.kt-lightbox__track');
    closeBtn = root.querySelector('.kt-lightbox__close');
    prevBtn  = root.querySelector('.kt-lightbox__nav--prev');
    nextBtn  = root.querySelector('.kt-lightbox__nav--next');
    counter  = root.querySelector('.kt-lightbox__counter');

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () { go(index - 1, true); });
    nextBtn.addEventListener('click', function () { go(index + 1, true); });

    // Backdrop / letterbox gutter click closes; the photo itself does not.
    track.addEventListener('click', function (e) {
      if (!locked && e.target.tagName !== 'IMG') close();
    });

    track.addEventListener('pointerdown', onPointerDown, { passive: true });
    track.addEventListener('pointermove', onPointerMove, { passive: false });
    track.addEventListener('pointerup', onPointerUp, { passive: true });
    track.addEventListener('pointercancel', onPointerCancel, { passive: true });
    track.addEventListener('lostpointercapture', onPointerCancel, { passive: true });

    window.addEventListener('resize', function () {
      if (!isOpen) return;
      width = root.clientWidth;
      position(-index * width, false);
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape')     { close(); }
      else if (e.key === 'ArrowLeft')  { go(index - 1, true); }
      else if (e.key === 'ArrowRight') { go(index + 1, true); }
      else if (e.key === 'Tab')   { trapFocus(e); }
    });
  }

  /** Keep Tab inside the dialog while it is open. */
  function trapFocus(e) {
    var focusable = root.querySelectorAll('button:not([disabled])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function render() {
    track.innerHTML = items.map(function (item) {
      return '<div class="kt-lightbox__slide"><img src="' + item.src + '" alt="' +
             String(item.alt || '').replace(/"/g, '&quot;') + '"></div>';
    }).join('');
  }

  function position(x, animate) {
    track.style.transition = animate ? 'transform ' + SLIDE_MS + 'ms ' + EASE : 'none';
    track.style.transform  = 'translate3d(' + x + 'px, 0, 0)';
  }

  function go(i, animate) {
    index = Math.min(Math.max(i, 0), items.length - 1);
    width = root.clientWidth;
    position(-index * width, animate);
    counter.textContent = (index + 1) + ' / ' + items.length;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === items.length - 1;
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    try {
      track.setPointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
    width = root.clientWidth;
    startX = lastX = prevX = e.clientX;
    startY = e.clientY;
    lastT = prevT = e.timeStamp || Date.now();
    dragging = true;
    locked = false;
  }

  function onPointerMove(e) {
    if (e.pointerId !== pointerId || !dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;

    if (!locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        dragging = false;
        pointerId = null;
        try {
          track.releasePointerCapture(e.pointerId);
        } catch (err) { /* ignore */ }
        return;
      }
      locked = true;
    }

    e.preventDefault();
    prevX = lastX; prevT = lastT;
    lastX = e.clientX;
    lastT = e.timeStamp || Date.now();

    // Resistance past the first / last slide.
    if ((index === 0 && dx > 0) || (index === items.length - 1 && dx < 0)) dx *= 0.35;
    position(-index * width + dx, false);
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    try {
      track.releasePointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
    if (!dragging) return;
    dragging = false;
    if (!locked) return;

    var dx = lastX - startX;
    var dt = Math.max(1, lastT - prevT);
    var v  = (lastX - prevX) / dt;

    if (dx < -width * 0.18 || v < -0.4)      go(index + 1, true);
    else if (dx > width * 0.18 || v > 0.4)   go(index - 1, true);
    else                                     go(index, true);

    // Let the click handler see the drag, then clear it.
    setTimeout(function () { locked = false; }, 0);
  }

  function onPointerCancel() {
    if (pointerId !== null) {
      try {
        track.releasePointerCapture(pointerId);
      } catch (err) { /* ignore */ }
      pointerId = null;
    }
    if (!dragging) return;
    dragging = false;
    if (locked) go(index, true);
    locked = false;
  }

  function open(list, i) {
    if (!list || !list.length) return;
    if (!root) build();

    items = list;
    lastFocus = document.activeElement;
    render();

    root.style.display = 'block';
    root.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('kt-lightbox-open');
    document.body.classList.add('kt-lightbox-open');
    isOpen = true;

    width = root.clientWidth;
    go(i || 0, false);

    requestAnimationFrame(function () { root.classList.add('is-open'); });
    // Focus the dialog itself, not the X — a programmatic focus ring on the
    // close button reads as a stray box over the photo.
    root.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    // Move focus out first — aria-hidden over a focused subtree is an a11y error.
    if (root.contains(document.activeElement) && document.activeElement.blur) {
      document.activeElement.blur();
    }
    if (lastFocus && lastFocus !== document.body && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;

    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('kt-lightbox-open');
    document.body.classList.remove('kt-lightbox-open');

    setTimeout(function () {
      if (isOpen) return;          // reopened during the fade
      root.style.display = 'none';
      track.innerHTML = '';
    }, 240);
  }

  window.KT.lightbox = { open: open, close: close };
}());
