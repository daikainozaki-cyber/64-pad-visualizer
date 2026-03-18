#!/usr/bin/env node
/**
 * sfz-to-js.mjs — Convert jRhodes3c SFZ + FLAC to a single JS file
 * with base64 MP3 samples and velocity layer metadata.
 *
 * Baked Loop: FLAC loop regions are expanded at the PCM level to produce
 * 8-15 second MP3 files. No runtime source.loop needed (WKWebView safe).
 *
 * Usage:
 *   node tools/sfz-to-js.mjs /tmp/jRhodes3c/jRhodes3c-looped-flac-sfz/_jRhodes-mono-looped.sfz
 *
 * Output: jrhodes3c-samples.js in the current directory
 *
 * Requirements: ffmpeg (for FLAC→PCM→MP3 conversion)
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';

// --- SFZ note name → MIDI number ---
const NOTE_MAP = { c: 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11 };

function noteNameToMidi(name) {
  // e.g., "c1", "g#1", "a#6", "c-1"
  const m = name.trim().toLowerCase().match(/^([a-g])(#?)(-?\d+)$/);
  if (!m) throw new Error(`Invalid note name: ${name}`);
  const base = NOTE_MAP[m[1]];
  const sharp = m[2] === '#' ? 1 : 0;
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + base + sharp;
}

// --- Parse smpl chunk from FLAC for loop points ---
function getLoopPoints(flacPath) {
  const data = readFileSync(flacPath);
  const smplIdx = data.indexOf(Buffer.from('smpl'));
  if (smplIdx < 0) return null;

  const base = smplIdx + 8; // skip 'smpl' + chunk size
  const numLoops = data.readUInt32LE(base + 28);
  if (numLoops === 0) return null;

  const loopStart = data.readUInt32LE(base + 36 + 8);
  const loopEnd = data.readUInt32LE(base + 36 + 12);
  const sampleRate = 44100;

  return {
    loopStart: loopStart / sampleRate,
    loopEnd: loopEnd / sampleRate,
    loopStartSample: loopStart,
    loopEndSample: loopEnd,
  };
}

// --- Convert FLAC → MP3 (256kbps mono, high quality) and return base64 ---
function flacToMp3Base64(flacPath) {
  const mp3Buf = execSync(
    `ffmpeg -i "${flacPath}" -ac 1 -ab 256k -f mp3 -y pipe:1 2>/dev/null`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
  return mp3Buf.toString('base64');
}

// --- Baked Loop: expand loop region at PCM level → MP3 ---
function bakedLoopToMp3Base64(flacPath, loopStartSec, loopEndSec, targetDuration) {
  const SR = 44100;

  // Decode FLAC to raw PCM (signed 16-bit LE, mono)
  const pcmBuf = execSync(
    `ffmpeg -i "${flacPath}" -ac 1 -ar ${SR} -f s16le -y pipe:1 2>/dev/null`,
    { maxBuffer: 50 * 1024 * 1024 }
  );
  const raw = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.length / 2);

  const loopStart = Math.round(loopStartSec * SR);
  const loopEnd = Math.round(loopEndSec * SR);
  const loopLen = loopEnd - loopStart;

  if (loopLen <= 0) {
    process.stderr.write(`  WARNING: invalid loop (${loopStart}-${loopEnd}), encoding without loop\n`);
    return flacToMp3Base64(flacPath);
  }

  const targetSamples = Math.round(targetDuration * SR);

  // Pre-loop: everything from start up to loopEnd
  const preLen = Math.min(loopEnd, raw.length);
  const remaining = Math.max(0, targetSamples - preLen);
  const numRepeats = Math.ceil(remaining / loopLen);
  const totalLen = preLen + numRepeats * loopLen;

  const result = new Int16Array(totalLen);

  // Copy attack + first pass through to loopEnd
  for (let i = 0; i < preLen; i++) result[i] = raw[i] || 0;

  // Append loop repeats — no crossfade needed
  // SFZ loop points are sample-accurate (zero-crossing aligned)
  for (let r = 0; r < numRepeats; r++) {
    const base = preLen + r * loopLen;
    for (let i = 0; i < loopLen; i++) {
      const dst = base + i;
      if (dst >= totalLen) break;
      result[dst] = raw[loopStart + i] || 0;
    }
  }

  // Encode extended PCM → MP3
  const extBuf = Buffer.from(result.buffer, result.byteOffset, result.byteLength);
  const mp3Buf = execSync(
    `ffmpeg -f s16le -ar ${SR} -ac 1 -i pipe:0 -ab 256k -f mp3 -y pipe:1 2>/dev/null`,
    { input: extBuf, maxBuffer: 50 * 1024 * 1024 }
  );

  const durActual = (totalLen / SR).toFixed(1);
  process.stderr.write(`  Baked: ${numRepeats} repeats, ${durActual}s\n`);

  return mp3Buf.toString('base64');
}

// --- Target duration: low notes = longer, high notes = shorter ---
function getTargetDuration(pitchCenter) {
  // MIDI 36 (C2) → 15s, MIDI 96 (C7) → 8s
  const t = Math.max(0, Math.min(1, (pitchCenter - 36) / 60));
  return 15 - 7 * t;
}

// --- Parse SFZ file ---
function parseSfz(sfzPath) {
  const sfzDir = dirname(sfzPath);
  const text = readFileSync(sfzPath, 'utf-8');
  const lines = text.split('\n');

  let groupAttrs = {};
  const regions = [];
  let currentRegion = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    if (line.startsWith('<group>')) {
      groupAttrs = {};
      continue;
    }

    if (line.startsWith('<region>')) {
      if (currentRegion) regions.push(currentRegion);
      currentRegion = { ...groupAttrs };
      continue;
    }

    // Parse key=value pairs
    const kvMatch = line.match(/^(\w+)=(.+)$/);
    if (kvMatch && currentRegion !== null) {
      currentRegion[kvMatch[1]] = kvMatch[2].trim();
    } else if (kvMatch) {
      groupAttrs[kvMatch[1]] = kvMatch[2].trim();
    }
  }
  if (currentRegion) regions.push(currentRegion);

  // Convert to zone objects
  const zones = [];
  const mp3Cache = new Map(); // cacheKey → base64 (deduplicate shared samples)

  for (const r of regions) {
    const sample = r.sample;
    if (!sample) continue;

    const flacPath = join(sfzDir, sample);
    const keyLow = noteNameToMidi(r.lokey);
    const keyHigh = noteNameToMidi(r.hikey);
    const velLow = parseInt(r.lovel || '1', 10);
    const velHigh = parseInt(r.hivel || '127', 10);
    const pitchCenter = noteNameToMidi(r.pitch_keycenter);
    const hasLoop = r.loop_mode === 'loop_continuous';

    // Envelope params from SFZ
    const ampRelease = parseFloat(r.ampeg_release || '0.3');
    const ampHold = parseFloat(r.ampeg_hold || '0');
    const ampDecay = parseFloat(r.ampeg_decay || '0');
    const ampSustain = parseFloat(r.ampeg_sustain || '1');

    // Baked loop: expand loop region to target duration, encode as MP3
    const cacheKey = sample + (hasLoop ? ':baked' : '');
    if (!mp3Cache.has(cacheKey)) {
      process.stderr.write(`Converting ${sample}...\n`);
      if (hasLoop) {
        const lp = getLoopPoints(flacPath);
        if (lp && lp.loopStart != null && lp.loopEnd != null) {
          const dur = getTargetDuration(pitchCenter);
          process.stderr.write(`  Loop: ${lp.loopStart.toFixed(4)}s → ${lp.loopEnd.toFixed(4)}s, target ${dur.toFixed(1)}s\n`);
          mp3Cache.set(cacheKey, bakedLoopToMp3Base64(flacPath, lp.loopStart, lp.loopEnd, dur));
        } else {
          process.stderr.write(`  No loop points found, encoding without loop\n`);
          mp3Cache.set(cacheKey, flacToMp3Base64(flacPath));
        }
      } else {
        mp3Cache.set(cacheKey, flacToMp3Base64(flacPath));
      }
    }
    const b64 = mp3Cache.get(cacheKey);

    const zone = {
      keyLow, keyHigh, velLow, velHigh, pitchCenter,
      ampRelease, ampHold, ampDecay, ampSustain,
    };
    zone.file = `data:audio/mpeg;base64,${b64}`;

    zones.push(zone);
  }

  return zones;
}

// --- Main ---
const sfzPath = process.argv[2];
if (!sfzPath) {
  console.error('Usage: node tools/sfz-to-js.mjs <path-to-sfz>');
  process.exit(1);
}

console.error(`Parsing SFZ: ${sfzPath}`);
const zones = parseSfz(sfzPath);
console.error(`Generated ${zones.length} zones from ${new Set(zones.map(z => z.file)).size} unique samples`);

// Output JS
const js = `// jRhodes3c — 1977 Rhodes Mark I, 5 velocity layers, baked loops
// Auto-generated by tools/sfz-to-js.mjs — DO NOT EDIT
// License: CC-BY-4.0 (https://github.com/sfzinstruments/jlearman.jRhodes3c)
var _jRhodes3c = {
  name: 'jRhodes3c',
  zones: ${JSON.stringify(zones, null, 2)}
};
`;

const outPath = join(process.cwd(), 'jrhodes3c-samples.js');
writeFileSync(outPath, js);
console.error(`Written to ${outPath} (${(Buffer.byteLength(js) / 1024 / 1024).toFixed(1)} MB)`);
