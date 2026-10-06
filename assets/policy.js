// ══════════════════════════════════════════════════
// Policy pages — shared footer monster behavior
// Used by /terms/, /privacy/, /accessibility/, /returns/, /faqs/
// ══════════════════════════════════════════════════
(function () {
  // ── Monster pop-up on load ─────────────────────────────────────
  var monsterGroup = document.getElementById('monster-group');
  var monsterArea  = document.getElementById('monster-area');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      monsterGroup.classList.add('popped-up');
    });
  });

  // ── Eye tracking ───────────────────────────────────────────────
  // This page's height depends on pasted policy length, so both breakpoints
  // map the cursor through the wave's live bounding rect (not a fixed
  // canvas y like the 1440x1024 pages).
  function trackIris(el, localX, localY, restX, restY, maxX, maxY) {
    var dx = localX - restX;
    var dy = localY - restY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      el.setAttribute('cx', restX);
      el.setAttribute('cy', restY);
      return;
    }
    var nx = dx / dist;
    var ny = dy / dist;
    var strength = Math.min(dist / 200, 1);
    var kx = 0.55, ky = 0.28;
    el.setAttribute('cx', restX + nx * maxX * kx * strength);
    el.setAttribute('cy', restY + ny * maxY * ky * strength);
  }

  var monIrisR  = document.getElementById('mon-iris-r');
  var monIrisL  = document.getElementById('mon-iris-l');
  var monIrisRM = document.getElementById('mon-iris-r-m');
  var monIrisLM = document.getElementById('mon-iris-l-m');

  function updateMonsterEyes(vx, vy) {
    var wr = monsterArea.getBoundingClientRect();
    if (window.innerWidth <= 768) {
      var mx = ((vx - wr.left) / wr.width) * 440;
      var my = ((vy - wr.top) / wr.height) * 64;
      trackIris(monIrisRM, mx, my, 248.5, 62.5, 10, 3);
      trackIris(monIrisLM, mx, my, 142, 64, 10, 3);
    } else {
      var dxs = ((vx - wr.left) / wr.width) * 1440;
      var dys = ((vy - wr.top) / wr.height) * 116.154;
      trackIris(monIrisR, dxs, dys, 652.9, 49.45, 20, 5);
      trackIris(monIrisL, dxs, dys, 495.41, 49.46, 20, 5);
    }
  }

  // rAF-throttled pointer updates
  var monRaf = 0, monMX = 0, monMY = 0;
  function updateMonsterFrame() {
    monRaf = 0;
    updateMonsterEyes(monMX, monMY);
  }
  document.addEventListener('mousemove', function (e) {
    monMX = e.clientX;
    monMY = e.clientY;
    if (!monRaf) monRaf = requestAnimationFrame(updateMonsterFrame);
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!e.touches.length) return;
    monMX = e.touches[0].clientX;
    monMY = e.touches[0].clientY;
    if (!monRaf) monRaf = requestAnimationFrame(updateMonsterFrame);
  }, { passive: true });

  // ── Footer monster blink ───────────────────────────────────────
  var monsterBlinkGroups = document.querySelectorAll('#monster-area .eye-blink-group');
  function footerMonsterBlink() {
    monsterBlinkGroups.forEach(function (g) { g.classList.add('closing'); });
    setTimeout(function () {
      monsterBlinkGroups.forEach(function (g) {
        g.classList.remove('closing');
        g.classList.add('opening');
      });
      setTimeout(function () {
        monsterBlinkGroups.forEach(function (g) { g.classList.remove('opening'); });
      }, 110);
    }, 65);
  }
  function scheduleFooterMonsterBlink() {
    setTimeout(function () {
      footerMonsterBlink();
      scheduleFooterMonsterBlink();
    }, 2000 + Math.random() * 5000);
  }
  scheduleFooterMonsterBlink();

  // ── FAQ accordion: only one open at a time ─────────────────────
  var faqs = document.querySelectorAll('details.faq');
  faqs.forEach(function (faq) {
    faq.addEventListener('toggle', function () {
      if (!faq.open) return;
      faqs.forEach(function (other) {
        if (other !== faq) other.open = false;
      });
    });
  });
})();
