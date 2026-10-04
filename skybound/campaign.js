// Authored room sequences. Coordinates are local pixels; rises are relative to
// the area's floor. Required routes never depend on lifts or wind timing.
const ROOM_WIDTH = 1024;
const ROOMS_PER_CHAPTER = 6;
export const ROOST_EMBLEM_GOAL = 12;
const ROOMS = {
  terraces: {
    ground: [[0, 192, 0], [192, 160, 16], [352, 160, 48], [512, 160, 16], [672, 352, 0]],
    ledges: [[368, 80, 80], [464, 112, 96], [576, 144, 112], [704, 112, 96], [816, 80, 80], [912, 48, 80]],
    prize: [624, 144], encounters: [272, 784], flower: 944,
  },
  brook: {
    ground: [[0, 304, 0], [352, 304, 0], [704, 320, 0]],
    ledges: [[176, 32, 80], [272, 64, 80], [368, 96, 96], [480, 128, 112], [608, 96, 80], [704, 64, 80], [800, 32, 80]],
    prize: [528, 128], encounters: [224, 816], flower: 944,
  },
  ridge: {
    ground: [[0, 192, 0], [192, 160, 32], [352, 160, 64], [512, 160, 96], [672, 128, 64], [800, 128, 32], [928, 96, 0]],
    ledges: [[368, 96, 80], [464, 128, 96], [576, 160, 112], [704, 128, 80]],
    prize: [624, 160], encounters: [272, 736], flower: 968,
  },
  hollow: {
    ground: [[0, 192, 0], [192, 192, -32], [384, 256, -64], [640, 192, -32], [832, 192, 0]],
    ledges: [[192, 32, 96], [304, 64, 96], [416, 96, 112], [544, 64, 96], [656, 32, 96], [768, 0, 80]],
    prize: [464, 96], encounters: [288, 736], flower: 944,
  },
  causeway: {
    ground: [[0, 224, 0], [272, 176, 16], [496, 208, 16], [752, 272, 0]],
    ledges: [[112, 32, 80], [208, 64, 96], [320, 96, 96], [432, 128, 112], [560, 96, 96], [672, 64, 96], [784, 32, 96]],
    prize: [480, 128], encounters: [352, 848], flower: 968,
  },
  windwalk: {
    ground: [[0, 1024, 0]],
    ledges: [[176, 32, 80], [272, 64, 80], [368, 96, 80], [464, 128, 96], [656, 128, 96], [768, 96, 80], [864, 64, 80]],
    lift: [560, 128, 80, { axis: 'x', distance: 80, speed: 22 }],
    gust: [560, 144, 80, 144], prize: [704, 128], encounters: [288, 832], flower: 944,
  },
  saddle: {
    ground: [[0, 224, 0], [224, 160, 32], [384, 192, 0], [576, 160, 32], [736, 288, 0]],
    ledges: [[240, 64, 96], [352, 96, 96], [464, 128, 112], [592, 96, 96], [704, 64, 96], [816, 32, 80]],
    prize: [512, 128], encounters: [304, 832], flower: 960,
  },
  skySteps: {
    ground: [[0, 256, 0], [256, 192, 32], [448, 224, 64], [672, 192, 32], [864, 160, 0]],
    ledges: [[272, 64, 80], [368, 96, 80], [464, 128, 96], [576, 160, 112], [704, 128, 80], [800, 96, 80], [896, 64, 96]],
    gust: [592, 160, 48, 96], prize: [624, 160], encounters: [352, 768], flower: 960,
  },
};

// Every act culminates in a recognizable required platform room. Step heights
// stay within Boco's real 64px jump arc; springs, lifts, and gusts add timing
// without making a moving object the only possible recovery route.
const LANDMARKS = {
  trail: {
    ground: [[0, 304, 0], [688, 336, 0]],
    ledges: [[304, 32, 96], [416, 64, 96], [528, 96, 96], [640, 64, 96]],
    prize: [576, 128],
  },
  duel: {
    ground: [[0, 320, 0], [672, 352, 0]],
    ledges: [[320, 32, 80], [416, 80, 80], [512, 32, 80], [608, 80, 96]],
    prize: [648, 112],
  },
  lift: {
    ground: [[0, 400, 0], [624, 400, 0]],
    ledges: [[320, 48, 96], [512, 64, 96], [624, 96, 96], [720, 32, 64]],
    lift: [416, 96, 80, { axis: 'x', distance: 128, speed: 30 }],
    prize: [660, 128],
  },
  spring: {
    ground: [[0, 384, 0], [720, 304, 0]],
    ledges: [[432, 32, 96], [544, 64, 80], [640, 32, 112], [752, 32, 64]],
    spring: 352,
    prize: [584, 96],
  },
  gust: {
    ground: [[0, 352, 0], [688, 336, 0]],
    ledges: [[368, 48, 80], [464, 96, 80], [560, 128, 80], [656, 64, 80]],
    gust: [464, 160, 80, 160],
    prize: [600, 160],
  },
  relay: {
    ground: [[0, 352, 0], [720, 304, 0]],
    ledges: [[368, 48, 72], [464, 80, 80], [576, 64, 72], [672, 96, 80]],
    lift: [464, 80, 80, { axis: 'y', distance: 48, speed: 28 }],
    spring: 320,
    gust: [576, 144, 64, 144],
    prize: [704, 128],
  },
};

// Each chapter mixes a different route rhythm and enemy pairing. Mirrored
// rooms provide descending approaches rather than repeating the same climbs.
const CHAPTERS = {
  meadow: [
    ['Petal Outskirts', ['terraces', 'brook', 'saddle', 'hollow', 'ridge', 'windwalk', 'skySteps']],
    ['Windmill Way', ['windwalk', 'saddle', 'terraces', 'causeway', 'skySteps', 'brook', 'hollow']],
    ['Honeybank Hollow', ['hollow', 'brook', 'ridge', 'terraces', 'saddle', 'causeway', 'windwalk']],
    ['Sunflower Heights', ['ridge', 'skySteps', 'windwalk', 'saddle', 'causeway', 'hollow', 'terraces']],
    ['Bramble Crossing', ['causeway', 'terraces', 'hollow', 'ridge', 'brook', 'skySteps', 'saddle']],
    ['Golden Approach', ['skySteps', 'windwalk', 'causeway', 'brook', 'terraces', 'ridge', 'hollow']],
  ],
  cliff: [
    ['Windswept Pass', ['skySteps', 'ridge', 'hollow', 'causeway', 'windwalk', 'terraces', 'saddle']],
    ['Echo Ravine', ['hollow', 'causeway', 'brook', 'ridge', 'saddle', 'windwalk', 'skySteps']],
    ['Kitekeeper Trail', ['windwalk', 'terraces', 'skySteps', 'saddle', 'ridge', 'brook', 'causeway']],
    ['Splitstone Peaks', ['ridge', 'saddle', 'causeway', 'skySteps', 'hollow', 'terraces', 'brook']],
    ['Cloudbreak Crossing', ['brook', 'windwalk', 'skySteps', 'causeway', 'terraces', 'hollow', 'ridge']],
    ['Galeweaver Ascent', ['terraces', 'ridge', 'windwalk', 'hollow', 'saddle', 'causeway', 'skySteps']],
  ],
  canopy: [
    ['Fernroot Trail', ['terraces', 'hollow', 'saddle', 'ridge', 'brook', 'skySteps', 'windwalk']],
    ['Lantern Grove', ['windwalk', 'skySteps', 'brook', 'terraces', 'causeway', 'saddle', 'hollow']],
    ['Tangled Waterway', ['brook', 'causeway', 'hollow', 'windwalk', 'ridge', 'terraces', 'skySteps']],
    ['Mothlight Boughs', ['skySteps', 'windwalk', 'ridge', 'saddle', 'hollow', 'brook', 'causeway']],
    ['Thornroot Maze', ['saddle', 'ridge', 'terraces', 'hollow', 'causeway', 'skySteps', 'brook']],
    ['Heartwood Trail', ['hollow', 'terraces', 'windwalk', 'causeway', 'skySteps', 'saddle', 'ridge']],
  ],
};
const ENCOUNTERS = {
  meadow: [['beetle', 'hopper'], ['hopper', 'beetle'], ['beetle', 'shellback'], ['hopper', 'bird'], ['shellback', 'hopper'], ['bird', 'beetle']],
  cliff: [['shellback', 'moth'], ['hopper', 'shellback'], ['moth', 'beetle'], ['shellback', 'bird'], ['bird', 'hopper'], ['moth', 'shellback']],
  canopy: [['plant', 'hopper'], ['bird', 'beetle'], ['shellback', 'plant'], ['moth', 'hopper'], ['plant', 'bird'], ['shellback', 'moth']],
};

// A chapter is more than a room ordering. These identities drive its route
// feature, title card, backdrop details, and musical arrangement.
const CHAPTER_IDENTITIES = {
  meadow: [
    ['Open Trail', 'A bright run through low flowered terraces.', 'trail'],
    ['Turning Sails', 'Moving platforms keep time with the windmills.', 'lift'],
    ['Honeyguard Duel', 'Armored patrols hold the low road.', 'duel'],
    ['Bloom Bounce', 'Spring blooms open a playful high route.', 'spring'],
    ['Bramble Drafts', 'Updrafts and fliers rule the crossing.', 'gust'],
    ['Golden Relay', 'Every meadow skill returns in quick succession.', 'relay'],
  ],
  cliff: [
    ['Crosswind Run', 'Ride the gusts between broken shelves.', 'gust'],
    ['Echo Descent', 'A grounded duel through the quiet ravine.', 'duel'],
    ['Kite Lifts', 'Moving ledges climb the open sky.', 'lift'],
    ['Splitstone Springs', 'Bounce from crag to crag above the pass.', 'spring'],
    ['Cloudbreak Flight', 'Aerial patrols sweep the exposed crossing.', 'gust'],
    ['Gale Relay', 'The mountain tests every route at once.', 'relay'],
  ],
  canopy: [
    ['Rootbound Trail', 'A close, winding run beneath old branches.', 'trail'],
    ['Lantern Lifts', 'Living platforms rise through the glowing grove.', 'lift'],
    ['Waterway Guard', 'Heavy sentries crowd the forest floor.', 'duel'],
    ['Mothlight Springs', 'Spring blooms reach the lantern boughs.', 'spring'],
    ['Thornwind Maze', 'Hidden drafts carry danger through the leaves.', 'gust'],
    ['Heartwood Relay', 'Roots, wind, and wings meet at the old tree.', 'relay'],
  ],
};

function encounterFor(area, mechanic, roomIndex, index) {
  const ordinary = ENCOUNTERS[area][roomIndex % 6][index];
  if (mechanic === 'duel') return index === 0 ? (area === 'canopy' ? 'plant' : 'shellback') : (area === 'cliff' ? 'shellback' : 'hopper');
  if (mechanic === 'gust') return (roomIndex + index) % 2 ? 'bird' : 'moth';
  if (mechanic === 'spring') return index === 0 ? 'hopper' : (area === 'canopy' ? 'moth' : 'bird');
  if (mechanic === 'lift') return index === 0 ? ordinary : (area === 'meadow' ? 'beetle' : 'moth');
  return ordinary;
}

export function extendLevel(original) {
  if (!CHAPTERS[original.id]) return original;
  const level = structuredClone(original);
  level.springs = level.springs || [];
  // Rare flowers are now safety nets; ordinary recovery comes from winning
  // encounters instead of walking through a flower every few seconds.
  level.flowers = level.flowers.filter(point => point.id.endsWith('flower-start') || point.id.endsWith('flower-boss-rest'));
  // Keep one demanding emblem in each opening route. Acts 2, 4, and 6 add one
  // apiece, making exactly four meaningful emblems per main area.
  level.emblems = level.emblems.slice(-1);
  const insertAt = level.terrain.at(-1).x;
  const floor = level.terrain.at(-1).y;
  const length = CHAPTERS[level.id].length * ROOMS_PER_CHAPTER * ROOM_WIDTH;
  for (const key of ['terrain', 'platforms', 'enemies', 'flowers', 'emblems', 'checkpoints', 'gusts', 'springs']) {
    for (const entry of level[key]) {
      if (entry.x >= insertAt || entry.id?.endsWith('-boss') || entry.id?.endsWith('-boss-rest')) entry.x += length;
    }
  }
  level.width += length;
  level.boss.x += length;
  level.boss.arena.x += length;
  level.exit.x += length;
  level.chapters = [{ id: `${level.id}-opening`, name: level.name, x: 0, endX: insertAt, kind: 'opening', variant: 0 }];
  let cursor = insertAt;
  CHAPTERS[level.id].forEach(([name, roomNames], chapterIndex) => {
    const activeRooms = roomNames.slice(0, ROOMS_PER_CHAPTER);
    const chapterId = `${level.id}-chapter-${chapterIndex + 1}`;
    const [style, tagline, mechanic] = CHAPTER_IDENTITIES[level.id][chapterIndex];
    level.chapters.push({ id: chapterId, name, style, tagline, mechanic, kind: 'act', act: chapterIndex + 1,
      count: CHAPTERS[level.id].length, variant: chapterIndex, x: cursor, endX: cursor + ROOM_WIDTH * activeRooms.length,
      landmarkX: cursor + (ROOMS_PER_CHAPTER - 2) * ROOM_WIDTH });
    activeRooms.forEach((roomName, roomIndex) => {
      const room = ROOMS[roomName];
      const id = `${chapterId}-room-${roomIndex + 1}`;
      const roomMechanic = mechanic === 'relay' ? 'relay' : mechanic;
      const landmark = roomIndex === ROOMS_PER_CHAPTER - 2 ? LANDMARKS[roomMechanic] : null;
      // Signature rooms have authored left-to-right reads. Mirroring a spring,
      // lift, or gust can put its teaching aid beyond the gap it should solve.
      const mirror = !landmark && (chapterIndex + roomIndex) % 2 === 1;
      const pointX = x => cursor + (mirror ? ROOM_WIDTH - x : x);
      const rectX = (x, w) => cursor + (mirror ? ROOM_WIDTH - x - w : x);
      const groundPlan = landmark?.ground || room.ground;
      const ledgePlan = landmark?.ledges || room.ledges;
      const ground = groundPlan.map(([x, w, rise]) => ({ x: rectX(x, w), y: floor - rise, w, h: level.height - floor + rise }));
      level.terrain.push(...ground);
      for (const [x, rise, w] of ledgePlan) level.platforms.push({ x: rectX(x, w), y: floor - rise, w, h: 8, oneWay: true });
      const liftPlan = landmark?.lift || (!landmark ? room.lift : null);
      if (liftPlan) {
        const [x, rise, w, move] = liftPlan;
        level.platforms.push({ x: rectX(x, w) - (mirror ? move.distance : 0), y: floor - rise, w, h: 8, oneWay: true,
          move: { ...move } });
      }
      const gustPlan = landmark?.gust || (!landmark ? room.gust : null);
      if (gustPlan) {
        const [x, rise, w, h] = gustPlan;
        level.gusts.push({ x: rectX(x, w), y: floor - rise, w, h });
      }
      const surface = x => ground.find(rect => x >= rect.x && x < rect.x + rect.w)?.y;
      const roomFeature = mechanic === 'relay' ? ['lift', 'spring', 'gust'][roomIndex % 3] : mechanic;
      if (!landmark && roomFeature === 'lift' && roomIndex % 2 === 1) {
        level.platforms.push({ x: cursor + 448, y: floor - 104, w: 80, h: 8, oneWay: true,
          move: { axis: roomIndex % 4 === 1 ? 'x' : 'y', distance: 64, speed: 26 + chapterIndex * 2 } });
      }
      if (!landmark && roomFeature === 'spring' && roomIndex % 2 === 0) {
        const base = ground[roomIndex % ground.length];
        const x = base.x + Math.min(base.w - 12, Math.max(12, Math.floor(base.w / 2)));
        level.springs.push({ id: `${id}-spring`, x, y: base.y });
      }
      if (!landmark && roomFeature === 'gust' && roomIndex % 2 === 1) {
        level.gusts.push({ x: cursor + 464, y: floor - 144, w: 64, h: 144 });
      }
      if (landmark?.spring !== undefined) {
        const x = pointX(landmark.spring);
        level.springs.push({ id: `${id}-landmark-spring`, x, y: surface(x) });
      }
      room.encounters.forEach((localX, index) => {
        const x = pointX(landmark ? [144, 880][index] : localX);
        const type = encounterFor(level.id, roomFeature, chapterIndex + roomIndex, index);
        const flying = type === 'bird' || type === 'moth';
        // Flying patrols sit above the highest ground in their whole lane.
        const y = flying ? Math.min(...ground.filter(rect => rect.x < x + 96 && rect.x + rect.w > x - 96).map(rect => rect.y)) - 64 : surface(x);
        level.enemies.push({ id: `${id}-enemy-${index}`, type, x, y, range: 32 });
      });
      if (landmark && [1, 3, 5].includes(chapterIndex)) {
        level.emblems.push({ id: `${chapterId}-emblem`, x: pointX(landmark.prize[0]), y: floor - landmark.prize[1] });
      }
      if ([Math.floor(ROOMS_PER_CHAPTER / 2) - 1, ROOMS_PER_CHAPTER - 1].includes(roomIndex)) {
        const x = cursor + 944;
        const label = roomIndex === ROOMS_PER_CHAPTER - 1 ? 'End' : 'Midway';
        const checkpoint = { id: `${id}-checkpoint`, name: `${name} ${label}`, x, y: surface(x) };
        const legacyBoss = label === 'End' && chapterIndex === CHAPTERS[level.id].length - 1
          ? level.checkpoints.find(point => point.id.endsWith('checkpoint-boss')) : null;
        if (legacyBoss) Object.assign(legacyBoss, { name: checkpoint.name, x: checkpoint.x, y: checkpoint.y });
        else level.checkpoints.push(checkpoint);
      }
      cursor += ROOM_WIDTH;
    });
  });
  level.chapters.push({ id: `${level.id}-boss`, name: level.boss.name, style: 'Boss', tagline: 'The garden guardian awaits.',
    kind: 'boss', variant: 6, x: cursor, endX: level.width });
  for (const key of ['terrain', 'platforms', 'enemies', 'flowers', 'emblems', 'checkpoints', 'gusts', 'springs']) level[key].sort((a, b) => a.x - b.x);
  return level;
}

export function chapterAt(level, x) {
  return level.chapters?.find(chapter => x >= chapter.x && x < chapter.endX) || null;
}
