// All dashboard metrics derive from scheduler output (spec §3, §6, §11).
// Formulas (documented):
// - onTimePct: on-time routed / routed * 100 (undeliverable excluded from both
//   numerator and denominator; they are reported separately).
// - avgDelay: mean of max(0, arrival - deadline) over routed shipments.
// - connection utilization: for each connection, peak-hour departures/capacity
//   and total departures; network utilization = total departures /
//   sum(capacity * activeHours) where activeHours = last arrival hour + 1.
// - terminal throughput: counts of departures + arrivals per terminal (no
//   terminal handling capacity is modelled, so no % utilization per §11).

export function computeMetrics(scenario, schedule) {
  const { results, used } = schedule;
  const routed = results.filter((r) => r.status === 'routed');
  const undeliverable = results.filter((r) => r.status === 'undeliverable');
  const onTime = routed.filter((r) => !r.late);
  const late = routed.filter((r) => r.late);
  const onTimePct = routed.length ? (onTime.length / routed.length) * 100 : 0;
  const avgDelay = routed.length ? routed.reduce((a, r) => a + (r.delay || 0), 0) / routed.length : 0;
  const maxArrival = routed.reduce((a, r) => Math.max(a, r.arrival || 0), 0);

  const connStats = scenario.connections.map((c) => {
    const eff = schedule.effectiveConnections.find((e) => e.id === c.id) || c;
    let total = 0; let peak = 0; const hourly = {};
    for (const [k, v] of Object.entries(used)) {
      const [cid, h] = k.split('|');
      if (cid === c.id) { total += v; peak = Math.max(peak, v); hourly[h] = v; }
    }
    return {
      id: c.id, a: c.a, b: c.b, travelTime: eff.travelTime, capacity: eff.capacity,
      total, peak, peakPct: eff.capacity ? (peak / eff.capacity) * 100 : 0, hourly,
    };
  });
  const activeHours = Math.max(1, maxArrival + 1);
  const capHours = connStats.reduce((a, c) => a + c.capacity * activeHours, 0);
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
  const affected = []; const rerouted = [];
  for (const r of newSchedule.results) {
    const b = baseById.get(r.shipmentId);
    if (!b) { affected.push({ shipmentId: r.shipmentId, change: 'new shipment', baseArrival: null, newArrival: r.arrival }); continue; }
    const sameRoute = JSON.stringify(b.legs.map((l) => [l.connectionId, l.depart])) === JSON.stringify(r.legs.map((l) => [l.connectionId, l.depart]));
    if (b.status !== r.status || b.arrival !== r.arrival || !sameRoute) {
      affected.push({ shipmentId: r.shipmentId, change: b.status !== r.status ? `${b.status} → ${r.status}` : 'schedule changed', baseArrival: b.arrival, newArrival: r.arrival, delta: b.arrival != null && r.arrival != null ? r.arrival - b.arrival : null, reason: r.reason });
      if (b.status === 'routed' && r.status === 'routed' && JSON.stringify(b.legs.map((l) => l.connectionId)) !== JSON.stringify(r.legs.map((l) => l.connectionId))) rerouted.push(r.shipmentId);
    }
  }
  return {
    base: bm, current: nm, affected, rerouted,
    delta: {
      onTimePct: nm.onTimePct - bm.onTimePct, avgDelay: nm.avgDelay - bm.avgDelay,
      utilization: nm.networkUtilization - bm.networkUtilization,
      rerouted: rerouted.length, undeliverable: nm.undeliverable - bm.undeliverable,
    },
  };
}
