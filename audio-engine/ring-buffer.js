// PAD DAW RingBuffer — SharedArrayBuffer-based lock-free command queue
// Main thread writes (ringWrite), Worklet thread reads (ringDrain).
// Command format: [sampleIndex (float), velocity (float), pitchRatio (float)]
// 3 floats per command, capacity = RING_CAPACITY commands.

var RING_FLOATS_PER_CMD = 3;
var RING_CAPACITY = 64; // max queued commands
var RING_DATA_FLOATS = RING_CAPACITY * RING_FLOATS_PER_CMD; // 192
// Layout: [writeHead (1 int), readHead (1 int)] + [data (192 floats)]
var RING_HEADER_BYTES = 8; // 2 x Int32
var RING_DATA_BYTES = RING_DATA_FLOATS * 4; // 192 x Float32
var RING_TOTAL_BYTES = RING_HEADER_BYTES + RING_DATA_BYTES;

// --- Main thread side ---

function ringCreate() {
  var sab = new SharedArrayBuffer(RING_TOTAL_BYTES);
  return {
    sab: sab,
    header: new Int32Array(sab, 0, 2),       // [writeHead, readHead]
    data: new Float32Array(sab, RING_HEADER_BYTES, RING_DATA_FLOATS)
  };
}

function ringWrite(ring, sampleIndex, velocity, pitchRatio) {
  var w = Atomics.load(ring.header, 0);
  var r = Atomics.load(ring.header, 1);
  // Check if full: (w + 1) % capacity === r
  var next = (w + 1) % RING_CAPACITY;
  if (next === r) return false; // queue full, drop
  var offset = w * RING_FLOATS_PER_CMD;
  ring.data[offset]     = sampleIndex;
  ring.data[offset + 1] = velocity;
  ring.data[offset + 2] = pitchRatio;
  Atomics.store(ring.header, 0, next);
  return true;
}

// --- Worklet thread side ---

function ringAttach(sab) {
  return {
    sab: sab,
    header: new Int32Array(sab, 0, 2),
    data: new Float32Array(sab, RING_HEADER_BYTES, RING_DATA_FLOATS)
  };
}

function ringDrain(ring, callback) {
  var r = Atomics.load(ring.header, 1);
  var w = Atomics.load(ring.header, 0);
  while (r !== w) {
    var offset = r * RING_FLOATS_PER_CMD;
    callback(
      ring.data[offset] | 0,       // sampleIndex (int)
      ring.data[offset + 1],       // velocity (float)
      ring.data[offset + 2]        // pitchRatio (float)
    );
    r = (r + 1) % RING_CAPACITY;
  }
  Atomics.store(ring.header, 1, r);
}
