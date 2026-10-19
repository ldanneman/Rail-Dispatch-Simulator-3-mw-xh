import { describe, it, expect } from 'vitest';
import { generateDefaultDataset, presetReference, presetDisconnected, presetConflictingDeadlines, HORIZON } from '../seed.js';
import { scheduleScenario, effectiveConnections } from '../scheduler.js';
import { computeMetrics, compareSchedules } from '../metrics.js';
import { validateImport, exportScenario } from '../schema.js';

const ref = () => presetReference();

function assertConstraints(scenario, disruptions, schedule) {
  const eff = Object.fromEntries(schedule.effectiveConnections.map((c) => [c.id, c]));
  // capacity never exceeded
  for (const [k, v] of Object.entries(schedule.used)) {
    const cid = k.split('|')[0];
    expect(v).toBeLessThanOrEqual(eff[cid].capacity);
  }
  for (const r of schedule.results) {
    const s = schedule.byId[r.shipmentId];
    let prevArr = null;
    for (const leg of r.legs) {
      expect(leg.depart).toBeGreaterThanOrEqual(s.release); // never before release (first leg); waits only add time
      if (prevArr !== null) expect(leg.depart).toBeGreaterThanOrEqual(prevArr);
      expect(leg.arrive - leg.depart).toBe(eff[leg.connectionId].travelTime);
      prevArr = leg.arrive;
    }
    if (r.status === 'routed' && r.legs.length) expect(r.arrival).toBe(r.legs[r.legs.length - 1].arrive);
    if (r.status === 'routed') expect(r.arrival).toBeLessThanOrEqual(HORIZON);
  }
  void scenario; void disruptions;
}

describe('seeded default dataset (spec §1)', () => {
  it('has 8 terminals, >=14 connections, 100 shipments and is deterministic', () => {
    const a = generateDefaultDataset(); const b = generateDefaultDataset();
    expect(a.terminals).toHaveLength(8);
    expect(a.connections.length).toBeGreaterThanOrEqual(14);
    expect(a.shipments).toHaveLength(100);
    expect(a).toEqual(b);
  });
});

describe('reference three-terminal scenario (spec §11)', () => {
  it('produces arrivals 10, 11, 12 without violating capacity', () => {
    const sc = ref(); const sch = scheduleScenario(sc, []);
    const arrivals = sch.results.map((r) => r.arrival).sort((x, y) => x - y);
    expect(arrivals).toEqual([10, 11, 12]);
    assertConstraints(sc, [], sch);
  });
});

describe('scheduler invariants (spec §8)', () => {
  it('never departs before release and never exceeds capacity on the default network', () => {
    const sc = generateDefaultDataset(); const sch = scheduleScenario(sc, []);
    assertConstraints(sc, [], sch);
  });

  it('does not use a closed connection during its closure period', () => {
    const sc = ref();
    const disruptions = [{ id: 'D1', type: 'closure', connectionId: 'C2', start: 9, end: 12 }];
    const sch = scheduleScenario(sc, disruptions);
    for (const r of sch.results) for (const leg of r.legs) {
      if (leg.connectionId === 'C2') expect(leg.arrive <= 9 || leg.depart >= 12).toBe(true);
    }
    // First shipment can arrive 10? No: B-C traversal [9,10) overlaps [9,12) so earliest B-C depart is 12 => arrival 13.
    expect(sch.results.map((r) => r.arrival).sort((a, b) => a - b)).toEqual([13, 14, 15]);
  });

  it('identifies shipments with no feasible route (disconnected)', () => {
    const sc = presetDisconnected(); const sch = scheduleScenario(sc, []);
    const byId = Object.fromEntries(sch.results.map((r) => [r.shipmentId, r]));
    expect(byId.X1.status).toBe('routed');
    expect(byId.X2.status).toBe('undeliverable');
    expect(byId.X3.status).toBe('undeliverable');
    expect(byId.X2.reason).toMatch(/disconnected|No path/);
  });

  it('calculates arrival across multiple connections including waiting', () => {
    const sc = ref(); const sch = scheduleScenario(sc, []);
    const second = sch.results[1];
    // Shipment R2: A-B depart 9 arrive 10 (waits for slot), B-C depart 10 arrive 11.
    expect(second.legs).toHaveLength(2);
    expect(second.arrival).toBe(11);
    expect(second.legs[0].depart).toBeGreaterThanOrEqual(8);
  });

  it('repeated execution with identical input produces identical output', () => {
    const sc = generateDefaultDataset();
    expect(scheduleScenario(sc, [])).toEqual(scheduleScenario(sc, []));
  });

  it('classifies missed deadlines as late, not undeliverable', () => {
    const sc = presetConflictingDeadlines(); const sch = scheduleScenario(sc, []);
    expect(sch.results.every((r) => r.status === 'routed')).toBe(true);
    expect(sch.results.some((r) => r.late)).toBe(true);
    // Critical shipments first: K1 arrives 2 (on time vs deadline 3).
    const k1 = sch.results.find((r) => r.shipmentId === 'K1');
    expect(k1.arrival).toBe(2); expect(k1.late).toBe(false);
  });

  it('applies travel-time and release-delay disruptions', () => {
    const sc = ref();
    const sch = scheduleScenario(sc, [{ id: 'D1', type: 'travelTime', connectionId: 'C1', newTravelTime: 3 }]);
    expect(sch.results[0].arrival).toBe(8 + 3 + 1);
    const sch2 = scheduleScenario(sc, [{ id: 'D2', type: 'releaseDelay', shipmentId: 'R1', delayHours: 5 }]);
    expect(sch2.results[0].legs[0].depart).toBeGreaterThanOrEqual(13);
  });

  it('marks shipments undeliverable when horizon is exceeded by extreme travel time', () => {
    const sc = ref();
    const sch = scheduleScenario(sc, [{ id: 'D1', type: 'travelTime', connectionId: 'C1', newTravelTime: 200 }]);
    expect(sch.results.every((r) => r.status === 'undeliverable')).toBe(true);
  });
});

describe('scenario isolation (spec §6/§8)', () => {
  it('replanning a disrupted copy does not modify the baseline', () => {
    const base = generateDefaultDataset();
    const baseSnapshot = JSON.parse(JSON.stringify(base));
    const baseSch = scheduleScenario(base, []);
    const disrupted = JSON.parse(JSON.stringify(base));
    disrupted.connections[0].capacity = 1;
    const newSch = scheduleScenario(disrupted, [{ id: 'D1', type: 'closure', connectionId: disrupted.connections[1].id, start: 0, end: 40 }]);
    expect(base).toEqual(baseSnapshot);
    expect(scheduleScenario(base, [])).toEqual(baseSch);
    const cmp = compareSchedules(base, baseSch, disrupted, newSch);
    expect(cmp.base.total).toBe(100);
    expect(Array.isArray(cmp.affected)).toBe(true);
  });
});

describe('import validation (spec §4/§7)', () => {
  it('accepts a valid export and rejects malformed data', () => {
    const sc = ref();
    const good = validateImport(exportScenario(sc, []));
    expect(good.ok).toBe(true); expect(good.data.shipments).toHaveLength(3);
    expect(validateImport('{not json').ok).toBe(false);
    expect(validateImport(JSON.stringify({ schemaVersion: 2, terminals: [], connections: [], shipments: [] })).ok).toBe(false);
    const bad = JSON.parse(exportScenario(sc, [])); bad.shipments[0].origin = 'ZZZ';
    expect(validateImport(JSON.stringify(bad)).ok).toBe(false);
    const dup = JSON.parse(exportScenario(sc, [])); dup.shipments[1].id = dup.shipments[0].id;
    expect(validateImport(JSON.stringify(dup)).ok).toBe(false);
  });
});

describe('metrics derive from schedule', () => {
  it('computes on-time %, delay and utilization from results', () => {
    const sc = ref(); const sch = scheduleScenario(sc, []); const m = computeMetrics(sc, sch);
    expect(m.total).toBe(3); expect(m.routed).toBe(3); expect(m.onTimePct).toBe(100);
    expect(m.totalMoves).toBe(6);
    expect(m.throughput.find((t) => t.id === 'A').departures).toBe(3);
  });
});
