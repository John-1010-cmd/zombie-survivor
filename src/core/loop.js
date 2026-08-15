export function createLoop(step = 1 / 60) {
  return { step, acc: 0, last: null };
}
export function advance(loop, nowMs) {
  if (loop.last === null) { loop.last = nowMs; return 0; }
  let frame = (nowMs - loop.last) / 1000;
  loop.last = nowMs;
  if (frame > 0.25) frame = 0.25;
  loop.acc += frame;
  let steps = 0;
  while (loop.acc >= loop.step) { loop.acc -= loop.step; steps++; }
  return steps;
}
