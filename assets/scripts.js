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
    '<img id="cursor-default" src="assets/cursor-pointer.svg" alt="">' +
    '<img id="cursor-hover"   src="assets/cursor-open.svg"   alt="">' +
    '<img id="cursor-drag"    src="assets/cursor-closed.svg" alt="">';
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
  document.addEventListener('mousemove', function (e) {
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

  document.addEventListener('mousemove', function (e) {
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
