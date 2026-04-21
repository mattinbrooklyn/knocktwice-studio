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
  window.KT = window.KT || {};
  window.KT.setCursor = function (state) {
    document.body.dataset.cursor = (state === 'default') ? '' : state;
  };

  // ── Position tracking ─────────────────────────────────────────────
  document.addEventListener('pointermove', function (e) {
    var state = document.body.dataset.cursor || 'default';
    var off   = hotspot[state] || hotspot.default;
    div.style.transform = 'translate(' + (e.clientX - off[0]) + 'px,' + (e.clientY - off[1]) + 'px)';
  });
}());

// ── Logo iris tracking ────────────────────────────────────────────
(function () {
  var iris  = null;
  var restX = 27.325, restY = 19.055;
  var maxX  = 2.5,    maxY  = 1.5;

  document.addEventListener('pointermove', function (e) {
    if (!iris) iris = document.getElementById('logo-iris');
    if (!iris) return;

    var rect = iris.ownerSVGElement.getBoundingClientRect();
    var eyeX = rect.left + rect.width  * 0.53;
    var eyeY = rect.top  + rect.height * 0.19;

    var dx   = e.clientX - eyeX;
    var dy   = e.clientY - eyeY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { iris.setAttribute('cx', restX); iris.setAttribute('cy', restY); return; }

    var strength = Math.min(dist / 400, 1);
    iris.setAttribute('cx', restX + (dx / dist) * maxX * strength);
    iris.setAttribute('cy', restY + (dy / dist) * maxY * strength);
  });
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
   card deck. Top card = last DOM child. On a committed horizontal swipe the
   top card flies off, is re-inserted as the first child (bottom of pile),
   and its transform resets — the deck loops forever.

   Touch-only: binds listeners only when (pointer: coarse) or viewport ≤768px.
   Desktop mouse input is intentionally untouched.

   Options (all optional):
     threshold         px drag distance to commit  (default 80)
     velocityThreshold px/ms to commit              (default 0.4)
     duration          off-screen fly-out ms        (default 400)
     snapDuration      snap-back ms                 (default 280)
     onChange(i)       fires after each recycle

   Returns { destroy } to remove listeners. */
(function () {
  window.KT = window.KT || {};

  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  function isTouchContext() {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return true;
      if (window.matchMedia('(max-width: 768px)').matches) return true;
    } catch (e) { /* matchMedia unavailable — bail to touch detection */ }
    return 'ontouchstart' in window;
  }

  window.KT.swipeStack = function (container, opts) {
    if (!container) return { destroy: function () {} };
    if (!isTouchContext()) return { destroy: function () {} };

    opts = opts || {};
    var threshold         = opts.threshold         != null ? opts.threshold         : 80;
    var velocityThreshold = opts.velocityThreshold != null ? opts.velocityThreshold : 0.4;
    var duration          = opts.duration          != null ? opts.duration          : 400;
    var snapDuration      = opts.snapDuration      != null ? opts.snapDuration      : 280;
    var onChange          = typeof opts.onChange === 'function' ? opts.onChange : null;

    var top = null;
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

    function setTransform(el, dx, rot, withTransition, ms) {
      el.style.transition = withTransition
        ? 'transform ' + ms + 'ms ' + EASE
        : 'none';
      el.style.transform = 'translate3d(' + dx + 'px, 0, 0) rotate(' + rot + 'deg)';
    }

    function onStart(e) {
      if (animating) return;
      top = getTop();
      if (!top) return;
      var t = e.touches[0];
      startX = lastX = prevX = t.clientX;
      startY = t.clientY;
      lastT = prevT = e.timeStamp || Date.now();
      dragging = true;
      locked = false;
      top.style.transition = 'none';
    }

    function onMove(e) {
      if (!dragging || !top) return;
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;

      if (!locked) {
        // Claim the gesture only when horizontal intent is clear.
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical scroll wins — release the gesture.
          dragging = false;
          top.style.transition = '';
          top.style.transform = '';
          return;
        }
        locked = true;
        
        // Hide swipe hint if present
        var hint = container.querySelector('.swipe-hint-overlay');
        if (hint) hint.classList.add('is-hidden');
      }

      e.preventDefault();
      prevX = lastX; prevT = lastT;
      lastX = t.clientX;
      lastT = e.timeStamp || Date.now();

      setTransform(top, dx, dx * 0.04, false, 0);
    }

    function recycle(card) {
      container.insertBefore(card, container.firstChild);
      card.style.transition = 'none';
      card.style.transform = '';
      // Force reflow so the next drag starts from a clean transform.
      /* eslint-disable no-unused-expressions */
      card.offsetHeight;
      /* eslint-enable no-unused-expressions */
      if (onChange) {
        var cards = container.querySelectorAll('.swipe-card');
        onChange(cards.length - 1);
      }
    }

    function commit(card, dir) {
      animating = true;
      var offX = (window.innerWidth || 800) * 1.2 * dir;
      var offRot = 18 * dir;
      var onEnd = function () {
        card.removeEventListener('transitionend', onEnd);
        recycle(card);
        animating = false;
      };
      card.addEventListener('transitionend', onEnd);
      setTransform(card, offX, offRot, true, duration);
    }

    function snapBack(card) {
      setTransform(card, 0, 0, true, snapDuration);
    }

    function onEnd(e) {
      if (!dragging || !top) { dragging = false; return; }
      dragging = false;

      var dx = lastX - startX;
      var dt = Math.max(1, lastT - prevT);
      var v = (lastX - prevX) / dt;

      if (!locked) {
        top.style.transition = '';
        top.style.transform = '';
        return;
      }

      if (Math.abs(dx) > threshold || Math.abs(v) > velocityThreshold) {
        var dir = (dx === 0 ? (v >= 0 ? 1 : -1) : (dx > 0 ? 1 : -1));
        commit(top, dir);
      } else {
        snapBack(top);
      }
    }

    function onCancel() {
      if (!dragging || !top) { dragging = false; return; }
      dragging = false;
      if (locked) snapBack(top);
      else {
        top.style.transition = '';
        top.style.transform = '';
      }
    }

    container.addEventListener('touchstart', onStart, { passive: true });
    container.addEventListener('touchmove',  onMove,  { passive: false });
    container.addEventListener('touchend',   onEnd);
    container.addEventListener('touchcancel', onCancel);

    return {
      destroy: function () {
        container.removeEventListener('touchstart', onStart);
        container.removeEventListener('touchmove',  onMove);
        container.removeEventListener('touchend',   onEnd);
        container.removeEventListener('touchcancel', onCancel);
      }
    };
  };
}());
