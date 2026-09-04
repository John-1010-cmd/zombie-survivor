// src/core/angles.js —— 所有视觉朝向共用的最短弧角度工具。
export const TURN_RATE = 240 * Math.PI / 180;
export const FIRE_TOLERANCE = Math.PI / 12;

export function normAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function turnToward(current, target, maxDelta) {
  const delta = normAngle(target - current);
  const limit = Math.max(0, maxDelta);
  if (Math.abs(delta) <= limit) return current + delta;
  return current + Math.sign(delta) * limit;
}
