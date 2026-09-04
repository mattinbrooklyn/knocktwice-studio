/* Knock Twice — Shared cursor system
   Injects the 3-state pixel cursor and resolves its state on every move.

   States:
     'default' — pixel pointer hand (nothing draggable under the cursor)
     'hover'   — open hand (cursor is over something draggable)
     'drag'    — closed hand (actively dragging)

   Hover state is resolved by hit-testing under the cursor on every move,
   NOT by mouseenter/mouseleave on each element. Boundary events are
   suppressed while a drag holds pointer capture, which left the cursor
   stuck in the wrong state after a drag ended.

   Usage in page JS:
     KT.setHoverSelector('.obj, .photo-card');  // what counts as draggable
     KT.lockCursor('drag');    // pointerdown — freeze state while dragging
     KT.unlockCursor();        // pointerup / pointercancel — resume hit-test
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
    window.KT.setCursor        = function () {};
    window.KT.setHoverSelector = function () {};
    window.KT.lockCursor       = function () {};
    window.KT.unlockCursor     = function () {};
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

  // ── State resolution ──────────────────────────────────────────────
  // hoverSelector: anything matching it (or containing what's under the
  // cursor) shows the open hand. locked: held during a drag so the closed
  // hand survives the element moving out from under the pointer.
  var hoverSelector = '';
  var locked        = null;

  function applyState(state) {
    document.body.dataset.cursor = (state === 'default') ? '' : state;
  }

  function resolveState() {
    if (locked) return locked;
    if (!hoverSelector) return 'default';
    var el = document.elementFromPoint(cursorX, cursorY);
    return (el && el.closest(hoverSelector)) ? 'hover' : 'default';
  }

  // ── Public API ────────────────────────────────────────────────────
  window.KT.setHoverSelector = function (selector) {
    hoverSelector = selector || '';
    applyState(resolveState());
  };

  window.KT.lockCursor = function (state) {
    locked = state || 'drag';
    applyState(locked);
  };

  window.KT.unlockCursor = function () {
    locked = null;
    applyState(resolveState());
  };

  // Kept for one-off overrides (and pages not on the hover selector).
  window.KT.setCursor = function (state) {
    if (locked) return;
    applyState(state);
  };

  // ── Position tracking (rAF-throttled) ─────────────────────────────
  var cursorX = -200, cursorY = -200;
  var cursorRaf = 0;

  function updateCursor() {
    cursorRaf = 0;
    var state = resolveState();
    applyState(state);
    var off   = hotspot[state] || hotspot.default;
    div.style.transform = 'translate(' + (cursorX - off[0]) + 'px,' + (cursorY - off[1]) + 'px)';
  }

  document.addEventListener('pointermove', function (e) {
    cursorX = e.clientX;
    cursorY = e.clientY;
    if (!cursorRaf) cursorRaf = requestAnimationFrame(updateCursor);
  }, { passive: true });

  // Scrolling moves content under a stationary cursor — re-resolve.
  window.addEventListener('scroll', function () {
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
   card deck. Top card = last DOM child. Swipe either way: the top card flies
   off in the direction it was thrown, is re-inserted as the first child
   (bottom of the pile) and its transform resets — the deck loops forever.

   A tap (press + release with no drag) opens the shared lightbox at that
   card's position in the deck — see KT.lightbox.

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

    /** Off-screen distance for the fly-out. Viewport-based so a card always
        clears the screen regardless of stack width. */
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

    /** Throw the top card off in the direction it was swiped (dir: -1 left,
        +1 right), then drop it to the bottom of the pile. */
    function commit(card, dir) {
      animating = true;
      setTransform(card, fly() * dir, 18 * dir, true, duration);
      afterTransition(card, duration, function () {
        container.insertBefore(card, container.firstChild);
        clearTransform(card);
        animating = false;
        announce();
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
      }

      e.preventDefault();
      prevX = lastX; prevT = lastT;
      lastX = e.clientX;
      lastT = e.timeStamp || Date.now();

      // The card tracks the finger either way.
      setTransform(top, dx, dx * 0.04, false, 0);
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

      if (Math.abs(dx) > threshold || Math.abs(v) > velocityThreshold) {
        commit(top, (dx === 0 ? (v >= 0 ? 1 : -1) : (dx > 0 ? 1 : -1)));
      } else {
        snapBack(top);
      }
    }

    function onPointerCancel() {
      if (activePointerId !== null) {
        releasePointer(activePointerId);
        activePointerId = null;
      }
      if (!dragging || !top) { dragging = false; return; }
      dragging = false;
      if (locked) {
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
   X / a click on the backdrop to close.

   The slideshow loops in both directions: the track carries a clone of the
   last slide before the first and a clone of the first after the last, so a
   wrap glides like any other step and then snaps silently onto the real
   slide once the glide lands.

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

  // Pending clone→real snap after a wrap step.
  var wrapTimer = 0, pendingWrap = null;

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
      finalizeWrap();
      width = root.clientWidth;
      position(offsetFor(index), false);
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

  function slide(item, clone) {
    return '<div class="kt-lightbox__slide"' + (clone ? ' aria-hidden="true"' : '') +
           '><img src="' + item.src + '" alt="' +
           String(item.alt || '').replace(/"/g, '&quot;') + '"></div>';
  }

  function render() {
    // [clone of last] [0 … n-1] [clone of first] — the loop's seam.
    var last = items[items.length - 1];
    track.innerHTML = slide(last, true) +
      items.map(function (item) { return slide(item, false); }).join('') +
      slide(items[0], true);
  }

  /** Track offset for a logical slide index; +1 skips the leading clone. */
  function offsetFor(i) {
    return -(i + 1) * width;
  }

  function position(x, animate) {
    track.style.transition = animate ? 'transform ' + SLIDE_MS + 'ms ' + EASE : 'none';
    track.style.transform  = 'translate3d(' + x + 'px, 0, 0)';
  }

  /** Apply a queued clone→real snap immediately (on resize, or when a new
      gesture starts before the previous wrap has settled). */
  function finalizeWrap() {
    if (!pendingWrap) return;
    clearTimeout(wrapTimer);
    wrapTimer = 0;
    var snap = pendingWrap;
    pendingWrap = null;
    snap();
  }

  /** i may be -1 or items.length — one step past either end. The track glides
      onto the matching clone, then jumps to the real slide, invisibly. */
  function go(i, animate) {
    var n = items.length;
    var wrapped = ((i % n) + n) % n;

    finalizeWrap();
    width = root.clientWidth;
    position(offsetFor(i), animate);

    index = wrapped;
    counter.textContent = (wrapped + 1) + ' / ' + n;

    if (i !== wrapped) {
      pendingWrap = function () { position(offsetFor(wrapped), false); };
      wrapTimer = setTimeout(finalizeWrap, animate ? SLIDE_MS + 20 : 0);
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    try {
      track.setPointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
    // Settle any wrap still in flight so this drag starts from the real slide.
    finalizeWrap();
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

    // No end resistance — the clones mean there is always a slide either way.
    position(offsetFor(index) + dx, false);
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

    clearTimeout(wrapTimer);
    wrapTimer = 0;
    pendingWrap = null;

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

// ── Footer mailing-list form ───────────────────────────────────────
(function () {
  var forms = document.querySelectorAll('[data-footer-newsletter]');
  if (!forms.length) return;

  var sheetUrl = 'https://script.google.com/macros/s/AKfycbyIKQkkXpe8kO5tsrhDdunKesfhD-xJGHTBSN1FhOC_Z-veuRK8fxkEbzX4_cbhmtZm/exec';
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  forms.forEach(function (form) {
    var input = form.querySelector('.footer-newsletter-input');
    if (!input) return;

    input.addEventListener('input', function () {
      form.classList.remove('is-error');
      input.classList.remove('has-error');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = input.value.trim();
      if (!emailRe.test(email)) {
        form.classList.add('is-error');
        form.classList.remove('is-success');
        input.classList.add('has-error');
        return;
      }

      form.classList.remove('is-error');
      input.classList.remove('has-error');
      form.classList.add('is-success');
      fetch(sheetUrl + '?email=' + encodeURIComponent(email), { mode: 'no-cors' })
        .catch(function () {});
    });
  });
}());
