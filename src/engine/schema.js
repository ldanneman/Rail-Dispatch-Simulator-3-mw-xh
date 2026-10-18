// Documented JSON import/export schema (spec §4, §7). schemaVersion: 1.
// { schemaVersion:1, name?, terminals:[{id,name,x,y}], connections:[{id,a,b,travelTime,capacity}],
//   shipments:[{id,origin,destination,release,deadline,priority,commodity?}],
//   disruptions:[{id,type,...}] }
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];

export function exportScenario(scenario, disruptions = []) {
  return JSON.stringify({
    schemaVersion: 1, name: scenario.name || 'Exported scenario',
    terminals: scenario.terminals, connections: scenario.connections,
    shipments: scenario.shipments, disruptions,
  }, null, 2);
}

export function validateImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, errors: [`Invalid JSON: ${e.message}`] }; }
  const errors = [];
  if (!data || typeof data !== 'object') return { ok: false, errors: ['Root must be a JSON object.'] };
  if (data.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  for (const k of ['terminals', 'connections', 'shipments']) if (!Array.isArray(data[k])) errors.push(`${k} must be an array.`);
  if (errors.length) return { ok: false, errors };
  if (data.disruptions !== undefined && !Array.isArray(data.disruptions)) errors.push('disruptions must be an array when present.');

  const tids = new Set();
  data.terminals.forEach((t, i) => {
    if (!t.id || typeof t.id !== 'string') errors.push(`terminals[${i}].id must be a non-empty string.`);
    if (tids.has(t.id)) errors.push(`Duplicate terminal id "${t.id}".`);
    tids.add(t.id);
    if (typeof t.name !== 'string' || !t.name) errors.push(`terminals[${i}].name is required.`);
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) errors.push(`terminals[${i}] (${t.id}) needs numeric x/y.`);
  });
  const cids = new Set();
  data.connections.forEach((c, i) => {
    if (!c.id) errors.push(`connections[${i}].id is required.`);
    if (cids.has(c.id)) errors.push(`Duplicate connection id "${c.id}".`);
    cids.add(c.id);
    if (!tids.has(c.a) || !tids.has(c.b)) errors.push(`connections[${i}] (${c.id}) references an unknown terminal.`);
    if (c.a === c.b) errors.push(`connections[${i}] (${c.id}) must join two different terminals.`);
    if (!Number.isInteger(c.travelTime) || c.travelTime < 1) errors.push(`connections[${i}] (${c.id}).travelTime must be an integer >= 1.`);
    if (!Number.isInteger(c.capacity) || c.capacity < 1) errors.push(`connections[${i}] (${c.id}).capacity must be an integer >= 1.`);
  });
  const sids = new Set();
  data.shipments.forEach((s, i) => {
    if (!s.id) errors.push(`shipments[${i}].id is required.`);
    if (sids.has(s.id)) errors.push(`Duplicate shipment id "${s.id}".`);
    sids.add(s.id);
    if (!tids.has(s.origin) || !tids.has(s.destination)) errors.push(`shipments[${i}] (${s.id}) references an unknown terminal.`);
    if (!Number.isInteger(s.release) || s.release < 0) errors.push(`shipments[${i}] (${s.id}).release must be an integer >= 0.`);
    if (!Number.isInteger(s.deadline) || s.deadline < 0) errors.push(`shipments[${i}] (${s.id}).deadline must be an integer >= 0.`);
    if (!PRIORITIES.includes(s.priority)) errors.push(`shipments[${i}] (${s.id}).priority must be one of ${PRIORITIES.join(', ')}.`);
  });
  (data.disruptions || []).forEach((d, i) => {
    if (!['closure', 'travelTime', 'capacity', 'releaseDelay'].includes(d.type)) errors.push(`disruptions[${i}].type is invalid.`);
    if ((d.type === 'closure' || d.type === 'travelTime' || d.type === 'capacity') && !cids.has(d.connectionId)) errors.push(`disruptions[${i}] references an unknown connection.`);
    if (d.type === 'closure' && (!Number.isInteger(d.start) || !Number.isInteger(d.end) || d.end <= d.start)) errors.push(`disruptions[${i}] closure needs integer start < end.`);
    if (d.type === 'travelTime' && (!Number.isInteger(d.newTravelTime) || d.newTravelTime < 1)) errors.push(`disruptions[${i}].newTravelTime must be an integer >= 1.`);
    if (d.type === 'capacity' && (!Number.isInteger(d.newCapacity) || d.newCapacity < 1)) errors.push(`disruptions[${i}].newCapacity must be an integer >= 1.`);
    if (d.type === 'releaseDelay' && (!sids.has(d.shipmentId) || !Number.isInteger(d.delayHours) || d.delayHours < 0)) errors.push(`disruptions[${i}] releaseDelay needs a known shipmentId and integer delayHours >= 0.`);
  });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true, errors: [],
    data: {
      name: data.name || 'Imported scenario',
      terminals: data.terminals, connections: data.connections, shipments: data.shipments,
      disruptions: data.disruptions || [],
    },
  };
}

// localStorage persistence helpers (spec §7).
const KEY = 'railDispatch.v1';
export function persistState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
export function loadPersisted() {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearPersisted() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
