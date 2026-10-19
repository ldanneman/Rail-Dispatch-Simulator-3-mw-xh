// Documented JSON import/export schema (spec §4, §7). schemaVersion: 1.
// { schemaVersion:1, name?, terminals:[{id,name,x,y}], connections:[{id,a,b,travelTime,capacity}],
//   shipments:[{id,origin,destination,release,deadline,priority,commodity?}],
//   disruptions:[{id,type,...}] }
// Validation fails closed: any malformed record rejects the whole import with
// itemised errors; nothing here ever throws on untrusted input.
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];
export const DISRUPTION_TYPES = ['closure', 'travelTime', 'capacity', 'releaseDelay'];

function isRecord(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
// Ids must be non-empty strings without the reservation-key separator '|'
// (used in "connectionId|hour" keys and route path strings).
function isValidId(v) { return typeof v === 'string' && v.length > 0 && !v.includes('|'); }

export function validateDisruptionRecord(d, i, cids, sids, errors) {
  if (!isRecord(d)) { errors.push(`disruptions[${i}] must be an object.`); return; }
  if (!isValidId(d.id)) errors.push(`disruptions[${i}].id must be a non-empty string without '|'.`);
  if (!DISRUPTION_TYPES.includes(d.type)) { errors.push(`disruptions[${i}].type is invalid.`); return; }
  if (d.type === 'closure' || d.type === 'travelTime' || d.type === 'capacity') {
    if (!cids.has(d.connectionId)) errors.push(`disruptions[${i}] references an unknown connection.`);
  }
  if (d.type === 'closure' && (!Number.isInteger(d.start) || !Number.isInteger(d.end) || d.start < 0 || d.end <= d.start)) errors.push(`disruptions[${i}] closure needs integer hours with 0 <= start < end.`);
  if (d.type === 'travelTime' && (!Number.isInteger(d.newTravelTime) || d.newTravelTime < 1)) errors.push(`disruptions[${i}].newTravelTime must be an integer >= 1.`);
  if (d.type === 'capacity' && (!Number.isInteger(d.newCapacity) || d.newCapacity < 1)) errors.push(`disruptions[${i}].newCapacity must be an integer >= 1.`);
  if (d.type === 'releaseDelay' && (!sids.has(d.shipmentId) || !Number.isInteger(d.delayHours) || d.delayHours < 0)) errors.push(`disruptions[${i}] releaseDelay needs a known shipmentId and integer delayHours >= 0.`);
}

// Validate a scenario-shaped object ({terminals, connections, shipments,
// disruptions?}) without the JSON/schemaVersion wrapper. Returns error strings.
export function validateScenarioData(data) {
  const errors = [];
  if (!isRecord(data)) return ['Scenario must be a JSON object.'];
  for (const k of ['terminals', 'connections', 'shipments']) if (!Array.isArray(data[k])) errors.push(`${k} must be an array.`);
  if (data.disruptions !== undefined && !Array.isArray(data.disruptions)) errors.push('disruptions must be an array when present.');
  if (errors.length) return errors;

  const tids = new Set();
  data.terminals.forEach((t, i) => {
    if (!isRecord(t)) { errors.push(`terminals[${i}] must be an object.`); return; }
    if (!isValidId(t.id)) errors.push(`terminals[${i}].id must be a non-empty string without '|'.`);
    else if (tids.has(t.id)) errors.push(`Duplicate terminal id "${t.id}".`);
    tids.add(t.id);
    if (typeof t.name !== 'string' || !t.name) errors.push(`terminals[${i}].name is required.`);
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) errors.push(`terminals[${i}] (${t.id}) needs numeric x/y.`);
  });
  const cids = new Set();
  data.connections.forEach((c, i) => {
    if (!isRecord(c)) { errors.push(`connections[${i}] must be an object.`); return; }
    if (!isValidId(c.id)) errors.push(`connections[${i}].id must be a non-empty string without '|'.`);
    else if (cids.has(c.id)) errors.push(`Duplicate connection id "${c.id}".`);
    cids.add(c.id);
    if (!tids.has(c.a) || !tids.has(c.b)) errors.push(`connections[${i}] (${c.id}) references an unknown terminal.`);
    if (c.a === c.b) errors.push(`connections[${i}] (${c.id}) must join two different terminals.`);
    if (!Number.isInteger(c.travelTime) || c.travelTime < 1) errors.push(`connections[${i}] (${c.id}).travelTime must be an integer >= 1.`);
    if (!Number.isInteger(c.capacity) || c.capacity < 1) errors.push(`connections[${i}] (${c.id}).capacity must be an integer >= 1.`);
  });
  const sids = new Set();
  data.shipments.forEach((s, i) => {
    if (!isRecord(s)) { errors.push(`shipments[${i}] must be an object.`); return; }
    if (!isValidId(s.id)) errors.push(`shipments[${i}].id must be a non-empty string without '|'.`);
    else if (sids.has(s.id)) errors.push(`Duplicate shipment id "${s.id}".`);
    sids.add(s.id);
    if (!tids.has(s.origin) || !tids.has(s.destination)) errors.push(`shipments[${i}] (${s.id}) references an unknown terminal.`);
    if (!Number.isInteger(s.release) || s.release < 0) errors.push(`shipments[${i}] (${s.id}).release must be an integer >= 0.`);
    if (!Number.isInteger(s.deadline) || s.deadline < 0) errors.push(`shipments[${i}] (${s.id}).deadline must be an integer >= 0.`);
    if (!PRIORITIES.includes(s.priority)) errors.push(`shipments[${i}] (${s.id}).priority must be one of ${PRIORITIES.join(', ')}.`);
  });
  const dids = new Set();
  (data.disruptions || []).forEach((d, i) => {
    if (isRecord(d)) {
      if (isValidId(d.id) && dids.has(d.id)) errors.push(`Duplicate disruption id "${d.id}".`);
      dids.add(d.id);
    }
    validateDisruptionRecord(d, i, cids, sids, errors);
  });
  return errors;
}

// Validate one disruption built by the Disruption form against a scenario.
// Returns an error string, or null when valid. (Spec §5, integer-hour rule.)
export function validateDisruptionInput(d, scenario) {
  if (!isRecord(d) || !DISRUPTION_TYPES.includes(d.type)) return 'Choose a valid disruption type.';
  const cids = new Set(scenario.connections.map((c) => c.id));
  const sids = new Set(scenario.shipments.map((s) => s.id));
  const errors = [];
  validateDisruptionRecord({ ...d, id: d.id || 'form' }, 0, cids, sids, errors);
  return errors.length ? errors[0].replace('disruptions[0]', 'Disruption') : null;
}

// Drop disruptions whose connection/shipment references no longer exist.
// Used when records are deleted so an export can never reference a ghost.
export function pruneDisruptions(disruptions, scenario) {
  const cids = new Set(scenario.connections.map((c) => c.id));
  const sids = new Set(scenario.shipments.map((s) => s.id));
  return disruptions.filter((d) => (d.type === 'releaseDelay' ? sids.has(d.shipmentId) : cids.has(d.connectionId)));
}

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
  if (!isRecord(data)) return { ok: false, errors: ['Root must be a JSON object.'] };
  const errors = [];
  if (data.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  errors.push(...validateScenarioData(data));
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
// True only when persisted state has the real App shape and valid records, so
// corrupt or legacy storage falls back to the seeded default instead of
// crashing the scheduler on reload.
export function isValidPersistedState(state) {
  if (!isRecord(state) || !isRecord(state.baseline) || !isRecord(state.working) || !Array.isArray(state.disruptions)) return false;
  if (validateScenarioData(state.working).length) return false;
  if (validateScenarioData(state.baseline.scenario).length) return false;
  if (!Array.isArray(state.baseline.disruptions)) return false;
  const chk = (scenario, ds) => {
    const cids = new Set(scenario.connections.map((c) => c.id));
    const sids = new Set(scenario.shipments.map((s) => s.id));
    const errs = []; const seen = new Set();
    ds.forEach((d, i) => { if (isRecord(d) && isValidId(d.id)) { if (seen.has(d.id)) errs.push('dup'); seen.add(d.id); } validateDisruptionRecord(d, i, cids, sids, errs); });
    return errs.length === 0;
  };
  return chk(state.working, state.disruptions) && chk(state.baseline.scenario, state.baseline.disruptions);
}
export function clearPersisted() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
