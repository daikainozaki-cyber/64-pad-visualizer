// ========================================
// DATA & CONSTANTS — 64 Pad Explorer (App-specific)
// Theory constants (SCALES, KEY_SPELLINGS, BUILDER_QUALITIES, etc.)
// are imported from pad-core/data.js via script tag.
// ========================================

// DOMContentLoaded utility (body-end scripts may fire after DOMContentLoaded)
function onReady(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

const IS_DEV = location.pathname.indexOf('64-pad-dev') !== -1 || location.pathname.indexOf('64-pad-chs') !== -1;

// ======== GRID DESTRUCTURING (from pad-core GRID) ========
const { ROWS, COLS, BASE_MIDI, ROW_INTERVAL, COL_INTERVAL, PAD_SIZE, PAD_GAP, MARGIN } = GRID;

// ======== ADAPTER: pcName (bridges AppState → pad-core) ========
function getParentMajorKey(scaleIdx, key) { return padGetParentMajorKey(scaleIdx, key); }
function pcName(pc, contextKey) {
  const parentKey = contextKey !== undefined ? contextKey : padGetParentMajorKey(AppState.scaleIdx, AppState.key);
  return KEY_SPELLINGS[parentKey][pc];
}

// ======== STATE ========
const AppState = {
  key: 0,
  mode: 'scale',  // 'scale' | 'chord' | 'input'
  scaleIdx: 0,
  octaveShift: 0, // -1, 0, +1, +2 — shifts entire grid like Push's octave up/down
  semitoneShift: 0, // -11 to +11 — fine-tune for 32-pad mode
  showParentScales: false, // Parent Scale panel toggle
  psSortMode: 'practical', // 'practical' | 'diatonic'
  diatonicMode: 'tetrad',  // 'tetrad' | 'triad'
  // Velocity sensitivity (Push 3-style parameters)
  velThreshold: 0,   // 0-64: minimum input velocity, below = no sound
  velDrive: 0,       // -64 to +64: curve rise (+soft=loud, -need harder touch)
  velCompand: 0,     // -64 to +64: dynamic range compress(+)/expand(-)
  velRange: 127,     // 1-127: max output velocity
};

const BuilderState = {
  step: 0,       // 0=not started, 1=root, 2=quality, 3=tension, 4=onchord
  root: null,     // 0-11
  quality: null,  // {name, label, pcs}
  tension: null,  // {label, mods}
  bass: null,     // 0-11 for slash chord
  bassInputMode: false, // true when piano keyboard is used for bass selection
};

const VoicingState = {
  omit5: false,
  rootless: false,
  omit3: false,
  shell: null,           // null, '137', '173'
  inversion: 0,          // 0=root, 1=1st, 2=2nd, 3=3rd
  drop: null,            // null, 'drop2', 'drop3'
  shellExtension: 0,     // 0 = shell only, 1 = +1 note, 2 = +2 notes
  selectedBoxIdx: null,  // selected bounding box index for staff display
  lastBoxes: [],         // [{midiNotes: [...], alternatives: [...], currentAlt: n}, ...] stored from last render
  cycleIndices: {},      // { boxIdx: alternativeIdx } - tracks cycling state per box
  _preservePosition: false, // flag: find nearest box after chord change (transpose/inversion/drop)
};

const PlainState = {
  activeNotes: new Set(),        // MIDIノート（クリックでon/off）
  memory: Array(16).fill(null),  // [{midiNotes: number[], chordName: string}] × 16
  currentSlot: null,             // 現在選択中スロット (0-15)
  subMode: 'idle',               // 'idle' | 'capture' | 'edit'
  captureIndex: 0,               // 次にキャプチャするスロット番号
};

const PerformState = {
  activePad: null,              // 現在再生中のパッドインデックス
};

// ======== GUITAR/BASS POSITION STATE (v3.19) ========
const GuitarPositionState = {
  alternatives: [],   // padEnumGuitarChordForms results
  currentAlt: 0,      // currently displayed index
  enabled: false,     // true only in Chord mode + chord confirmed
  _lastKey: null,     // cache key for recalc detection
  groups: [],         // [{label, forms:[...]}, ...]
  currentGroupIdx: 0,
  currentAltInGroup: 0,
};
const BassPositionState = {
  alternatives: [],
  currentAlt: 0,
  enabled: false,
  _lastKey: null,
  groups: [],
  currentGroupIdx: 0,
  currentAltInGroup: 0,
};

// ======== BANK STATE (v2.50) ========
const BankState = {
  banks: [],         // [{id, name, memory: Array(16)}]
  activeBankId: null,
};

function getActiveBank() {
  return BankState.banks.find(b => b.id === BankState.activeBankId) || BankState.banks[0];
}

function syncMemoryToActiveBank() {
  const bank = getActiveBank();
  if (bank) bank.memory = PlainState.memory.map(s => s ? { midiNotes: [...s.midiNotes], chordName: s.chordName } : null);
}

function loadBankMemory() {
  const bank = getActiveBank();
  if (bank) PlainState.memory = bank.memory.map(s => s ? { midiNotes: [...s.midiNotes], chordName: s.chordName } : null);
}

// ======== SETTINGS PERSISTENCE ========
function saveAppSettings() {
  try {
    syncMemoryToActiveBank();
    const s = {
      key: AppState.key,
      mode: AppState.mode,
      scaleIdx: AppState.scaleIdx,
      octaveShift: AppState.octaveShift,
      showGuitar: typeof showGuitar !== 'undefined' ? showGuitar : false,
      showBass: typeof showBass !== 'undefined' ? showBass : false,
      showPiano: typeof showPiano !== 'undefined' ? showPiano : false,
      showStaff: typeof showStaff !== 'undefined' ? showStaff : true,
      showCircle: typeof showCircle !== 'undefined' ? showCircle : false,
      showSound: typeof showSound !== 'undefined' ? showSound : true,
      guitarLabelMode: typeof guitarLabelMode !== 'undefined' ? guitarLabelMode : 'name',
      velThreshold: AppState.velThreshold,
      velDrive: AppState.velDrive,
      velCompand: AppState.velCompand,
      velRange: AppState.velRange,
      semitoneShift: AppState.semitoneShift,
      diatonicMode: AppState.diatonicMode,
      banks: BankState.banks,
      activeBankId: BankState.activeBankId,
    };
    localStorage.setItem('64pad-settings', JSON.stringify(s));
  } catch(_) {}
}

function loadAppSettings() {
  try {
    const raw = localStorage.getItem('64pad-settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.key !== undefined && s.key >= 0 && s.key <= 11) AppState.key = s.key;
    if (s.mode === 'plain') s.mode = 'input';
    if (s.mode && ['scale','chord','input'].includes(s.mode)) AppState.mode = s.mode;
    if (s.scaleIdx !== undefined && s.scaleIdx >= 0 && s.scaleIdx < SCALES.length) AppState.scaleIdx = s.scaleIdx;
    if (s.octaveShift !== undefined && s.octaveShift >= -1 && s.octaveShift <= 3) AppState.octaveShift = s.octaveShift;
    if (s.showGuitar !== undefined) showGuitar = s.showGuitar;
    if (s.showBass !== undefined) showBass = s.showBass;
    if (s.showPiano !== undefined) showPiano = s.showPiano;
    if (s.showStaff !== undefined) showStaff = s.showStaff;
    if (s.showCircle !== undefined) showCircle = s.showCircle;
    if (s.showSound !== undefined) showSound = s.showSound;
    if (s.guitarLabelMode) guitarLabelMode = s.guitarLabelMode;
    if (s.velThreshold !== undefined) AppState.velThreshold = s.velThreshold;
    if (s.velDrive !== undefined) AppState.velDrive = s.velDrive;
    if (s.velCompand !== undefined) AppState.velCompand = s.velCompand;
    if (s.velRange !== undefined) AppState.velRange = s.velRange;
    if (s.semitoneShift !== undefined && s.semitoneShift >= -11 && s.semitoneShift <= 11) AppState.semitoneShift = s.semitoneShift;
    if (s.diatonicMode === 'triad' || s.diatonicMode === 'tetrad') AppState.diatonicMode = s.diatonicMode;
    // Migration: banks
    if (Array.isArray(s.banks) && s.banks.length > 0) {
      BankState.banks = s.banks;
      BankState.activeBankId = s.activeBankId || s.banks[0].id;
    } else if (Array.isArray(s.memory) && s.memory.length === 16) {
      BankState.banks = [{ id: 'default', name: 'Bank 1', memory: s.memory }];
      BankState.activeBankId = 'default';
    } else {
      BankState.banks = [{ id: 'default', name: 'Bank 1', memory: Array(16).fill(null) }];
      BankState.activeBankId = 'default';
    }
    loadBankMemory();
  } catch(_) {}
}

function showSaveToast() {
  const toast = document.getElementById('slot-save-toast');
  if (toast) {
    toast.textContent = typeof t === 'function' ? t('notify.settings_saved') : 'Settings saved';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1200);
  }
}

function resetVoicingSelection() {
  VoicingState.selectedBoxIdx = null;
  VoicingState.cycleIndices = {};
}

// Conditional exports for Node.js (Vitest) — ignored in browser
if (typeof module !== 'undefined') module.exports = {
  SCALES, NOTE_NAMES_SHARP, NOTE_NAMES_FLAT, FLAT_MAJOR_KEYS, KEY_SPELLINGS,
  BUILDER_QUALITIES, TENSION_ROWS, SCALE_AVAIL_TENSIONS,
  GRID, ROWS, COLS, BASE_MIDI, ROW_INTERVAL, COL_INTERVAL, PAD_SIZE, PAD_GAP, MARGIN,
  SCALE_DEGREE_NAMES, PC_TO_TENSION_NAME, TENSION_NAME_TO_PC,
  AppState, BuilderState, VoicingState, PlainState, PerformState, BankState,
  GuitarPositionState, BassPositionState,
  resetVoicingSelection, getParentMajorKey, pcName, onReady, IS_DEV,
  getActiveBank, syncMemoryToActiveBank, loadBankMemory,
  GRID_32,
};
