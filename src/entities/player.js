import { slideCircleObstacles } from '../core/physics.js';
import { TURN_RATE, turnToward } from '../core/angles.js';

const WALK_FRAME_TIME = 0.12;

export function createPlayer(x, y) {
  return {
    x, y, r: 16, hp: 100, maxHp: 100, speed: 180,
    pickupRadius: 80, invuln: 0, xp: 0, level: 1, facing: 0,
    moving: false, walkFrame: 0, walkClock: 0,
  };
}

export function updatePlayer(p, input, obstacles, mapSize, dt) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  p.moving = Boolean(dx || dy);
  if (p.moving) {
    const len = Math.hypot(dx, dy);
    p.x += dx / len * p.speed * dt;
    p.y += dy / len * p.speed * dt;
    p.facing = turnToward(p.facing, Math.atan2(dy, dx), TURN_RATE * Math.max(0, dt));
    p.walkClock += dt;
    if (p.walkClock >= WALK_FRAME_TIME) {
      p.walkFrame = (p.walkFrame + Math.floor(p.walkClock / WALK_FRAME_TIME)) % 2;
      p.walkClock %= WALK_FRAME_TIME;
    }
  } else {
    p.walkFrame = 0;
    p.walkClock = 0;
  }
  p.x = Math.max(p.r, Math.min(mapSize - p.r, p.x));
  p.y = Math.max(p.r, Math.min(mapSize - p.r, p.y));
  slideCircleObstacles(p, obstacles);
  if (p.invuln > 0) p.invuln -= dt;
}

export function damagePlayer(p, dmg) {
  if (p.invuln > 0) return false;
  p.hp -= dmg;
  p.invuln = 0.5;
  return true;
}
