const fs = require('fs');

const items = [
  // Mr Tao (H=1256, Y_offset=360)
  { id: 'Box Tape', aabbX: 214, aabbY: 414, aabbW: 97, aabbH: 284, containerY: 360, containerH: 1256, angle: 90, imgW: 2332, imgH: 796 },
  { id: 'Yellow Pencil', aabbX: 1267.36, aabbY: 532.04, aabbW: 224.02, aabbH: 421.51, containerY: 360, containerH: 1256, angle: -24.05, imgW: 61, imgH: 546 },
  { id: 'Duct Tape', aabbX: 1200.13, aabbY: 1233, aabbW: 312.13, aabbH: 90, containerY: 360, containerH: 1256, angle: 180, imgW: 326, imgH: 94 },
  { id: 'Pink Eraser', aabbX: 44.47, aabbY: 1216.59, aabbW: 228.43, aabbH: 150.79, containerY: 360, containerH: 1256, angle: -16.85, imgW: 319, imgH: 142 },

  // Dinner (H=1414, Y_offset=1605)
  { id: 'Grapefruit', aabbX: 1050, aabbY: 1728, aabbW: 210, aabbH: 221, containerY: 1605, containerH: 1414, angle: 0, imgW: 660, imgH: 692 },
  { id: 'Halved Plum', aabbX: 350, aabbY: 2479, aabbW: 220, aabbH: 219, containerY: 1605, containerH: 1414, angle: 0, imgW: 272, imgH: 271 },
  { id: 'Orange 3', aabbX: 880, aabbY: 2563, aabbW: 212, aabbH: 202, containerY: 1605, containerH: 1414, angle: 0, imgW: 231, imgH: 220 },
  { id: 'Old Fashioned', aabbX: 1095.7, aabbY: 3055.82, aabbW: 264.95, aabbH: 316.81, containerY: 1605, containerH: 1414, angle: 9.06, imgW: 492, imgH: 630 },
  // Sticker Ring 1 (Sticker_SpiralText 7074:1273 - wait, this is SVG so angle=0 effectively)
  { id: 'Sticker Ring 1', aabbX: 825, aabbY: 2780.05, aabbW: 183.05, aabbH: 183.05, containerY: 1605, containerH: 1414, angle: 0, imgW: 1, imgH: 1 },

  // Wedding (H=1212, Y_offset=3079)
  { id: 'Napkin', aabbX: 1207, aabbY: 3643.26, aabbW: 331.23, aabbH: 349.71, containerY: 3079, containerH: 1212, angle: -12.02, imgW: 291, imgH: 317 },

  // Mr Hotel (H=1225, Y_offset=4341)
  { id: 'lemonWedge', aabbX: 1239.12, aabbY: 4667, aabbW: 280.75, aabbH: 286.45, containerY: 4341, containerH: 1225, angle: 142.99, imgW: 292, imgH: 338 },
  { id: 'ChocolateChipCookie', aabbX: 400, aabbY: 5480, aabbW: 240, aabbH: 231, containerY: 4341, containerH: 1225, angle: 0, imgW: 713, imgH: 685 },

  // Mr Buffet (H=936, Y_offset=5596)
  { id: 'DarkCherry', aabbX: 67.84, aabbY: 5917, aabbW: 257.71, aabbH: 274.63, containerY: 5596, containerH: 936, angle: 12.54, imgW: 428, imgH: 473 },
  { id: 'Orange 1', aabbX: 396, aabbY: 6679, aabbW: 200, aabbH: 183, containerY: 5596, containerH: 936, angle: 180, imgW: 229, imgH: 209 },
  // Sticker Ring 2 (7065:993)
  { id: 'Sticker Ring 2', aabbX: 1068.69, aabbY: 5707.81, aabbW: 151.63, aabbH: 151.63, containerY: 5596, containerH: 936, angle: 0, imgW: 1, imgH: 1 },

  // Mr Nine West (H=1145, Y_offset=6709)
  { id: 'WhiteOrchid', aabbX: 1126.52, aabbY: 6724.72, aabbW: 260.13, aabbH: 223.55, containerY: 6709, containerH: 1145, angle: 3.45, imgW: 302, imgH: 255 },
  { id: 'Orange 2', aabbX: -9.6, aabbY: 7147.72, aabbW: 261.37, aabbH: 256.07, containerY: 6709, containerH: 1145, angle: 17.93, imgW: 229, imgH: 220 },
  { id: 'Paloma', aabbX: 1244, aabbY: 7349, aabbW: 237, aabbH: 326, containerY: 6709, containerH: 1145, angle: 0, imgW: 662, imgH: 909 },
];

items.forEach(item => {
  const rad = Math.abs(item.angle * Math.PI / 180);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  let W_orig, H_orig;
  
  if (Math.abs(item.angle) < 0.1 || Math.abs(item.angle - 180) < 0.1) {
      W_orig = item.aabbW;
      H_orig = item.aabbH;
  } else if (Math.abs(item.angle - 90) < 0.1 || Math.abs(item.angle - 270) < 0.1) {
      W_orig = item.aabbH;
      H_orig = item.aabbW;
  } else {
      const denom = (cos * cos - sin * sin);
      if (Math.abs(denom) > 0.001) {
          W_orig = (item.aabbW * cos - item.aabbH * sin) / denom;
          H_orig = (item.aabbH * cos - item.aabbW * sin) / denom;
      } else {
          // If 45 deg, image ratio is needed to solve
          const r = item.imgH / item.imgW;
          W_orig = item.aabbW / (cos + r * sin);
          H_orig = W_orig * r;
      }
  }

  // Validate aspect ratio
  let actualRatio = item.imgW / item.imgH;
  let calcRatio = W_orig / H_orig;

  // Center
  const Cx = item.aabbX + item.aabbW / 2;
  const Cy = item.aabbY + item.aabbH / 2;

  const left = Cx - W_orig / 2;
  const top = Cy - H_orig / 2;

  const pctLeft = (left / 1440 * 100).toFixed(2);
  const pctTop = ((top - item.containerY) / item.containerH * 100).toFixed(2);
  const pctWidth = (W_orig / 1440 * 100).toFixed(2);

  console.log(`${item.id} CSS: style="left:${pctLeft}%; top:${pctTop}%; width:${pctWidth}%;"  (AR: ${item.imgW}/${item.imgH})`);
});
