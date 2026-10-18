// Scheduling engine (spec §2, §11).
// Algorithm: priority-ordered greedy earliest-arrival routing. Shipments are
// ordered by priority (desc), deadline, release, then id (deterministic
// tie-break). Each shipment is routed with a time-dependent Dijkstra search
// over integer-hour departure slots that respects per-slot departure capacity
// (shared across both directions), closure overlap, release times, and the
// 168h horizon. Reservations are committed before the next shipment runs.
// This is a consistent heuristic, not a claim of global optimality: earlier
// (more urgent) shipments get first claim on capacity.
import { HORIZON, PRIORITY_WEIGHT } from './seed.js';

export function effectiveConnections(connections, disruptions = []) {
  const travel = new Map(); const cap = new Map();
  for (const d of disruptions) {
    if (d.type === 'travelTime' && d.connectionId) travel.set(d.connectionId, d.newTravelTime);
    if (d.type === 'capacity' && d.connectionId) cap.set(d.connectionId, d.newCapacity);
  }
  return connections.map((c) => ({
    ...c,
    travelTime: travel.has(c.id) ? travel.get(c.id) : c.travelTime,
    capacity: cap.has(c.id) ? cap.get(c.id) : c.capacity,
  }));
}

export function effectiveShipments(shipments, disruptions = []) {
  const delay = new Map();
  for (const d of disruptions) if (d.type === 'releaseDelay' && d.shipmentId) delay.set(d.shipmentId, (delay.get(d.shipmentId) || 0) + (d.delayHours || 0));
  return shipments.map((s) => ({ ...s, release: s.release + (delay.get(s.id) || 0) }));
}

export function closuresByConnection(disruptions = []) {
  const m = new Map();
  for (const d of disruptions) if (d.type === 'closure' && d.connectionId) {
    if (!m.has(d.connectionId)) m.set(d.connectionId, []);
    m.get(d.connectionId).push([d.start, d.end]);
  }
  return m;
}

// Intervals are half-open [start, end): overlap iff aStart < bEnd && bStart < aEnd.
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function adjacency(connections) {
  const adj = new Map();
  for (const c of connections) {
    if (!adj.has(c.a)) adj.set(c.a, []);
    if (!adj.has(c.b)) adj.set(c.b, []);
    adj.get(c.a).push({ conn: c, to: c.b });
    adj.get(c.b).push({ conn: c, to: c.a });
  }
  for (const list of adj.values()) list.sort((x, y) => x.conn.id.localeCompare(y.conn.id) || x.to.localeCompare(y.to));
  return adj;
}

function reachable(terminals, connections, from, to) {
  const adj = adjacency(connections); const seen = new Set([from]); const q = [from];
  while (q.length) { const n = q.shift(); if (n === to) return true; for (const e of adj.get(n) || []) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }
  return false;
}

// Earliest integer departure >= earliest for conn, honouring capacity + closures.
function earliestDeparture(conn, earliest, used, closures) {
  const cls = closures.get(conn.id) || [];
  for (let d = earliest; d + conn.travelTime <= HORIZON; d++) {
    if (cls.some(([s, e]) => intervalsOverlap(d, d + conn.travelTime, s, e))) continue;
    if ((used.get(`${conn.id}|${d}`) || 0) >= conn.capacity) continue;
    return d;
  }
  return null;
}

function orderShipments(shipments) {
  return [...shipments].sort((a, b) =>
    (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0) ||
    a.deadline - b.deadline || a.release - b.release || a.id.localeCompare(b.id));
}

// Time-dependent Dijkstra: cost = (arrival, hops, pathKey) lexicographic.
function routeOne(shipment, adj, used, closures) {
  const start = shipment.origin, goal = shipment.destination;
  const best = new Map(); // node -> {time, hops, pathKey, legs}
  const pq = [{ node: start, time: shipment.release, hops: 0, pathKey: start, legs: [] }];
  best.set(start, { time: shipment.release, hops: 0, pathKey: start });
  while (pq.length) {
    pq.sort((a, b) => a.time - b.time || a.hops - b.hops || a.pathKey.localeCompare(b.pathKey));
    const cur = pq.shift();
    const b = best.get(cur.node);
    if (cur.time !== b.time || cur.hops !== b.hops || cur.pathKey !== b.pathKey) continue;
    if (cur.node === goal) return cur;
    for (const { conn, to } of adj.get(cur.node) || []) {
      const dep = earliestDeparture(conn, cur.time, used, closures);
      if (dep === null) continue;
      const arr = dep + conn.travelTime;
      const cand = {
        node: to, time: arr, hops: cur.hops + 1, pathKey: `${cur.pathKey}>${to}`,
        legs: [...cur.legs, { connectionId: conn.id, from: cur.node, to, depart: dep, arrive: arr, wait: dep - cur.time, travelTime: conn.travelTime }],
      };
      const prev = best.get(to);
      if (!prev || cand.time < prev.time || (cand.time === prev.time && (cand.hops < prev.hops || (cand.hops === prev.hops && cand.pathKey < prev.pathKey)))) {
        best.set(to, { time: cand.time, hops: cand.hops, pathKey: cand.pathKey });
        pq.push(cand);
      }
    }
  }
  return null;
}

export function scheduleScenario({ terminals, connections, shipments }, disruptions = []) {
  const conns = effectiveConnections(connections, disruptions);
  const ships = effectiveShipments(shipments, disruptions);
  const closures = closuresByConnection(disruptions);
  const adj = adjacency(conns);
  const used = new Map(); // "connId|hour" -> departures count
  const results = [];
  const byId = new Map(ships.map((s) => [s.id, s]));

  for (const s of orderShipments(ships)) {
    if (s.origin === s.destination) {
      results.push({ shipmentId: s.id, status: 'routed', legs: [], arrival: s.release, late: s.release > s.deadline, delay: Math.max(0, s.release - s.deadline), reason: null });
      continue;
    }
    const found = routeOne(s, adj, used, closures);
    if (!found) {
      const connected = reachable(terminals, conns, s.origin, s.destination);
      const reason = !connected
        ? `No path exists from ${s.origin} to ${s.destination} in the network (disconnected).`
        : `No feasible schedule within the ${HORIZON}h horizon: capacity slots and/or closure windows block every route.`;
      results.push({ shipmentId: s.id, status: 'undeliverable', legs: [], arrival: null, late: false, delay: null, reason });
      continue;
    }
    for (const leg of found.legs) used.set(`${leg.connectionId}|${leg.depart}`, (used.get(`${leg.connectionId}|${leg.depart}`) || 0) + 1);
    results.push({
      shipmentId: s.id, status: 'routed', legs: found.legs, arrival: found.time,
      late: found.time > s.deadline, delay: Math.max(0, found.time - s.deadline), reason: null,
    });
  }
  // Present results in original shipment order for stable display; scheduling
  // order above is internal. Determinism is preserved either way.
  const order = new Map(shipments.map((s, i) => [s.id, i]));
  results.sort((a, b) => order.get(a.shipmentId) - order.get(b.shipmentId));
  return { results, used: Object.fromEntries(used), effectiveConnections: conns, effectiveShipments: ships, byId: Object.fromEntries(byId) };
}
