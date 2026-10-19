import React, { useState } from 'react';
import { allPresets } from '../engine/seed.js';
import { exportScenario, validateImport, pruneDisruptions } from '../engine/schema.js';

function nextId(prefix, items) {
  let n = items.length + 1;
  const ids = new Set(items.map((i) => i.id));
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export default function TestLab({ scenario, setScenario, disruptions, setDisruptions, onImportScenario, onSaveBaseline, notice }) {
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState(null);
  const presets = allPresets();

  const upd = (fn) => setScenario((prev) => { const copy = JSON.parse(JSON.stringify(prev)); fn(copy); return copy; });
  // Deleting a record also deletes every disruption that references it (or
  // references a record removed as a consequence), so the working state can
  // never export a file its own importer would reject.
  const deleteWithCleanup = (mutate) => {
    const copy = JSON.parse(JSON.stringify(scenario));
    mutate(copy);
    setScenario(copy);
    if (setDisruptions) setDisruptions(pruneDisruptions(disruptions, copy));
  };
  const removeTerminal = (id) => deleteWithCleanup((c) => { c.terminals = c.terminals.filter((x) => x.id !== id); c.connections = c.connections.filter((x) => x.a !== id && x.b !== id); c.shipments = c.shipments.filter((s) => s.origin !== id && s.destination !== id); });
  const removeConnection = (id) => deleteWithCleanup((c) => { c.connections = c.connections.filter((x) => x.id !== id); });
  const removeShipment = (id) => deleteWithCleanup((c) => { c.shipments = c.shipments.filter((x) => x.id !== id); });
  const setTerm = (id, field, value) => upd((c) => { const t = c.terminals.find((x) => x.id === id); if (t) t[field] = field === 'name' ? value : (Number.isFinite(Number(value)) ? Number(value) : 0); });
  const setConn = (id, field, value) => upd((c) => { const x = c.connections.find((y) => y.id === id); if (x) x[field] = (field === 'a' || field === 'b') ? value : Math.max(1, Math.floor(Number(value) || 1)); });
  const setShip = (id, field, value) => upd((c) => { const s = c.shipments.find((y) => y.id === id); if (s) s[field] = ['origin', 'destination', 'priority', 'commodity'].includes(field) ? value : Math.max(0, Math.floor(Number(value) || 0)); });

  const doImport = (text) => {
    const res = validateImport(text);
    if (!res.ok) { setImportMsg({ ok: false, text: res.errors.join('\n') }); return; }
    onImportScenario(res.data);
    setImportMsg({ ok: true, text: `Imported "${res.data.name}": ${res.data.terminals.length} terminals, ${res.data.connections.length} connections, ${res.data.shipments.length} shipments.` });
  };

  return (
    <div>
      {notice && <div className="notice">{notice}</div>}
      <div className="panel">
        <h2>Preset test scenarios</h2>
        <p className="small muted">Loading a preset replaces the working scenario (the saved baseline is untouched until you snapshot a new one). Expected results are documented per preset and in the Docs tab.</p>
        <div className="row">
          {presets.map((p) => <button key={p.name} onClick={() => onImportScenario(p)}>{p.name}</button>)}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={onSaveBaseline}>Snapshot working scenario as new baseline</button>
          <span className="small muted">Baseline is immutable during recalculation; use this only when you deliberately want a new baseline.</span>
        </div>
      </div>

      <div className="panel">
        <h2>Network editor</h2>
        <h3>Terminals ({scenario.terminals.length})</h3>
        <div className="scroll" style={{ maxHeight: 260 }}><table><thead><tr><th>ID</th><th>Name</th><th>X</th><th>Y</th><th /></tr></thead>
          <tbody>{scenario.terminals.map((t) => <tr key={t.id}><td className="mono">{t.id}</td>
            <td><input value={t.name} onChange={(e) => setTerm(t.id, 'name', e.target.value)} aria-label={`Name of ${t.id}`} /></td>
            <td><input type="number" value={t.x} onChange={(e) => setTerm(t.id, 'x', e.target.value)} style={{ width: 70 }} aria-label={`X of ${t.id}`} /></td>
            <td><input type="number" value={t.y} onChange={(e) => setTerm(t.id, 'y', e.target.value)} style={{ width: 70 }} aria-label={`Y of ${t.id}`} /></td>
            <td><button className="danger" onClick={() => removeTerminal(t.id)}>Remove</button></td></tr>)}</tbody></table></div>
        <button onClick={() => upd((c) => { const id = nextId('T', c.terminals); c.terminals.push({ id, name: `Terminal ${id}`, x: 100 + c.terminals.length * 40, y: 200 }); })}>Add terminal</button>

        <h3>Connections ({scenario.connections.length})</h3>
        <div className="scroll" style={{ maxHeight: 300 }}><table><thead><tr><th>ID</th><th>A</th><th>B</th><th>Travel (h)</th><th>Capacity/h</th><th /></tr></thead>
          <tbody>{scenario.connections.map((c) => <tr key={c.id}><td className="mono">{c.id}</td>
            <td><select value={c.a} onChange={(e) => setConn(c.id, 'a', e.target.value)}>{scenario.terminals.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</select></td>
            <td><select value={c.b} onChange={(e) => setConn(c.id, 'b', e.target.value)}>{scenario.terminals.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</select></td>
            <td><input type="number" min={1} value={c.travelTime} onChange={(e) => setConn(c.id, 'travelTime', e.target.value)} style={{ width: 70 }} /></td>
            <td><input type="number" min={1} value={c.capacity} onChange={(e) => setConn(c.id, 'capacity', e.target.value)} style={{ width: 70 }} /></td>
            <td><button className="danger" onClick={() => removeConnection(c.id)}>Remove</button></td></tr>)}</tbody></table></div>
        <button disabled={scenario.terminals.length < 2} onClick={() => upd((c) => { const id = nextId('C', c.connections); c.connections.push({ id, a: c.terminals[0].id, b: c.terminals[1].id, travelTime: 2, capacity: 1 }); })}>Add connection</button>
      </div>

      <div className="panel">
        <h2>Shipment editor ({scenario.shipments.length})</h2>
        <div className="scroll"><table><thead><tr><th>ID</th><th>Origin</th><th>Destination</th><th>Release</th><th>Deadline</th><th>Priority</th><th>Commodity</th><th /></tr></thead>
          <tbody>{scenario.shipments.map((s) => <tr key={s.id}><td className="mono">{s.id}</td>
            <td><select value={s.origin} onChange={(e) => setShip(s.id, 'origin', e.target.value)}>{scenario.terminals.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</select></td>
            <td><select value={s.destination} onChange={(e) => setShip(s.id, 'destination', e.target.value)}>{scenario.terminals.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</select></td>
            <td><input type="number" min={0} value={s.release} onChange={(e) => setShip(s.id, 'release', e.target.value)} style={{ width: 64 }} /></td>
            <td><input type="number" min={0} value={s.deadline} onChange={(e) => setShip(s.id, 'deadline', e.target.value)} style={{ width: 64 }} /></td>
            <td><select value={s.priority} onChange={(e) => setShip(s.id, 'priority', e.target.value)}><option>critical</option><option>high</option><option>medium</option><option>low</option></select></td>
            <td><input value={s.commodity || ''} onChange={(e) => setShip(s.id, 'commodity', e.target.value)} style={{ width: 110 }} /></td>
            <td><button className="danger" onClick={() => removeShipment(s.id)}>Remove</button></td></tr>)}</tbody></table></div>
        <button disabled={scenario.terminals.length < 2} onClick={() => upd((c) => { const id = nextId('S', c.shipments); c.shipments.push({ id, origin: c.terminals[0].id, destination: c.terminals[1].id, release: 0, deadline: 24, priority: 'medium', commodity: 'general freight' }); })}>Add shipment</button>
      </div>

      <div className="panel">
        <h2>Import / export (JSON schema v1)</h2>
        <p className="small muted">Schema: <span className="mono">{`{ schemaVersion: 1, name, terminals:[{id,name,x,y}], connections:[{id,a,b,travelTime,capacity}], shipments:[{id,origin,destination,release,deadline,priority,commodity?}], disruptions:[...] }`}</span>. Imports are validated (unique ids, known terminal references, integer ranges, known priorities) and rejected with messages when malformed.</p>
        {importMsg && <div className={importMsg.ok ? 'notice' : 'error'}>{importMsg.text}</div>}
        <div className="row">
          <button onClick={() => setImportText(exportScenario(scenario, disruptions))}>Export working scenario to box</button>
          <button className="primary" onClick={() => doImport(importText)}>Import from box</button>
          <label className="small">Import file <input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files[0]; if (f) f.text().then((t) => { setImportText(t); doImport(t); }); }} /></label>
          <button onClick={() => { const blob = new Blob([exportScenario(scenario, disruptions)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rail-scenario.json'; a.click(); URL.revokeObjectURL(a.href); }}>Download export</button>
        </div>
        <textarea rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Exported JSON appears here, or paste a scenario to import…" aria-label="Scenario JSON" />
      </div>
    </div>
  );
}
