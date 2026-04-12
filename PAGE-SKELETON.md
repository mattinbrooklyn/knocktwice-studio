# PAGE SKELETON — Canonical Template

This is the shared page structure every page on knocktwice.studio should use.
Page-specific content goes inside `.page`. Everything else is the skeleton.

## HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" href="assets/Logo_DifferentStates_03-30-26_Favicon_Eye_Blue.png">
  <title>[Page Name] — Knock Twice</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Erica+One&family=Handjet:wght@100..900&family=Instrument+Sans&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/styles.css">
  <style>
    /* === Page-specific styles only === */
  </style>
</head>
<body>

  <!-- Logo — fixed, outside page-scaler -->
  <a href="home.html" class="logo">
    <!-- Standard keyhole logo SVG -->
  </a>

  <!-- Nav — fixed, outside page-scaler -->
  <nav class="nav">
    <a href="about.html">About</a>
    <a href="interiors.html">Interiors</a>
    <a href="experiences.html">Experiences</a>
    <a href="shop.html">Shop</a>
    <a href="contact.html" class="active">Contact</a>
  </nav>

  <!-- Mobile nav trigger + overlay -->
  <button class="nav-mobile-trigger" aria-label="Menu"><!-- hamburger --></button>
  <div class="nav-mobile-overlay">
    <!-- same links as .nav -->
  </div>

  <div id="page-scaler">

    <div class="page">
      <!-- === PAGE CONTENT GOES HERE === -->
    </div><!-- /.page -->

    <!-- Modal backdrop (if page has a modal) -->
    <div class="modal-backdrop" id="modal-backdrop"></div>

    <!-- Monster wave group -->
    <div id="monster-group">
      <div class="monster-area" id="monster-area">
        <img class="wave" src="assets/monster-wave.svg" alt="">
        <svg class="monster-eyes-overlay" id="monster-eyes-svg"
             viewBox="0 0 1440 116" xmlns="http://www.w3.org/2000/svg">
          <!-- Eye whites and irises — same on every page using monster-wave.svg -->
          <defs>
            <clipPath id="mon-eye-r-clip">
              <path transform="translate(593.13 32.7)"
                d="M0 26.2514C43.7331 -10.9423 82.9881 -6.48788 119.75 26.2514C75.9056 35.4212 35.555 36.426 0 26.2514Z"/>
            </clipPath>
            <clipPath id="mon-eye-l-clip">
              <path transform="translate(431.49 31.57)"
                d="M0 28.0226C45.7339 -12.7789 87.7997 -5.73732 127.849 28.0226C81.0428 37.8174 37.9608 38.8855 0 28.0226Z"/>
            </clipPath>
          </defs>
          <path fill="white" transform="translate(593.13 32.7)"
            d="M0 26.2514C43.7331 -10.9423 82.9881 -6.48788 119.75 26.2514C75.9056 35.4212 35.555 36.426 0 26.2514Z"/>
          <path fill="white" transform="translate(431.49 31.57)"
            d="M0 28.0226C45.7339 -12.7789 87.7997 -5.73732 127.849 28.0226C81.0428 37.8174 37.9608 38.8855 0 28.0226Z"/>
          <circle id="mon-iris-r" clip-path="url(#mon-eye-r-clip)"
            cx="652.9" cy="49.45" r="30" fill="#32261F"/>
          <circle id="mon-iris-l" clip-path="url(#mon-eye-l-clip)"
            cx="495.41" cy="49.46" r="30" fill="#32261F"/>
        </svg>
      </div>
    </div><!-- /#monster-group -->

    <footer class="footer">
      <div class="footer-icons">
        <a href="https://www.instagram.com/knocktwice.studio" aria-label="Instagram" target="_blank" rel="noopener noreferrer"><img src="assets/icon-instagram.svg" alt="Instagram"></a>
        <a href="https://www.tiktok.com/@knocktwice.studio" aria-label="TikTok" target="_blank" rel="noopener noreferrer"><img src="assets/icon-tiktok.svg" alt="TikTok"></a>
      </div>
      <span class="footer-copyright">© 2026 Knock Twice Studio. All rights reserved.</span>
    </footer>

  </div><!-- /#page-scaler -->

  <script src="assets/scripts.js"></script>
  <script>
    // === Skeleton JS (same on every page) ===

    // ── Scale page ──────────────────────────────────────────
    const page         = document.querySelector('.page');
    const scaler       = document.getElementById('page-scaler');
    const monsterGroup = document.getElementById('monster-group');
    let scale = 1;

    function scalePage() {
      scale = window.innerWidth / 1440;
      page.style.transform = '';
      scaler.style.height  = '';
    }
    scalePage();
    window.addEventListener('resize', scalePage);

    // ── Monster pop-up on load ──────────────────────────────
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        monsterGroup.classList.add('popped-up');
      });
    });

    // ── Eye tracking ────────────────────────────────────────
    function toCanvas(vx, vy) {
      const r = page.getBoundingClientRect();
      return { x: (vx - r.left) / scale, y: (vy - r.top) / scale };
    }

    function trackIris(el, localX, localY, restX, restY, maxX, maxY) {
      const dx = localX - restX;
      const dy = localY - restY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        el.setAttribute('cx', restX);
        el.setAttribute('cy', restY);
        return;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      const strength = Math.min(dist / 200, 1);
      el.setAttribute('cx', restX + nx * maxX * strength);
      el.setAttribute('cy', restY + ny * maxY * strength);
    }

    const monIrisR = document.getElementById('mon-iris-r');
    const monIrisL = document.getElementById('mon-iris-l');

    document.addEventListener('mousemove', e => {
      const { x, y } = toCanvas(e.clientX, e.clientY);
      // waveTop needs to be set per page or calculated
      trackIris(monIrisR, x, y - waveTop, 652.9, 49.45, 20, 5);
      trackIris(monIrisL, x, y - waveTop, 495.41, 49.46, 20, 5);
    });

    // === Page-specific JS below ===
  </script>

</body>
</html>
```


## Skeleton CSS (add to styles.css)

These rules should be in the global stylesheet so every page inherits them.
Page-specific `<style>` blocks should only contain content styles, never skeleton overrides.

```css
/* ── Page skeleton ──────────────────────────────── */
#page-scaler {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh + var(--footer-height));
  overflow: hidden;
}

.page {
  position: relative;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  flex: 1;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  padding-top: 4.375rem;
  padding-left: var(--content-left);
}

/* ── Monster wave (default behavior) ────────────── */
#monster-group {
  position: absolute;
  bottom: var(--footer-height);
  left: 0;
  width: 100%;
  z-index: 5;
  transform: translateY(250px);
  will-change: transform;
}
#monster-group.popped-up {
  transform: translateY(0);
  transition: transform 1800ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: 1.1s;
}

.monster-area {
  position: relative;
  width: 100%;
  height: var(--wave-height-desktop);
}
.monster-area img.wave {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  display: block;
  pointer-events: none;
}
.monster-eyes-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  overflow: visible;
}
```


## What stays page-specific

These are the things that belong in each page's `<style>` tag:

- **Content styles**: headings, body text widths, form layouts, image grids, people rows
- **Monster animation overrides**: if the page needs a different monster behavior (wave-risen for about's mailing list, popped-up timing for shop)
- **Draggable objects**: positions, sizes, rotations (about, home, interiors, experiences)
- **Page background**: if different from cream (e.g. contact uses blue for body)
- **Ticker**: about's mailing list ticker (unique to that page)
- **waveTop value**: each page sets this in JS based on where the wave sits in its content


## What NEVER goes in page-specific styles

- `#page-scaler` rules
- `.page` layout rules (max-width, margin, flex, padding-left)
- `.footer` rules
- `#monster-group` base positioning
- `.monster-area` base rules
- Modal backdrop / modal card base rules
- Any value that should be a design system variable


## Migration order

1. Add skeleton CSS to styles.css
2. Test on contact (simplest page) — remove duplicated skeleton rules from contact's `<style>`
3. Migrate shop
4. Migrate about (most complex due to ticker + draggables + mailing list wave-risen)
5. Then rebuild interiors, experiences, home using the skeleton from the start


## Known issues to resolve during migration

- **waveTop calculation**: each page currently hardcodes or calculates this differently. Needs a consistent approach.
- **About page ticker**: still not tracking the wave correctly. Dedicated session after skeleton migration.
- **Contact page vertical spacing**: form floats in empty space. Needs content-specific fix after skeleton is consistent.
- **Interiors/experiences/home**: still on old canvas-scale architecture. Full rebuild needed using this skeleton.
