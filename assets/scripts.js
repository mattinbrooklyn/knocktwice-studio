/* ==========================================================
   KNOCK TWICE — Shared Scripts
   ========================================================== */

/* -------------------------
   Mobile Nav Toggle
   Hamburger opens/closes the full-screen nav overlay
------------------------- */
(function() {
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.querySelector('.nav-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', function() {
    var isOpen = menu.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
  });

  /* Close overlay when a nav link is tapped */
  menu.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      menu.classList.remove('open');
      toggle.classList.remove('open');
    });
  });
})();

/* -------------------------
   Eye Tracking (Splash page)
   Moves the keyhole eye toward the cursor
------------------------- */
(function() {
  var eye = document.querySelector('.eye');
  var splash = document.querySelector('.splash');
  if (!eye || !splash) return;

  var maxMove = 14;

  document.addEventListener('mousemove', function(e) {
    var rect = splash.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;

    var dx = e.clientX - centerX;
    var dy = e.clientY - centerY;
    var distance = Math.sqrt(dx * dx + dy * dy);

    var range = Math.min(distance / 200, 1);
    var moveX = (dx / distance) * maxMove * range;
    // Looking down = full range, looking up = restrained
    var yScale = dy > 0 ? 1.0 : 0.15;
    var moveY = (dy / distance) * maxMove * range * yScale;

    eye.style.transform = 'translate(' + moveX + 'px, ' + moveY + 'px)';
  });
})();

/* -------------------------
   Drag & Rotate (any page with .furniture elements)
   Click corners to rotate, click center to drag
------------------------- */
(function() {
  var pieces = document.querySelectorAll('.furniture');
  if (!pieces.length) return;

  /* Skip drag/rotate on small screens — conflicts with scrolling */
  if (window.innerWidth <= 768) return;

  var active = null;
  var mode = null;
  var topZ = 10;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var rotateStartAngle = 0;
  var elementStartRotation = 0;
  var cornerThreshold = 0.25;

  function getRotation(el) {
    var st = window.getComputedStyle(el);
    var tr = st.transform;
    if (!tr || tr === 'none') return 0;
    var values = tr.split('(')[1].split(')')[0].split(',');
    return Math.atan2(parseFloat(values[1]), parseFloat(values[0])) * (180 / Math.PI);
  }

  function isRotateZone(e, rect, piece) {
    var x = (e.clientX - rect.left) / rect.width;
    var y = (e.clientY - rect.top) / rect.height;
    var zone = piece.getAttribute('data-rotate-zone');

    if (zone === 'legs') {
      return y > 0.7 && (x < 0.3 || x > 0.7);
    }
    if (zone === 'top-left') {
      return x < cornerThreshold && y < cornerThreshold;
    }

    var nearEdgeX = x < cornerThreshold || x > (1 - cornerThreshold);
    var nearEdgeY = y < cornerThreshold || y > (1 - cornerThreshold);
    return nearEdgeX && nearEdgeY;
  }

  function angleFromCenter(e, rect) {
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }

  pieces.forEach(function(piece) {
    piece._rotation = getRotation(piece);

    piece.addEventListener('mousedown', function(e) {
      e.preventDefault();
      active = piece;
      piece.classList.add('dragging');
      piece.style.zIndex = ++topZ;
      var rect = piece.getBoundingClientRect();

      if (!piece.hasAttribute('data-no-rotate') && isRotateZone(e, rect, piece)) {
        mode = 'rotate';
        rotateStartAngle = angleFromCenter(e, rect);
        elementStartRotation = piece._rotation;
      } else {
        mode = 'drag';
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
      }
    });
  });

  document.addEventListener('mousemove', function(e) {
    if (!active) return;

    if (mode === 'drag') {
      var parentRect = active.parentElement.getBoundingClientRect();
      var newLeft = e.clientX - parentRect.left - dragOffsetX;
      var newTop = e.clientY - parentRect.top - dragOffsetY;
      active.style.left = newLeft + 'px';
      active.style.top = newTop + 'px';
    } else if (mode === 'rotate') {
      var rect = active.getBoundingClientRect();
      var currentAngle = angleFromCenter(e, rect);
      var delta = currentAngle - rotateStartAngle;
      active._rotation = elementStartRotation + delta;
      active.style.transform = 'rotate(' + active._rotation + 'deg)';
    }
  });

  document.addEventListener('mouseup', function() {
    if (active) {
      active.classList.remove('dragging');
      active = null;
      mode = null;
    }
  });
})();

/* -------------------------
   Marquee helper
   Waits for fonts, measures text, runs a seamless loop
------------------------- */
function initMarquee(id1, id2, speed) {
  var tp1 = document.getElementById(id1);
  var tp2 = document.getElementById(id2);
  if (!tp1 || !tp2) return;

  document.fonts.ready.then(function() {
    var loopLen = tp1.getComputedTextLength();
    var offset = 0;

    function tick() {
      offset -= speed;
      if (offset < -loopLen) offset += loopLen;
      tp1.setAttribute('startOffset', offset);
      tp2.setAttribute('startOffset', offset + loopLen);
      requestAnimationFrame(tick);
    }
    tick();
  });
}

/* Wave Marquee (About page) */
initMarquee('wave-textpath', 'wave-textpath2', 0.75);

/* WHO'S THERE Marquee (Contact page) */
initMarquee('whos-textpath', 'whos-textpath2', 0.4);

/* -------------------------
   Footer Monster Animation (any page with a footer monster)
   Randomly picks a behavior: peek & stay, peek & slide, or peek & hide.
   Wave morphs from flat, eyes blink open, irises wander.
------------------------- */
(function() {
  var monster = document.querySelector(
    '.footer-monster, .contact-footer-monster, .int-footer-monster, .shop-footer-monster'
  );
  if (!monster) return;

  var svg = monster.querySelector('svg');
  if (!svg) return;

  var vb = svg.getAttribute('viewBox').split(/[\s,]+/);
  var svgHeight = parseFloat(vb[3]);

  var wavePath = svg.querySelector('path[fill="#378CDA"]');
  if (!wavePath) return;

  // Collect eye groups and irises
  var eyeGroups = [];
  var irises = [];
  for (var i = 0; i < svg.children.length; i++) {
    var child = svg.children[i];
    if (child.tagName === 'g' && child.hasAttribute('transform')) {
      eyeGroups.push(child);
      var iris = child.querySelector('circle[fill="#32261F"]');
      if (iris) irises.push(iris);
    }
  }

  // Parse wave path numbers
  var finalD = wavePath.getAttribute('d');
  var finalNums = finalD.match(/-?[\d.]+/g).map(Number);
  var flatNums = finalNums.map(function(n, idx) {
    return idx % 2 === 1 ? svgHeight : n;
  });

  function buildPath(nums) {
    var idx = 0;
    return finalD.replace(/-?[\d.]+/g, function() { return nums[idx++]; });
  }

  // --- Initial state: flat wave, eyes hidden ---
  wavePath.setAttribute('d', buildPath(flatNums));
  eyeGroups.forEach(function(g) { g.style.opacity = '0'; });

  // Track looking animation so we can cancel it
  var lookingId = null;

  // --- Easing ---
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  // =====================
  // ANIMATION PRIMITIVES
  // =====================

  // Wave rises from flat to curved
  function rise(callback) {
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min((ts - start) / 800, 1);
      var current = flatNums.map(function(f, idx) {
        return f + (finalNums[idx] - f) * easeOutCubic(t);
      });
      wavePath.setAttribute('d', buildPath(current));
      if (t < 1) requestAnimationFrame(step);
      else if (callback) callback();
    }
    requestAnimationFrame(step);
  }

  // Wave sinks from curved back to flat
  function sink(callback) {
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min((ts - start) / 1200, 1);
      var current = finalNums.map(function(fin, idx) {
        return fin + (flatNums[idx] - fin) * easeInCubic(t);
      });
      wavePath.setAttribute('d', buildPath(current));
      if (t < 1) requestAnimationFrame(step);
      else if (callback) callback();
    }
    requestAnimationFrame(step);
  }

  // Eyes blink open: flash visible → shut → open (like real eyelids)
  function blinkOpen(callback) {
    eyeGroups.forEach(function(g) { g.style.opacity = '1'; });
    setTimeout(function() {
      eyeGroups.forEach(function(g) { g.style.opacity = '0'; });
      setTimeout(function() {
        eyeGroups.forEach(function(g) { g.style.opacity = '1'; });
        if (callback) setTimeout(callback, 150);
      }, 80);
    }, 80);
  }

  // Eyes blink shut
  function blinkClose(callback) {
    eyeGroups.forEach(function(g) { g.style.opacity = '1'; });
    setTimeout(function() {
      eyeGroups.forEach(function(g) { g.style.opacity = '0'; });
      setTimeout(function() {
        eyeGroups.forEach(function(g) { g.style.opacity = '1'; });
        setTimeout(function() {
          eyeGroups.forEach(function(g) { g.style.opacity = '0'; });
          if (callback) setTimeout(callback, 100);
        }, 60);
      }, 80);
    }, 80);
  }

  // Irises wander on a continuous loop
  function startLooking() {
    var bases = irises.map(function(iris) {
      return {
        cx: parseFloat(iris.getAttribute('cx')),
        cy: parseFloat(iris.getAttribute('cy'))
      };
    });
    var lookStart = performance.now();
    // Randomize the wave speeds slightly each time
    var sx1 = 0.6 + Math.random() * 0.4;
    var sx2 = 1.0 + Math.random() * 0.6;
    var sy  = 0.4 + Math.random() * 0.4;

    function step(ts) {
      var t = (ts - lookStart) / 1000;
      var lx = Math.sin(t * sx1) * 8 + Math.sin(t * sx2) * 4;
      var ly = Math.sin(t * sy) * 3;
      irises.forEach(function(iris, idx) {
        iris.setAttribute('cx', bases[idx].cx + lx);
        iris.setAttribute('cy', bases[idx].cy + ly);
      });
      lookingId = requestAnimationFrame(step);
    }
    lookingId = requestAnimationFrame(step);
  }

  function stopLooking() {
    if (lookingId) { cancelAnimationFrame(lookingId); lookingId = null; }
  }

  // Slide the eyes horizontally within the wave (monster "swims")
  var svgWidth = parseFloat(vb[2]);
  var eyeMargin = svgWidth * 0.15;

  function slideEyes(callback) {
    var dir = Math.random() > 0.5 ? 1 : -1;
    var dist = 40 + Math.random() * 80;
    var dur = 3000 + Math.random() * 2000;
    var origPositions = eyeGroups.map(function(g) {
      var m = g.getAttribute('transform').match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
      return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    });

    // Clamp direction so eyes stay within the wave
    var testX = origPositions[0].x + dir * dist;
    if (testX < eyeMargin || testX > svgWidth - eyeMargin) {
      dir = -dir;
    }

    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min((ts - start) / dur, 1);
      var eased = easeOutCubic(t);
      eyeGroups.forEach(function(g, idx) {
        var newX = origPositions[idx].x + dir * dist * eased;
        newX = Math.max(eyeMargin, Math.min(svgWidth - eyeMargin, newX));
        g.setAttribute('transform', 'translate(' + newX + ', ' + origPositions[idx].y + ')');
      });
      if (t < 1) requestAnimationFrame(step);
      else if (callback) callback();
    }
    requestAnimationFrame(step);
  }

  // =====================
  // BEHAVIOR ROUTINES
  // =====================

  // Rise, blink, look around, stay put
  function peekAndStay() {
    rise(function() {
      setTimeout(function() {
        blinkOpen(function() { startLooking(); });
      }, 200);
    });
  }

  // Rise, blink, look around, drift to a new spot
  function peekAndSlide() {
    rise(function() {
      setTimeout(function() {
        blinkOpen(function() {
          startLooking();
          setTimeout(function() {
            slideEyes();
          }, 2000 + Math.random() * 3000);
        });
      }, 200);
    });
  }

  // Rise, blink, look around, then sink back down, pause, return
  function peekAndHide() {
    rise(function() {
      setTimeout(function() {
        blinkOpen(function() {
          startLooking();
          // Look around for a while, then duck under
          setTimeout(function() {
            stopLooking();
            blinkClose(function() {
              sink(function() {
                // Pause underwater, then resurface
                setTimeout(function() {
                  rise(function() {
                    setTimeout(function() {
                      blinkOpen(function() { startLooking(); });
                    }, 200);
                  });
                }, 2000 + Math.random() * 3000);
              });
            });
          }, 3000 + Math.random() * 3000);
        });
      }, 200);
    });
  }

  // --- Pick a random routine and start after a random delay ---
  var routines = [peekAndStay, peekAndStay, peekAndSlide, peekAndHide];
  var routine = routines[Math.floor(Math.random() * routines.length)];
  var delay = 400 + Math.random() * 1200; // 0.4–1.6 seconds

  setTimeout(routine, delay);
})();
