// ========================================
// PERFORM MODE (Memory Slots → real-time playback)
// ========================================

// PERFORM MIDI MAP: dynamic calculation from baseMidi()
// Linnstrument/Launchpad send fourths-layout natively (no conversion needed)
// Push has its own handler in builder.js (serial→slot direct mapping)

const PERFORM_KEY_MAP = {
  '1':0, '2':1, '3':2, '4':3,
  'q':4, 'w':5, 'e':6, 'r':7,
  'a':8, 's':9, 'd':10, 'f':11,
  'z':12, 'x':13, 'c':14, 'v':15
};

function performPadTap(idx) {
  const slot = PlainState.memory[idx];
  if (!slot) return;
  noteOffAll();
  PerformState.activePad = idx;
  playMidiNotes(slot.midiNotes, 1.0);
  // Show chord on pad grid + staff (same as Input mode display)
  PlainState.activeNotes = new Set(slot.midiNotes);
  updatePlainDisplay();
  render();
  highlightPlaybackPads(slot.midiNotes);
  updateMemorySlotUI();
}

// Handle perform mode MIDI input - returns true if handled
// Dynamic: bottom-left 4×4 of grid (rows 0-3, cols 0-3) relative to baseMidi()
// Works for any fourths-layout controller (Linnstrument, Launchpad, etc.)
// Orientation matches Push handler: bottom row → slots 12-15, top row → slots 0-3
function handlePerformMidi(note) {
  if (memoryViewMode !== 'perform') return false;
  var offset = note - baseMidi();
  if (offset < 0) return false;
  var row = Math.floor(offset / ROW_INTERVAL);
  var col = offset % ROW_INTERVAL;
  if (row >= 4 || col >= 4) return false;
  var padIdx = (3 - row) * 4 + col;
  console.log('[PERF] HIT note=' + note + ' → row=' + row + ' col=' + col + ' → slot ' + (padIdx + 1));
  performPadTap(padIdx);
  return true;
}

// Handle perform mode keyboard input - returns true if handled
function handlePerformKey(lk) {
  if (memoryViewMode !== 'perform') return false;
  const padIdx = PERFORM_KEY_MAP[lk];
  if (padIdx === undefined) return false;
  performPadTap(padIdx);
  return true;
}
