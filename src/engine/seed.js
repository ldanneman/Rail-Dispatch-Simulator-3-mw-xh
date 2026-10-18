// Deterministic seeded dataset (spec §1, §11). Same seed => same network/shipments.
export const SEED = 20241017;
export const HORIZON = 168; // seven-day planning horizon, integer hours

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TERMINAL_DEFS = [
  { id: 'T1', name: 'Ironhaven', x: 80, y: 90 },
  { id: 'T2', name: 'Port Calder', x: 300, y: 60 },
  { id: 'T3', name: 'Kestrel Junction', x: 520, y: 110 },
  { id: 'T4', name: 'Brackenfield', x: 150, y: 260 },
  { id: 'T5', name: 'Millbrook', x: 380, y: 250 },
  { id: 'T6', name: 'Ostrov Point', x: 620, y: 270 },
  { id: 'T7', name: 'Hallow Creek', x: 260, y: 420 },
  { id: 'T8', name: 'Vantage Yard', x: 540, y: 430 },
];

// [a, b, travelTime, capacity] — bidirectional, capacity shared per §11.
export const CONNECTION_DEFS = [
  ['T1', 'T2', 3, 2], ['T1', 'T4', 2, 3], ['T2', 'T3', 3, 2], ['T2', 'T5', 4, 2],
  ['T3', 'T6', 3, 3], ['T4', 'T5', 2, 3], ['T4', 'T7', 3, 2], ['T5', 'T6', 3, 2],
  ['T5', 'T7', 3, 2], ['T5', 'T8', 4, 2], ['T6', 'T8', 3, 3], ['T7', 'T8', 4, 2],
  ['T1', 'T5', 5, 1], ['T3', 'T5', 4, 1], ['T2', 'T4', 4, 1], ['T6', 'T7', 6, 1],
];

const COMMODITIES = ['steel coils', 'grain', 'timber', 'containers', 'coal', 'chemicals', 'machinery', 'vehicles'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
export const PRIORITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

export function generateDefaultDataset(seed = SEED) {
  const rand = mulberry32(seed);
  const terminals = TERMINAL_DEFS.map((t) => ({ ...t }));
  const connections = CONNECTION_DEFS.map(([a, b, travelTime, capacity], i) => ({
    id: `C${i + 1}`, a, b, travelTime, capacity,
  }));
  const ids = terminals.map((t) => t.id);
  const shipments = [];
  for (let i = 0; i < 100; i++) {
    const oi = Math.floor(rand() * 8);
    let di = Math.floor(rand() * 8);
    if (di === oi) di = (di + 1 + Math.floor(rand() * 7)) % 8;
    const release = Math.floor(rand() * 49); // 0..48
    const slack = 10 + Math.floor(rand() * 38); // deadline slack over release
    const r = rand();
    const priority = r < 0.12 ? 'critical' : r < 0.38 ? 'high' : r < 0.75 ? 'medium' : 'low';
    shipments.push({
      id: `S${String(i + 1).padStart(3, '0')}`,
      origin: ids[oi], destination: ids[di],
      release, deadline: release + slack,
      priority, commodity: COMMODITIES[Math.floor(rand() * COMMODITIES.length)],
    });
  }
  return { terminals, connections, shipments };
}

// ---- Preset Test Lab scenarios (spec §4, §11) ----
export function presetReference() {
  return {
    name: 'Reference: Three-Terminal (A-B-C)',
    description: 'Spec §11 reference. Three identical-priority A→C shipments released at hour 8. Expected arrivals: 10, 11, 12.',
    terminals: [
      { id: 'A', name: 'Alpha (A)', x: 120, y: 140 },
      { id: 'B', name: 'Bravo (B)', x: 360, y: 140 },
      { id: 'C', name: 'Charlie (C)', x: 600, y: 140 },
    ],
    connections: [
      { id: 'C1', a: 'A', b: 'B', travelTime: 1, capacity: 1 },
      { id: 'C2', a: 'B', b: 'C', travelTime: 1, capacity: 1 },
    ],
    shipments: [1, 2, 3].map((n) => ({
      id: `R${n}`, origin: 'A', destination: 'C', release: 8, deadline: 30, priority: 'medium', commodity: 'test load',
    })),
    disruptions: [],
    expected: 'Earliest feasible arrivals are hours 10, 11, and 12 with no capacity violation.',
  };
}

export function presetNormal() {
  const d = generateDefaultDataset();
  return { name: 'Normal Routing (default network)', description: 'Full seeded 8-terminal network, 100 shipments, no disruptions.', ...d, disruptions: [] };
}

export function presetBottleneck() {
  return {
    name: 'Capacity Bottleneck',
    description: 'Line A-B-C-D where B-C admits only 1 movement/hour; six A→D shipments contend for it.',
    terminals: [
      { id: 'A', name: 'Alpha (A)', x: 90, y: 140 }, { id: 'B', name: 'Bravo (B)', x: 270, y: 140 },
      { id: 'C', name: 'Charlie (C)', x: 450, y: 140 }, { id: 'D', name: 'Delta (D)', x: 630, y: 140 },
    ],
    connections: [
      { id: 'C1', a: 'A', b: 'B', travelTime: 1, capacity: 3 },
      { id: 'C2', a: 'B', b: 'C', travelTime: 2, capacity: 1 },
      { id: 'C3', a: 'C', b: 'D', travelTime: 1, capacity: 3 },
    ],
    shipments: Array.from({ length: 6 }, (_, i) => ({
      id: `B${i + 1}`, origin: 'A', destination: 'D', release: 0, deadline: 12, priority: i < 2 ? 'high' : 'medium', commodity: 'bottleneck test',
    })),
    disruptions: [],
  };
}

export function presetClosure() {
  const base = presetReference();
  return {
    ...base, name: 'Connection Closure',
    description: 'B-C closed during hours [9, 12). A→C shipments must wait until the line reopens.',
    disruptions: [{ id: 'D1', type: 'closure', connectionId: 'C2', start: 9, end: 12 }],
  };
}

export function presetDisconnected() {
  return {
    name: 'Disconnected Network',
    description: 'Terminal D has no connections; shipments to D are undeliverable and must be identified as such.',
    terminals: [
      { id: 'A', name: 'Alpha (A)', x: 120, y: 120 }, { id: 'B', name: 'Bravo (B)', x: 360, y: 120 },
      { id: 'C', name: 'Charlie (C)', x: 600, y: 120 }, { id: 'D', name: 'Isolated (D)', x: 360, y: 340 },
    ],
    connections: [
      { id: 'C1', a: 'A', b: 'B', travelTime: 1, capacity: 2 },
      { id: 'C2', a: 'B', b: 'C', travelTime: 1, capacity: 2 },
    ],
    shipments: [
      { id: 'X1', origin: 'A', destination: 'C', release: 0, deadline: 20, priority: 'high', commodity: 'containers' },
      { id: 'X2', origin: 'A', destination: 'D', release: 0, deadline: 20, priority: 'high', commodity: 'containers' },
      { id: 'X3', origin: 'D', destination: 'A', release: 0, deadline: 20, priority: 'medium', commodity: 'grain' },
    ],
    disruptions: [],
  };
}

export function presetConflictingDeadlines() {
  return {
    name: 'Conflicting Delivery Deadlines',
    description: 'Five A→C shipments, capacity 1/hour per leg, deadlines that cannot all be met. Critical shipments are scheduled first; the rest arrive late but are still delivered.',
    terminals: presetReference().terminals,
    connections: presetReference().connections,
    shipments: [
      { id: 'K1', origin: 'A', destination: 'C', release: 0, deadline: 3, priority: 'critical', commodity: 'urgent parts' },
      { id: 'K2', origin: 'A', destination: 'C', release: 0, deadline: 3, priority: 'critical', commodity: 'urgent parts' },
      { id: 'K3', origin: 'A', destination: 'C', release: 0, deadline: 3, priority: 'high', commodity: 'machinery' },
      { id: 'K4', origin: 'A', destination: 'C', release: 0, deadline: 4, priority: 'medium', commodity: 'grain' },
      { id: 'K5', origin: 'A', destination: 'C', release: 0, deadline: 5, priority: 'low', commodity: 'timber' },
    ],
    disruptions: [],
  };
}

export function allPresets() {
  return [presetReference(), presetNormal(), presetBottleneck(), presetClosure(), presetDisconnected(), presetConflictingDeadlines()];
}
