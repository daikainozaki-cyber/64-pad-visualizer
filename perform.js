// ========================================
// PERFORM MODE (Memory Slots → real-time playback)
// ========================================

// PERFORM MIDI MAP: starts at D#2 (MIDI 51 = Row 3 of 64-pad grid), 5-semitone row interval
// Aligns physical controller with the visual 64-pad grid (Rows 3-6, playable chord range)
const PERFORM_MIDI_MAP = {
  51:0, 52:1, 53:2, 54:3,
  56:4, 57:5, 58:6, 59:7,
  61:8, 62:9, 63:10, 64:11,
  66:12, 67:13, 68:14, 69:15
};

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
function handlePerformMidi(note) {
  if (memoryViewMode !== 'perform') return false;
  const padIdx = PERFORM_MIDI_MAP[note];
  if (padIdx === undefined) return false;
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
