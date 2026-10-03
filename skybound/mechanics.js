export const MOVE = Object.freeze({ speed: 115, acceleration: 1100, braking: 1500, gravity: 800, jump: 280, glideFall: 55, coyote: 0.10, buffer: 0.12 });

export function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function canLand(previousFeet, velocityY, platformTop, dropUntil, time) {
  return velocityY >= 0 && previousFeet <= platformTop + 5 && time >= dropUntil;
}

export function isStomp(previousFeet, velocityY, enemyTop) {
  return velocityY > 45 && previousFeet <= enemyTop + 7;
}

export function attackBox(x, feet, facing, airborne) {
  return { x: facing > 0 ? x + 6 : x - 33, y: feet - (airborne ? 29 : 26), width: 27, height: airborne ? 25 : 20 };
}

export function approach(value, target, amount) {
  return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
}
