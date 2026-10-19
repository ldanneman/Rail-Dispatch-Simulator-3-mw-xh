// All dashboard metrics derive from scheduler output (spec §3, §6, §11).
// Formulas (documented):
// - onTimePct: on-time routed / routed * 100 (undeliverable excluded from both
//   numerator and denominator; they are reported separately).
// - avgDelay: mean of max(0, arrival - deadline) over routed shipments.
// - connection utilization: for each connection, peak-hour departures/capacity
//   and total departures; network utilization = total departures /
//   sum over connections of capacity * availableHours, where availableHours =
//   active hours (last arrival + 1, capped at 168) minus departure hours in
//   that window whose traversal would overlap a closure for that connection.
// - terminal throughput: counts of departures + arrivals per terminal (no
//   terminal handling capacity is modelled, so no % utilization per §11).
import { HORIZON } from './seed.js';
import { intervalsOverlap } from './scheduler.js';

// A departure hour is blocked when its traversal interval overlaps a closure.
export function blockedDepartureHours(conn, closures, upto = HORIZON) {
  const windows = (closures && closures[conn.id]) || [];
  if (!windows.length) return new Set();
  const blocked = new Set();
  for (let h = 0; h < upto; h++) {
    if (windows.some(([s, e]) => intervalsOverlap(h, h + conn.travelTime, s, e))) blocked.add(h);
  }
  return blocked;
}

export function computeMetrics(scenario, schedule) {
  const { results, used } = schedule;
  const routed = results.filter((r) => r.status === 'routed');
  const undeliverable = results.filter((r) => r.status === 'undeliverable');
  const onTime = routed.filter((r) => !r.late);
  const late = routed.filter((r) => r.late);
  const onTimePct = routed.length ? (onTime.length / routed.length) * 100 : 0;
  const avgDelay = routed.length ? routed.reduce((a, r) => a + (r.delay || 0), 0) / routed.length : 0;
  const maxArrival = routed.reduce((a, r) => Math.max(a, r.arrival || 0), 0);
  const activeHours = Math.min(HORIZON, Math.max(1, maxArrival + 1));

  const connStats = scenario.connections.map((c) => {
    const eff = schedule.effectiveConnections.find((e) => e.id === c.id) || c;
    let total = 0; let peak = 0; const hourly = {};
    for (const [k, v] of Object.entries(used)) {
      // Keys are "connectionId|hour"; parse from the right so ids stay intact.
      const sep = k.lastIndexOf('|');
      if (sep < 0) continue;
      if (k.slice(0, sep) === c.id) { total += v; peak = Math.max(peak, v); hourly[k.slice(sep + 1)] = v; }
    }
    const blocked = blockedDepartureHours(eff, schedule.closures, HORIZON);
    const blockedInWindow = [...blocked].filter((h) => h < activeHours).length;
    return {
      id: c.id, a: c.a, b: c.b, travelTime: eff.travelTime, capacity: eff.capacity,
      total, peak, peakPct: eff.capacity ? (peak / eff.capacity) * 100 : 0, hourly,
      closedHours: blocked.size, blockedInWindow,
    };
  });
  const capHours = connStats.reduce((a, c) => a + c.capacity * Math.max(0, activeHours - c.blockedInWindow), 0);
  const totalMoves = connStats.reduce((a, c) => a + c.total, 0);
  const networkUtilization = capHours ? (totalMoves / capHours) * 100 : 0;

  const throughput = {};
  for (const t of scenario.terminals) throughput[t.id] = { id: t.id, name: t.name, departures: 0, arrivals: 0 };
  for (const r of routed) for (const leg of r.legs) {
    if (throughput[leg.from]) throughput[leg.from].departures++;
    if (throughput[leg.to]) throughput[leg.to].arrivals++;
  }

  const alerts = [];
  for (const c of connStats) if (c.peakPct >= 100) alerts.push({ level: 'high', text: `Connection ${c.id} (${c.a}–${c.b}) is saturated: peak ${c.peak}/${c.capacity} departures in one hour.` });
  else if (c.peakPct >= 75) alerts.push({ level: 'medium', text: `Connection ${c.id} (${c.a}–${c.b}) near capacity: peak ${c.peak}/${c.capacity} per hour.` });
  for (const r of late) alerts.push({ level: 'medium', text: `Shipment ${r.shipmentId} is late by ${r.delay}h (arrives hour ${r.arrival}).` });
  for (const r of undeliverable) alerts.push({ level: 'high', text: `Shipment ${r.shipmentId} undeliverable: ${r.reason}` });

  return {
    total: results.length, routed: routed.length, undeliverable: undeliverable.length,
    onTime: onTime.length, late: late.length, onTimePct, avgDelay,
    maxArrival, totalMoves, networkUtilization, connStats,
    throughput: Object.values(throughput), alerts,
  };
}

export function compareSchedules(baseScenario, baseSchedule, newScenario, newSchedule) {
  const bm = computeMetrics(baseScenario, baseSchedule);
  const nm = computeMetrics(newScenario, newSchedule);
  const baseById = new Map(baseSchedule.results.map((r) => [r.shipmentId, r]));
  const newById = new Map(newSchedule.results.map((r) => [r.shipmentId, r]));
  const baseDeadline = new Map((baseScenario.shipments || []).map((s) => [s.id, s.deadline]));
  const newDeadline = new Map((newScenario.shipments || []).map((s) => [s.id, s.deadline]));
  const affected = []; const rerouted = []; const newlyLate = [];
  const ids = [...new Set([...baseById.keys(), ...newById.keys()])].sort((a, b) => String(a).localeCompare(String(b)));

  for (const id of ids) {
    const b = baseById.get(id); const r = newById.get(id);
    if (!b) { affected.push({ shipmentId: id, change: 'added shipment', baseArrival: null, newArrival: r.arrival, delta: null, reason: r.reason || null }); continue; }
    if (!r) { affected.push({ shipmentId: id, change: 'removed shipment', baseArrival: b.arrival, newArrival: null, delta: null, reason: null }); continue; }
    const parts = [];
    if (b.status !== r.status) {
      parts.push(r.status === 'undeliverable' ? 'became undeliverable' : 'recovered (undeliverable → routed)');
    } else {
      const routeB = JSON.stringify(b.legs.map((l) => l.connectionId));
      const routeR = JSON.stringify(r.legs.map((l) => l.connectionId));
      if (routeB !== routeR) { parts.push('rerouted'); rerouted.push(id); }
      else if (JSON.stringify(b.legs.map((l) => [l.connectionId, l.depart])) !== JSON.stringify(r.legs.map((l) => [l.connectionId, l.depart]))) parts.push('retimed (same route, new departure times)');
      if (b.arrival !== r.arrival && routeB === routeR && !parts.includes('retimed (same route, new departure times)')) parts.push('arrival changed');
      else if (b.arrival !== r.arrival && routeB !== routeR) parts.push('arrival changed');
    }
    if (b.status === 'routed' && r.status === 'routed' && b.late !== r.late) {
      if (r.late) { parts.push('newly late'); newlyLate.push(id); } else parts.push('no longer late');
    }
    if (baseDeadline.get(id) !== newDeadline.get(id)) parts.push(`deadline changed (${baseDeadline.get(id)} → ${newDeadline.get(id)})`);
    if (parts.length) {
      affected.push({
        shipmentId: id, change: parts.join('; '), baseArrival: b.arrival, newArrival: r.arrival,
        delta: b.arrival != null && r.arrival != null ? r.arrival - b.arrival : null, reason: r.reason || null,
      });
    }
  }
  return {
    base: bm, current: nm, affected, rerouted, newlyLate,
    delta: {
      onTimePct: nm.onTimePct - bm.onTimePct, avgDelay: nm.avgDelay - bm.avgDelay,
      utilization: nm.networkUtilization - bm.networkUtilization,
      rerouted: rerouted.length, undeliverable: nm.undeliverable - bm.undeliverable,
    },
  };
}
