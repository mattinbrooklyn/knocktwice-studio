import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDimensions, classify, extractMaterials, extractColors, stripHtml, normalizeProduct } from '../normalize.js';

test('parseDimensions: labeled metric', () => {
  const d = parseDimensions('Dimensions: W 45 x D 45 x H 50 cm');
  assert.equal(d.width_cm, 45); assert.equal(d.depth_cm, 45); assert.equal(d.height_cm, 50);
});

test('parseDimensions: labeled imperial with quotes after number', () => {
  const d = parseDimensions('Size: 17.7"W x 17.7"D x 19.7"H');
  assert.equal(d.width_cm, 44.96); assert.equal(d.depth_cm, 44.96); assert.equal(d.height_cm, 50.04);
});

test('parseDimensions: diameter and height', () => {
  const d = parseDimensions('Ø 60 cm, H 74 cm. Powder coated steel.');
  assert.equal(d.diameter_cm, 60); assert.equal(d.height_cm, 74); assert.equal(d.width_cm, null);
});

test('parseDimensions: unlabeled triple is W x D x H', () => {
  const d = parseDimensions('Stackable crate. 26.5 x 17 x 10.5 cm.');
  assert.equal(d.width_cm, 26.5); assert.equal(d.depth_cm, 17); assert.equal(d.height_cm, 10.5);
});

test('parseDimensions: unlabeled pair in inches (rugs, prints)', () => {
  const d = parseDimensions('Available in 24 x 36 in');
  assert.equal(d.width_cm, 60.96); assert.equal(d.depth_cm, 91.44); assert.equal(d.height_cm, null);
});

test('parseDimensions: word labels', () => {
  const d = parseDimensions('Height: 30 cm. Width: 12 cm.');
  assert.equal(d.height_cm, 30); assert.equal(d.width_cm, 12);
});

test('parseDimensions: millimetres convert', () => {
  const d = parseDimensions('W 450 mm x H 500 mm');
  assert.equal(d.width_cm, 45); assert.equal(d.height_cm, 50);
});

test('parseDimensions: nothing', () => {
  const d = parseDimensions('A lovely chair in 3 colours, ships in 2 weeks.');
  assert.equal(d.width_cm, null); assert.equal(d.raw, null);
});

test('classify: product type wins, then name, then tags', () => {
  assert.equal(classify({ productType: 'Pendant Lamps', name: 'Rice Paper Shade' }), 'lighting');
  assert.equal(classify({ productType: '', name: 'Palissade Cone Table' }), 'furniture');
  assert.equal(classify({ productType: '', name: 'Big Stripe', tags: ['rug'] }), 'rugs');
  assert.equal(classify({ productType: '', name: 'Thing', brandCategories: ['finish'] }), 'finish');
  assert.equal(classify({ productType: '', name: 'Thing', brandCategories: ['furniture', 'lighting'] }), null);
  assert.equal(classify({ productType: 'Wallpaper', name: 'Lamp motif' }), 'finish');
  assert.equal(classify({ productType: 'Outdoor Tables', name: 'Palissade' }), 'furniture');
  assert.equal(classify({ productType: '', name: 'Two Vases' }), 'tabletop');
});

test('materials and colors', () => {
  assert.deepEqual(extractMaterials('Solid oak frame with wool upholstery and brass feet').sort(), ['brass', 'oak', 'wool']);
  assert.deepEqual(extractMaterials('Stainless steel and powder coated aluminium').sort(), ['aluminum', 'powder-coated', 'stainless steel']);
  assert.deepEqual(extractColors('Terracotta', 'Sage', 'off white').sort(), ['off-white', 'sage', 'terracotta']);
  assert.deepEqual(extractMaterials('Two chairs in oak'), ['oak']);
});

test('stripHtml', () => {
  assert.equal(stripHtml('<p>One&nbsp;two</p><p>Three &amp; four</p>'), 'One two\nThree & four');
});

test('normalizeProduct assembles a row', () => {
  const row = normalizeProduct({
    sourceUrl: 'https://x.test/products/a', externalId: '1', name: 'Kink Vase', descriptionHtml: '<p>Stoneware vase. Height 30 cm, width 12 cm.</p>',
    productType: 'Vases', tags: [], priceMin: 180, priceMax: 180, currency: 'USD', inStock: true,
    images: [{ url: 'https://x.test/a.jpg' }], options: [{ name: 'Color', values: ['Mustard'] }], variantTitles: ['Mustard'],
  }, { id: 'x', name: 'X Studio', categories: ['tabletop'] });
  assert.equal(row.category, 'tabletop');
  assert.equal(row.price_cents, 18000);
  assert.equal(row.height_cm, 30);
  assert.deepEqual(row.materials, ['stoneware']);
  assert.deepEqual(row.colors, ['mustard']);
  assert.match(row.search_text, /^X Studio Kink Vase\. Category: tabletop\./);
  assert.equal(row.search_hash.length, 32);
});
