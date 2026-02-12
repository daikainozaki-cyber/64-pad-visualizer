// ========================================
// PERFORM MODE (Memory Slots → real-time playback)
// ========================================

const PERFORM_MIDI_MAP = {
  36:0, 37:1, 38:2, 39:3,
  41:4, 42:5, 43:6, 44:7,
  46:8, 47:9, 48:10, 49:11,
  51:12, 52:13, 53:14, 54:15
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
