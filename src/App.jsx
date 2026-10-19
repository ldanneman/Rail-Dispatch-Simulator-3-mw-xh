import React, { useEffect, useMemo, useState } from 'react';
import { generateDefaultDataset } from './engine/seed.js';
import { scheduleScenario } from './engine/scheduler.js';
import { computeMetrics, compareSchedules } from './engine/metrics.js';
import { persistState, loadPersisted, clearPersisted, isValidPersistedState } from './engine/schema.js';
import NetworkMap, { RouteDetail } from './components/NetworkMap.jsx';
import { Kpis, AlertsPanel, UtilizationPanel, ThroughputPanel, ShipmentTable, TimelinePanel, CapacityPanel } from './components/Panels.jsx';
import TestLab from './components/TestLab.jsx';
import { DisruptionPanel, ComparePanel } from './components/Disruptions.jsx';

const TABS = [
  ['dashboard', 'Dashboard'], ['shipments', 'Shipments & Routes'], ['timeline', 'Timeline'],
  ['testlab', 'Test Lab'], ['disruptions', 'Disruptions & Compare'], ['docs', 'Docs & Rules'],
];
const clone = (x) => JSON.parse(JSON.stringify(x));

function defaultState() {
  const d = generateDefaultDataset();
  const scenario = { name: 'Default seeded network (seed 20241017)', ...d };
  return { baseline: { scenario: clone(scenario), disruptions: [] }, working: clone(scenario), disruptions: [] };
}

function initialState() {
  const saved = loadPersisted();
  if (isValidPersistedState(saved)) return saved;
  return defaultState();
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState('dashboard');
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runCount, setRunCount] = useState(1);
  const [notice, setNotice] = useState('');

  const { baseline, working, disruptions } = state;
  const schedule = useMemo(() => scheduleScenario(working, disruptions), [working, disruptions, runCount]); // eslint-disable-line
  const baseSchedule = useMemo(() => scheduleScenario(baseline.scenario, baseline.disruptions), [baseline]);
  const metrics = useMemo(() => computeMetrics(working, schedule), [working, schedule]);
  const comparison = useMemo(() => compareSchedules(baseline.scenario, baseSchedule, working, schedule), [baseline, baseSchedule, working, schedule]);

  useEffect(() => { persistState(state); }, [state]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => { if (h >= metrics.maxArrival + 2) { setPlaying(false); return h; } return h + 1; }), 500);
    return () => clearInterval(t);
  }, [playing, metrics.maxArrival]);

  const setWorking = (updater) => setState((s) => ({ ...s, working: typeof updater === 'function' ? updater(s.working) : updater }));
  const setDisruptions = (d) => setState((s) => ({ ...s, disruptions: typeof d === 'function' ? d(s.disruptions) : d }));

  const resetToSeed = () => { clearPersisted(); const fresh = defaultState(); setState(fresh); setSelectedShipment(null); setNotice('Reset to the original seeded state (seed 20241017).'); };
  const loadScenario = (p) => {
    const scenario = { name: p.name, terminals: clone(p.terminals), connections: clone(p.connections), shipments: clone(p.shipments) };
    setState((s) => ({ ...s, working: scenario, disruptions: clone(p.disruptions || []) }));
    setSelectedShipment(null);
    setNotice(`Loaded preset "${p.name}". ${p.expected ? `Expected: ${p.expected}` : p.description || ''}`);
  };
  const saveBaseline = () => { setState((s) => ({ ...s, baseline: { scenario: clone(s.working), disruptions: clone(s.disruptions) } })); setNotice('Working scenario snapshotted as the new baseline.'); };

  const selShipment = working.shipments.find((s) => s.id === selectedShipment) || working.shipments[0];
  const selResult = selShipment ? schedule.results.find((r) => r.shipmentId === selShipment.id) : null;
  const selTerminalStats = metrics.throughput.find((t) => t.id === selectedTerminal);

  return (
    <div>
      <header className="top">
        <h1>Rail Network Dispatch &amp; Optimization Simulator</h1>
        <span className="sub">Seeded network · capacity-aware scheduling · 168h horizon · all metrics computed from the scheduling engine</span>
      </header>
      <div className="row" style={{ padding: '10px 22px 0' }}>
        <button className="primary" onClick={() => { setRunCount((c) => c + 1); setNotice(`Recalculated (run #${runCount + 1}). Identical inputs always produce identical outputs.`); }}>Run / Recalculate</button>
        <button onClick={resetToSeed}>Reset to seeded state</button>
        <span className="small muted">Working scenario: <strong>{working.name || 'Custom scenario'}</strong> · {working.terminals.length} terminals · {working.connections.length} connections · {working.shipments.length} shipments · changes auto-save to this browser</span>
      </div>
      {notice && tab !== 'testlab' && <div style={{ padding: '10px 22px 0' }}><div className="notice">{notice}</div></div>}
      <nav className="tabs" aria-label="Main views">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <main>
        {tab === 'dashboard' && <>
          <Kpis metrics={metrics} />
          <div style={{ height: 16 }} />
          <div className="grid two">
            <div className="panel"><h2>Network overview</h2>
              <p className="small muted">Click a terminal or connection to inspect it. Red connections are saturated in at least one hour; amber marks the selected shipment&apos;s route.</p>
              <NetworkMap scenario={working} connStats={metrics.connStats} selectedConnection={selectedConnection} onSelectConnection={setSelectedConnection}
                selectedTerminal={selectedTerminal} onSelectTerminal={setSelectedTerminal} highlightLegs={selResult?.legs} />
              {selTerminalStats && <p className="small"><strong>{selTerminalStats.id} · {selTerminalStats.name}</strong>: {selTerminalStats.departures} departures, {selTerminalStats.arrivals} arrivals.</p>}
              {selectedConnection && (() => { const c = metrics.connStats.find((x) => x.id === selectedConnection); return c ? <p className="small"><strong>{c.id} ({c.a}–{c.b})</strong>: travel {c.travelTime}h, capacity {c.capacity}/h, {c.total} movements, peak {c.peak}/h ({c.peakPct.toFixed(0)}%).</p> : null; })()}
            </div>
            <AlertsPanel metrics={metrics} />
          </div>
          <div className="grid two">
            <UtilizationPanel metrics={metrics} onSelect={setSelectedConnection} />
            <ThroughputPanel metrics={metrics} />
          </div>
          <CapacityPanel scenario={working} schedule={schedule} connectionId={selectedConnection || working.connections[0]?.id} setConnectionId={setSelectedConnection} />
        </>}

        {tab === 'shipments' && <>
          <ShipmentTable scenario={working} schedule={schedule} selectedId={selShipment?.id} onSelect={setSelectedShipment} />
          <div className="panel"><h2>Route visualization &amp; detailed schedule</h2>
            <NetworkMap scenario={working} connStats={metrics.connStats} selectedConnection={selectedConnection} onSelectConnection={setSelectedConnection}
              selectedTerminal={selectedTerminal} onSelectTerminal={setSelectedTerminal} highlightLegs={selResult?.legs} />
            <RouteDetail shipment={selShipment} result={selResult} scenario={working} />
          </div>
        </>}

        {tab === 'timeline' && <TimelinePanel schedule={schedule} hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} maxHour={metrics.maxArrival} />}

        {tab === 'testlab' && <>
          <TestLab scenario={working} setScenario={setWorking} disruptions={disruptions} setDisruptions={setDisruptions} onImportScenario={loadScenario} onSaveBaseline={saveBaseline} notice={notice} />
          <CapacityPanel scenario={working} schedule={schedule} connectionId={selectedConnection || working.connections[0]?.id} setConnectionId={setSelectedConnection} />
          <div className="panel"><h2>Detailed scheduling inspector</h2>
            <div className="row"><label className="small">Shipment <select value={selShipment?.id || ''} onChange={(e) => setSelectedShipment(e.target.value)}>
              {working.shipments.map((s) => <option key={s.id} value={s.id}>{s.id}: {s.origin}→{s.destination}</option>)}</select></label></div>
            <RouteDetail shipment={selShipment} result={selResult} scenario={working} />
          </div>
        </>}

        {tab === 'disruptions' && <>
          <DisruptionPanel scenario={working} disruptions={disruptions} setDisruptions={setDisruptions} />
          <ComparePanel comparison={comparison} />
        </>}

        {tab === 'docs' && <div className="panel">
          <h2>Rules, algorithm &amp; known limitations</h2>
          <h3>Capacity assumption</h3>
          <p>Capacity is the maximum number of movements <em>entering</em> a connection per one-hour departure slot, regardless of traversal duration. Bidirectional connections share that capacity across both directions. Departures occur only on integer hours; traversal occupies the half-open interval [depart, depart + travelTime). A closure on [start, end) blocks any traversal interval that overlaps it. Times are integer hours; the planning horizon is 168 hours (7 days). Late shipments are still delivered; a shipment is undeliverable only when no feasible route and schedule exists within the horizon.</p>
          <h3>Optimization strategy</h3>
          <p>The engine uses a priority-ordered greedy earliest-arrival search: shipments are ordered by priority (critical → low), then deadline, release, and id; each is routed with time-dependent Dijkstra over (arrival time, hops, path) while checking per-slot capacity and closures, and its reservations are committed before the next shipment. This guarantees release times, capacity, and closures are respected and urgencies are served first, but it is a consistent heuristic — not a proof of global optimality (spec §2 prioritises correct, consistent behaviour).</p>
          <h3>Metrics formulas</h3>
          <p>On-time % = on-time routed ÷ routed (undeliverable shipments are excluded from both terms and reported separately). Average delay = mean of max(0, arrival − deadline) over routed shipments. Network utilization = total leg departures ÷ Σ (connection capacity × active hours), where active hours = last arrival hour + 1. Terminal figures are arrival/departure counts because no terminal handling capacity is modelled.</p>
          <h3>Reference scenario</h3>
          <p>Test Lab → “Reference: Three-Terminal (A-B-C)”: A–B and B–C each take 1h at capacity 1/h; three A→C shipments release at hour 8. Expected arrivals are 10, 11, and 12 — verified by an automated test. Full documentation lives in the Obsidian vault folder <span className="mono">Rail_Dispatch_Simulator_muse_wonder_1.0-xhigh</span>.</p>
          <h3>Known limitations</h3>
          <p>Greedy ordering can leave later low-priority shipments late even when a different global assignment would do better; capacity is a departure-slot simplification (no in-transit or terminal handling limits); travel times are deterministic with no stochastic delays. All inputs are validated in whole hours: fractional or negative disruption values are rejected at the form and dropped by the engine if they ever arrive another way. The JSON box export includes disruptions; downloaded files use the same schema v1.</p>
        </div>}
      </main>
    </div>
  );
}
