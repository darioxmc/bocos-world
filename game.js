const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const statusEl = document.getElementById("status");

function readHighScore() {
  try {
    return Number(localStorage.getItem("bocosWorldHighScore") || 0);
  } catch {
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem("bocosWorldHighScore", String(value));
  } catch {
    // High score persistence is optional when storage is blocked.
  }
}

function isMobileOperatingSystem() {
  const ua = navigator.userAgent || navigator.vendor || "";
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /android/i.test(ua) || /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

document.body.classList.toggle("is-mobile-os", isMobileOperatingSystem());

const COLS = 20;
const ROWS = 16;
const CELL_W = canvas.width / COLS;
const CELL_H = canvas.height / ROWS;
const PLAYER_X = 2.1;
const GROUND_ROW = 14;
const ART_GRID = 32;
const SPRITE_CELLS = 12;
const BASE_SPEED = 2.2;
const MAX_SPEED = 4.2;
const START_LIVES = 3;
const MAX_LIVES = 99;
const FIRST_SPAWN_DELAY = 1.25;
const BIRD_ROW = 1.1;
const FLOWER_CHANCE = 0.18;
const FLOWER_ROCK_BUFFER = 5.5;
const OBSTACLE_SPACING = SPRITE_CELLS * 2;
const BUILD_VERSION = "20260620-09";
const CLOUD_W = 10;
const CLOUD_WRAP = COLS + CLOUD_W + 6;
const assetRoot = "assets/";
const SOURCE_GRID_X = [67, 106, 145, 185, 224, 263, 302, 341, 380, 419, 458, 497, 536];
const SOURCE_GRID_Y = [40, 74, 109, 144, 179, 214, 249, 284, 318, 353, 388, 423, 458];

const objectShapes = {
  bird: {
    w: 3,
    h: 2,
    cells: [
      [0, 0, "#111111"],
      [2, 0, "#111111"],
      [1, 1, "#111111"]
    ]
  },
  rock: {
    w: 3,
    h: 2,
    cells: [
      [1, 0, "#777b73"],
      [0, 1, "#777b73"],
      [1, 1, "#777b73"],
      [2, 1, "#777b73"]
    ]
  },
  flower: {
    w: 3,
    h: 4,
    cells: [
      [1, 0, "#e83d36"],
      [0, 1, "#e83d36"],
      [1, 1, "#ffe668"],
      [2, 1, "#e83d36"],
      [1, 2, "#e83d36"],
      [1, 3, "#26d229"]
    ]
  }
};

const bgImage = new Image();
bgImage.src = `${assetRoot}boco_bg.gif`;

const spriteImages = Array.from({ length: 9 }, (_, index) => {
  const image = new Image();
  image.src = `${assetRoot}Boco${index + 1}.bmp`;
  return image;
});

const extractedSprites = new Map();

const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  start: false
};

const keys = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "up",
  ArrowUp: "up",
  Space: "start",
  KeyS: "down",
  ArrowDown: "down",
  Enter: "start"
};

const game = {
  mode: "title",
  lastTime: 0,
  elapsed: 0,
  spawnTimer: 0,
  waveTimer: 0,
  speed: BASE_SPEED,
  cloudOffset: 0,
  score: 0,
  highScore: readHighScore(),
  lives: START_LIVES,
  player: {
    colOffset: 0,
    y: 0,
    vy: 0,
    state: "run1",
    hurtTimer: 0,
    runFrame: 0,
    duckTimer: 0,
    flyTimer: 0,
    wasUp: false
  },
  obstacles: [],
  flowers: []
};

const palettes = [
  { sky: "#7ddbd5", ground: "#0f821e", dirt: "#75400f", cloud: "#f3f7e7", cloudShade: "#92ced2" },
  { sky: "#77b9df", ground: "#699c28", dirt: "#6f5320", cloud: "#fff8da", cloudShade: "#abcbe3" },
  { sky: "#8cd97e", ground: "#1b7e4a", dirt: "#5c3f26", cloud: "#f6f4ea", cloudShade: "#8fc9a5" },
  { sky: "#b9c070", ground: "#527c35", dirt: "#5c3d29", cloud: "#f0eed5", cloudShade: "#aaa974" },
  { sky: "#405268", ground: "#121919", dirt: "#2d231b", cloud: "#b9c3cc", cloudShade: "#59616f" }
];

const bocoFrames = {
  run1: [
    "......YYY...",
    "....YYWWWY..",
    "...YWWWWBWY.",
    "..YWWWWWWYY.",
    ".YYWWWWY....",
    "YWWWWWWY....",
    ".YWWWWY.....",
    "..YY.YY.....",
    "..B...B....."
  ],
  run2: [
    "......YYY...",
    "....YYWWWY..",
    "...YWWWWBWY.",
    "..YWWWWWWYY.",
    ".YYWWWWY....",
    "YWWWWWWY....",
    ".YWWWWY.....",
    ".B..YY......",
    "....B......."
  ],
  duck: [
    "............",
    "............",
    ".....YYY....",
    "...YYWWWY...",
    "..YWWWWBWY..",
    ".YWWWWWWWY..",
    "YWWWWWWYY...",
    ".BB....BB..."
  ],
  jump: [
    "......YYY...",
    "....YYWWWY..",
    "...YWWWWBWY.",
    "..YWWWWWWYY.",
    ".YYWWWWY....",
    "YWWWWWWY....",
    ".YWWWWY.....",
    "..B...B.....",
    ".B.....B...."
  ],
  glide: [
    "......YYY...",
    "...YYYWWWY..",
    "YY.YWWWWBWY.",
    ".YWWWWWWWYY.",
    "..YWWWWY....",
    "...YWWWWY...",
    "...YWWY.....",
    "..B...B....."
  ],
  hurt: [
    "......RRR...",
    "....RRWWWR..",
    "...RWWWWBRR.",
    "..RWWWWWWRR.",
    ".RRWWWWR....",
    "RWWWWWWR....",
    ".RWWWWR.....",
    "..B...B....."
  ]
};

const colorMap = {
  Y: "#f4dc27",
  W: "#fff9e8",
  B: "#101010",
  R: "#d94b3e"
};

let audioContext = null;
let audioCursor = 0;

function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function pcSpeakerFrequency(divisor) {
  return 1193180 / divisor;
}

function playTone(divisor, duration = 0.075, startAt = 0) {
  const context = ensureAudio();
  if (!context) return 0;

  const start = Math.max(context.currentTime, audioCursor) + startAt;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = pcSpeakerFrequency(divisor);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.055, start + 0.006);
  gain.gain.setValueAtTime(0.055, start + duration - 0.012);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
  audioCursor = start + duration + 0.025;
  return duration + 0.025;
}

function playSequence(divisors, duration = 0.075) {
  ensureAudio();
  audioCursor = Math.max(audioCursor, audioContext?.currentTime || 0);
  for (const divisor of divisors) playTone(divisor, duration);
}

function playSound(name) {
  const sounds = {
    start: [900, 1200, 1000, 800, 1100, 750],
    jump: [396, 3136],
    glide: [3136],
    hit: [2800],
    flower: [2000, 1568, 1200, 900],
    gameover: [2400, 2800, 3200, 4000]
  };
  const sequence = sounds[name];
  if (sequence) playSequence(sequence);
}

function startGame() {
  playSound("start");
  Object.assign(game, {
    mode: "playing",
    elapsed: 0,
    spawnTimer: FIRST_SPAWN_DELAY,
    waveTimer: 0,
    speed: BASE_SPEED,
    cloudOffset: 0,
    score: 0,
    lives: START_LIVES,
    obstacles: [],
    flowers: []
  });
  Object.assign(game.player, {
    colOffset: 0,
    y: 0,
    vy: 0,
    state: "run1",
    hurtTimer: 0,
    runFrame: 0,
    duckTimer: 0,
    flyTimer: 0,
    wasUp: false
  });
  game.lastTime = performance.now();
  updateHud();
}

function beginGame() {
  startGame();
}

function imagesReady() {
  return bgImage.complete && spriteImages.every((image) => image.complete);
}

function extractSprite(index) {
  if (extractedSprites.has(index)) return extractedSprites.get(index);
  if (!spriteImages[index].complete) return null;

  const work = document.createElement("canvas");
  work.width = canvas.width;
  work.height = canvas.height;
  const workCtx = work.getContext("2d", { willReadFrequently: true });
  workCtx.drawImage(spriteImages[index], 0, 0, canvas.width, canvas.height);

  const sprite = document.createElement("canvas");
  sprite.width = SPRITE_CELLS * ART_GRID;
  sprite.height = SPRITE_CELLS * ART_GRID;
  const spriteCtx = sprite.getContext("2d");
  const hurtSprite = document.createElement("canvas");
  hurtSprite.width = sprite.width;
  hurtSprite.height = sprite.height;
  const hurtCtx = hurtSprite.getContext("2d");
  const cells = [];
  let minCol = SPRITE_CELLS;
  let minRow = SPRITE_CELLS;
  let maxCol = 0;
  let maxRow = 0;

  for (let row = 0; row < SOURCE_GRID_Y.length - 1; row++) {
    for (let col = 0; col < SOURCE_GRID_X.length - 1; col++) {
      const left = SOURCE_GRID_X[col];
      const right = SOURCE_GRID_X[col + 1];
      const top = SOURCE_GRID_Y[row];
      const bottom = SOURCE_GRID_Y[row + 1];
      const sample = workCtx.getImageData(
        Math.floor((left + right) / 2),
        Math.floor((top + bottom) / 2),
        1,
        1
      ).data;
      const color = spriteCellColor(sample[0], sample[1], sample[2]);
      if (!color) continue;
      cells.push({ col, row });
      minCol = Math.min(minCol, col);
      minRow = Math.min(minRow, row);
      maxCol = Math.max(maxCol, col);
      maxRow = Math.max(maxRow, row);
      spriteCtx.fillStyle = color;
      spriteCtx.fillRect(col * ART_GRID, row * ART_GRID, ART_GRID, ART_GRID);
      hurtCtx.fillStyle = color === "#fffdf0" ? "#d84736" : color;
      hurtCtx.fillRect(col * ART_GRID, row * ART_GRID, ART_GRID, ART_GRID);
    }
  }

  const output = {
    image: sprite,
    hurtImage: hurtSprite,
    sourceX: SOURCE_GRID_X[0],
    sourceY: SOURCE_GRID_Y[0],
    bounds: cells.length ? { minCol, minRow, maxCol, maxRow } : { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }
  };
  extractedSprites.set(index, output);
  return output;
}

function spriteCellColor(r, g, b) {
  if (r > 185 && g > 165 && b < 85) return "#f5e617";
  if (r > 215 && g > 215 && b > 200) return "#fffdf0";
  if (r > 70 && r < 150 && g > 35 && g < 100 && b < 70) return "#8a4a0b";
  if (r < 55 && g < 55 && b < 55) return "#101010";
  if (r < 60 && g > 75 && g < 150 && b > 75 && b < 150) return "#166c6c";
  return null;
}

function gameOver() {
  game.mode = "gameover";
  game.highScore = Math.max(game.highScore, game.score);
  saveHighScore(game.highScore);
  playSound("gameover");
}

function spawnPattern() {
  const phase = Math.floor(game.elapsed / 12) % 4;
  const baseX = COLS + 2;
  const wave = [];
  if (phase === 0) {
    wave.push(rock(baseX));
  } else if (phase === 1) {
    wave.push(bird(baseX));
  } else if (phase === 2) {
    wave.push(rock(baseX));
  } else {
    wave.push(bird(baseX));
  }

  game.obstacles.push(...wave);
  spawnFlowerForWave(baseX, wave);
}

function rock(x) {
  return { type: "rock", x, y: GROUND_ROW - objectShapes.rock.h, w: objectShapes.rock.w, h: objectShapes.rock.h, scored: false };
}

function bird(x) {
  return { type: "bird", x, y: BIRD_ROW, w: objectShapes.bird.w, h: objectShapes.bird.h, scored: false };
}

function flower(x) {
  return { type: "flower", x, y: GROUND_ROW - objectShapes.flower.h, w: objectShapes.flower.w, h: objectShapes.flower.h, collected: false };
}

function spawnFlowerForWave(baseX, wave) {
  if (Math.random() >= FLOWER_CHANCE) return;
  if (wave.some((item) => item.type === "rock")) return;

  const candidates = [baseX + OBSTACLE_SPACING / 2];
  const fairSpot = candidates.find((x) => !wave.some((item) => item.type === "rock" && x > item.x && x - item.x < FLOWER_ROCK_BUFFER));
  if (fairSpot !== undefined) game.flowers.push(flower(fairSpot));
}

function obstacleSpawnDelay() {
  return OBSTACLE_SPACING / game.speed;
}

function update(dt) {
  if (input.start && game.mode !== "playing") {
    input.start = false;
    startGame();
  }

  if (game.mode !== "playing") return;

  game.elapsed += dt;
  game.spawnTimer -= dt;
  game.waveTimer += dt;
  game.speed = Math.min(MAX_SPEED, BASE_SPEED + game.elapsed * 0.07);
  game.cloudOffset = (game.cloudOffset + dt * 0.28) % 24;

  if (game.spawnTimer <= 0) {
    spawnPattern();
    game.spawnTimer = obstacleSpawnDelay();
  }

  updatePlayer(dt);
  updateWorld(dt);
  updateCollisions();
  updateHud();
}

function updatePlayer(dt) {
  const player = game.player;
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.colOffset += move * 22 * dt;
  player.colOffset = Math.max(-11, Math.min(11, player.colOffset));
  const upPressed = input.up && !player.wasUp;

  if (upPressed && player.y === 0) {
    player.vy = 24;
    playSound("jump");
  } else if (upPressed && player.y > 0 && player.flyTimer <= 0) {
    player.flyTimer = 0.72;
    player.vy = Math.max(player.vy, -2);
    playSound("glide");
  }

  player.y += player.vy * dt;
  player.vy -= player.flyTimer > 0 ? 14 * dt : 55 * dt;
  if (player.y < 0) {
    player.y = 0;
    player.vy = 0;
    player.flyTimer = 0;
  }

  if (player.hurtTimer > 0) {
    player.hurtTimer -= dt;
    player.state = "hurt";
    player.wasUp = input.up;
    return;
  }

  if (input.down && player.y === 0) {
    player.duckTimer = 0.12;
  }

  if (player.flyTimer > 0) {
    player.flyTimer -= dt;
    player.state = "glide";
  } else if (player.duckTimer > 0) {
    player.duckTimer -= dt;
    player.state = "duck";
  } else if (player.y > 3 && player.vy < -6) {
    player.state = "jump";
  } else if (player.y > 0) {
    player.state = "jump";
  } else {
    player.runFrame += dt * 8;
    player.state = Math.floor(player.runFrame) % 2 === 0 ? "run1" : "run2";
  }
  player.wasUp = input.up;
}

function updateWorld(dt) {
  const dx = game.speed * dt;
  for (const item of game.obstacles) item.x -= dx;
  for (const item of game.flowers) item.x -= dx;
  for (const item of game.obstacles) {
    if (!item.scored && item.x + item.w < PLAYER_X + game.player.colOffset) {
      item.scored = true;
      game.score += 5;
    }
  }

  game.obstacles = game.obstacles.filter((item) => item.x > -10);
  game.flowers = game.flowers.filter((item) => item.x > -10 && !item.collected);
}

function updateCollisions() {
  if (game.player.flyTimer > 0 || game.player.state === "glide") {
    for (const item of game.obstacles) {
      if (item.type === "bird" && playerTouches(item.type, item)) {
        item.x = -20;
        game.lives -= 1;
        game.player.hurtTimer = 0.55;
        playSound("hit");
        if (game.lives <= 0) gameOver();
        break;
      }
    }
    updateFlowerCollisions();
    return;
  }

  for (const item of game.obstacles) {
    if (playerTouches(item.type, item)) {
      item.x = -20;
      game.lives -= 1;
      game.player.hurtTimer = 0.55;
      playSound("hit");
      if (game.lives <= 0) gameOver();
      break;
    }
  }
  updateFlowerCollisions();
}

function updateFlowerCollisions() {
  for (const item of game.flowers) {
    if (!item.collected && playerTouches("flower", item)) {
      item.collected = true;
      game.lives = Math.min(MAX_LIVES, game.lives + 1);
      playSound("flower");
    }
  }
}

function playerTouches(kind, item) {
  return playerProbePoints(kind).some((point) => pointInsideItem(point, item));
}

function playerProbePoints(kind) {
  const baseX = PLAYER_X + game.player.colOffset;
  const top = GROUND_ROW - SPRITE_CELLS - game.player.y;

  if (kind === "rock") {
    const footColsByState = {
      run1: [5.5, 6.5],
      run2: [3.5, 4.5, 6.5, 7.5],
      duck: [4.5, 5.5, 8.5],
      jump: [4.5, 7.5],
      glide: [3.5, 8.5],
      hurt: [5.5, 6.5]
    };
    return (footColsByState[game.player.state] || footColsByState.run1).map((col) => ({
      x: baseX + col,
      y: top + 11.5
    }));
  }

  if (kind === "bird") {
    if (game.player.state === "duck") return [];
    return [
      { x: baseX + 5.5, y: top + 1.25 },
      { x: baseX + 6.5, y: top + 1.5 },
      { x: baseX + 7.5, y: top + 0.5 },
      { x: baseX + 8.5, y: top + 0.5 },
      { x: baseX + 9.5, y: top + 0.5 }
    ];
  }

  if (kind === "flower") {
    return [
      { x: baseX + 4.5, y: top + 8.5 },
      { x: baseX + 5.5, y: top + 7.5 },
      { x: baseX + 7.5, y: top + 6.5 },
      { x: baseX + 8.5, y: top + 5.5 }
    ];
  }

  return [];
}

function pointInsideItem(point, item) {
  const shape = objectShapes[item.type];
  if (!shape) return false;
  const pad = item.type === "bird" ? 0.12 : 0.08;
  return shape.cells.some(([col, row]) => (
    point.x >= item.x + col - pad &&
    point.x <= item.x + col + 1 + pad &&
    point.y >= item.y + row - pad &&
    point.y <= item.y + row + 1 + pad
  ));
}

function draw() {
  const palette = palettes[Math.min(palettes.length - 1, Math.floor(game.score / 200))];
  drawBackground(palette);
  drawWorld();
  drawPlayer();
  drawGrid();

  if (game.mode === "title") {
    centerMessage("BOCO'S WORLD", "PRESS START");
  } else if (game.mode === "gameover") {
    centerMessage("GAME OVER", rankForScore(game.score));
  }
}

function drawBackground(palette) {
  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cloudSets = [
    [2, 1], [9, 4], [17, 2], [26, 3]
  ];
  for (const [col, row] of cloudSets) {
    const wrapped = ((col - game.cloudOffset + CLOUD_W) % CLOUD_WRAP + CLOUD_WRAP) % CLOUD_WRAP - CLOUD_W;
    drawCloud(wrapped, row, palette);
  }

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, GROUND_ROW * CELL_H, canvas.width, canvas.height - GROUND_ROW * CELL_H);
  ctx.fillStyle = palette.dirt;
  for (let col = 0; col < COLS; col += 6) {
    fillCell(col, GROUND_ROW + 2, 2, 3);
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 0, canvas.width, CELL_H * 0.35);
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.42)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += ART_GRID) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += ART_GRID) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCloud(col, row, palette) {
  const shade = [
    [1, 0], [2, 0], [5, 0], [6, 0], [7, 0],
    [0, 1], [1, 1], [3, 1], [4, 1], [8, 1],
    [0, 2], [9, 2], [0, 3], [9, 3],
    [1, 4], [5, 4], [6, 4], [8, 4],
    [2, 5], [3, 5], [4, 5], [7, 5]
  ];
  const white = [
    [2, 1], [5, 1], [6, 1], [7, 1],
    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
    [2, 4], [3, 4], [4, 4], [7, 4]
  ];
  ctx.fillStyle = palette.cloudShade;
  for (const [x, y] of shade) fillCell(col + x, row + y, 1, 1);
  ctx.fillStyle = palette.cloud;
  for (const [x, y] of white) fillCell(col + x, row + y, 1, 1);
}

function drawWorld() {
  for (const item of game.flowers) drawFlower(item);
  for (const item of game.obstacles) {
    if (item.type === "rock") drawRock(item);
    if (item.type === "bird") drawBird(item);
  }
}

function drawRock(item) {
  drawObjectShape(item);
}

function drawBird(item) {
  drawObjectShape(item);
}

function drawFlower(item) {
  drawObjectShape(item);
}

function drawObjectShape(item) {
  const shape = objectShapes[item.type];
  if (!shape) return;
  for (const [col, row, color] of shape.cells) {
    ctx.fillStyle = color;
    fillCell(Math.round(item.x) + col, Math.round(item.y) + row, 1, 1);
  }
}

function drawPlayer() {
  const sprite = spriteForState(game.player.state);
  if (sprite) {
    const x = (PLAYER_X + game.player.colOffset) * CELL_W;
    const y = (GROUND_ROW - SPRITE_CELLS - game.player.y) * CELL_H;
    ctx.drawImage(game.player.state === "hurt" ? sprite.hurtImage : sprite.image, snapToCell(x), snapToCell(y));
    return;
  }

  const frame = bocoFrames[game.player.state] || bocoFrames.run1;
  const baseX = PLAYER_X + game.player.colOffset;
  const baseY = GROUND_ROW - frame.length - game.player.y;
  frame.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === ".") return;
      ctx.fillStyle = colorMap[cell];
      fillCell(baseX + x, baseY + y, 1, 1);
    });
  });
}

function spriteForState(state) {
  const map = {
    run1: 0,
    run2: 1,
    duck: 3,
    jump: 4,
    glide: 6,
    hurt: 8
  };
  return extractSprite(map[state] ?? 0);
}

function centerMessage(title, subtitle) {
  ctx.save();
  ctx.fillStyle = "rgba(10, 12, 10, 0.78)";
  ctx.fillRect(0, 7 * CELL_H, canvas.width, 7 * CELL_H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f1d434";
  ctx.font = "700 58px 'Courier New', monospace";
  ctx.fillText(title, canvas.width / 2, 10 * CELL_H);
  ctx.fillStyle = "#f7f0d6";
  ctx.font = "700 28px 'Courier New', monospace";
  ctx.fillText(subtitle, canvas.width / 2, 12.2 * CELL_H);
  ctx.restore();
}

function fillCell(col, row, w = 1, h = 1) {
  ctx.fillRect(Math.round(col * CELL_W), Math.round(row * CELL_H), Math.ceil(w * CELL_W), Math.ceil(h * CELL_H));
}

function snapToCell(value) {
  return Math.round(value / ART_GRID) * ART_GRID;
}

function updateHud() {
  livesEl.textContent = `Lives:  ${String(game.lives).padStart(2, "0")}`;
  scoreEl.textContent = `Score ${String(game.score).padStart(4, "0")}`;
  statusEl.textContent = game.mode === "playing" ? `High ${String(game.highScore).padStart(4, "0")}` : `Press Start | ${BUILD_VERSION}`;
}

function rankForScore(score) {
  if (score >= 1000) return "OUTRAGEOUS";
  if (score >= 500) return "EXCELLENT";
  if (score >= 100) return "AVERAGE";
  return "POOR";
}

function frame(time) {
  const dt = Math.min(0.033, Math.max(0, (time - game.lastTime) / 1000 || 0));
  game.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function setInput(code, isDown) {
  const key = keys[code] || code;
  if (!Object.prototype.hasOwnProperty.call(input, key)) return;
  input[key] = isDown;
}

function setInputKeys(keyList, isDown) {
  for (const key of keyList) {
    if (Object.prototype.hasOwnProperty.call(input, key)) input[key] = isDown;
  }
}

window.addEventListener("keydown", (event) => {
  if (game.mode !== "playing" && (event.code === "KeyS" || event.code === "KeyR" || event.code === "Enter" || event.code === "Space")) {
    event.preventDefault();
    beginGame();
    return;
  }

  if (keys[event.code]) {
    event.preventDefault();
    setInput(event.code, true);
  }
});

window.addEventListener("keyup", (event) => {
  if (keys[event.code]) {
    event.preventDefault();
    setInput(event.code, false);
  }
});

for (const button of document.querySelectorAll("[data-key]")) {
  const key = button.dataset.key;
  const down = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("is-down");
    input[key] = true;
    if (key === "start" && game.mode !== "playing") beginGame();
  };
  const up = (event) => {
    event.preventDefault();
    button.releasePointerCapture?.(event.pointerId);
    button.classList.remove("is-down");
    input[key] = false;
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", up);
}

for (const button of document.querySelectorAll("[data-keys]")) {
  const keyList = button.dataset.keys.split(/\s+/).filter(Boolean);
  const down = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("is-down");
    setInputKeys(keyList, true);
  };
  const up = (event) => {
    event.preventDefault();
    button.releasePointerCapture?.(event.pointerId);
    button.classList.remove("is-down");
    setInputKeys(keyList, false);
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", up);
}

updateHud();
requestAnimationFrame(frame);
