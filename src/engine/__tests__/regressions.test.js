// Regression tests for the defects found in the independent Codex review.
// Each describe block maps to a numbered finding in
// rail-simulator-codex-review-comparison.md and asserts actual behaviour.
import { describe, it, expect } from 'vitest';
import { presetReference, presetClosure, generateDefaultDataset } from '../seed.js';
import { scheduleScenario, sanitizeDisruptions } from '../scheduler.js';
import { computeMetrics, compareSchedules, blockedDepartureHours } from '../metrics.js';
import { validateImport, validateDisruptionInput, pruneDisruptions, exportScenario, isValidPersistedState } from '../schema.js';

const ref = () => presetReference();
const refJson = (mutate) => { const d = JSON.parse(exportScenario(ref(), [])); if (mutate) mutate(d); return JSON.stringify(d); };

describe('finding 1: disruption values cannot bypass integer-hour validation', () => {
  it('form validator rejects fractional travel time, fractional capacity, negative delay and inverted closures', () => {
    const sc = ref();
    expect(validateDisruptionInput({ type: 'travelTime', connectionId: 'C1', newTravelTime: 1.5 }, sc)).toMatch(/integer/);
    expect(validateDisruptionInput({ type: 'capacity', connectionId: 'C1', newCapacity: 1.5 }, sc)).toMatch(/integer/);
    expect(validateDisruptionInput({ type: 'releaseDelay', shipmentId: 'R1', delayHours: -2 }, sc)).toMatch(/integer/);
    expect(validateDisruptionInput({ type: 'closure', connectionId: 'C1', start: 12, end: 9 }, sc)).toMatch(/start < end/);
    expect(validateDisruptionInput({ type: 'closure', connectionId: 'ZZ', start: 1, end: 2 }, sc)).toMatch(/unknown connection/);
    expect(validateDisruptionInput({ type: 'travelTime', connectionId: 'C1', newTravelTime: 3 }, sc)).toBeNull();
  });

  it('engine drops malformed disruptions instead of producing fractional or negative schedules', () => {
    const sc = ref();
    const frac = scheduleScenario(sc, [{ id: 'D1', type: 'travelTime', connectionId: 'C1', newTravelTime: 1.5 }]);
    expect(frac.results.map((r) => r.arrival)).toEqual([10, 11, 12]);
    const fracCap = scheduleScenario(sc, [{ id: 'D1', type: 'capacity', connectionId: 'C1', newCapacity: 1.5 }]);
    expect(fracCap.used['C1|8']).toBe(1); // not 2: fractional capacity never reserves extra slots
    const neg = scheduleScenario(sc, [{ id: 'D1', type: 'releaseDelay', shipmentId: 'R1', delayHours: -20 }]);
    expect(neg.results[0].legs[0].depart).toBe(8);
    expect(sanitizeDisruptions([{ type: 'closure', connectionId: 'C1', start: 2, end: 2 }], sc.connections, sc.shipments)).toEqual([]);
    expect(sanitizeDisruptions('junk', sc.connections, sc.shipments)).toEqual([]);
  });
});

describe('finding 2: malformed imports fail closed without throwing', () => {
  it('rejects null records in every array and a non-array disruptions value', () => {
    const cases = [
      (d) => { d.terminals[0] = null; }, (d) => { d.connections[0] = null; },
      (d) => { d.shipments[0] = null; }, (d) => { d.disruptions = [null]; },
      (d) => { d.disruptions = {}; }, (d) => { d.terminals = [null]; },
    ];
    for (const mutate of cases) {
      let res;
      expect(() => { res = validateImport(refJson(mutate)); }).not.toThrow();
      expect(res.ok).toBe(false); expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects non-string ids, separator ids and duplicate disruption ids', () => {
    expect(validateImport(refJson((d) => { d.shipments[0].id = 42; })).ok).toBe(false);
    expect(validateImport(refJson((d) => { d.connections[0].id = 7; })).ok).toBe(false);
    expect(validateImport(refJson((d) => { d.terminals[0].id = 3; })).ok).toBe(false);
    expect(validateImport(refJson((d) => { d.connections[0].id = 'C|1'; })).ok).toBe(false);
    const dup = (d) => { d.disruptions = [
      { id: 'D1', type: 'closure', connectionId: 'C1', start: 0, end: 2 },
      { id: 'D1', type: 'closure', connectionId: 'C1', start: 3, end: 4 }]; };
    expect(validateImport(refJson(dup)).ok).toBe(false);
    expect(validateImport(refJson((d) => { d.disruptions = [{ type: 'closure', connectionId: 'C1', start: 0, end: 2 }]; })).ok).toBe(false);
  });

  it('counts every movement in metrics for a valid schedule', () => {
    const sc = ref(); const m = computeMetrics(sc, scheduleScenario(sc, []));
    expect(m.totalMoves).toBe(6);
  });
});

describe('finding 3: deletions prune dependent disruptions (export re-imports cleanly)', () => {
  it('deleting connection C2 from the closure preset removes its closure and the export validates', () => {
    const cl = presetClosure();
    const after = { terminals: cl.terminals, connections: cl.connections.filter((c) => c.id !== 'C2'), shipments: cl.shipments };
    const pruned = pruneDisruptions(cl.disruptions, after);
    expect(pruned).toEqual([]);
    expect(validateImport(exportScenario(after, pruned)).ok).toBe(true);
  });

  it('deleting a shipment prunes its release delay; deleting a terminal prunes cascaded references', () => {
    const sc = ref();
    const delays = [{ id: 'D1', type: 'releaseDelay', shipmentId: 'R1', delayHours: 3 }];
    const noR1 = { ...sc, shipments: sc.shipments.filter((s) => s.id !== 'R1') };
    expect(pruneDisruptions(delays, noR1)).toEqual([]);
    const noB = { terminals: sc.terminals.filter((t) => t.id !== 'B'), connections: [], shipments: [] };
    expect(pruneDisruptions(presetClosure().disruptions, noB)).toEqual([]);
  });

  it('persisted-state guard rejects corrupt shapes and accepts the real App shape', () => {
    const d = generateDefaultDataset();
    const good = { baseline: { scenario: { name: 'b', ...d }, disruptions: [] }, working: { name: 'w', ...d }, disruptions: [] };
    expect(isValidPersistedState(good)).toBe(true);
    expect(isValidPersistedState({ baseline: {}, working: { terminals: [null] }, disruptions: [] })).toBe(false);
    expect(isValidPersistedState(null)).toBe(false);
    expect(isValidPersistedState({ baseline: { scenario: good.baseline.scenario, disruptions: [] }, working: { ...good.working, shipments: [{ id: 9 }] }, disruptions: [] })).toBe(false);
  });
});

describe('finding 4: comparison reports late, deadline, added and removed changes', () => {
  it('a deadline-only change that makes a shipment late is reported as newly late', () => {
    const base = ref(); const baseSch = scheduleScenario(base, []);
    const mod = JSON.parse(JSON.stringify(base)); mod.shipments[0].deadline = 9;
    const cmp = compareSchedules(base, baseSch, mod, scheduleScenario(mod, []));
    expect(cmp.current.onTimePct).toBeCloseTo(66.7, 1);
    expect(cmp.affected).toHaveLength(1);
    expect(cmp.affected[0].shipmentId).toBe('R1');
    expect(cmp.affected[0].change).toMatch(/newly late/);
    expect(cmp.newlyLate).toEqual(['R1']);
  });

  it('removed and added shipments appear in the affected list', () => {
    const base = ref(); const baseSch = scheduleScenario(base, []);
    const fewer = JSON.parse(JSON.stringify(base)); fewer.shipments = fewer.shipments.slice(0, 2);
    const cmpFewer = compareSchedules(base, baseSch, fewer, scheduleScenario(fewer, []));
    expect(cmpFewer.affected.map((a) => a.change)).toContain('removed shipment');
    const cmpMore = compareSchedules(fewer, scheduleScenario(fewer, []), base, baseSch);
    expect(cmpMore.affected.map((a) => a.change)).toContain('added shipment');
  });

  it('a disruption that delays arrival past the deadline labels the shipment newly late, and recovery is labelled too', () => {
    const base = ref(); const baseSch = scheduleScenario(base, []);
    const tight = JSON.parse(JSON.stringify(base)); tight.shipments.forEach((s) => { s.deadline = 10; });
    const tightBaseSch = scheduleScenario(tight, []);
    const delayed = scheduleScenario(tight, [{ id: 'D1', type: 'releaseDelay', shipmentId: 'R1', delayHours: 2 }]);
    const cmp = compareSchedules(tight, tightBaseSch, tight, delayed);
    const r1 = cmp.affected.find((a) => a.shipmentId === 'R1');
    expect(r1.change).toMatch(/newly late/);
    const back = compareSchedules(tight, delayed, tight, tightBaseSch);
    expect(back.affected.find((a) => a.shipmentId === 'R1').change).toMatch(/no longer late/);
    void base; void baseSch;
  });
});

describe('finding 5: capacity inspection covers the whole horizon incl. closures', () => {
  it('blocked departure hours reflect traversal overlap at any hour, including beyond hour 72', () => {
    const conn = { id: 'C1', travelTime: 1, capacity: 1 };
    expect([...blockedDepartureHours(conn, { C1: [[100, 110]] }, 168)]).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    const conn2 = { id: 'C1', travelTime: 2, capacity: 1 };
    // Departure at 8 traverses [8,10), which overlaps closure [9,12).
    expect(blockedDepartureHours(conn2, { C1: [[9, 12]] }, 168).has(8)).toBe(true);
    expect(blockedDepartureHours(conn2, { C1: [[9, 12]] }, 168).has(7)).toBe(false);
  });

  it('metrics expose closed hours per connection', () => {
    const cl = presetClosure();
    const m = computeMetrics(cl, scheduleScenario(cl, cl.disruptions));
    const c2 = m.connStats.find((c) => c.id === 'C2');
    expect(c2.closedHours).toBeGreaterThan(0);
  });
});

describe('finding 6: same-origin shipments respect the horizon', () => {
  const mk = (release) => ({ terminals: ref().terminals, connections: ref().connections, shipments: [{ id: 'SO1', origin: 'A', destination: 'A', release, deadline: release + 10, priority: 'medium' }] });
  it('release beyond 168h is undeliverable; release at/inside the horizon is delivered', () => {
    const beyond = scheduleScenario(mk(200), []).results[0];
    expect(beyond.status).toBe('undeliverable'); expect(beyond.reason).toMatch(/horizon/);
    expect(scheduleScenario(mk(169), []).results[0].status).toBe('undeliverable');
    const atEdge = scheduleScenario(mk(168), []).results[0];
    expect(atEdge.status).toBe('routed'); expect(atEdge.arrival).toBe(168);
    expect(scheduleScenario(mk(100), []).results[0].arrival).toBe(100);
  });
});

describe('finding 7 (coverage): a genuine capacity disruption changes the schedule', () => {
  it('raising both leg capacities to 3 lets all reference shipments arrive at hour 10', () => {
    const sc = ref();
    const sch = scheduleScenario(sc, [
      { id: 'D1', type: 'capacity', connectionId: 'C1', newCapacity: 3 },
      { id: 'D2', type: 'capacity', connectionId: 'C2', newCapacity: 3 },
    ]);
    expect(sch.results.map((r) => r.arrival)).toEqual([10, 10, 10]);
    const base = scheduleScenario(sc, []);
    expect(base.results.map((r) => r.arrival)).toEqual([10, 11, 12]);
  });
});
