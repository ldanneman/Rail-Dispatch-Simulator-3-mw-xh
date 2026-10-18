# Rail Network Dispatch & Optimization Simulator

React + Vite + JavaScript (no TypeScript), Yarn, Vitest. No backend or API keys; data is seeded locally and persisted in localStorage.

## Run
```bash
yarn install
yarn dev      # http://127.0.0.1:5173/
yarn test     # 15 Vitest tests for the scheduling engine
yarn build    # production build
```

## What it does
- Seeded 8-terminal / 16-connection network with 100 deterministic shipments (seed 20241017).
- Capacity-aware scheduler: priority-ordered greedy earliest-arrival routing with time-dependent Dijkstra. Capacity = movements entering a connection per one-hour departure slot, shared across both directions; closures block overlapping traversals; 168h horizon; late is delivered, undeliverable means no feasible schedule exists.
- Dashboard (network map, KPIs, alerts/bottlenecks, utilization, terminal throughput), searchable/sortable shipments table with per-leg route detail, playback timeline, full Test Lab (network/shipment editors, presets including the spec reference scenario with expected arrivals 10/11/12, hourly capacity inspection, JSON schema v1 import/export with validation), disruption simulation, and immutable-baseline scenario comparison.

Full documentation: Obsidian vault folder `Rail_Dispatch_Simulator_muse_wonder_1.0-xhigh` in `~/Documents/code_projects`.
