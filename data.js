// ========================================
// DATA & CONSTANTS
// ========================================

// DOMContentLoaded utility (body-end scripts may fire after DOMContentLoaded)
function onReady(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

const IS_DEV = location.pathname.indexOf('64-pad-dev') !== -1 || location.pathname.indexOf('64-pad-chs') !== -1;
const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_MAJOR_KEYS = new Set([1, 3, 5, 6, 8, 10]); // Db, Eb, F, Gb, Ab, Bb (circle of fifths)

// ======== SCALES ========
const SCALES = [
  // cn = characteristic notes (intervals that define the mode's color)
  // Diatonic
  {id:0, cat:'○', num:1, name:'Major (Ionian)', pcs:[0,2,4,5,7,9,11], cn:[11]},
  {id:1, cat:'○', num:2, name:'Dorian', pcs:[0,2,3,5,7,9,10], cn:[9]},
  {id:2, cat:'○', num:3, name:'Phrygian', pcs:[0,1,3,5,7,8,10], cn:[1]},
  {id:3, cat:'○', num:4, name:'Lydian', pcs:[0,2,4,6,7,9,11], cn:[6]},
  {id:4, cat:'○', num:5, name:'Mixolydian', pcs:[0,2,4,5,7,9,10], cn:[10]},
  {id:5, cat:'○', num:6, name:'Natural Minor (Aeolian)', pcs:[0,2,3,5,7,8,10], cn:[8]},
  {id:6, cat:'○', num:7, name:'Locrian', pcs:[0,1,3,5,6,8,10], cn:[1,6]},
  // Harmonic Minor
  {id:7, cat:'■', num:1, name:'Harmonic Minor', pcs:[0,2,3,5,7,8,11], cn:[11]},
  {id:8, cat:'■', num:2, name:'Locrian ♮6', pcs:[0,1,3,5,6,9,10], cn:[9]},
  {id:9, cat:'■', num:3, name:'Ionian #5', pcs:[0,2,4,5,8,9,11], cn:[8]},
  {id:10, cat:'■', num:4, name:'Dorian #4', pcs:[0,2,3,6,7,9,10], cn:[6]},
  {id:11, cat:'■', num:5, name:'Phrygian Dominant', pcs:[0,1,4,5,7,8,10], cn:[1,4]},
  {id:12, cat:'■', num:6, name:'Lydian #2', pcs:[0,3,4,6,7,9,11], cn:[3]},
  {id:13, cat:'■', num:7, name:'Functional Diminish', pcs:[0,1,3,4,6,8,10], cn:[6]},
  // Melodic Minor
  {id:14, cat:'◆', num:1, name:'Melodic Minor', pcs:[0,2,3,5,7,9,11], cn:[9,11]},
  {id:15, cat:'◆', num:2, name:'Dorian b2', pcs:[0,1,3,5,7,9,10], cn:[1]},
  {id:16, cat:'◆', num:3, name:'Lydian #5', pcs:[0,2,4,6,8,9,11], cn:[6,8]},
  {id:17, cat:'◆', num:4, name:'Lydian b7', pcs:[0,2,4,6,7,9,10], cn:[6,10]},
  {id:18, cat:'◆', num:5, name:'Mixolydian b6', pcs:[0,2,4,5,7,8,10], cn:[8]},
  {id:19, cat:'◆', num:6, name:'Locrian ♮2', pcs:[0,2,3,5,6,8,10], cn:[2]},
  {id:20, cat:'◆', num:7, name:'Super Locrian (Altered)', pcs:[0,1,3,4,6,8,10], cn:[1,6,8]},
  // Pentatonic / Blues / Symmetric
  {id:21, cat:'', num:0, name:'Major Pentatonic', pcs:[0,2,4,7,9], cn:[]},
  {id:22, cat:'', num:0, name:'Minor Pentatonic', pcs:[0,3,5,7,10], cn:[]},
  {id:23, cat:'', num:0, name:'Blues', pcs:[0,3,5,6,7,10], cn:[6]},
  {id:24, cat:'', num:0, name:'Chromatic', pcs:[0,1,2,3,4,5,6,7,8,9,10,11], cn:[]},
  {id:25, cat:'', num:0, name:'Whole Tone', pcs:[0,2,4,6,8,10], cn:[]},
  {id:26, cat:'', num:0, name:'Half-Whole Diminish', pcs:[0,1,3,4,6,7,9,10], cn:[]},
  {id:27, cat:'', num:0, name:'Whole-Half Diminish', pcs:[0,2,3,5,6,8,9,11], cn:[]},
  // Bebop Scales (8音) - cn = passing tone
  {id:28, cat:'♪', num:0, name:'Bebop Major', pcs:[0,2,4,5,7,8,9,11], cn:[8]},
  {id:29, cat:'♪', num:0, name:'Bebop Dominant (Mixolydian)', pcs:[0,2,4,5,7,9,10,11], cn:[11]},
  {id:30, cat:'♪', num:0, name:'Bebop Dorian', pcs:[0,2,3,4,5,7,9,10], cn:[4]},
];

// ======== ENHARMONIC SPELLING (circle of fifths) ========
function getParentMajorKey(scaleIdx, key) {
  const scale = SCALES[scaleIdx];
  if (scale.cat === '○') {
    const DIATONIC = [0, 2, 4, 5, 7, 9, 11];
    return (key - DIATONIC[scale.num - 1] + 12) % 12;
  }
  if (scale.cat === '■') {
    const HM = [0, 2, 3, 5, 7, 8, 11];
    const minorRoot = (key - HM[scale.num - 1] + 12) % 12;
    return (minorRoot + 3) % 12;
  }
  if (scale.cat === '◆') {
    const MM = [0, 2, 3, 5, 7, 9, 11];
    const minorRoot = (key - MM[scale.num - 1] + 12) % 12;
    return (minorRoot + 3) % 12;
  }
  // Non-modal: minor-like (has b3 without natural 3) → relative major
  if (scale.pcs.includes(3) && !scale.pcs.includes(4)) {
    return (key + 3) % 12;
  }
  return key;
}

function pcName(pc) {
  const parentKey = getParentMajorKey(AppState.scaleIdx, AppState.key);
  return FLAT_MAJOR_KEYS.has(parentKey) ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
}

// ======== QUALITY DEFINITIONS (Step 2) ========
// 4×3 grid matching Clover Chord Systems
const BUILDER_QUALITIES = [
  // Row 0
  [{name:'', label:'Maj', pcs:[0,4,7]}, {name:'m', label:'m', pcs:[0,3,7]}, {name:'m7(b5)', label:'m7⁻⁵', pcs:[0,3,6,10]}],
  // Row 1
  [{name:'6', label:'6', pcs:[0,4,7,9]}, {name:'m6', label:'m6', pcs:[0,3,7,9]}, {name:'dim', label:'dim', pcs:[0,3,6]}],
  // Row 2
  [{name:'7', label:'7', pcs:[0,4,7,10]}, {name:'m7', label:'m7', pcs:[0,3,7,10]}, {name:'dim7', label:'dim7', pcs:[0,3,6,9]}],
  // Row 3
  [{name:'△7', label:'△7', pcs:[0,4,7,11]}, {name:'m△7', label:'m△7', pcs:[0,3,7,11]}, {name:'aug', label:'aug', pcs:[0,4,8]}],
];

// ======== TENSION DEFINITIONS (Step 3) ========
// Each tension: {label, mods:{add:[], replace3:pc, sharp5:bool, flat5:bool, omit3:bool, omit5:bool}}
const TENSION_ROWS = [
  // Row 0
  [
    {label:'sus4', mods:{replace3:5}},
    {label:'aug', mods:{sharp5:true}},
    {label:'6', mods:{add:[9]}},
    {label:'9', mods:{add:[2]}},
    {label:'11', mods:{add:[2,5]}},
    {label:'13', mods:{add:[9]}},
    {label:'(9,13)', mods:{add:[2,9]}},
  ],
  // Row 1
  [
    {label:'add9', mods:{add:[2]}},
    {label:'b5', mods:{flat5:true}},
    {label:'6/9', mods:{add:[9,2]}},
    {label:'b9', mods:{add:[1]}},
    {label:'#11', mods:{add:[6]}},
    {label:'b13', mods:{add:[8]}},
  ],
  // Row 2
  [
    {label:'aug\n(9)', mods:{add:[2], sharp5:true}},
    {label:'6/9\n(#11)', mods:{add:[6,9,2]}},
    {label:'#9', mods:{add:[3]}},
    {label:'(9)\n(11)', mods:{add:[5,2]}},
    {label:'(11)\n(13)', mods:{add:[9,5]}},
  ],
  // Row 3
  [
    {label:'sus4\n(9)', mods:{replace3:5, add:[2]}},
    {label:'b5\n(b9)', mods:{add:[1], flat5:true}},
    null,
    null,
    {label:'(b11)\n(b13)', mods:{add:[8,4]}},
    null,
    null,
    null,
  ],
  // Row 4
  [
    {label:'sus4\n(b9)', mods:{replace3:5, add:[1]}},
    {label:'aug\n(b9)', mods:{sharp5:true, add:[1]}},
    null,
    {label:'(9)\n(#11)', mods:{add:[6,2]}},
    {label:'(#11)\n(b13)', mods:{add:[8,6]}},
    null,
    null,
    null,
  ],
  // Row 5
  [
    {label:'(#9)\n(#11)', mods:{add:[3,6]}},
    null,
    {label:'(9)\n(#11)\n(13)', mods:{add:[9,2,6]}},
    null,
    null,
    null,
    null,
    null,
  ],
  // Row 6
  [
    null,
    {label:'aug\n(#9)', mods:{add:[3], sharp5:true}},
    {label:'b5\n(#9)', mods:{add:[3], flat5:true}},
    {label:'(9)\n(b13)', mods:{add:[8,2]}},
    {label:'(b9)\n(13)', mods:{add:[1,9]}},
    null,
    null,
    null,
  ],
  // Row 7
  [
    null,
    null,
    null,
    {label:'(b9)\n(b13)', mods:{add:[8,1]}},
    {label:'(#9)\n(b13)', mods:{add:[3,8]}},
    null,
    null,
    null,
  ],
  // Row 8
  [
    null,
    null,
    null,
    {label:'(b9)\n(#9)\n(b13)', mods:{add:[8,1,3]}},
    null,
    null,
    null,
    null,
  ],
];

// ======== AVAILABLE TENSIONS PER SCALE (HOW TO IMPROVISE) ========
// Maps scaleIdx → available tension names. Used for Parent Scale display + tension filtering.
const PC_TO_TENSION_NAME = { 1:'b9', 2:'9', 3:'#9', 5:'11', 6:'#11', 8:'b13', 9:'13' };
const TENSION_NAME_TO_PC = { 'b9':1, '9':2, '#9':3, '11':5, '#11':6, 'b13':8, '13':9 };

const SCALE_AVAIL_TENSIONS = {
  // === Diatonic (○) ===
  0:  { avail:['9','13'], avoid:['11'] },           // Ionian (Major)
  1:  { avail:['9','11','13'] },                     // Dorian
  2:  { avail:['11'], avoid:['b9','b13'] },            // Phrygian
  3:  { avail:['9','#11','13'] },                    // Lydian
  4:  { avail:['9','13'], avoid:['11'] },            // Mixolydian
  5:  { avail:['9','11'], avoid:['b13'] },            // Aeolian (Natural Minor)
  6:  { avail:['11','b13'], avoid:['b9'] },          // Locrian
  // === Harmonic Minor (■) ===
  7:  { avail:['9','11','b13'] },                    // Harmonic Minor (I)
  8:  { avail:['11','13'], avoid:['b9'] },           // Locrian ♮6 (II)
  9:  { avail:['9','13'], avoid:['11'] },            // Ionian #5 (III)
  10: { avail:['9','#11','13'] },                    // Dorian #4 (IV)
  11: { avail:['b9','b13'], avoid:['11'] },          // Phrygian Dominant (V)
  12: { avail:['#11','13'] },                        // Lydian #2 (VI)
  13: { avail:['11','b13'] },                        // Functional Diminish (VII)
  // === Melodic Minor (◆) ===
  14: { avail:['9','11','13'] },                     // Melodic Minor (I)
  15: { avail:['11','b13'], avoid:['b9'] },          // Dorian b2 (II)
  16: { avail:['9','#11','13'] },                    // Lydian #5 (III) = Lydian Augmented
  17: { avail:['9','#11','13'] },                    // Lydian b7 (IV)
  18: { avail:['9','b13'], avoid:['11'] },           // Mixolydian b6 (V)
  19: { avail:['9','11'] },                          // Locrian ♮2 (VI)
  20: { avail:['b9','#9','#11','b13'] },             // Super Locrian / Altered (VII)
  // === Symmetric / Special ===
  25: { avail:['9','#11','b13'] },                   // Whole Tone
  26: { avail:['b9','#9','#11','13'] },              // Half-Whole Diminish (CombiDim)
  27: { avail:['9','11','b13'] },                    // Whole-Half Diminish
  // === Bebop (inherit from parent) ===
  28: { avail:['9','13'], avoid:['11'] },            // Bebop Major (≈ Ionian)
  29: { avail:['9','13'], avoid:['11'] },            // Bebop Dominant (≈ Mixolydian)
  30: { avail:['9','11','13'] },                     // Bebop Dorian (≈ Dorian)
};

// ======== PAD GRID ========
const GRID = {
  ROWS: 8, COLS: 8,
  BASE_MIDI: 36, ROW_INTERVAL: 5, COL_INTERVAL: 1,
  PAD_SIZE: 62, PAD_GAP: 4, MARGIN: 20,
};
const { ROWS, COLS, BASE_MIDI, ROW_INTERVAL, COL_INTERVAL, PAD_SIZE, PAD_GAP, MARGIN } = GRID;
const SCALE_DEGREE_NAMES = ['R','b2','2','b3','3','4','b5','5','b6','6','b7','7'];

// ======== STATE ========
const AppState = {
  key: 0,
  mode: 'scale',  // 'scale' | 'chord' | 'input'
  scaleIdx: 0,
  octaveShift: 0, // -1, 0, +1, +2 — shifts entire grid like Push's octave up/down
  showParentScales: false, // Parent Scale panel toggle
  psSortMode: 'practical', // 'practical' | 'diatonic'
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
  toDAW: false,                  // Desktop: drag slots to DAW mode
  dawSelection: new Set(),       // Desktop: cmd+click multi-select for D&D to DAW
};

const PerformState = {
  activePad: null,              // 現在再生中のパッドインデックス
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
      guitarLabelMode: typeof guitarLabelMode !== 'undefined' ? guitarLabelMode : 'name',
      velThreshold: AppState.velThreshold,
      velDrive: AppState.velDrive,
      velCompand: AppState.velCompand,
      velRange: AppState.velRange,
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
    if (s.guitarLabelMode) guitarLabelMode = s.guitarLabelMode;
    if (s.velThreshold !== undefined) AppState.velThreshold = s.velThreshold;
    if (s.velDrive !== undefined) AppState.velDrive = s.velDrive;
    if (s.velCompand !== undefined) AppState.velCompand = s.velCompand;
    if (s.velRange !== undefined) AppState.velRange = s.velRange;
    // Migration: banks
    if (Array.isArray(s.banks) && s.banks.length > 0) {
      BankState.banks = s.banks;
      BankState.activeBankId = s.activeBankId || s.banks[0].id;
    } else if (Array.isArray(s.memory) && s.memory.length === 16) {
      // Legacy: wrap existing memory as "Bank 1"
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
  SCALES, NOTE_NAMES_SHARP, NOTE_NAMES_FLAT, FLAT_MAJOR_KEYS,
  BUILDER_QUALITIES, TENSION_ROWS, SCALE_AVAIL_TENSIONS,
  GRID, ROWS, COLS, BASE_MIDI, ROW_INTERVAL, COL_INTERVAL, PAD_SIZE, PAD_GAP, MARGIN,
  SCALE_DEGREE_NAMES, PC_TO_TENSION_NAME, TENSION_NAME_TO_PC,
  AppState, BuilderState, VoicingState, PlainState, PerformState, BankState,
  resetVoicingSelection, getParentMajorKey, pcName, onReady, IS_DEV,
  getActiveBank, syncMemoryToActiveBank, loadBankMemory,
};

