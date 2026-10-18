import React, { useMemo, useState } from 'react';

export function Kpis({ metrics }) {
  const cards = [
    ['Shipments', metrics.total], ['Routed', metrics.routed], ['Undeliverable', metrics.undeliverable],
    ['On-time %', `${metrics.onTimePct.toFixed(1)}%`], ['Late', metrics.late],
    ['Avg delay (routed)', `${metrics.avgDelay.toFixed(2)}h`],
    ['Network utilization', `${metrics.networkUtilization.toFixed(1)}%`], ['Total movements', metrics.totalMoves],
  ];
  return <div className="grid kpis">{cards.map(([l, v]) => <div className="kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div></div>)}</div>;
}

export function AlertsPanel({ metrics }) {
  return (
    <div className="panel">
      <h2>Operational alerts &amp; bottlenecks</h2>
      {metrics.alerts.length === 0 && <p className="muted">No alerts. No connection is near capacity and every routed shipment is on time.</p>}
      <div className="scroll" style={{ maxHeight: 320 }}>
        {metrics.alerts.map((a, i) => <div key={i} className={`alert ${a.level}`}><span className="badge">{a.level}</span> {a.text}</div>)}
      </div>
    </div>
  );
}

export function UtilizationPanel({ metrics, onSelect }) {
  return (
    <div className="panel">
      <h2>Connection utilization</h2>
      <p className="small muted">Peak = busiest single departure hour. Capacity counts movements entering the connection per hour, shared by both directions.</p>
      <table><thead><tr><th>Conn</th><th>Route</th><th>Travel</th><th>Cap/h</th><th>Moves</th><th>Peak/h</th><th>Peak use</th></tr></thead>
        <tbody>{metrics.connStats.map((c) => (
          <tr key={c.id} onClick={() => onSelect && onSelect(c.id)} style={{ cursor: 'pointer' }}>
            <td className="mono">{c.id}</td><td>{c.a}–{c.b}</td><td className="mono">{c.travelTime}h</td><td className="mono">{c.capacity}</td>
            <td className="mono">{c.total}</td><td className="mono">{c.peak}</td>
            <td><div className="bar"><div className={c.peakPct >= 100 ? 'hot' : c.peakPct >= 75 ? 'warm' : ''} style={{ width: `${Math.min(100, c.peakPct)}%` }} /></div><span className="mono small">{c.peakPct.toFixed(0)}%</span></td>
          </tr>))}</tbody></table>
    </div>
  );
}

export function ThroughputPanel({ metrics }) {
  return (
    <div className="panel">
      <h2>Terminal throughput</h2>
      <p className="small muted">Arrivals and departures counted from scheduled legs. Terminals have no modelled handling capacity, so counts are shown rather than a percentage.</p>
      <table><thead><tr><th>Terminal</th><th>Departures</th><th>Arrivals</th><th>Total</th></tr></thead>
        <tbody>{metrics.throughput.map((t) => <tr key={t.id}><td>{t.id} · {t.name}</td><td className="mono">{t.departures}</td><td className="mono">{t.arrivals}</td><td className="mono">{t.departures + t.arrivals}</td></tr>)}</tbody></table>
    </div>
  );
}

export function ShipmentTable({ scenario, schedule, selectedId, onSelect }) {
  const [q, setQ] = useState(''); const [status, setStatus] = useState('all'); const [prio, setPrio] = useState('all');
  const [sort, setSort] = useState({ key: 'id', dir: 1 });
  const byId = Object.fromEntries(schedule.results.map((r) => [r.shipmentId, r]));
  const eff = schedule.byId;
  const rows = useMemo(() => {
    let list = scenario.shipments.filter((s) => {
      const r = byId[s.id]; const e = eff[s.id] || s;
      const text = `${s.id} ${s.origin} ${s.destination} ${s.commodity || ''}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (prio !== 'all' && s.priority !== prio) return false;
      if (status === 'routed' && r.status !== 'routed') return false;
      if (status === 'late' && !(r.status === 'routed' && r.late)) return false;
      if (status === 'ontime' && !(r.status === 'routed' && !r.late)) return false;
      if (status === 'undeliverable' && r.status !== 'undeliverable') return false;
      void e; return true;
    });
    const val = (s) => { const r = byId[s.id]; switch (sort.key) {
      case 'arrival': return r.arrival ?? 1e9; case 'release': return s.release; case 'deadline': return s.deadline;
      case 'delay': return r.delay ?? -1; default: return s.id; } };
    list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    return list;
  }, [scenario, q, status, prio, sort]); // eslint-disable-line

  const th = (label, key) => <th onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>{label}{sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>;
  return (
    <div className="panel">
      <div className="row spread"><h2>Shipments ({rows.length} shown)</h2>
        <div className="row">
          <input placeholder="Search id, terminal, commodity…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shipments" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option><option value="ontime">On time</option><option value="late">Late</option><option value="routed">Routed</option><option value="undeliverable">Undeliverable</option>
          </select>
          <select value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Filter by priority">
            <option value="all">All priorities</option><option>critical</option><option>high</option><option>medium</option><option>low</option>
          </select>
        </div></div>
      <div className="scroll"><table>
        <thead><tr>{th('ID', 'id')}<th>Route</th><th>Commodity</th>{th('Release', 'release')}{th('Deadline', 'deadline')}<th>Priority</th>{th('Arrival', 'arrival')}{th('Delay', 'delay')}<th>Status</th></tr></thead>
        <tbody>{rows.map((s) => { const r = byId[s.id]; return (
          <tr key={s.id} className={selectedId === s.id ? 'selected' : ''} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
            <td className="mono">{s.id}</td><td className="mono">{s.origin} → {s.destination}</td><td>{s.commodity || '—'}</td>
            <td className="mono">{(eff[s.id] || s).release}</td><td className="mono">{s.deadline}</td>
            <td><span className={`badge ${s.priority}`}>{s.priority}</span></td>
            <td className="mono">{r.arrival ?? '—'}</td><td className="mono">{r.delay ?? '—'}</td>
            <td>{r.status === 'undeliverable' ? <span className="badge bad">undeliverable</span> : r.late ? <span className="badge late">late</span> : <span className="badge good">on time</span>}</td>
          </tr>); })}</tbody></table></div>
    </div>
  );
}

export function TimelinePanel({ schedule, hour, setHour, playing, setPlaying, maxHour }) {
  const routed = schedule.results.filter((r) => r.status === 'routed');
  const scale = Math.max(24, maxHour + 2);
  return (
    <div className="panel">
      <div className="row spread"><h2>Timeline of scheduled movements</h2>
        <div className="row">
          <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={() => { setPlaying(false); setHour(0); }}>Restart</button>
          <label className="small">Hour <input type="number" min={0} max={scale} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ width: 70 }} /></label>
          <input type="range" min={0} max={scale} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Playback hour" />
        </div></div>
      <p className="small muted">Each bar is one connection leg, positioned by departure–arrival hour. Shipments at or before the current playback hour are listed below. Playback is a viewing aid; scheduling itself is instantaneous.</p>
      <div className="scroll" style={{ maxHeight: 380 }}>
        {routed.slice(0, 60).map((r) => (
          <div className="gantt-row" key={r.shipmentId}><span className="gantt-label">{r.shipmentId}</span>
            <div className="gantt-track">{r.legs.map((leg, i) => (
              <div key={i} className={`gantt-leg ${r.late ? 'late' : ''}`} title={`${leg.connectionId}: depart ${leg.depart}, arrive ${leg.arrive}`}
                style={{ left: `${(leg.depart / scale) * 100}%`, width: `${Math.max(1, ((leg.arrive - leg.depart) / scale) * 100)}%`, opacity: leg.depart <= hour ? 1 : 0.25 }} />))}
            </div><span className="mono small">→ {r.arrival}</span></div>
        ))}
        {routed.length > 60 && <p className="small muted">Showing first 60 routed shipments; use the Shipments tab for the full list.</p>}
      </div>
      <h3>Movements departing at or before hour {hour}</h3>
      <div className="scroll" style={{ maxHeight: 220 }}><table><thead><tr><th>Shipment</th><th>Connection</th><th>From → To</th><th>Depart</th><th>Arrive</th></tr></thead>
        <tbody>{routed.flatMap((r) => r.legs.map((leg, i) => ({ r, leg, i }))).filter(({ leg }) => leg.depart <= hour)
          .sort((a, b) => a.leg.depart - b.leg.depart || a.r.shipmentId.localeCompare(b.r.shipmentId)).slice(0, 120)
          .map(({ r, leg, i }) => <tr key={`${r.shipmentId}-${i}`}><td className="mono">{r.shipmentId}</td><td className="mono">{leg.connectionId}</td><td>{leg.from} → {leg.to}</td><td className="mono">{leg.depart}</td><td className="mono">{leg.arrive}</td></tr>)}</tbody></table></div>
    </div>
  );
}

export function CapacityPanel({ scenario, schedule, connectionId, setConnectionId }) {
  const conn = scenario.connections.find((c) => c.id === connectionId) || scenario.connections[0];
  if (!conn) return <div className="panel"><h2>Capacity inspection</h2><p className="muted">No connections defined.</p></div>;
  const eff = schedule.effectiveConnections.find((c) => c.id === conn.id) || conn;
  const hours = 72;
  return (
    <div className="panel">
      <div className="row spread"><h2>Capacity inspection by hour</h2>
        <select value={conn.id} onChange={(e) => setConnectionId(e.target.value)} aria-label="Select connection">
          {scenario.connections.map((c) => <option key={c.id} value={c.id}>{c.id}: {c.a}–{c.b} (cap {c.capacity}/h)</option>)}
        </select></div>
      <p className="small muted">Each cell shows departures entering {conn.id} in that hour / effective capacity {eff.capacity}. Verify no cell exceeds capacity. Hours 0–{hours - 1} shown; later hours follow the same rule.</p>
      <div className="capgrid">
        {Array.from({ length: hours }, (_, h) => { const used = schedule.used[`${conn.id}|${h}`] || 0; return (
          <div key={h} className={`capcell ${used >= eff.capacity && used > 0 ? 'full' : used > 0 ? 'part' : ''}`} title={`Hour ${h}: ${used}/${eff.capacity}`}>
            <div>h{h}</div><div>{used}/{eff.capacity}</div></div>); })}
      </div>
    </div>
  );
}
