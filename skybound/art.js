// All artwork is rasterized once. Drawing uses integer rectangles exclusively.
const OUTLINE = '#302f3b';
const BG_WIDTH = 512;
const BG_HEIGHT = 384;

function rect(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function polygon(ctx, color, points) {
  const lo = Math.floor(Math.min(...points.map(p => p[1])));
  const hi = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = lo; y < hi; y++) {
    const cuts = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y + 0.5 && b[1] > y + 0.5) ||
          (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
        cuts.push(a[0] + (y + 0.5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const left = Math.floor(cuts[i]);
      rect(ctx, color, left, y, Math.ceil(cuts[i + 1]) - left, 1);
    }
  }
}

function matrix(ctx, rows, palette, x = 0, y = 0) {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      if (palette[row[dx]]) rect(ctx, palette[row[dx]], x + dx, y + dy);
    }
  });
}

function texture(scene, key, width, height, paint) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, width, height);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  tex.refresh();
  tex.setFilter(globalThis.Phaser?.Textures?.FilterMode?.NEAREST ?? 1);
}

const BOCO = {
  edge: '#543d32', gold: '#edb832', light: '#ffe776', shade: '#bf792b',
  cream: '#fff4cc', creamShade: '#dfc887', ink: '#252f39',
  teal: '#267c80', tealLight: '#65b7ae', tealDark: '#194955',
  red: '#c94751', redLight: '#ff8972', redDark: '#7f3446'
};

function bocoBoot(ctx, x, y, rear = false) {
  rect(ctx, BOCO.edge, x, y - 5, 4, 5);
  rect(ctx, rear ? '#76543e' : '#a57048', x + 1, y - 4, 2, 3);
  rect(ctx, '#e3b85f', x, y - 4, 4, 1);
  rect(ctx, BOCO.ink, x - 1, y - 1, 8, 2);
  rect(ctx, rear ? '#76543e' : '#bd8a57', x, y - 1, 6, 1);
  rect(ctx, '#f3d48c', x + 5, y - 1, 1, 1);
}

function bocoWing(ctx, pose, bob) {
  const p = BOCO;
  if (pose.startsWith('glide') || pose === 'jump' || pose === 'win') {
    const lift = pose === 'glide1' ? 2 : 0;
    polygon(ctx, p.edge, [[13, 21 + bob], [7, 18], [2, 13 + lift], [0, 5 + lift],
      [3, 7 + lift], [4, 2 + lift], [7, 6 + lift], [9, 4 + lift],
      [12, 12 + lift], [16, 18 + bob]]);
    polygon(ctx, p.gold, [[13, 20 + bob], [8, 17], [4, 12 + lift], [2, 8 + lift],
      [5, 11 + lift], [5, 5 + lift], [8, 10 + lift], [9, 7 + lift],
      [11, 14 + lift], [15, 19 + bob]]);
    polygon(ctx, p.light, [[5, 6 + lift], [8, 11 + lift], [10, 16], [8, 15], [5, 10 + lift]]);
    rect(ctx, p.cream, 10, 17, 3, 2);
  } else if (pose === 'swipe') {
    polygon(ctx, p.edge, [[11, 17], [16, 16], [22, 19], [31, 20],
      [29, 22], [32, 24], [27, 24], [28, 27], [22, 25], [14, 23]]);
    polygon(ctx, p.gold, [[12, 18], [16, 17], [22, 20], [28, 21],
      [25, 22], [29, 23], [24, 23], [25, 25], [20, 23], [14, 22]]);
    rect(ctx, p.light, 16, 19, 5, 2);
    rect(ctx, p.cream, 21, 21, 3, 1);
  } else {
    polygon(ctx, p.edge, [[10, 17 + bob], [14, 16 + bob], [18, 18 + bob],
      [17, 21 + bob], [13, 23 + bob], [9, 21 + bob]]);
    polygon(ctx, p.gold, [[11, 18 + bob], [14, 17 + bob], [17, 19 + bob],
      [15, 21 + bob], [12, 22 + bob], [10, 20 + bob]]);
    rect(ctx, p.light, 11, 18 + bob, 3, 1);
    rect(ctx, p.shade, 12, 21 + bob, 2, 1);
  }
}

function boco(ctx, pose) {
  const p = BOCO;
  const attack = /^(peck|swipe)([0-3])?$/.exec(pose);
  const attackFrame = attack ? Number(attack[2] ?? 1) : -1;
  const basePose = attack ? attack[1] : pose;
  const run = pose.startsWith('run') ? Number(pose.slice(3)) : -1;
  const duck = pose === 'duck';
  const airborne = ['jump', 'fall', 'glide0', 'glide1', 'swipe'].includes(basePose);
  const bob = run >= 0 ? [0, -1, 0, 0, -1, 0][run] : 0;
  const headY = attack ? [4, 7, 6, 4][attackFrame] : duck ? 12 : 4 + bob;
  const headX = attack ? [-3, 1, 0, -1][attackFrame] : duck ? 2 : 0;
  const headAngle = attack ? [-0.45, 0.65, 0.35, -0.12][attackFrame] : 0;
  const bodyY = duck ? 5 : bob;
  const cream = pose === 'hurt' ? '#ee645c' : p.cream;
  const creamShade = pose === 'hurt' ? '#b7384e' : p.creamShade;

  // Tail, scarf tails and far leg sit behind the fitted torso.
  polygon(ctx, p.edge, [[11, 22 + bodyY], [5, 22 + bodyY], [0, 18 + bodyY],
    [4, 18 + bodyY], [0, 13 + bodyY], [5, 15 + bodyY], [3, 10 + bodyY],
    [8, 14 + bodyY], [12, 18 + bodyY]]);
  polygon(ctx, p.gold, [[10, 21 + bodyY], [5, 20 + bodyY], [3, 19 + bodyY],
    [7, 19 + bodyY], [3, 15 + bodyY], [7, 17 + bodyY], [5, 13 + bodyY],
    [10, 17 + bodyY]]);
  rect(ctx, p.light, 5, 16 + bodyY, 2, 2);
  const flutter = run >= 0 ? [0, -1, 0, 1, 0, -1][run] : pose === 'glide1' ? -1 : 0;
  polygon(ctx, p.redDark, [[18, 13 + bodyY], [11, 12 + bodyY],
    [5, 10 + bodyY + flutter], [3, 13 + bodyY + flutter],
    [7, 14 + bodyY + flutter], [5, 16 + bodyY + flutter], [12, 15 + bodyY], [18, 15 + bodyY]]);
  polygon(ctx, p.red, [[17, 13 + bodyY], [10, 13 + bodyY],
    [5, 11 + bodyY + flutter], [5, 13 + bodyY + flutter], [10, 14 + bodyY], [17, 14 + bodyY]]);

  const strides = [[10, 19, 31, 29], [7, 18, 31, 27], [9, 17, 30, 28],
    [12, 16, 29, 31], [14, 14, 27, 31], [11, 17, 29, 31]];
  const [rearX, frontX, rearY, frontY] = run >= 0 ? strides[run] :
    airborne ? [9, 19, 29, 28] : duck ? [8, 19, 31, 31] : [11, 19, 31, 31];
  polygon(ctx, p.edge, [[12, 22 + bodyY], [15, 22 + bodyY],
    [rearX + 3, rearY - 4], [rearX, rearY - 4]]);
  rect(ctx, p.shade, rearX + 1, 24 + bodyY, 2, Math.max(1, rearY - 27 - bodyY));
  bocoBoot(ctx, rearX, rearY, true);

  polygon(ctx, p.edge, [[12, 14 + bodyY], [19, 14 + bodyY], [23, 17 + bodyY],
    [23, 22 + bodyY], [20, 25 + bodyY], [13, 25 + bodyY], [8, 22 + bodyY], [8, 18 + bodyY]]);
  polygon(ctx, p.gold, [[12, 15 + bodyY], [19, 15 + bodyY], [22, 18 + bodyY],
    [22, 22 + bodyY], [19, 24 + bodyY], [13, 24 + bodyY], [9, 21 + bodyY], [9, 18 + bodyY]]);
  polygon(ctx, creamShade, [[18, 16 + bodyY], [21, 17 + bodyY], [22, 21 + bodyY],
    [19, 24 + bodyY], [16, 23 + bodyY], [16, 19 + bodyY]]);
  polygon(ctx, cream, [[19, 17 + bodyY], [21, 18 + bodyY], [21, 21 + bodyY],
    [19, 23 + bodyY], [17, 22 + bodyY], [18, 19 + bodyY]]);

  // Open teal waistcoat, gold trim and a small leather hip pouch.
  polygon(ctx, p.tealDark, [[11, 14 + bodyY], [17, 14 + bodyY], [18, 17 + bodyY],
    [16, 21 + bodyY], [17, 24 + bodyY], [11, 24 + bodyY], [8, 21 + bodyY], [9, 17 + bodyY]]);
  polygon(ctx, p.teal, [[12, 15 + bodyY], [16, 15 + bodyY], [16, 18 + bodyY],
    [14, 21 + bodyY], [15, 23 + bodyY], [11, 22 + bodyY], [10, 19 + bodyY]]);
  rect(ctx, p.tealLight, 11, 16 + bodyY, 2, 3);
  rect(ctx, p.light, 16, 15 + bodyY, 1, 3);
  rect(ctx, '#593f37', 11, 23 + bodyY, 10, 2);
  rect(ctx, '#f7d77b', 18, 23 + bodyY, 2, 2);
  rect(ctx, '#79513d', 9, 22 + bodyY, 4, 4);
  rect(ctx, '#bf8852', 10, 22 + bodyY, 3, 2);
  rect(ctx, p.light, 11, 23 + bodyY);

  if (!duck) {
    polygon(ctx, p.edge, [[17, 10 + bob], [22, 10 + bob], [22, 16 + bob],
      [20, 19 + bob], [17, 18 + bob], [16, 14 + bob]]);
    polygon(ctx, p.gold, [[18, 10 + bob], [21, 10 + bob], [21, 16 + bob],
      [19, 18 + bob], [18, 16 + bob]]);
    rect(ctx, cream, 20, 12 + bob, 1, 5);
  }

  // A smaller head, swept three-feather crest and hooked beak make a runner silhouette.
  ctx.save();
  ctx.translate(headX, headY);
  // Rotate the whole head on the pixel grid, without antialiased canvas rotation.
  const headPoint = ([x, y]) => [Math.round(19 + (x - 19) * Math.cos(headAngle) - (y - 9) * Math.sin(headAngle)), Math.round(9 + (x - 19) * Math.sin(headAngle) + (y - 9) * Math.cos(headAngle))];
  const headPolygon = (color, points) => polygon(ctx, color, points.map(headPoint));
  const headRect = (color, x, y, w = 1, h = 1) => headPolygon(color, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  headPolygon(p.edge, [[13, 4], [9, 0], [13, 0], [12, -2], [17, 0],
    [18, -3], [20, 0], [23, 1], [25, 4], [25, 8], [22, 11], [17, 10], [14, 8]]);
  headPolygon(p.gold, [[14, 4], [12, 1], [16, 2], [14, 0], [18, 2],
    [18, -1], [20, 2], [23, 2], [24, 4], [24, 8], [21, 10], [17, 9], [15, 7]]);
  headPolygon(p.light, [[15, 3], [18, 3], [20, 2], [23, 3], [23, 4],
    [18, 5], [16, 6]]);
  headRect(p.shade, 16, 8, 3, 1);
  headRect(cream, 21, 5, 3, 3);
  headRect(p.ink, 22, 5, 2, 3);
  headRect('#ffffff', 22, 5);
  headRect(p.edge, 21, 4, 3, 1);
  const beakInset = attack ? 0 : headX;
  headPolygon(p.edge, [[24, 6], [28, 6], [31 - beakInset, 8], [29 - beakInset, 11], [27 - beakInset, 9], [24, 9]]);
  headPolygon('#f5c877', [[25, 7], [28, 7], [30 - beakInset, 8], [28 - beakInset, 9], [25, 8]]);
  headRect('#aa683a', 25, 9, Math.max(1, 4 - beakInset), 1);
  if (pose === 'hurt') {
    rect(ctx, p.gold, 21, 5, 3, 3);
    matrix(ctx, ['K.K', '.K.', 'K.K'], { K: p.ink }, 21, 5);
  } else if (pose === 'win') {
    rect(ctx, p.gold, 21, 5, 3, 3);
    matrix(ctx, ['.K.', 'K.K'], { K: p.ink }, 21, 6);
  }
  ctx.restore();

  rect(ctx, p.redDark, 16, 13 + bodyY, 7, 3);
  rect(ctx, p.red, 17, 13 + bodyY, 6, 2);
  rect(ctx, p.redLight, 18, 13 + bodyY, 4, 1);
  rect(ctx, p.light, 20, 15 + bodyY, 2, 1);

  polygon(ctx, p.edge, [[18, 24 + bodyY], [21, 24 + bodyY],
    [frontX + 3, frontY - 4], [frontX, frontY - 4]]);
  rect(ctx, '#dca147', frontX + 1, 25 + bodyY, 2, Math.max(1, frontY - 28 - bodyY));
  bocoBoot(ctx, frontX, frontY);
  bocoWing(ctx, duck ? 'idle' : basePose, bodyY);
}

function hitTexture(scene, key) {
  const source = scene.textures.get(key).getSourceImage();
  texture(scene, `${key}-hit`, source.width, source.height, ctx => {
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, source.width, source.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!pixels.data[i + 3]) continue;
      const dark = pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2] < 210;
      pixels.data[i] = dark ? 151 : 255;
      pixels.data[i + 1] = dark ? 45 : 241;
      pixels.data[i + 2] = dark ? 65 : 214;
    }
    ctx.putImageData(pixels, 0, 0);
  });
}

function beetle(ctx, shellback = false, frame = -1) {
  const colors = shellback ? ['#596574', '#7e929e', '#b4c9ca', '#e5e3c6'] :
    ['#77434e', '#ba5863', '#ed8590', '#ffd2ac'];
  for (const [leg, x] of [5, 12, 22].entries()) {
    if (frame < 0) {
      polygon(ctx, OUTLINE, [[x, 25], [x + 3, 25], [x + 4, 31], [x - 2, 31]]);
      rect(ctx, '#ac7e65', x, 27, 2, 2);
    } else {
      const reach = [-2, 0, 3, 1][(frame + leg * 2) % 4];
      const lift = (frame + leg) % 4 === 1 ? 2 : 0;
      polygon(ctx, OUTLINE, [[x, 25], [x + 2, 25], [x + reach + 3, 29 - lift],
        [x + reach + 5, 30 - lift], [x + reach + 5, 32 - lift],
        [x + reach - 2, 32 - lift], [x + reach - 2, 30 - lift], [x - 1, 28]]);
      rect(ctx, '#ac7e65', x + reach, 29 - lift, 2, 2);
      rect(ctx, '#cfaa82', x + reach - 1, 30 - lift, 4, 1);
    }
  }
  polygon(ctx, OUTLINE, [[2, 25], [3, 18], [6, 12], [11, 8], [20, 8],
    [25, 13], [28, 20], [30, 25], [27, 28], [7, 28]]);
  polygon(ctx, colors[0], [[3, 23], [5, 16], [10, 10], [20, 10], [24, 14],
    [27, 23], [23, 26], [7, 26]]);
  polygon(ctx, colors[1], [[5, 20], [7, 14], [12, 10], [19, 10], [23, 15],
    [24, 22], [9, 24]]);
  polygon(ctx, colors[2], [[7, 17], [9, 13], [13, 11], [18, 11], [21, 14],
    [20, 16], [11, 16]]);
  rect(ctx, colors[3], 11, 12, 6, 1);
  if (shellback) {
    for (const [x, y] of [[6, 17], [13, 10], [21, 15]]) {
      polygon(ctx, OUTLINE, [[x, y], [x + 1, y - 6], [x + 4, y - 2], [x + 4, y + 2]]);
      polygon(ctx, '#d7e0c9', [[x + 1, y], [x + 1, y - 4], [x + 3, y - 1]]);
    }
    rect(ctx, colors[0], 14, 17, 1, 7);
    rect(ctx, colors[3], 15, 18, 1, 4);
  } else {
    for (const [x, y] of [[9, 18], [18, 19], [14, 13]]) {
      rect(ctx, '#733d4d', x, y, 3, 3);
      rect(ctx, '#9d4754', x + 1, y + 1);
    }
  }
  polygon(ctx, OUTLINE, [[22, 20], [29, 20], [32, 24], [30, 28], [24, 28]]);
  rect(ctx, '#c79770', 25, 22, 5, 4);
  rect(ctx, '#fff1d1', 28, 22, 2, 2);
  rect(ctx, OUTLINE, 29, 23);
  rect(ctx, OUTLINE, 28, 19, 1, 2);
  rect(ctx, OUTLINE, 30, 18, 2, 1);
}

function hopper(ctx) {
  polygon(ctx, OUTLINE, [[5, 21], [2, 14], [5, 13], [10, 19], [12, 10],
    [17, 5], [23, 5], [27, 10], [28, 20], [24, 26], [29, 29], [29, 32],
    [18, 32], [17, 29], [8, 29], [4, 32], [0, 32], [1, 29]]);
  polygon(ctx, '#3b7960', [[5, 23], [11, 20], [13, 12], [18, 7], [23, 7],
    [25, 11], [26, 21], [22, 26], [12, 27]]);
  polygon(ctx, '#75b977', [[13, 19], [14, 12], [18, 8], [23, 8], [24, 13],
    [21, 22], [16, 24], [10, 23]]);
  polygon(ctx, '#c4dd88', [[19, 17], [25, 16], [25, 22], [21, 26], [18, 25]]);
  rect(ctx, '#e9edb4', 16, 10, 4, 2);
  rect(ctx, '#fff8de', 23, 10, 3, 4);
  rect(ctx, OUTLINE, 25, 11, 1, 2);
  polygon(ctx, '#4c9562', [[6, 23], [12, 23], [15, 26], [12, 29], [6, 29]]);
  rect(ctx, '#98cb7c', 7, 24, 5, 1);
  rect(ctx, '#759565', 2, 30, 5, 1);
  rect(ctx, '#759565', 20, 30, 7, 1);
  rect(ctx, OUTLINE, 24, 20, 3, 1);
  rect(ctx, '#e9edb4', 26, 19);
  rect(ctx, '#638550', 5, 17, 2, 3);
}

function plant(ctx) {
  polygon(ctx, OUTLINE, [[14, 16], [20, 16], [19, 26], [24, 30], [24, 32],
    [7, 32], [7, 30], [14, 26]]);
  rect(ctx, '#478359', 15, 18, 3, 12);
  rect(ctx, '#a8c878', 15, 19, 1, 9);
  polygon(ctx, '#254d46', [[15, 26], [7, 24], [2, 19], [9, 19], [15, 23]]);
  polygon(ctx, '#71a866', [[14, 25], [7, 23], [4, 20], [10, 21]]);
  polygon(ctx, '#254d46', [[18, 28], [20, 22], [30, 20], [26, 26]]);
  polygon(ctx, '#8cb76f', [[19, 26], [22, 23], [28, 21], [25, 25]]);
  polygon(ctx, OUTLINE, [[5, 15], [6, 8], [11, 3], [19, 2], [26, 6],
    [30, 12], [25, 19], [12, 21]]);
  polygon(ctx, '#aa4560', [[7, 13], [8, 8], [13, 4], [20, 4], [25, 7],
    [28, 12], [24, 17], [13, 19]]);
  polygon(ctx, '#f18b88', [[9, 10], [12, 6], [19, 5], [23, 7], [23, 9], [13, 10]]);
  polygon(ctx, '#522b42', [[11, 13], [27, 10], [25, 16], [14, 18]]);
  for (const [x, y] of [[13, 12], [18, 11], [23, 10]]) {
    polygon(ctx, '#fff1c9', [[x, y], [x + 3, y], [x + 2, y + 4]]);
  }
  rect(ctx, '#ffc1a2', 11, 7, 4, 1);
  rect(ctx, '#ffe6ac', 18, 6, 2, 2);
  rect(ctx, OUTLINE, 19, 7);
}

function bird(ctx) {
  polygon(ctx, OUTLINE, [[4, 15], [0, 8], [6, 10], [7, 4], [13, 12],
    [17, 7], [24, 6], [27, 11], [32, 13], [29, 17], [26, 17],
    [23, 25], [19, 27], [16, 31], [13, 30], [14, 26], [7, 24], [3, 27], [1, 26]]);
  polygon(ctx, '#507c9d', [[5, 16], [3, 11], [8, 14], [8, 7], [13, 15],
    [18, 9], [23, 8], [25, 12], [25, 19], [21, 24], [15, 25], [7, 22]]);
  polygon(ctx, '#8dc3cd', [[17, 12], [19, 9], [23, 9], [24, 12], [22, 16], [18, 17]]);
  polygon(ctx, '#e7e8c8', [[20, 17], [25, 16], [24, 21], [21, 24], [17, 24], [17, 21]]);
  polygon(ctx, '#34576f', [[6, 17], [12, 14], [18, 17], [15, 22], [10, 22]]);
  polygon(ctx, '#a5d6da', [[7, 17], [12, 15], [16, 17], [12, 18]]);
  rect(ctx, '#699fb2', 10, 20, 4, 1);
  rect(ctx, '#fff4d7', 23, 11, 2, 3);
  rect(ctx, OUTLINE, 24, 12);
  polygon(ctx, '#e2b85f', [[26, 12], [31, 14], [26, 16]]);
  rect(ctx, '#bb814b', 14, 29, 4, 1);
}

function birdFlap(ctx, frame) {
  bird(ctx);
  // Only the wing changes; the torso, eye, beak and registration stay fixed.
  ctx.clearRect(0, 0, 14, 16);
  const outline = [
    [[7, 19], [2, 12], [0, 4], [3, 6], [4, 1], [8, 6], [9, 2], [12, 7], [14, 16], [17, 19]],
    [[8, 20], [2, 18], [0, 12], [5, 13], [3, 9], [9, 12], [13, 15], [17, 19]],
    [[10, 16], [5, 20], [1, 24], [2, 28], [6, 26], [6, 31], [10, 27], [14, 22], [17, 19]],
    [[10, 15], [6, 16], [4, 20], [6, 24], [10, 23], [14, 21], [17, 18]]
  ][frame];
  const inside = [
    [[8, 18], [4, 12], [2, 7], [5, 10], [5, 5], [9, 10], [10, 6], [12, 11], [13, 17]],
    [[8, 18], [3, 16], [2, 14], [7, 15], [6, 12], [10, 14], [14, 18]],
    [[10, 18], [7, 21], [3, 25], [3, 26], [8, 23], [8, 27], [11, 24], [14, 20]],
    [[10, 17], [7, 18], [6, 20], [7, 22], [10, 21], [14, 19]]
  ][frame];
  polygon(ctx, OUTLINE, outline);
  polygon(ctx, '#507c9d', inside);
  const highlight = [
    [[6, 8], [8, 12], [11, 16], [9, 17], [5, 12]],
    [[5, 14], [10, 15], [13, 18], [9, 17]],
    [[10, 19], [12, 20], [7, 24], [4, 25]],
    [[7, 19], [11, 18], [13, 19], [8, 21]]
  ][frame];
  polygon(ctx, '#a5d6da', highlight);
  const [x, y] = [[10, 13], [9, 17], [9, 24], [8, 22]][frame];
  rect(ctx, '#34576f', x, y, 3, 1);
}

function hopperRun(ctx, frame) {
  hopper(ctx);
  ctx.clearRect(0, 29, 32, 3);
  const rear = [0, 3, 6, 2][frame];
  const front = [1, -2, 0, 3][frame];
  polygon(ctx, OUTLINE, [[8, 27], [12, 27], [9 + rear, 30], [8 + rear, 32],
    [rear, 32], [rear, 30], [5, 28]]);
  polygon(ctx, '#4c9562', [[8, 28], [10, 28], [7 + rear, 30], [2 + rear, 30]]);
  rect(ctx, '#98cb7c', 2 + rear, 30, 5, 1);
  polygon(ctx, OUTLINE, [[19, 26], [22, 26], [23 + front, 29], [29 + front, 30],
    [29 + front, 32], [19 + front, 32], [18 + front, 29]]);
  polygon(ctx, '#759565', [[20, 27], [21, 27], [22 + front, 30], [26 + front, 30],
    [26 + front, 31], [20 + front, 31]]);
  rect(ctx, '#b7cb88', 21 + front, 30, 5, 1);
}

function moth(ctx, frame = -1) {
  const left = frame < 0 || frame === 0 ?
    [[14, 11], [8, 4], [3, 3], [0, 6], [1, 17], [5, 21], [2, 25], [4, 29], [9, 29], [15, 22]] : [
      [[14, 11], [9, 8], [5, 6], [3, 8], [4, 17], [7, 20], [4, 24], [7, 28], [10, 27], [15, 22]],
      [[14, 11], [11, 9], [9, 10], [8, 15], [10, 20], [9, 23], [10, 28], [13, 26], [15, 22]],
      [[14, 11], [9, 10], [2, 13], [0, 17], [2, 23], [6, 23], [4, 27], [8, 31], [13, 28], [15, 22]]
    ][frame - 1];
  polygon(ctx, '#382e48', left);
  polygon(ctx, '#382e48', left.map(([x, y]) => [31 - x, y]));
  const inner = frame < 0 || frame === 0 ?
    [[13, 12], [7, 6], [3, 5], [2, 8], [3, 16], [8, 21], [5, 24], [5, 27], [8, 27], [13, 21]] : [
      [[13, 13], [9, 10], [5, 8], [5, 15], [9, 20], [6, 24], [8, 26], [12, 22]],
      [[13, 12], [11, 11], [10, 12], [10, 16], [12, 20], [11, 24], [11, 26], [13, 23]],
      [[13, 13], [9, 12], [3, 15], [2, 18], [4, 21], [9, 22], [6, 27], [9, 29], [12, 26], [13, 21]]
    ][frame - 1];
  polygon(ctx, '#a76caa', inner);
  polygon(ctx, '#a76caa', inner.map(([x, y]) => [31 - x, y]));
  const shine = frame < 0 || frame === 0 ? [[12, 13], [6, 7], [3, 7], [4, 11], [9, 17]] : [
    [[12, 14], [7, 10], [5, 10], [6, 13], [10, 17]],
    [[12, 12], [11, 12], [11, 16], [13, 18]],
    [[12, 14], [8, 14], [3, 17], [4, 19], [10, 18]]
  ][frame - 1];
  polygon(ctx, '#e3b3bf', shine);
  polygon(ctx, '#e3b3bf', shine.map(([x, y]) => [31 - x, y]));
  if (frame < 0) {
    for (const x of [6, 22]) {
      rect(ctx, '#5d416d', x, 13, 4, 5);
      rect(ctx, '#f5d8aa', x + 1, 14, 2, 3);
      rect(ctx, '#68416d', x + 1, 15);
      rect(ctx, '#e7a9a8', x, 24, 2, 2);
    }
  } else {
    const [x, y, w] = [[6, 13, 4], [7, 14, 3], [10, 14, 2], [5, 18, 4]][frame];
    for (const flip of [false, true]) {
      const xx = flip ? 31 - x - w + 1 : x;
      rect(ctx, '#5d416d', xx, y, w, 5);
      rect(ctx, '#f5d8aa', xx + (w > 2 ? 1 : 0), y + 1, Math.max(1, w - 2), 3);
      rect(ctx, '#68416d', xx + 1, y + 2);
      const spot = frame === 2 ? 11 : frame === 3 ? 8 : x;
      rect(ctx, '#e7a9a8', flip ? 30 - spot : spot, frame === 3 ? 27 : 24, 2, 2);
    }
  }
  polygon(ctx, OUTLINE, [[13, 8], [18, 8], [20, 14], [18, 25], [15, 29], [12, 23], [11, 14]]);
  rect(ctx, '#c9a87f', 14, 10, 3, 14);
  rect(ctx, '#fff0b7', 14, 11, 1, 10);
  for (const y of [16, 20, 24]) rect(ctx, '#846776', 14, y, 3, 1);
  rect(ctx, '#fff0b7', 13, 9, 1, 2);
  rect(ctx, '#fff0b7', 18, 9, 1, 2);
  polygon(ctx, OUTLINE, [[14, 9], [10, 5], [10, 2], [12, 2], [12, 5], [16, 9]]);
  polygon(ctx, OUTLINE, [[17, 9], [20, 5], [20, 2], [22, 2], [22, 5], [18, 10]]);
}

function bossBeetle(ctx) {
  for (const x of [10, 24, 44]) {
    polygon(ctx, OUTLINE, [[x, 49], [x + 5, 49], [x + 7, 59], [x + 12, 62],
      [x + 11, 64], [x - 3, 64], [x - 3, 61], [x + 1, 57]]);
    rect(ctx, '#b89472', x + 1, 54, 3, 5);
  }
  polygon(ctx, OUTLINE, [[3, 49], [5, 34], [12, 21], [22, 14], [38, 13],
    [47, 19], [54, 32], [59, 47], [54, 55], [15, 57]]);
  polygon(ctx, '#633c53', [[5, 48], [8, 34], [14, 23], [23, 16], [38, 15],
    [45, 21], [51, 34], [55, 47], [50, 52], [17, 54]]);
  polygon(ctx, '#ad5168', [[9, 43], [11, 33], [17, 23], [25, 17], [36, 17],
    [44, 23], [48, 34], [48, 45], [31, 49], [17, 49]]);
  polygon(ctx, '#dd8585', [[13, 32], [19, 23], [26, 19], [35, 19], [42, 25],
    [42, 29], [25, 30], [18, 35]]);
  rect(ctx, '#ffceac', 23, 21, 12, 2);
  polygon(ctx, '#452f48', [[29, 31], [32, 30], [33, 50], [30, 52]]);
  for (const [x, y] of [[17, 36], [39, 34], [22, 44], [41, 44]]) {
    polygon(ctx, '#67364f', [[x, y], [x + 5, y - 1], [x + 7, y + 3], [x + 4, y + 6], [x, y + 4]]);
    rect(ctx, '#cb6975', x + 1, y, 3, 1);
  }
  polygon(ctx, OUTLINE, [[20, 17], [19, 8], [24, 10], [28, 3], [32, 9], [38, 5], [39, 17]]);
  polygon(ctx, '#dba75a', [[22, 15], [21, 11], [25, 13], [28, 7], [32, 12], [36, 9], [37, 15]]);
  rect(ctx, '#ffe69d', 26, 14, 8, 1);
  polygon(ctx, OUTLINE, [[47, 36], [57, 36], [63, 41], [64, 50], [59, 55], [47, 53], [44, 45]]);
  polygon(ctx, '#b98264', [[49, 38], [57, 38], [61, 42], [61, 49], [56, 52], [49, 50]]);
  rect(ctx, '#ecd1a1', 52, 40, 6, 3);
  rect(ctx, '#fff8cf', 57, 40, 3, 5);
  rect(ctx, OUTLINE, 59, 41, 1, 3);
  polygon(ctx, '#e7c68b', [[51, 51], [54, 56], [58, 55], [60, 51], [60, 57], [54, 60], [49, 56]]);
  rect(ctx, OUTLINE, 55, 33, 2, 4);
  rect(ctx, '#e6b476', 58, 31, 3, 2);
}

function bossMoth(ctx) {
  const shape = [[30, 20], [20, 9], [5, 3], [0, 7], [1, 25], [9, 36],
    [4, 45], [5, 56], [13, 61], [23, 54], [31, 39]];
  const inside = [[28, 21], [18, 11], [6, 5], [2, 9], [3, 24], [12, 36],
    [6, 46], [7, 55], [13, 58], [22, 52], [28, 38]];
  for (const flip of [false, true]) {
    const mirror = pts => pts.map(([x, y]) => [flip ? 63 - x : x, y]);
    polygon(ctx, '#322d47', mirror(shape));
    polygon(ctx, '#765987', mirror(inside));
    polygon(ctx, '#b283b0', mirror([[26, 22], [17, 13], [7, 7], [4, 9],
      [6, 19], [16, 32], [25, 34]]));
    polygon(ctx, '#e8b5bb', mirror([[24, 23], [15, 14], [7, 10], [9, 18], [19, 29]]));
    polygon(ctx, '#d58b9a', mirror([[26, 36], [16, 37], [9, 46], [9, 53], [14, 55], [21, 49]]));
    polygon(ctx, '#4c3b63', mirror([[11, 20], [18, 20], [23, 27], [20, 33], [13, 32], [9, 26]]));
    polygon(ctx, '#f4daaa', mirror([[12, 22], [17, 22], [20, 27], [17, 30], [13, 29], [11, 26]]));
    polygon(ctx, '#658b95', mirror([[14, 24], [17, 24], [18, 27], [16, 29], [13, 27]]));
    rect(ctx, '#fff3d0', flip ? 48 : 14, 24, 2, 2);
    for (const [x, y] of [[8, 14], [6, 36], [16, 48], [20, 16]]) {
      const xx = flip ? 62 - x : x;
      rect(ctx, '#f4cda0', xx, y, 2, 2);
    }
  }
  polygon(ctx, OUTLINE, [[28, 15], [35, 15], [39, 26], [37, 44], [32, 57], [27, 47], [25, 28]]);
  polygon(ctx, '#9d8192', [[29, 20], [34, 20], [36, 28], [34, 46], [32, 52], [29, 45], [27, 29]]);
  rect(ctx, '#edd5b3', 29, 22, 3, 19);
  for (const y of [30, 36, 42, 47]) rect(ctx, '#58475e', 28, y, 7, 2);
  polygon(ctx, OUTLINE, [[29, 18], [24, 11], [21, 10], [20, 4], [23, 4], [24, 9], [32, 17]]);
  polygon(ctx, OUTLINE, [[34, 18], [39, 11], [42, 10], [43, 4], [40, 4], [39, 9], [32, 17]]);
  rect(ctx, '#ffe4b5', 28, 19, 2, 3);
  rect(ctx, '#ffe4b5', 34, 19, 2, 3);
}

function bossPlant(ctx) {
  polygon(ctx, OUTLINE, [[25, 31], [37, 31], [38, 51], [46, 58], [50, 62],
    [49, 64], [12, 64], [13, 60], [25, 52]]);
  polygon(ctx, '#2e6a54', [[28, 33], [34, 33], [35, 53], [44, 60], [17, 61], [28, 53]]);
  rect(ctx, '#8bb778', 29, 35, 2, 18);
  for (const flip of [false, true]) {
    const mirror = pts => pts.map(([x, y]) => [flip ? 63 - x : x, y]);
    polygon(ctx, '#254b44', mirror([[28, 52], [15, 50], [3, 38], [14, 37], [25, 42]]));
    polygon(ctx, '#548b5b', mirror([[26, 49], [16, 47], [7, 40], [14, 40], [24, 45]]));
    polygon(ctx, '#a0bf74', mirror([[25, 47], [16, 43], [11, 40], [17, 41]]));
  }
  polygon(ctx, '#38313e', [[6, 28], [5, 19], [11, 8], [22, 2], [37, 3],
    [50, 10], [58, 20], [63, 24], [58, 36], [47, 41], [22, 42], [11, 36]]);
  polygon(ctx, '#924763', [[8, 25], [8, 19], [14, 10], [24, 5], [36, 5],
    [48, 12], [56, 22], [60, 25], [55, 34], [45, 38], [23, 39], [13, 34]]);
  polygon(ctx, '#dc777e', [[11, 19], [17, 11], [25, 7], [35, 7], [45, 12],
    [50, 18], [40, 19], [24, 22]]);
  polygon(ctx, '#ffc39b', [[16, 15], [23, 9], [32, 8], [37, 10], [24, 13], [19, 17]]);
  polygon(ctx, '#422b42', [[15, 25], [29, 22], [58, 23], [54, 33], [43, 36], [25, 36]]);
  for (const [x, y] of [[19, 24], [30, 23], [42, 23], [52, 23]]) {
    polygon(ctx, '#f9e6c0', [[x, y], [x + 6, y], [x + 4, y + 7], [x + 2, y + 5]]);
    rect(ctx, '#b6aca1', x + 3, y + 3, 1, 2);
  }
  for (const x of [28, 40, 50]) polygon(ctx, '#e3c5aa', [[x, 35], [x + 4, 34], [x + 2, 30]]);
  rect(ctx, '#ffdda6', 39, 14, 5, 5);
  rect(ctx, OUTLINE, 42, 15, 2, 3);
  rect(ctx, '#fff9d6', 39, 14, 2, 2);
  for (const [x, y] of [[13, 22], [27, 17], [33, 9], [48, 20], [19, 34]]) {
    rect(ctx, '#f3a79a', x, y, 2, 2);
  }
}

function bossBird(ctx) {
  polygon(ctx, OUTLINE, [[17, 29], [6, 22], [0, 12], [3, 10], [9, 14],
    [6, 5], [9, 3], [20, 13], [19, 4], [23, 3], [32, 18], [39, 9],
    [48, 7], [55, 13], [57, 21], [64, 24], [64, 28], [57, 31],
    [53, 43], [45, 52], [47, 57], [53, 61], [52, 64], [39, 64],
    [34, 58], [26, 59], [20, 63], [9, 63], [9, 60], [17, 53],
    [12, 49], [3, 56], [0, 52], [8, 39]]);
  polygon(ctx, '#5b536e', [[17, 29], [8, 21], [4, 14], [13, 19], [10, 9],
    [23, 21], [22, 9], [31, 23], [40, 12], [48, 10], [53, 15],
    [54, 28], [51, 40], [43, 49], [28, 53], [17, 48], [12, 39]]);
  polygon(ctx, '#a08b9c', [[33, 24], [40, 14], [47, 12], [51, 16], [50, 25], [44, 31]]);
  polygon(ctx, '#e0bda6', [[43, 29], [53, 29], [50, 39], [42, 48], [34, 49], [31, 42]]);
  polygon(ctx, '#433f59', [[16, 29], [25, 23], [37, 30], [34, 38], [26, 45], [17, 41], [11, 36]]);
  polygon(ctx, '#9688a2', [[16, 29], [25, 26], [33, 30], [29, 33], [20, 33]]);
  for (const [x, y] of [[16, 34], [20, 38], [25, 39]]) {
    polygon(ctx, '#beb0b7', [[x, y], [x + 7, y - 1], [x + 4, y + 3]]);
  }
  polygon(ctx, '#edc075', [[54, 22], [62, 25], [62, 27], [55, 29], [52, 27]]);
  rect(ctx, '#ffdfa0', 55, 24, 5, 1);
  rect(ctx, '#fff8dd', 49, 19, 4, 5);
  rect(ctx, OUTLINE, 51, 20, 2, 3);
  rect(ctx, '#46364e', 47, 18, 6, 1);
  polygon(ctx, '#cf946a', [[39, 12], [37, 4], [42, 7], [44, 2], [47, 8], [51, 5], [51, 12]]);
  rect(ctx, '#ffd29a', 42, 9, 6, 1);
  polygon(ctx, '#bc8b65', [[22, 52], [27, 54], [23, 59], [14, 61], [18, 58]]);
  polygon(ctx, '#bc8b65', [[37, 52], [42, 52], [43, 59], [49, 61], [41, 61], [37, 58]]);
  rect(ctx, '#edd2a3', 15, 60, 7, 1);
  rect(ctx, '#edd2a3', 42, 60, 6, 1);
}

const BOSS_ANIMATION_FRAMES = { idle: 4, warn: 4, attack: 6, recover: 4, return: 4 };

function bossAnimationFrame(ctx, source, type, phase, frame) {
  ctx.imageSmoothingEnabled = false;
  if (phase === 'idle' || phase === 'return') {
    const bob = type === 'moth' || type === 'bird' ? [0, -1, -2, -1][frame] : [0, 0, -1, 0][frame];
    ctx.drawImage(source, 0, bob);
    return;
  }
  if (phase === 'warn') {
    const squeeze = [0, 2, 3, 1][frame];
    ctx.drawImage(source, 0, 0, 64, 64, squeeze, squeeze, 64 - squeeze * 2, 64 - squeeze);
    return;
  }
  if (phase === 'recover') {
    const droop = [1, 3, 4, 2][frame];
    ctx.drawImage(source, 0, 0, 64, 32, 0, droop, 64, 32);
    ctx.drawImage(source, 0, 32, 64, 32, 0, 32, 64, 32);
    return;
  }
  if ((type === 'moth' || type === 'bird') && phase === 'attack') {
    const wing = [1, -2, -4, -1, 2, 0][frame];
    ctx.drawImage(source, 0, 0, 24, 64, 0, wing, 24, 64);
    ctx.drawImage(source, 24, 0, 16, 64, 24, 0, 16, 64);
    ctx.drawImage(source, 40, 0, 24, 64, 40, wing, 24, 64);
    return;
  }
  if (type === 'plant' && phase === 'attack') {
    const snap = [0, 2, 4, 2, 0, -1][frame];
    ctx.drawImage(source, 0, 0, 64, 43, 0, snap, 64, 43 - Math.max(0, snap));
    ctx.drawImage(source, 0, 43, 64, 21, 0, 43, 64, 21);
    return;
  }
  // The beetle charge leans forward in whole-pixel bands. The sprite flip in
  // gameplay mirrors this cleanly without changing its collision rectangle.
  const lean = [0, 1, 3, 5, 3, 1][frame];
  for (let y = 0; y < 64; y += 8) {
    const shift = Math.round(lean * (1 - y / 64));
    ctx.drawImage(source, 0, y, 64 - shift, 8, shift, y, 64 - shift, 8);
  }
}

function objects(scene) {
  texture(scene, 'seed', 8, 8, ctx => {
    matrix(ctx, ['..oo....', '.oLSo...', 'oLLYSo..', 'oLYYSoo.', '.oYSSSo.', '..oSSSo.', '...ooo..', '........'],
      { o: '#473946', L: '#f8d58b', Y: '#be8a61', S: '#876050' });
  });
  texture(scene, 'spring-bloom', 16, 8, ctx => {
    polygon(ctx, OUTLINE, [[1, 5], [4, 2], [7, 3], [10, 1], [15, 4], [14, 7], [2, 7]]);
    polygon(ctx, '#e56f82', [[2, 5], [5, 3], [8, 4], [10, 2], [14, 4], [13, 6], [3, 6]]);
    rect(ctx, '#ffd276', 5, 4, 7, 2);
    rect(ctx, '#fff0a8', 7, 4, 3, 1);
  });
  texture(scene, 'chapter-marker', 24, 48, ctx => {
    rect(ctx, OUTLINE, 2, 7, 3, 41); rect(ctx, '#8b694d', 3, 9, 1, 39);
    rect(ctx, OUTLINE, 19, 7, 3, 41); rect(ctx, '#8b694d', 20, 9, 1, 39);
    polygon(ctx, OUTLINE, [[0, 5], [5, 1], [19, 1], [24, 5], [21, 13], [3, 13]]);
    polygon(ctx, '#e8c85f', [[2, 5], [6, 3], [18, 3], [22, 5], [20, 11], [4, 11]]);
    rect(ctx, '#fff0a8', 6, 4, 10, 2); rect(ctx, '#a84b54', 10, 7, 4, 3);
  });
  texture(scene, 'boss-warning', 8, 16, ctx => {
    rect(ctx, '#3b3038', 2, 0, 5, 11); rect(ctx, '#ffe777', 3, 1, 3, 8);
    rect(ctx, '#3b3038', 2, 12, 5, 4); rect(ctx, '#fff1a8', 3, 13, 3, 2);
  });
  texture(scene, 'flower', 16, 32, ctx => {
    rect(ctx, '#305952', 7, 14, 2, 17);
    rect(ctx, '#8bac68', 7, 17, 1, 12);
    polygon(ctx, '#42785a', [[7, 26], [2, 24], [1, 20], [5, 21], [8, 25]]);
    polygon(ctx, '#9cbd73', [[8, 23], [10, 19], [15, 18], [13, 22]]);
    matrix(ctx, ['....oo.oo....', '...oPPoPPo...', '...oPHHHPo...', '.oooPHHHPooo.', 'oPPPHYYYHPPPo',
      'oPHHYLILYHHPo', '.oPHYLLLYHPo.', '..oPHYYYHPo..', '..oPPHHHPPo..', '...ooPPPoo...', '.....ooo.....'],
    { o: '#794463', P: '#f090a2', H: '#ffd0bd', Y: '#dda54c', L: '#fff0a5', I: '#fffbd4' }, 1, 3);
  });
  texture(scene, 'emblem', 16, 32, ctx => {
    matrix(ctx, ['......oo......', '.....oLLo.....', '....oLWWLo....', '...oLWWWWLo...', '..oLWWWWWWLo..',
      '.oLWWWWWWWWLo.', 'oLWWYWWYWWWWLo', 'oLWWYWWYWWWYLo', 'oLWWYYWYYWWYLo', '.oLWWYYYYYYLo.',
      '..oLWWWWWYLo..', '...oLWWWYLo...', '....oLWYLo....', '.....oYLo.....', '......oo......'],
    { o: '#8c6440', L: '#eec564', W: '#ffe9a1', Y: '#c58c47' }, 0, 6);
    rect(ctx, '#fff6d0', 5, 11, 1, 3);
  });
  texture(scene, 'checkpoint', 16, 32, ctx => {
    rect(ctx, '#463d43', 4, 2, 3, 29);
    rect(ctx, '#c59b6d', 5, 4, 1, 25);
    rect(ctx, '#eee1b5', 5, 2, 1, 2);
    polygon(ctx, '#385650', [[7, 5], [15, 5], [13, 10], [15, 15], [7, 15]]);
    polygon(ctx, '#80ba98', [[7, 6], [13, 6], [11, 10], [13, 13], [7, 13]]);
    matrix(ctx, ['.Y.', 'YYY', '.Y.'], { Y: '#ffebb0' }, 8, 8);
    rect(ctx, '#5d6353', 1, 30, 9, 2);
    rect(ctx, '#a2a386', 2, 30, 6, 1);
  });
  texture(scene, 'exit', 16, 32, ctx => {
    matrix(ctx, ['.....oooooo.....', '...ooSSLLSSoo...', '..oSLLLHHLLLSo..', '.oSLLooooooLLSo.',
      '.oLLo......oLLo.', 'oSLo........oLSo', 'oLLo........oLLo', 'oLSo........oSLo'],
    { o: '#4b4c59', S: '#787b8b', L: '#b1b1b3', H: '#e0dbc5' });
    for (const x of [0, 12]) {
      rect(ctx, '#494c59', x, 8, 4, 24);
      rect(ctx, '#96969e', x + 1, 8, 2, 22);
      rect(ctx, '#d2cab7', x + 1, 8, 1, 21);
      for (const y of [13, 20, 27]) rect(ctx, '#666b7b', x + 1, y, 2, 1);
      rect(ctx, '#667954', x, 21, 2, 3);
      rect(ctx, '#8da575', x + 1, 22, 1, 2);
    }
    rect(ctx, '#636573', 3, 30, 10, 2);
    rect(ctx, '#d2cab7', 4, 30, 8, 1);
    rect(ctx, '#e6bd69', 7, 2, 2, 2);
  });
  texture(scene, 'gust', 16, 16, ctx => {
    matrix(ctx, ['........oo......', '.......oLLo.....', '......oLLLLo....', '.....oLL.LLLo...',
      '....oLL...LLLo..', '.....oo...oo....', '.......oLo......', '.......oLo......',
      '.......oLo......', '..ooo..oLo......', '.oLLLo.oLo......', '..ooLLoLLo......',
      '....oLLLLo......', '.....oooo.......'], { o: '#6d9ba7', L: '#c9ede7' }, 0, 1);
  });
}

const TERRAIN = {
  meadow: { rim: '#d4e391', grass: '#81b25d', dark: '#396950', soil: '#866f5c',
    shade: '#665a52', light: '#a68d6d', stone: '#bdac83' },
  cliff: { rim: '#e3ded0', grass: '#b3b5aa', dark: '#65747b', soil: '#8b929d',
    shade: '#626d82', light: '#afb6be', stone: '#d2cec4' },
  canopy: { rim: '#c1cc80', grass: '#658d55', dark: '#2f5549', soil: '#665a59',
    shade: '#424b4b', light: '#928071', stone: '#aaad88' },
  roost: { rim: '#efd3a1', grass: '#c5a777', dark: '#746776', soil: '#8b7785',
    shade: '#605b74', light: '#b19a9b', stone: '#dac0a7' }
};

function groundTile(ctx, theme, top) {
  const p = TERRAIN[theme];
  rect(ctx, p.soil, 0, 0, 16, 16);
  if (theme === 'meadow' || theme === 'canopy') {
    matrix(ctx, ['....sssss.......', '.....sss........', 'ss...........sss', 's..........sssss',
      '.......lll...sss', '......lllll.....', '.......ll.......', '..ss............',
      '.ssss...........', '..ssss......ss..', '...ss......ssss.', '...........sss..',
      '.....llll.......', '....llllll......', '.....lll........', '................'],
    { s: p.shade, l: p.light });
    matrix(ctx, ['.h.', 'hhh', '.l.'], { h: p.stone, l: p.light }, 11, 8);
    rect(ctx, p.shade, 4, 6, 2, 1);
    rect(ctx, p.light, 1, 12, 1, 1);
    if (theme === 'canopy') {
      polygon(ctx, p.shade, [[0, 2], [5, 4], [9, 9], [16, 10], [16, 13], [8, 11], [4, 6], [0, 5]]);
      polygon(ctx, p.light, [[0, 2], [5, 4], [9, 9], [16, 10], [16, 11], [8, 10], [4, 5], [0, 3]]);
      rect(ctx, '#4e6651', 12, 13, 3, 1);
    }
  } else {
    polygon(ctx, p.shade, [[0, 10], [4, 9], [7, 4], [12, 5], [16, 3], [16, 5],
      [12, 7], [8, 6], [5, 11], [0, 12]]);
    polygon(ctx, p.light, [[0, 2], [6, 3], [10, 0], [13, 0], [8, 5], [0, 4]]);
    polygon(ctx, p.light, [[7, 13], [11, 10], [16, 11], [16, 12], [11, 12], [9, 15], [7, 16]]);
    rect(ctx, p.stone, 1, 2, 3, 1);
    rect(ctx, p.stone, 10, 12, 3, 1);
    rect(ctx, p.shade, 3, 14, 2, 1);
    if (theme === 'roost') {
      matrix(ctx, ['.l...', 'llls.', '.sss.'], { l: '#d7c09a', s: '#78657b' }, 6, 7);
    }
  }
  if (top) {
    const heights = [3, 3, 4, 3, 2, 3, 5, 4, 3, 3, 2, 3, 4, 4, 3, 3];
    for (let x = 0; x < 16; x++) {
      rect(ctx, p.dark, x, 0, 1, heights[x] + 2);
      rect(ctx, p.grass, x, 0, 1, heights[x]);
      rect(ctx, p.rim, x, 0, 1, x % 5 === 2 ? 2 : 1);
    }
    rect(ctx, p.rim, 6, 2, 1, 1);
    rect(ctx, p.grass, 2, 5, 1, 2);
    rect(ctx, p.grass, 12, 5, 2, 1);
  }
}

/** Generate the complete shared texture set; safe to call on scene restart. */
export function createArt(scene) {
  for (const pose of ['idle', 'run0', 'run1', 'run2', 'run3', 'run4', 'run5',
    'jump', 'fall', 'glide0', 'glide1', 'duck', 'peck', 'swipe', 'hurt', 'win',
    'peck0', 'peck1', 'peck2', 'peck3', 'swipe0', 'swipe1', 'swipe2', 'swipe3']) {
    texture(scene, `boco-${pose}`, 32, 32, ctx => boco(ctx, pose));
  }
  const enemies = { beetle: ctx => beetle(ctx), shellback: ctx => beetle(ctx, true), hopper, plant, bird, moth };
  for (const [key, paint] of Object.entries(enemies)) texture(scene, key, 32, 32, paint);
  // Optional animation keys. Static contract keys and existing callers are unchanged.
  for (let frame = 0; frame < 4; frame++) {
    texture(scene, `beetle-run${frame}`, 32, 32, ctx => beetle(ctx, false, frame));
    texture(scene, `shellback-run${frame}`, 32, 32, ctx => beetle(ctx, true, frame));
    texture(scene, `hopper-run${frame}`, 32, 32, ctx => hopperRun(ctx, frame));
    texture(scene, `bird-flap${frame}`, 32, 32, ctx => birdFlap(ctx, frame));
    texture(scene, `moth-flap${frame}`, 32, 32, ctx => moth(ctx, frame));
  }
  for (const [key, paint] of Object.entries({ beetle: bossBeetle, moth: bossMoth, plant: bossPlant, bird: bossBird })) {
    texture(scene, `boss-${key}`, 64, 64, paint);
    const source = scene.textures.get(`boss-${key}`).getSourceImage();
    for (const [phase, count] of Object.entries(BOSS_ANIMATION_FRAMES)) {
      for (let frame = 0; frame < count; frame++) {
        const animationKey = `boss-${key}-${phase}${frame}`;
        texture(scene, animationKey, 64, 64, ctx => bossAnimationFrame(ctx, source, key, phase, frame));
        // Bosses are vulnerable only during recovery, so only those frames
        // need a second damage palette in memory.
        if (phase === 'recover') hitTexture(scene, animationKey);
      }
    }
  }
  for (const key of scene.textures.getTextureKeys()) {
    if (/^(beetle|shellback|hopper|plant|bird|moth)(-(run|flap)\d)?$|^boss-(beetle|moth|plant|bird)$/.test(key)) hitTexture(scene, key);
  }
  objects(scene);
  for (const key of Object.keys(TERRAIN)) {
    texture(scene, `${key}-ground`, 16, 16, ctx => groundTile(ctx, key, true));
    texture(scene, `${key}-fill`, 16, 16, ctx => groundTile(ctx, key, false));
  }
  texture(scene, 'platform', 32, 8, ctx => {
    rect(ctx, '#3b454a', 0, 1, 32, 7);
    rect(ctx, '#b4c084', 0, 0, 32, 2);
    rect(ctx, '#e0dba0', 1, 0, 5, 1);
    rect(ctx, '#d5d997', 17, 0, 9, 1);
    rect(ctx, '#a18c6b', 0, 2, 32, 3);
    rect(ctx, '#c7b187', 0, 2, 32, 1);
    matrix(ctx, ['........ss......ll........ss....', '....ll...ss........ss...........',
      'ss...ll........ss...ss.......ss.', '.......ss.......ll..............'],
    { s: '#665e51', l: '#ad9470' }, 0, 3);
    for (const x of [5, 23]) {
      rect(ctx, '#4d534b', x, 2, 2, 6);
      rect(ctx, '#828b67', x, 2, 1, 4);
    }
    rect(ctx, '#665e51', 0, 7, 32, 1);
  });
}

// Every shape crossing the horizontal boundary is painted on both sides.
function wrapped(ctx, x, width, paint) {
  paint(ctx, x);
  if (x < 0) paint(ctx, x + BG_WIDTH);
  if (x + width > BG_WIDTH) paint(ctx, x - BG_WIDTH);
}

function cloud(ctx, x, y, size, colors) {
  const spans = [
    [25, 0, 17, 3], [21, 3, 27, 4], [7, 7, 49, 4], [3, 11, 61, 5],
    [0, 16, 72, 5], [4, 21, 72, 4], [12, 25, 56, 3], [21, 28, 39, 2]
  ];
  for (const [dx, dy, w, h] of spans) {
    rect(ctx, colors[0], x + dx * size, y + dy * size, w * size, h * size);
  }
  polygon(ctx, colors[1], [[x + 5 * size, y + 20 * size], [x + 24 * size, y + 20 * size],
    [x + 28 * size, y + 23 * size], [x + 52 * size, y + 23 * size],
    [x + 56 * size, y + 20 * size], [x + 73 * size, y + 20 * size],
    [x + 73 * size, y + 25 * size], [x + 60 * size, y + 25 * size],
    [x + 60 * size, y + 28 * size], [x + 23 * size, y + 28 * size],
    [x + 23 * size, y + 25 * size], [x + 12 * size, y + 25 * size]]);
  rect(ctx, colors[2], x + 27 * size, y + 4 * size, 13 * size, 2 * size);
  rect(ctx, colors[2], x + 10 * size, y + 10 * size, 15 * size, 2 * size);
  rect(ctx, colors[2], x + 44 * size, y + 12 * size, 11 * size, 2 * size);
}

const THEMES = {
  meadow: {
    sky: ['#669dac', '#79b4bf', '#94c8c8', '#b6dbcf', '#d3e5cb', '#e4ebc7'],
    cloud: ['#f2f1d8', '#c5d8cd', '#fff9e5'],
    far: ['#a5c3a8', '#bfd2ae', '#8bad9b'],
    middle: ['#6f9d89', '#8cb291', '#5a8c7c'],
    near: ['#3e7568', '#60906e', '#90b97c']
  },
  cliff: {
    sky: ['#6a90ac', '#7daac0', '#9bc6d0', '#b9d9d6', '#d7e7d8', '#e8eee0'],
    cloud: ['#f2f4e8', '#c6dbe0', '#ffffff'],
    far: ['#9eaec1', '#c2cbd0', '#869ab0'],
    middle: ['#768f9f', '#9db2b9', '#5f7c91'],
    near: ['#506e7e', '#729097', '#a2b9b0']
  },
  canopy: {
    sky: ['#355861', '#416d70', '#578681', '#76a18b', '#95b595', '#b2c6a0'],
    cloud: ['#b3c9a6', '#8eaf96', '#d8ddaf'],
    far: ['#639489', '#8dab91', '#4f827d'],
    middle: ['#376e66', '#5a8a71', '#2e5c59'],
    near: ['#264f4d', '#437565', '#80a078']
  },
  roost: {
    sky: ['#847d9f', '#ab92ad', '#ceacb7', '#eac5bb', '#f4d9b9', '#f5e6c7'],
    cloud: ['#f7ddc7', '#d9b9bd', '#fff0d4'],
    far: ['#b2a9b8', '#d4bfbe', '#9c94ab'],
    middle: ['#8b859e', '#b09aa9', '#756f8b'],
    near: ['#595d7c', '#808099', '#bfacaa']
  }
};

function sky(ctx, key) {
  const colors = THEMES[key].sky;
  const bands = [0, 38, 76, 116, 161, 210, BG_HEIGHT];
  for (let i = 0; i < colors.length; i++) {
    rect(ctx, colors[i], 0, bands[i], BG_WIDTH, bands[i + 1] - bands[i]);
    if (i > 0) {
      // Sparse, staggered transition strokes keep the horizon softly pixelated.
      for (let x = 0; x < BG_WIDTH; x += 8) {
        const offset = ((x / 8) * 7 + i * 3) % 11;
        rect(ctx, colors[i - 1], x, bands[i] + offset % 3, 3 + offset % 4, 1);
        rect(ctx, colors[i], x + 4, bands[i] - 1 - offset % 2, 2, 1);
      }
    }
  }
  if (key === 'roost') {
    polygon(ctx, '#f9e5b8', [[356, 42], [378, 42], [388, 47], [394, 58],
      [394, 76], [388, 87], [378, 92], [356, 92], [346, 87], [340, 76], [340, 58], [346, 47]]);
    rect(ctx, '#f7d9b5', 337, 66, 62, 3);
    rect(ctx, '#edc6b3', 332, 79, 74, 2);
  }
  if (key === 'canopy') {
    polygon(ctx, '#87ad90', [[207, 0], [218, 0], [118, 218], [93, 218]]);
    polygon(ctx, '#79a28a', [[254, 0], [259, 0], [187, 188], [175, 188]]);
    polygon(ctx, '#8caf91', [[429, 0], [435, 0], [370, 210], [351, 210]]);
  }
}

function cloudLayer(ctx, key) {
  const p = THEMES[key];
  if (key === 'canopy') {
    for (const [x, y, size] of [[-28, -26, 2], [138, -35, 2], [297, -24, 2], [465, -30, 2]]) {
      wrapped(ctx, x, 152, (c, xx) => cloud(c, xx, y, size, ['#3e6b63', '#345f5b', '#52796a']));
    }
    for (const [x, length] of [[28, 80], [147, 48], [216, 99], [341, 68], [480, 93]]) {
      rect(ctx, '#426d60', x, 0, 1, length);
      for (let y = 13; y < length; y += 13) {
        polygon(ctx, '#638770', [[x, y], [x - 4, y - 3], [x - 6, y - 1], [x - 3, y + 2]]);
        polygon(ctx, '#70917a', [[x + 1, y + 6], [x + 5, y + 2], [x + 6, y + 4], [x + 3, y + 7]]);
      }
    }
    return;
  }
  for (const [x, y, size] of [[-37, 32, 1], [72, 14, 1], [167, 63, 2], [359, 25, 1], [455, 95, 1]]) {
    wrapped(ctx, x, 76 * size, (c, xx) => cloud(c, xx, y, size, p.cloud));
  }
  wrapped(ctx, -90, 152, (c, xx) => cloud(c, xx, 139, 2, [p.sky[4], p.sky[3], p.sky[5]]));
}

function chapterAtmosphere(ctx, key, variant) {
  const phase = Math.max(0, Math.min(6, variant));
  if (key === 'meadow') {
    const colors = ['#f8e895', '#fff4c9', '#df8b85'];
    for (let i = 0; i < 8 + phase * 3; i++) {
      const x = (i * 67 + phase * 29) % BG_WIDTH;
      const y = 42 + (i * 31 + phase * 17) % 170;
      rect(ctx, colors[(i + phase) % colors.length], x, y, 3, 1);
      rect(ctx, colors[(i + phase + 1) % colors.length], x + 1, y + 1, 1, 2);
    }
    if (phase >= 1) for (const x of [116, 354]) {
      rect(ctx, '#6d8d79', x, 109, 2, 68); rect(ctx, '#d9d7a4', x - 13, 117, 28, 2);
      rect(ctx, '#d9d7a4', x, 104, 2, 28);
    }
  } else if (key === 'cliff') {
    for (let i = 0; i < 7 + phase * 2; i++) {
      const x = (i * 83 + phase * 23) % BG_WIDTH;
      const y = 35 + (i * 29) % 190;
      rect(ctx, i % 2 ? '#d8e8df' : '#abc8cd', x, y, 18 + (i % 3) * 8, 1);
      if (phase >= 2 && i % 3 === 0) polygon(ctx, '#e7c967', [[x + 5, y + 8], [x + 9, y + 12], [x + 5, y + 16], [x + 1, y + 12]]);
    }
  } else if (key === 'canopy') {
    for (let i = 0; i < 10 + phase * 4; i++) {
      const x = (i * 47 + phase * 41) % BG_WIDTH;
      const y = 30 + (i * 53 + phase * 11) % 230;
      rect(ctx, i % 3 ? '#b8cf85' : '#f3d887', x, y, 2, 2);
      if (phase >= 3 && i % 4 === 0) rect(ctx, '#6f9675', x, 0, 1, y - 4);
    }
  } else {
    for (let i = 0; i < 14 + phase * 3; i++) {
      const x = (i * 41 + phase * 19) % BG_WIDTH;
      const y = 18 + (i * 37) % 190;
      rect(ctx, i % 4 ? '#f7e1b1' : '#f0b7b4', x, y, i % 3 === 0 ? 2 : 1, 1);
    }
  }
}

function rollingRidge(ctx, y, shape, colors) {
  const step = BG_WIDTH / (shape.length - 1);
  for (let x = 0; x < BG_WIDTH; x++) {
    const section = Math.min(shape.length - 2, Math.floor(x / step));
    const fraction = x / step - section;
    const height = Math.floor(y + shape[section] * (1 - fraction) + shape[section + 1] * fraction);
    rect(ctx, colors[0], x, height, 1, BG_HEIGHT - height);
    rect(ctx, colors[1], x, height, 1, 2);
    if (x % 13 < 4) rect(ctx, colors[1], x, height + 6 + (x % 5), 1, 1);
  }
}

function meadowFar(ctx) {
  const p = THEMES.meadow;
  rollingRidge(ctx, 142, [4, 1, -7, -18, -21, -15, -1, 6, 2, -9, -25, -29,
    -19, -3, 11, 20, 16, 6, -9, -16, -11, 0, 8, 11, 4], p.far);
  polygon(ctx, '#b4ceae', [[67, 128], [83, 135], [107, 147], [151, 160], [163, 169],
    [134, 167], [105, 155], [78, 140], [56, 132]]);
  polygon(ctx, '#8fb6a1', [[227, 143], [259, 160], [307, 163], [335, 175],
    [315, 184], [283, 173], [247, 170], [221, 152]]);
  rollingRidge(ctx, 185, [6, 8, 4, -5, -16, -22, -17, -5, 5, 9, 3, -13, -18,
    -10, 3, 11, 10, 1, -14, -22, -15, -2, 5, 7, 6], ['#8fbaa2', '#b1d0ae']);
  // Distant river ribbons follow the valleys rather than a repeating tile grid.
  polygon(ctx, '#b9d8cf', [[268, 175], [284, 175], [304, 186], [281, 197],
    [236, 203], [232, 209], [265, 217], [317, 222], [325, 227],
    [277, 230], [226, 221], [210, 209], [218, 198], [270, 192], [292, 185]]);
  rect(ctx, '#d5e5cc', 263, 200, 18, 1);
  rect(ctx, '#d5e5cc', 276, 222, 29, 1);
}

function tree(ctx, x, y, size, colors) {
  const [dark, mid, light] = colors;
  polygon(ctx, dark, [[x + 20 * size, y + 18 * size], [x + 27 * size, y + 18 * size],
    [x + 26 * size, y + 50 * size], [x + 32 * size, y + 54 * size],
    [x + 17 * size, y + 54 * size], [x + 21 * size, y + 48 * size]]);
  rect(ctx, mid, x + 22 * size, y + 24 * size, 2 * size, 26 * size);
  polygon(ctx, dark, [[x + 1 * size, y + 24 * size], [x, y + 15 * size],
    [x + 5 * size, y + 9 * size], [x + 10 * size, y + 9 * size],
    [x + 13 * size, y + 3 * size], [x + 21 * size, y], [x + 31 * size, y + 2 * size],
    [x + 36 * size, y + 9 * size], [x + 43 * size, y + 10 * size],
    [x + 47 * size, y + 17 * size], [x + 45 * size, y + 24 * size],
    [x + 38 * size, y + 29 * size], [x + 27 * size, y + 28 * size],
    [x + 19 * size, y + 31 * size], [x + 7 * size, y + 29 * size]]);
  polygon(ctx, mid, [[x + 2 * size, y + 17 * size], [x + 7 * size, y + 10 * size],
    [x + 13 * size, y + 11 * size], [x + 16 * size, y + 5 * size],
    [x + 22 * size, y + 2 * size], [x + 30 * size, y + 4 * size],
    [x + 33 * size, y + 11 * size], [x + 41 * size, y + 12 * size],
    [x + 44 * size, y + 19 * size], [x + 37 * size, y + 23 * size],
    [x + 27 * size, y + 21 * size], [x + 18 * size, y + 25 * size], [x + 7 * size, y + 23 * size]]);
  for (const [dx, dy, w] of [[17, 6, 9], [9, 13, 7], [29, 13, 9], [19, 18, 8], [6, 19, 5]]) {
    rect(ctx, light, x + dx * size, y + dy * size, w * size, size);
    rect(ctx, light, x + (dx + 2) * size, y + (dy - 1) * size, 3 * size, size);
  }
}

function meadowMiddle(ctx) {
  const p = THEMES.meadow;
  for (const [x, y, s] of [[-18, 150, 1], [60, 158, 1], [151, 137, 1],
    [260, 160, 1], [372, 146, 1], [453, 141, 1]]) {
    wrapped(ctx, x, 47 * s, (c, xx) => tree(c, xx, y, s, p.middle));
  }
  rollingRidge(ctx, 222, [0, -4, -10, -13, -10, -3, 5, 7, 0, -9, -15, -13,
    -5, 7, 14, 12, 5, -4, -10, -12, -6, 3, 6, 4, 0], p.middle);
  polygon(ctx, '#78a58a', [[0, 255], [56, 243], [111, 248], [161, 240], [212, 251],
    [246, 269], [294, 279], [349, 270], [403, 263], [460, 251], [512, 255], [512, 384], [0, 384]]);
  for (const [x, y] of [[22, 240], [78, 234], [178, 227], [289, 246], [397, 232], [475, 242]]) {
    rect(ctx, '#a2bd94', x, y, 9, 1);
    rect(ctx, '#a2bd94', x + 3, y - 2, 3, 2);
  }
}

function grass(ctx, x, y, colors) {
  polygon(ctx, colors[0], [[x, y], [x - 4, y - 9], [x + 1, y - 5],
    [x + 2, y - 14], [x + 4, y - 7], [x + 9, y - 11], [x + 7, y], [x + 11, y + 2]]);
  rect(ctx, colors[1], x + 3, y - 8, 1, 8);
  rect(ctx, colors[2], x + 3, y - 9, 1, 2);
}

function meadowNear(ctx) {
  const p = THEMES.meadow;
  rollingRidge(ctx, 284, [0, -5, -8, -3, 7, 12, 9, 1, -7, -9, -5, 3, 7, 3, 0], p.near);
  for (const [x, y] of [[4, 283], [41, 281], [105, 290], [163, 286], [215, 278],
    [258, 282], [318, 288], [399, 281], [450, 283], [493, 285]]) {
    wrapped(ctx, x - 4, 20, (c, xx) => grass(c, xx + 4, y, p.near));
  }
  for (const [x, y] of [[27, 280], [171, 274], [317, 278], [442, 279]]) {
    rect(ctx, p.near[1], x, y, 1, 9);
    matrix(ctx, ['.H.', 'HHH', '.Y.'], { H: '#b6be92', Y: '#dcd4a3' }, x - 1, y - 2);
  }
}

function mountain(ctx, x, y, width, height, colors, snow = false) {
  polygon(ctx, colors[0], [[x, y], [x + width * 0.18, y - height * 0.39],
    [x + width * 0.32, y - height * 0.56], [x + width * 0.48, y - height],
    [x + width * 0.57, y - height * 0.95], [x + width * 0.72, y - height * 0.48],
    [x + width * 0.85, y - height * 0.35], [x + width, y], [x + width, BG_HEIGHT], [x, BG_HEIGHT]]);
  polygon(ctx, colors[1], [[x + width * 0.48, y - height], [x + width * 0.32, y - height * 0.56],
    [x + width * 0.18, y - height * 0.39], [x, y], [x + width * 0.26, y - height * 0.12],
    [x + width * 0.41, y - height * 0.55], [x + width * 0.49, y - height * 0.78]]);
  polygon(ctx, colors[2], [[x + width * 0.57, y - height * 0.95],
    [x + width * 0.58, y - height * 0.55], [x + width * 0.68, y - height * 0.24],
    [x + width * 0.60, y - height * 0.12], [x + width * 0.75, y - height * 0.02],
    [x + width * 0.72, y - height * 0.48]]);
  if (snow) {
    polygon(ctx, '#dfe5dc', [[x + width * 0.48, y - height], [x + width * 0.57, y - height * 0.95],
      [x + width * 0.62, y - height * 0.77], [x + width * 0.54, y - height * 0.84],
      [x + width * 0.49, y - height * 0.76], [x + width * 0.45, y - height * 0.86],
      [x + width * 0.39, y - height * 0.76]]);
  }
}

function cliffFar(ctx) {
  for (const [x, y, w, h] of [[-46, 211, 162, 102], [70, 202, 190, 139],
    [239, 216, 174, 99], [367, 212, 178, 141]]) {
    wrapped(ctx, x, w, (c, xx) => mountain(c, xx, y, w, h, THEMES.cliff.far, true));
  }
  rect(ctx, '#a7c2c7', 0, 253, BG_WIDTH, 131);
  polygon(ctx, '#bbd5d1', [[0, 252], [80, 246], [143, 253], [218, 248], [306, 258],
    [389, 251], [458, 256], [512, 252], [512, 265], [0, 265]]);
}

function rockTower(ctx, x, y, w, h, colors) {
  polygon(ctx, colors[0], [[x, y], [x + 3, y - h + 8], [x + w * 0.32, y - h],
    [x + w * 0.77, y - h + 3], [x + w - 2, y - h + 16], [x + w, y], [x + w, 384], [x, 384]]);
  polygon(ctx, colors[1], [[x + 3, y - h + 8], [x + w * 0.32, y - h],
    [x + w * 0.54, y - h + 3], [x + w * 0.44, y - h * 0.57],
    [x + w * 0.57, y - h * 0.36], [x + w * 0.37, y], [x, y]]);
  polygon(ctx, colors[2], [[x + w * 0.77, y - h + 3], [x + w - 2, y - h + 16],
    [x + w, y], [x + w * 0.7, y], [x + w * 0.78, y - h * 0.32], [x + w * 0.62, y - h * 0.6]]);
  const top = Math.round(y - h);
  rect(ctx, '#b9c6b4', x + Math.round(w * 0.3), top, Math.round(w * 0.4), 2);
  for (let n = 0; n < 5; n++) {
    const xx = x + 5 + (n * 13) % Math.max(6, Math.floor(w - 12));
    const yy = top + 24 + n * 21;
    if (yy < y) {
      rect(ctx, colors[2], xx, yy, 10 + n % 3, 2);
      rect(ctx, colors[1], xx, yy - 1, 6, 1);
      rect(ctx, colors[2], xx + 4, yy + 2, 1, 5);
    }
  }
}

function cliffMiddle(ctx) {
  const p = THEMES.cliff;
  for (const [x, y, w, h] of [[-25, 282, 73, 137], [107, 291, 86, 110],
    [242, 292, 67, 172], [393, 287, 77, 121]]) {
    wrapped(ctx, x, w, (c, xx) => rockTower(c, xx, y, w, h, p.middle));
  }
  polygon(ctx, '#92babc', [[0, 293], [54, 280], [117, 289], [157, 297], [207, 287],
    [257, 299], [318, 290], [374, 286], [422, 299], [468, 283], [512, 293], [512, 384], [0, 384]]);
  // Fixed rock arches and bridges are scenery, never gameplay collision surfaces.
  polygon(ctx, '#748f9c', [[170, 268], [196, 250], [222, 251], [251, 268],
    [250, 278], [228, 264], [215, 260], [204, 260], [180, 278]]);
  rect(ctx, '#a9bbbc', 197, 251, 23, 2);
}

function cliffNear(ctx) {
  const p = THEMES.cliff;
  for (const [x, y, w, h] of [[-23, 354, 71, 91], [149, 364, 82, 87], [329, 361, 90, 106]]) {
    wrapped(ctx, x, w, (c, xx) => rockTower(c, xx, y, w, h, p.near));
  }
  rollingRidge(ctx, 352, [0, -4, -7, -1, 6, 9, 3, -6, -4, 2, 0], ['#63878e', '#89a7a3']);
  for (const [x, y] of [[30, 274], [182, 282], [359, 260]]) grass(ctx, x, y, ['#587a70', '#81a090', '#b7c1a1']);
}

function forestTrunk(ctx, x, width, color, light, branchY) {
  polygon(ctx, color, [[x, 384], [x + 4, 133], [x + 3, 0], [x + width - 4, 0],
    [x + width - 1, 149], [x + width, 384]]);
  polygon(ctx, light, [[x + width * 0.35, 0], [x + width * 0.51, 0],
    [x + width * 0.45, 173], [x + width * 0.57, 384], [x + width * 0.32, 384]]);
  polygon(ctx, color, [[x + width * 0.4, branchY + 14], [x - 22, branchY - 15],
    [x - 27, branchY - 36], [x - 24, branchY - 35], [x - 15, branchY - 14],
    [x + width * 0.55, branchY]]);
  polygon(ctx, color, [[x + width * 0.55, branchY + 49], [x + width + 21, branchY + 11],
    [x + width + 28, branchY - 14], [x + width + 25, branchY - 13],
    [x + width + 15, branchY + 13], [x + width * 0.5, branchY + 39]]);
  for (const [dx, y, h] of [[5, 112, 13], [width - 7, 174, 21], [7, 229, 16], [width - 6, 301, 19]]) {
    rect(ctx, light, x + dx, y, 1, h);
  }
}

function canopyFar(ctx) {
  const p = THEMES.canopy;
  for (const [x, w, by] of [[-9, 18, 49], [55, 13, 71], [131, 19, 37],
    [214, 12, 62], [279, 17, 32], [352, 21, 68], [438, 14, 51], [498, 18, 49]]) {
    wrapped(ctx, x - 30, w + 62, (c, xx) => forestTrunk(c, xx + 30, w, p.far[0], p.far[1], by));
  }
  rollingRidge(ctx, 227, [0, 6, 3, -6, -11, -4, 2, 7, 0, -8, -4, 0], ['#75a18d', '#90b294']);
  for (const [x, y] of [[8, 182], [118, 170], [249, 180], [391, 167]]) {
    wrapped(ctx, x, 78, (c, xx) => cloud(c, xx, y, 1, ['#6b9983', '#5a8b7c', '#8fae8d']));
  }
}

function canopyMiddle(ctx) {
  const p = THEMES.canopy;
  for (const [x, w, by] of [[-20, 35, 68], [104, 31, 52], [253, 40, 80], [422, 34, 43]]) {
    wrapped(ctx, x - 30, w + 62, (c, xx) => forestTrunk(c, xx + 30, w, p.middle[0], p.middle[1], by));
    wrapped(ctx, x - 18, w + 67, (c, xx) => tree(c, xx, -24, 2, p.middle));
  }
  rollingRidge(ctx, 277, [1, -6, -11, -2, 6, 0, -9, -6, 3, 8, 5, 1], p.middle);
  for (const [x, y] of [[67, 245], [184, 251], [329, 236], [479, 250]]) {
    polygon(ctx, '#477d68', [[x - 20, y + 14], [x - 15, y], [x - 3, y - 9],
      [x + 10, y - 6], [x + 22, y + 12]]);
    rect(ctx, '#86a17c', x - 5, y - 5, 12, 1);
    rect(ctx, '#42665b', x - 13, y + 7, 6, 2);
  }
}

function fern(ctx, x, y, colors) {
  polygon(ctx, colors[0], [[x, y], [x - 1, y - 28], [x + 1, y - 29], [x + 3, y]]);
  for (let n = 0; n < 5; n++) {
    const yy = y - 5 - n * 5;
    const reach = 13 - n * 2;
    polygon(ctx, colors[1], [[x + 1, yy], [x - reach, yy - 8], [x - reach + 2, yy - 3], [x, yy + 2]]);
    polygon(ctx, colors[1], [[x + 2, yy - 2], [x + reach + 2, yy - 10],
      [x + reach + 1, yy - 4], [x + 2, yy + 1]]);
    rect(ctx, colors[2], x - reach + 3, yy - 5, 3, 1);
  }
}

function canopyNear(ctx) {
  const p = THEMES.canopy;
  rollingRidge(ctx, 321, [0, 4, 8, 2, -5, -8, -1, 6, 2, -3, 0], p.near);
  for (const [x, y] of [[8, 322], [87, 321], [174, 315], [263, 323], [351, 319], [450, 320]]) {
    wrapped(ctx, x - 16, 34, (c, xx) => fern(c, xx + 16, y, p.near));
  }
  for (const [x, y] of [[52, 322], [224, 320], [398, 325]]) {
    rect(ctx, '#859876', x, y - 12, 3, 11);
    polygon(ctx, '#648f83', [[x - 5, y - 10], [x - 4, y - 16], [x, y - 19],
      [x + 5, y - 17], [x + 9, y - 10]]);
    rect(ctx, '#b3bf91', x - 1, y - 17, 4, 1);
    rect(ctx, '#c5c99c', x + 4, y - 13, 2, 1);
  }
}

function roostFar(ctx) {
  const p = THEMES.roost;
  for (const [x, y, w, h] of [[-55, 228, 198, 102], [112, 230, 180, 93], [273, 225, 209, 114], [435, 228, 192, 102]]) {
    wrapped(ctx, x, w, (c, xx) => mountain(c, xx, y, w, h, p.far));
  }
  rollingRidge(ctx, 265, [0, -4, -12, -17, -10, 1, 4, -8, -12, -4, 0], ['#b9b5c0', '#d2c5c7']);
}

function ruins(ctx, x, y, colors) {
  const [dark, mid, light] = colors;
  // Open arches, broken cornices and brick reliefs cut a readable skyline.
  for (const dx of [0, 37, 74]) {
    rect(ctx, dark, x + dx, y - 54, 12, 86);
    rect(ctx, mid, x + dx + 2, y - 54, 6, 84);
    rect(ctx, light, x + dx + 2, y - 53, 2, 82);
    rect(ctx, dark, x + dx - 3, y - 57, 18, 5);
    rect(ctx, light, x + dx - 2, y - 57, 13, 1);
    for (const yy of [y - 38, y - 16, y + 6]) rect(ctx, dark, x + dx + 3, yy, 5, 1);
  }
  for (const dx of [0, 37]) {
    polygon(ctx, dark, [[x + dx + 9, y - 45], [x + dx + 12, y - 57],
      [x + dx + 20, y - 65], [x + dx + 29, y - 65], [x + dx + 38, y - 57],
      [x + dx + 40, y - 45], [x + dx + 35, y - 45], [x + dx + 32, y - 54],
      [x + dx + 28, y - 58], [x + dx + 22, y - 58], [x + dx + 17, y - 53], [x + dx + 15, y - 45]]);
    rect(ctx, light, x + dx + 21, y - 64, 8, 1);
  }
  rect(ctx, dark, x - 5, y + 29, 96, 6);
  rect(ctx, light, x - 4, y + 29, 92, 1);
  polygon(ctx, '#879588', [[x + 74, y - 39], [x + 79, y - 37], [x + 79, y - 15],
    [x + 83, y - 9], [x + 80, y - 9], [x + 76, y - 16]]);
}

function roostMiddle(ctx) {
  const p = THEMES.roost;
  for (const [x, y, w, h] of [[-28, 304, 100, 110], [159, 304, 80, 127], [337, 308, 102, 97]]) {
    wrapped(ctx, x, w, (c, xx) => rockTower(c, xx, y, w, h, p.middle));
  }
  wrapped(ctx, 152, 97, (c, xx) => ruins(c, xx, 191, ['#8b8699', '#b8a5af', '#e4c8bc']));
  wrapped(ctx, 349, 97, (c, xx) => ruins(c, xx, 225, ['#817c95', '#ac9aac', '#d4bcb6']));
  rollingRidge(ctx, 323, [0, -2, -7, -3, 4, 6, 0, -8, -6, 0], ['#9b94a8', '#b6a7b4']);
}

function roostNear(ctx) {
  const p = THEMES.roost;
  rollingRidge(ctx, 356, [0, -6, -9, -1, 4, 7, 1, -5, -8, -2, 0], p.near);
  for (const [x, y] of [[22, 346], [129, 354], [274, 350], [405, 348], [481, 355]]) {
    wrapped(ctx, x - 18, 38, (c, xx) => {
      polygon(c, p.near[0], [[xx, y], [xx + 4, y - 11], [xx + 16, y - 16],
        [xx + 27, y - 9], [xx + 36, y + 1]]);
      polygon(c, p.near[1], [[xx + 4, y - 10], [xx + 16, y - 14],
        [xx + 25, y - 8], [xx + 12, y - 5]]);
      rect(c, p.near[2], xx + 10, y - 11, 9, 1);
    });
  }
  for (const [x, y] of [[80, 351], [222, 354], [376, 349]]) {
    grass(ctx, x, y, ['#6d7880', '#a2a68f', '#d8c3a0']);
  }
}

const LANDSCAPES = {
  meadow: [meadowFar, meadowMiddle, meadowNear],
  cliff: [cliffFar, cliffMiddle, cliffNear],
  canopy: [canopyFar, canopyMiddle, canopyNear],
  roost: [roostFar, roostMiddle, roostNear]
};

/** Owns backdrop display objects, not the camera or gameplay state. */
export function createBackdrop(scene, areaKey, worldWidth, worldHeight) {
  const key = Object.hasOwn(THEMES, areaKey) ? areaKey : 'meadow';
  for (let variant = 0; variant <= 6; variant++) {
    texture(scene, `skybound-bg-${key}-atmosphere-${variant}`, BG_WIDTH, BG_HEIGHT,
      ctx => chapterAtmosphere(ctx, key, variant));
  }
  const painters = [ctx => sky(ctx, key), ctx => cloudLayer(ctx, key), ctx => chapterAtmosphere(ctx, key, 0), ...LANDSCAPES[key]];
  const factors = [0, 0.12, 0.18, 0.22, 0.42, 0.65];
  const vertical = [0, 0.12, 0.15, 0.18, 0.29, 0.4];
  const nearOffset = { meadow: 80, cliff: 96, canopy: 112, roost: 144 }[key];
  const layers = painters.map((paint, i) => {
    const name = `skybound-bg-${key}-${i}`;
    texture(scene, name, BG_WIDTH, BG_HEIGHT, paint);
    const object = scene.add.tileSprite(0, 0, 320, 240, name);
    object.setOrigin(0, 0).setScrollFactor(0).setDepth(-100 + i * 10);
    return object;
  });
  let alive = true;
  let viewWidth = 320;
  let viewHeight = 240;
  let chapterVariant = 0;
  const height = Number.isFinite(worldHeight) ? Math.max(240, worldHeight) : 240;

  function update(camera, time = 0) {
    if (!alive || !camera) return;
    const zoom = camera.zoom > 0 ? camera.zoom : 1;
    const w = Math.ceil((camera.width || 320) / zoom);
    const h = Math.ceil((camera.height || 240) / zoom);
    if (w !== viewWidth || h !== viewHeight) {
      for (const object of layers) object.setSize(w, h);
      viewWidth = w;
      viewHeight = h;
    }
    const scrollX = Number.isFinite(camera.scrollX) ? camera.scrollX : 0;
    const scrollY = Number.isFinite(camera.scrollY) ? camera.scrollY : 0;
    const travelY = Math.max(0, height - h);
    const progressY = travelY ? Math.max(0, Math.min(1, scrollY / travelY)) : 0;
    for (let i = 0; i < layers.length; i++) {
      const drift = i === 1 && key !== 'canopy' && Number.isFinite(time) ? time * (0.0013 + chapterVariant * 0.00012) :
        i === 2 && Number.isFinite(time) ? time * (0.00035 + chapterVariant * 0.00008) : 0;
      // Modulo is horizontal only: a vertical wrap would cut the skyline in two.
      const offset = Math.floor(scrollX * factors[i] + drift);
      layers[i].tilePositionX = ((offset % BG_WIDTH) + BG_WIDTH) % BG_WIDTH;
      const maxY = Math.max(0, BG_HEIGHT - h);
      const baseY = i === 5 ? Math.min(nearOffset, maxY) : 0;
      layers[i].tilePositionY = Math.floor(baseY + progressY * (maxY - baseY) * vertical[i]);
    }
  }

  // Width is deliberately not used to size a giant world texture. A repeating
  // screen-space strip covers even camera shake beyond either world boundary.
  void worldWidth;
  update(scene.cameras?.main, 0);
  return {
    update,
    get chapter() { return chapterVariant; },
    setChapter(variant = 0) {
      chapterVariant = Math.max(0, Math.min(6, Number(variant) || 0));
      layers[2].setTexture(`skybound-bg-${key}-atmosphere-${chapterVariant}`);
      layers[2].setAlpha(chapterVariant === 0 ? 0.62 : Math.min(0.9, 0.65 + chapterVariant * 0.04));
    },
    destroy() {
      if (!alive) return;
      alive = false;
      for (const object of layers) object.destroy();
    }
  };
}
