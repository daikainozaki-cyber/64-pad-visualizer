// ========================================
// PERFORM MODE (Memory Slots → real-time playback)
// ========================================

// PERFORM MIDI MAP: dynamic, based on baseMidi() + Row 3-6 of 64-pad grid
// Rows 3-6 = playable chord range, cols 0-3 = 4x4 perform grid
// Computed at runtime so octaveShift/semitoneShift changes are reflected

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
// Rows 3-6 of grid (playable chord range), cols 0-3
// Row mapping inverted so grid visual position matches slot display:
//   Grid row 3 (bottom of perform area) → slots 12-15 (display bottom)
//   Grid row 6 (top of perform area)    → slots 0-3   (display top)
// Dynamic: baseMidi() tracks octaveShift/semitoneShift
function handlePerformMidi(note) {
  if (memoryViewMode !== 'perform') return false;
  const performBase = baseMidi() + 3 * ROW_INTERVAL; // Row 3 start
  const offset = note - performBase;
  if (offset < 0) return false;
  const row = Math.floor(offset / ROW_INTERVAL);
  const col = offset % ROW_INTERVAL;
  if (row >= 4 || col >= 4) return false;
  performPadTap((3 - row) * 4 + col);
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
