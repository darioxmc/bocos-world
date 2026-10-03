// Only nearby immutable terrain is queried each frame, even in long campaigns.
export function navigationSurfaces(level, entry) {
  const reach = (entry.range ?? 65) + 180;
  const flying = entry.type === 'bird' || entry.type === 'moth';
  // One-way perches support walkers, but do not form cages around flyers.
  return [...level.terrain, ...(flying ? [] : level.platforms.filter(rect => !rect.move))]
    .filter(rect => rect.x < entry.x + reach && rect.x + rect.w > entry.x - reach);
}

export function groundDirection(enemy, state, speed, dt) {
  const body = enemy.body;
  const grounded = body.blocked.down || body.touching.down;
  if (grounded || state.floorY === undefined) state.floorY = body.bottom;
  const floor = state.floorY;
  const margin = body.width / 2 + speed * Math.max(dt, 1 / 30) + 3;
  const range = state.range ?? 65;
  const safe = dir => {
    const x = enemy.x + dir * margin;
    if (x < 1 || x > state.worldWidth - 1) return false;
    if (dir < 0 && enemy.x <= state.startX - range) return false;
    if (dir > 0 && enemy.x >= state.startX + range) return false;
    if (dir < 0 ? body.blocked.left : body.blocked.right) return false;
    const supported = state.surfaces.some(r => x >= r.x && x <= r.x + r.w && Math.abs(r.y - floor) <= 3);
    const wall = state.surfaces.some(r => !r.oneWay && x > r.x && x < r.x + r.w && r.y < body.bottom - 2 && r.y + (r.h || 8) > body.top + 2);
    return supported && !wall;
  };
  // Test the desired side first: stale contact on the opposite side cannot flip us back.
  if (safe(state.dir)) return state.dir;
  // A hopper brakes at its safe landing boundary instead of zigzagging in air.
  if (state.type === 'hopper' && !grounded) return 0;
  if (safe(-state.dir)) { state.dir = -state.dir; return state.dir; }
  return 0;
}

export function constrainFlight(enemy, state, dt) {
  const body = enemy.body;
  const horizon = Math.max(dt, 1 / 30);
  const clear = (dx, dy) => {
    const left = body.left + Math.min(0, dx) - 2;
    const right = body.right + Math.max(0, dx) + 2;
    const top = body.top + Math.min(0, dy) - 2;
    const bottom = body.bottom + Math.max(0, dy) + 2;
    return left >= 0 && right <= state.worldWidth && top >= -150 && bottom <= state.worldHeight &&
      !state.surfaces.some(r => left < r.x + r.w && right > r.x && top < r.y + (r.h || 8) && bottom > r.y);
  };
  const vx = body.velocity.x, vy = body.velocity.y;
  if (!clear(vx * horizon, 0)) {
    state.dir = vx > 0 ? -1 : vx < 0 ? 1 : state.dir;
    body.setVelocityX(clear(state.dir * 25 * horizon, 0) ? state.dir * 25 : 0);
    if (state.phase === 'dive') { state.phase = 'patrol'; state.timer = 2.5; }
  }
  if (!clear(body.velocity.x * horizon, vy * horizon)) {
    body.setVelocityY(0);
    if (state.phase === 'dive') { state.phase = 'patrol'; state.timer = 2.5; }
  }
}
