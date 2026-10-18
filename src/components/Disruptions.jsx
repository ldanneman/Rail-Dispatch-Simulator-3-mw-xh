import React, { useState } from 'react';

export function DisruptionPanel({ scenario, disruptions, setDisruptions }) {
  const [type, setType] = useState('closure');
  const [connectionId, setConnectionId] = useState(scenario.connections[0]?.id || '');
  const [shipmentId, setShipmentId] = useState(scenario.shipments[0]?.id || '');
  const [start, setStart] = useState(9); const [end, setEnd] = useState(12);
  const [num, setNum] = useState(2);
  const add = () => {
    const id = `D${Date.now().toString(36)}`;
    let d;
    if (type === 'closure') d = { id, type, connectionId, start: Number(start), end: Number(end) };
    else if (type === 'travelTime') d = { id, type, connectionId, newTravelTime: Number(num) };
    else if (type === 'capacity') d = { id, type, connectionId, newCapacity: Number(num) };
    else d = { id, type, shipmentId, delayHours: Number(num) };
    setDisruptions([...disruptions, d]);
  };
  const describe = (d) => {
    if (d.type === 'closure') return `Close ${d.connectionId} during hours [${d.start}, ${d.end})`;
    if (d.type === 'travelTime') return `Set ${d.connectionId} travel time to ${d.newTravelTime}h`;
    if (d.type === 'capacity') return `Set ${d.connectionId} capacity to ${d.newCapacity}/h`;
    return `Delay release of ${d.shipmentId} by ${d.delayHours}h`;
  };
  return (
    <div className="panel">
      <h2>Disruption simulation</h2>
      <p className="small muted">Add a disruption, then the schedule recalculates immediately. A closure blocks any traversal whose [depart, arrive) interval overlaps the closure window. Travel-time and capacity changes apply to the whole scenario.</p>
      <div className="row">
        <label className="f">Type<select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="closure">Close connection</option><option value="travelTime">Increase travel time</option>
          <option value="capacity">Reduce capacity</option><option value="releaseDelay">Delay shipment release</option></select></label>
        {(type !== 'releaseDelay') && <label className="f">Connection<select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
          {scenario.connections.map((c) => <option key={c.id} value={c.id}>{c.id}: {c.a}–{c.b}</option>)}</select></label>}
        {type === 'releaseDelay' && <label className="f">Shipment<select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
          {scenario.shipments.map((s) => <option key={s.id} value={s.id}>{s.id}: {s.origin}→{s.destination}</option>)}</select></label>}
        {type === 'closure' && <><label className="f">Start hour<input type="number" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 80 }} /></label>
          <label className="f">End hour<input type="number" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 80 }} /></label></>}
        {type !== 'closure' && <label className="f">{type === 'travelTime' ? 'New travel time (h)' : type === 'capacity' ? 'New capacity (/h)' : 'Delay (h)'}
          <input type="number" min={type === 'releaseDelay' ? 0 : 1} value={num} onChange={(e) => setNum(e.target.value)} style={{ width: 90 }} /></label>}
        <button className="primary" onClick={add}>Add disruption &amp; recalculate</button>
      </div>
      <h3>Active disruptions ({disruptions.length})</h3>
      {disruptions.length === 0 && <p className="muted">None. The current schedule is the undisrupted plan for the working scenario.</p>}
      {disruptions.map((d) => <div key={d.id} className="row spread alert"><span>{describe(d)}</span>
        <button className="danger" onClick={() => setDisruptions(disruptions.filter((x) => x.id !== d.id))}>Remove</button></div>)}
      {disruptions.length > 0 && <button onClick={() => setDisruptions([])}>Clear all disruptions</button>}
    </div>
  );
}

export function ComparePanel({ comparison }) {
  if (!comparison) return null;
  const { base, current, delta, affected, rerouted } = comparison;
  const fmt = (v, suffix = '') => `${v >= 0 ? '+' : ''}${v.toFixed(1)}${suffix}`;
  return (
    <div className="panel">
      <h2>Scenario comparison (baseline vs current)</h2>
      <p className="small muted">The baseline never changes during recalculation. Use Test Lab → “Snapshot working scenario as new baseline” only to deliberately replace it.</p>
      <table><thead><tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Change</th></tr></thead><tbody>
        <tr><td>On-time % (of routed)</td><td className="mono">{base.onTimePct.toFixed(1)}%</td><td className="mono">{current.onTimePct.toFixed(1)}%</td><td className="mono">{fmt(delta.onTimePct, ' pts')}</td></tr>
        <tr><td>Average delay (routed)</td><td className="mono">{base.avgDelay.toFixed(2)}h</td><td className="mono">{current.avgDelay.toFixed(2)}h</td><td className="mono">{fmt(delta.avgDelay, 'h')}</td></tr>
        <tr><td>Network capacity utilization</td><td className="mono">{base.networkUtilization.toFixed(1)}%</td><td className="mono">{current.networkUtilization.toFixed(1)}%</td><td className="mono">{fmt(delta.utilization, ' pts')}</td></tr>
        <tr><td>Rerouted shipments</td><td className="mono">—</td><td className="mono">{rerouted.length}</td><td className="mono">{rerouted.join(', ') || 'none'}</td></tr>
        <tr><td>Undeliverable shipments</td><td className="mono">{base.undeliverable}</td><td className="mono">{current.undeliverable}</td><td className="mono">{delta.undeliverable >= 0 ? '+' : ''}{delta.undeliverable}</td></tr>
      </tbody></table>
      <h3>Affected shipments ({affected.length})</h3>
      {affected.length === 0 && <p className="muted">No shipment changed versus the baseline.</p>}
      <div className="scroll" style={{ maxHeight: 300 }}><table><thead><tr><th>Shipment</th><th>Change</th><th>Base arrival</th><th>New arrival</th><th>Δ</th><th>Reason (if failed)</th></tr></thead>
        <tbody>{affected.map((a) => <tr key={a.shipmentId}><td className="mono">{a.shipmentId}</td><td>{a.change}</td>
          <td className="mono">{a.baseArrival ?? '—'}</td><td className="mono">{a.newArrival ?? '—'}</td>
          <td className="mono">{a.delta == null ? '—' : (a.delta >= 0 ? `+${a.delta}` : a.delta)}</td><td className="small">{a.reason || ''}</td></tr>)}</tbody></table></div>
    </div>
  );
}
