/**
 * Circular text stickers: path radius follows natural text width so letter-spacing
 * stays normal (no textLength/lengthAdjust stretching). Run after fonts load.
 */
(function () {
  var PATH_GAP = 6;
  var MARGIN_RATIO = 13.5 / 78;

  function measureTextPathWidth(textPath) {
    var textEl = textPath.closest('text');
    if (!textEl) return 0;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;';
    var t = document.createElementNS(ns, 'text');
    t.setAttribute('font-family', textEl.getAttribute('font-family') || 'Handjet, sans-serif');
    t.setAttribute('font-size', textEl.getAttribute('font-size') || '18');
    t.setAttribute('font-weight', textEl.getAttribute('font-weight') || '400');
    t.setAttribute('fill', textEl.getAttribute('fill') || '#32261F');
    var style = textEl.getAttribute('style');
    if (style) t.setAttribute('style', style);
    var letterSpacing = textEl.getAttribute('letter-spacing');
    if (letterSpacing !== null) t.setAttribute('letter-spacing', letterSpacing);
    else t.setAttribute('letter-spacing', '0');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = textPath.textContent;
    svg.appendChild(t);
    document.body.appendChild(svg);
    var w = t.getComputedTextLength();
    document.body.removeChild(svg);
    return w;
  }

  function layoutSticker(sticker) {
    var textPath = sticker.querySelector('textPath');
    var path = sticker.querySelector('defs path[id], path[id]');
    var svg = sticker.querySelector('svg');
    if (!textPath || !path || !svg) return;

    var vbBase = parseFloat(sticker.getAttribute('data-sticker-vb-base') || '183');
    var layoutW = parseFloat(sticker.getAttribute('data-sticker-layout-width') || '183.047');

    var textW = measureTextPathWidth(textPath);
    if (!textW || !isFinite(textW)) return;

    var textEl = textPath.closest('text');
    var fontSize = parseFloat((textEl && textEl.getAttribute('font-size')) || '18');

    var circ = textW + PATH_GAP;
    var r = circ / (2 * Math.PI);
    var ringInset = r * MARGIN_RATIO;
    /* Emoji / rotated glyphs extend radially past the baseline path; without extra
       inset they clip at the viewBox (especially U+1F6CF bed). */
    var glyphOutset = fontSize * 0.85;
    var halfExtent = r + ringInset + glyphOutset;
    var viewBoxSize = 2 * halfExtent;
    var cx = viewBoxSize / 2;
    var pathD =
      'M ' +
      cx +
      ',' +
      (cx - r) +
      ' a ' +
      r +
      ',' +
      r +
      ' 0 1,1 0,' +
      2 * r +
      ' a ' +
      r +
      ',' +
      r +
      ' 0 1,1 0,-' +
      2 * r;

    path.setAttribute('d', pathD);
    svg.setAttribute('viewBox', '0 0 ' + viewBoxSize + ' ' + viewBoxSize);

    var widthPercent = ((layoutW * viewBoxSize) / vbBase / 1440) * 100;
    sticker.style.width = 'calc(' + widthPercent + '%)';
  }

  function run() {
    document.querySelectorAll('.sticker--dynamic').forEach(layoutSticker);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(run).catch(run);
  } else {
    run();
  }
})();
