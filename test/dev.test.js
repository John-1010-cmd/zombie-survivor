import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePerf } from '../src/ui/dev.js';

test('summarizePerf：平均/峰值帧时、缓存命中和同帧 drawImage 统计，DPR 封顶 2', () => {
  const result = summarizePerf([
    { frameMs: 16, iconCacheHits: 1, iconCacheMisses: 1, drawImageCount: 4 },
    { frameMs: 20, iconCacheHits: 2, iconCacheMisses: 0, drawImageCount: 9 },
    { frameMs: 18, iconCacheHits: 3, iconCacheMisses: 0, drawImageCount: 5 },
  ], { dpr: 3, cssWidth: 1280, cssHeight: 720 });
  assert.deepEqual(result, {
    frameCount: 3,
    cssWidth: 1280,
    cssHeight: 720,
    dpr: 2,
    averageFrameMs: 18,
    peakFrameMs: 20,
    iconCacheHits: 6,
    iconCacheMisses: 1,
    drawImageTotal: 18,
    drawImageMaxPerFrame: 9,
  });
});

test('summarizePerf：空样本和非法帧时拒绝，避免把缺测误报为通过', () => {
  assert.throws(() => summarizePerf([]), /samples must be a non-empty array/);
  assert.throws(() => summarizePerf([{ frameMs: -1 }]), /frameMs must be a non-negative finite number/);
  assert.throws(() => summarizePerf([{ frameMs: 16, drawImageCount: Infinity }]), /drawImageCount must be a non-negative finite number/);
});
