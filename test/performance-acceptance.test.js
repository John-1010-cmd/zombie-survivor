import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const RECORD = new URL('../docs/superpowers/acceptance-2026-09-02-ui-visual-overhaul-package-8.md', import.meta.url);
const REQUIRED_VISUAL_CHECKS = [
  'canvasFullSmall', 'canvasFullWide', 'canvasFullHighDpr', 'hudAnchors',
  'iconsAllRequiredScreens', 'transparentNoBlackEdge', 'tooltipCoverage',
  'auxEnhancementLockedRow', 'sceneSpriteRenderingWithFallback', 'bestiarySharesMonsterVisual',
  'skinFlowAndFallback', 'paletteTokens', 'terrainTileCached', 'dprCapped',
  'drawImageControlled',
];

function loadRecord() {
  assert.equal(fs.existsSync(RECORD), true, '缺少 package-8 验收记录');
  const markdown = fs.readFileSync(RECORD, 'utf8');
  const match = markdown.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, '验收记录必须包含 fenced JSON 数据块');
  return JSON.parse(match[1]);
}

test('package-8：三视口截图、5 秒性能红线和 8 个任务包核对表齐全', () => {
  const record = loadRecord();
  assert.deepEqual(record.viewports.map(v => v.id), ['small', 'wide', 'highDpr']);
  for (const viewport of record.viewports) {
    assert.ok(Number.isInteger(viewport.cssWidth) && viewport.cssWidth > 0, `${viewport.id}.cssWidth`);
    assert.ok(Number.isInteger(viewport.cssHeight) && viewport.cssHeight > 0, `${viewport.id}.cssHeight`);
    assert.ok(viewport.dpr >= 1 && viewport.dpr <= 2, `${viewport.id}.dpr 必须在 1..2`);
    assert.match(viewport.screenshot,
      /^docs\/superpowers\/ui-visual-overhaul-package-8-(small|wide|high-dpr)\.png$/,
      `${viewport.id}.screenshot 路径不符合归档约定`);
  }

  const p = record.performance;
  assert.equal(p.durationSec, 5, '压测必须连续记录 5 秒');
  assert.ok(Number.isFinite(p.averageFrameMs) && p.averageFrameMs <= 20,
    `平均帧时 ${p.averageFrameMs}ms 必须 ≤20ms`);
  assert.ok(Number.isFinite(p.peakFrameMs) && p.peakFrameMs >= p.averageFrameMs,
    '峰值帧时必须是有效数值且不小于平均帧时');
  assert.ok(p.iconCache.hits >= 1, '必须记录至少一次图标缓存命中');
  assert.ok(p.iconCache.misses >= 0, '图标缓存 miss 必须有记录');
  assert.ok(p.drawImage.total >= 0, '必须记录 drawImage 总次数');
  assert.ok(p.drawImage.maxPerFrame >= 0, '必须记录同帧 drawImage 峰值');
  assert.equal(record.viewports.some(v => v.id === p.stressViewport), true,
    '性能记录必须关联一个已截图视口');

  assert.deepEqual(record.checklist.taskPackages.map(item => item.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const item of record.checklist.taskPackages) {
    assert.equal(item.checked, true, `任务包 ${item.id} 未勾选`);
    assert.ok(item.evidence, `任务包 ${item.id} 缺少证据说明`);
  }
  for (const key of REQUIRED_VISUAL_CHECKS)
    assert.equal(record.checklist.visual[key], true, `实景核对项 ${key} 未通过`);
});
