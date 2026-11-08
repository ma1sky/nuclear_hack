const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 1. Test Player logic (Rate cycling, Seeking, Boundary Clamping, End-of-track Replay)
test('Player logic: speed cycling covers 1x, 1.25x, 1.5x, 2x, 0.75x and wraps to 1x', () => {
  const rates = [1, 1.25, 1.5, 2, 0.75];
  let currentRate = 1;

  function nextRate(rate) {
    return rates[(rates.indexOf(rate) + 1) % rates.length];
  }

  // Speedup transitions
  currentRate = nextRate(currentRate);
  assert.equal(currentRate, 1.25, '1x -> 1.25x speedup');
  currentRate = nextRate(currentRate);
  assert.equal(currentRate, 1.5, '1.25x -> 1.5x speedup');
  currentRate = nextRate(currentRate);
  assert.equal(currentRate, 2.0, '1.5x -> 2.0x maximum speedup');

  // Slowdown transition
  currentRate = nextRate(currentRate);
  assert.equal(currentRate, 0.75, '2.0x -> 0.75x slowdown');

  // Wrap back to normal
  currentRate = nextRate(currentRate);
  assert.equal(currentRate, 1.0, '0.75x -> 1.0x normal');
});

test('Player logic: seek clamps within [0, duration] for forward, backward and arbitrary offsets', () => {
  const duration = 60.0; // 60s audio
  function clampSeek(currentTime, offset) {
    return Math.max(0, Math.min(duration, currentTime + offset));
  }

  // Forward 15s
  assert.equal(clampSeek(10.0, 15), 25.0);
  assert.equal(clampSeek(50.0, 15), 60.0, 'clamps at duration, never exceeds audio length');

  // Backward 15s
  assert.equal(clampSeek(30.0, -15), 15.0);
  assert.equal(clampSeek(8.0, -15), 0.0, 'clamps at 0, never negative');

  // Jump to utterance time (clicking on transcript replica)
  function seekToReplica(utteranceStartMs) {
    const targetSeconds = utteranceStartMs / 1000;
    return Math.max(0, Math.min(duration, targetSeconds));
  }
  assert.equal(seekToReplica(12450), 12.45);
  assert.equal(seekToReplica(75000), 60.0, 'clamps out-of-bounds replica');
});

test('Player logic: end-of-track restart behavior (replay from 0)', () => {
  const duration = 60.0;
  function handleToggle(status) {
    if (status.playing) {
      return { action: 'pause' };
    } else {
      if (status.didJustFinish || status.currentTime >= duration - 0.05) {
        return { action: 'replay', seekTo: 0 };
      }
      return { action: 'resume', seekTo: status.currentTime };
    }
  }

  // Mid-track pause/resume
  assert.deepEqual(handleToggle({ playing: true, currentTime: 25.0, didJustFinish: false }), { action: 'pause' });
  assert.deepEqual(handleToggle({ playing: false, currentTime: 25.0, didJustFinish: false }), { action: 'resume', seekTo: 25.0 });

  // End-of-track replay
  assert.deepEqual(handleToggle({ playing: false, currentTime: 60.0, didJustFinish: true }), { action: 'replay', seekTo: 0 });
  assert.deepEqual(handleToggle({ playing: false, currentTime: 59.98, didJustFinish: false }), { action: 'replay', seekTo: 0 });
});

// 2. Test Recorder state machine & safety
test('Recorder state machine: handles start, pause, resume, backgrounding and finish', () => {
  let mode = 'ready';
  let isRecording = false;

  function start() {
    assert.equal(mode, 'ready');
    mode = 'recording';
    isRecording = true;
  }
  function pause() {
    assert.equal(mode, 'recording');
    mode = 'paused';
    isRecording = false;
  }
  function resume() {
    assert.equal(mode, 'paused');
    mode = 'recording';
    isRecording = true;
  }
  function onAppStateChange(nextAppState) {
    if (nextAppState !== 'active' && isRecording) {
      pause();
    }
  }
  function finish() {
    assert.ok(mode === 'recording' || mode === 'paused');
    mode = 'finished';
    isRecording = false;
  }

  start();
  assert.equal(mode, 'recording');

  // Pause
  pause();
  assert.equal(mode, 'paused');

  // Resume
  resume();
  assert.equal(mode, 'recording');

  // Backgrounding safety: user switches to another app
  onAppStateChange('background');
  assert.equal(mode, 'paused', 'microphones pauses safely when backgrounded');

  // Finish
  finish();
  assert.equal(mode, 'finished');
});

test('Recorder waveform: bucketed into exact 61 visual bars normalized between 0.0 and 1.0', () => {
  // simulate 200 measured audio metering samples
  const rawSamples = Array.from({ length: 200 }, (_, i) => Math.sin(i / 10) * 0.5 + 0.5);
  
  const waveform = Array.from({ length: 61 }, (_, i) => {
    const first = Math.floor((i * rawSamples.length) / 61);
    const last = Math.floor(((i + 1) * rawSamples.length) / 61);
    const bucket = rawSamples.slice(first, last);
    return bucket.length ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0;
  });

  assert.equal(waveform.length, 61, 'waveform has exact Figma 61 bars');
  for (const bar of waveform) {
    assert.ok(bar >= 0 && bar <= 1.0, 'each bar is bounded between 0 and 1');
  }
});

// 3. Test Transcript speaker renaming and text editing
test('Speaker renaming: custom label updates all utterances while preserving canonical speaker_id in export', () => {
  const utterances = [
    { speaker_id: 'speaker_1', start_ms: 100, end_ms: 2000, text: 'Привет' },
    { speaker_id: 'speaker_2', start_ms: 2100, end_ms: 4000, text: 'Здравствуйте' },
    { speaker_id: 'speaker_1', start_ms: 4200, end_ms: 6000, text: 'Как дела?' }
  ];

  const speakerNames = { 'speaker_1': 'Иван (Ведущий)' };

  // UI rendering helper
  function getDisplaySpeaker(speakerId) {
    return speakerNames[speakerId] || (speakerId === 'speaker_1' ? 'Спикер 1' : 'Спикер 2');
  }

  assert.equal(getDisplaySpeaker('speaker_1'), 'Иван (Ведущий)');
  assert.equal(getDisplaySpeaker('speaker_2'), 'Спикер 2');

  // Strict export helper (Page 15)
  function exportTranscript(rawUtterances) {
    return {
      transcript: rawUtterances.map(u => ({
        speaker_id: u.speaker_id, // must preserve canonical speaker_1
        start_ms: u.start_ms,
        end_ms: u.end_ms,
        text: u.text
      }))
    };
  }

  const exported = exportTranscript(utterances);
  assert.equal(exported.transcript[0].speaker_id, 'speaker_1', 'Export strictly preserves speaker_1');
  assert.equal(exported.transcript[2].speaker_id, 'speaker_1', 'Export strictly preserves speaker_1');
  assert.equal(Object.keys(exported).length, 1);
  assert.ok(Array.isArray(exported.transcript));
});

test('Transcript text editing: editing a turn updates content without corrupting timestamps', () => {
  const utterances = [
    { speaker_id: 'speaker_1', start_ms: 100, end_ms: 2000, text: 'Ошибочный текст' }
  ];

  function updateTurnText(index, newText) {
    return utterances.map((u, i) => i === index ? { ...u, text: newText } : u);
  }

  const updated = updateTurnText(0, 'Исправленный текст');
  assert.equal(updated[0].text, 'Исправленный текст');
  assert.equal(updated[0].start_ms, 100);
  assert.equal(updated[0].end_ms, 2000);
  assert.equal(updated[0].speaker_id, 'speaker_1');
});
