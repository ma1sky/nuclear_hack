const assert = require('node:assert/strict');
const { test } = require('node:test');
const theme = require('../src/theme/tokens.json');
const { measuredSegmentProgress } = require('../src/theme/progress.ts');

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
test('normal text and speaker labels meet 4.5:1 contrast in the shipped theme', () => {
  const c = theme.colors;
  const pairs = [[c.foreground, c.background], [c.cardForeground, c.card], [c.mutedForeground, c.muted],
    [c.mutedForeground, c.background], [c.primaryForeground, c.primary], [c.destructiveForeground, c.destructive],
    [c.destructive, c.errorSurface], [c.success, c.successSurface], [c.warning, c.warningSurface],
    ...theme.speakers.map(({ text, bg }) => [text, bg])];
  for (const [text, background] of pairs) {
    const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${text} on ${background}`);
  }
});
test('unknown duration and other stages never display an invented percentage', () => {
  for (const progress of [{ stage: 'diarizing', completed: 2, total: 3 }, { stage: 'transcribing' },
    { stage: 'transcribing', completed: 0, total: 0 }, { stage: 'transcribing', completed: NaN, total: 4 },
    { stage: 'transcribing', completed: 1, total: Infinity }, { stage: 'transcribing', completed: -1, total: 4 }]) {
    assert.equal(measuredSegmentProgress(progress), undefined);
  }
});
test('measured progress counts completed utterances and remains inside bounds', () => {
  assert.equal(measuredSegmentProgress({ stage: 'transcribing', completed: 0, total: 4 }), 0);
  assert.equal(measuredSegmentProgress({ stage: 'transcribing', completed: 1, total: 4 }), 25);
  assert.equal(measuredSegmentProgress({ stage: 'transcribing', completed: 6, total: 4 }), 100);
});
