import React from 'react';

// SVG network overview. Terminal/connection click selects items; an optional
// highlighted route path (list of legs) is drawn in amber.
export default function NetworkMap({ scenario, connStats, selectedConnection, onSelectConnection, selectedTerminal, onSelectTerminal, highlightLegs }) {
  const pos = Object.fromEntries(scenario.terminals.map((t) => [t.id, t]));
  const statById = Object.fromEntries((connStats || []).map((c) => [c.id, c]));
  const hl = new Set((highlightLegs || []).map((l) => l.connectionId));
  return (
    <svg viewBox="0 0 720 500" style={{ width: '100%', height: 'auto', background: '#f7f9f5', borderRadius: 8 }} role="img" aria-label="Rail network map">
      {scenario.connections.map((c) => {
        const a = pos[c.a]; const b = pos[c.b]; if (!a || !b) return null;
        const st = statById[c.id];
        const hot = st && st.peakPct >= 100;
        const isHl = hl.has(c.id);
        return (
          <g key={c.id} onClick={() => onSelectConnection && onSelectConnection(c.id)} style={{ cursor: 'pointer' }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isHl ? '#b45309' : hot ? '#b3261e' : selectedConnection === c.id ? '#0f766e' : '#9db3a6'} strokeWidth={isHl ? 5 : selectedConnection === c.id ? 4 : 2.5} />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="11" fill="#43534a" fontFamily="ui-monospace, monospace">
              {c.id} · {c.travelTime}h · cap {c.capacity}
            </text>
          </g>
        );
      })}
      {scenario.terminals.map((t) => (
        <g key={t.id} onClick={() => onSelectTerminal && onSelectTerminal(t.id)} style={{ cursor: 'pointer' }}>
          <circle cx={t.x} cy={t.y} r={selectedTerminal === t.id ? 17 : 14} fill={selectedTerminal === t.id ? '#0f766e' : '#17251f'} />
          <text x={t.x} y={t.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{t.id}</text>
          <text x={t.x} y={t.y + 30} textAnchor="middle" fontSize="11.5" fill="#1c2420">{t.name}</text>
        </g>
      ))}
    </svg>
  );
}

export function RouteDetail({ shipment, result, scenario }) {
  if (!shipment) return <p className="muted">Select a shipment to inspect its route.</p>;
  if (!result) return <p className="muted">No schedule result for {shipment.id}.</p>;
  const name = (id) => scenario.terminals.find((t) => t.id === id)?.name || id;
  if (result.status === 'undeliverable') {
    return (
      <div>
        <p><span className="badge bad">undeliverable</span> <strong className="mono">{shipment.id}</strong> {name(shipment.origin)} → {name(shipment.destination)}</p>
        <p className="small">Reason: {result.reason}</p>
        <p className="small muted">Released hour {shipment.release} · deadline hour {shipment.deadline} · priority {shipment.priority}</p>
      </div>
    );
  }
  return (
    <div>
      <p>
        <span className={`badge ${result.late ? 'late' : 'good'}`}>{result.late ? `late by ${result.delay}h` : 'on time'}</span>{' '}
        <strong className="mono">{shipment.id}</strong> {name(shipment.origin)} → {name(shipment.destination)} · arrives{' '}
        <span className="mono">hour {result.arrival}</span> (deadline {shipment.deadline})
      </p>
      <table>
        <thead><tr><th>Leg</th><th>Connection</th><th>From → To</th><th>Wait</th><th>Depart</th><th>Arrive</th></tr></thead>
        <tbody>
          {result.legs.map((leg, i) => (
            <tr key={i}><td className="mono">{i + 1}</td><td className="mono">{leg.connectionId}</td><td>{leg.from} → {leg.to}</td><td className="mono">{leg.wait}h</td><td className="mono">{leg.depart}</td><td className="mono">{leg.arrive}</td></tr>
          ))}
          {result.legs.length === 0 && <tr><td colSpan={6} className="muted">Origin equals destination; no movement required.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
