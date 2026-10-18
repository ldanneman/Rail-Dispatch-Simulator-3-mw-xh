Project: Rail Network Dispatch & Optimization Simulator
Create a fully functional, interactive freight rail logistics simulation and optimization application.
Technology: React, Vite, JavaScript (no TypeScript), Yarn. Use appropriate libraries where beneficial. No real backend or external API keys.
Use mock data and localStorage for persistence.

1. Rail Network:
Create a simulated network containing:
8 interconnected freight terminals.
At least 14 rail connections.
Different travel times and hourly shipment capacities for each connection.
100 shipments with origins, destinations, release times, delivery deadlines, and priority levels.
Use realistic but entirely fictional operational data.
Generate the initial dataset deterministically so the same seed always produces the same network and shipments.

2. Route Optimization Engine:
Design and implement an algorithm to assign routes and departure times to shipments.
Requirements:
Find feasible routes through the network.
Respect the hourly capacity of each rail connection.
Never schedule a shipment before its release time.
Account for travel time and waiting between connections.
Prioritize urgent shipments and minimize late deliveries.
Identify shipments that cannot be routed.
Prevent impossible schedules or overlapping capacity reservations.
Choose an appropriate algorithm and explain your reasoning in the documentation.
Prioritize correct, consistent behavior over claiming a mathematically optimal solution.

3. Interactive Dashboard:
Create a polished, responsive interface featuring:
Network overview with terminals and connections.
Shipments table with search, sorting, and filtering.
Route visualization for individual shipments.
Timeline of scheduled movements.
On-time and delayed shipment statistics.
Terminal and route utilization.
Operational alerts and capacity bottlenecks.
All dashboard metrics must derive from actual simulation results rather than hardcoded values.

4. Interactive Simulation Controls and Test Lab:
In addition to the default 8-terminal, 100-shipment simulation, provide a fully functional Test Lab where users can create, modify, and execute custom simulations.
The Test Lab must support:
Network Editor: Add, edit, and remove terminals and connections. Modify connection travel times and hourly capacities.
Shipment Editor: Add, edit, and remove shipments. Configure origins, destinations, release times, delivery deadlines, and priority levels.
Simulation Controls: Run, pause when applicable, reset, and recalculate simulations. Display actual algorithm-generated routes and schedules.
Detailed Scheduling: Allow users to inspect every shipment's route, individual connection departure and arrival times, waiting periods, and final delivery time.
Capacity Inspection: Display connection utilization by hourly time slot so users can independently verify that capacity restrictions are respected.
Preset Test Scenarios: Include selectable scenarios for normal routing, capacity bottlenecks, connection closures, disconnected networks, and conflicting delivery deadlines. Include at least one simple three-terminal scenario with documented expected results.
Import/Export: Support importing and exporting complete custom networks, shipment lists, and disruption settings using one documented JSON schema. Validate all imported data before accepting it.
Scenario Comparison: Preserve an immutable baseline while allowing modifications and recalculations in separate scenarios.
All displayed values must come from the actual scheduling engine. Do not use simulated or hardcoded dashboard results.
Define capacity as the maximum number of movements entering a connection per one-hour departure slot, regardless of traversal duration. Document this simplified operational assumption and apply it consistently across scheduling, disruptions, and tests.
Ensure the application can perform all these operations through the user interface without requiring source code modifications.

5. Disruption Simulation:
Allow the user to introduce disruptions:
Close a rail connection for a specified time.
Increase travel time on a connection.
Reduce available capacity.
Delay a shipment's release time.
After a disruption, the system must support recalculating affected schedules and routing shipments through alternatives when feasible.
Clearly identify:
Which shipments were affected.
Which shipments were rerouted.
Changes in arrival times.
Which deliveries became late or impossible.
The reason for each failed routing decision.

6. Scenario Comparison:
Allow users to compare the original schedule against a disrupted scenario.
Display differences in:
On-time delivery percentage.
Average delivery delay.
Capacity utilization.
Number of rerouted shipments.
Number of undeliverable shipments.
The baseline must remain unchanged when experimenting with a scenario.

7. Data Management:
Persist user changes between page reloads.
Support resetting the simulation to its original seeded state.
Export and import simulation scenarios as JSON.
Validate imported data and handle malformed files gracefully.
Maintain consistent shipment IDs and relationships between records.

8. Testing:
Use Vitest to create automated tests for the optimization engine and important application logic.
Include tests that verify:
Shipments never depart before their release times.
Route capacity is never exceeded.
A closed connection is not used during its closure period.
Shipments with no feasible route are identified correctly.
Arrival times are calculated correctly across multiple connections.
Replanning does not modify the original baseline scenario.
Repeated execution with identical input produces identical results.
Changes persist correctly after application reload.
Test edge cases, not just successful scenarios.

9. Obsidian Documentation:
Create documentation in my Obsidian vault code_projects and name the folder Rail_Dispatch_Simulator_muse_wonder_1.0-xhigh  – Path to vault: /Users/levdanneman/Documents/code_projects
Create separate Markdown files for:
System architecture.
Network and scheduling algorithms.
Data models and state management.
Each major page.
Each major component.
Important functions and their dependencies.
Testing approach and known limitations.
Include a component tree and explain how data flows through the application.
Documentation must reflect the actual finished implementation.

10. Implementation:
Plan the architecture before coding, then implement the complete application.
Make reasonable technical decisions independently. Avoid unnecessary abstractions or unrelated functionality.
Do not reduce the requirements to a static mockup. The scheduling and disruption simulation must genuinely work.
Run automated tests and a production build. Resolve identified failures.
At completion, provide:
How to run the application.
Architecture summary.
Explanation of the optimization strategy.
Test results.
Any incomplete functionality or known limitations.
Do not claim functionality is implemented unless it actually works.

11. Simulation Rules and Acceptance Criteria:
To ensure scheduling consistency and allow independent evaluation, follow these rules:
Time and scheduling
Use a deterministic, discrete-time simulation with one-hour scheduling slots.
Represent simulation times as integer hours relative to a common starting point.
Shipments may be delivered after their deadlines; classify these as late rather than undeliverable.
A shipment is undeliverable only when no feasible route or schedule exists within a defined seven-day planning horizon.
Connection capacity represents the maximum number of movements entering that connection during an hourly slot.
For bidirectional connections, movements in either direction share the same capacity unless explicitly modeled as separate connections.
A connection closure prevents any movement whose traversal interval overlaps the closure period.
Use consistent time-interval boundaries throughout the application.
Simulation behavior
The scheduling engine may calculate results instantaneously. Animation and real-time playback are optional, not required.
Identical inputs must always produce identical outputs.
Define consistent tie-breaking rules for otherwise equivalent scheduling decisions.
Recalculating a scenario must not alter its saved baseline.
Display terminal throughput (arrivals and departures) rather than percentage utilization unless terminal handling capacities are explicitly modeled.
Calculate all metrics from actual scheduling results.
Document the formulas and treatment of undeliverable shipments in performance statistics.
Reference test scenario
Include a preset three-terminal network with:
Terminals A, B, and C.
Connection A–B: 1-hour travel time, capacity 1 per hour.
Connection B–C: 1-hour travel time, capacity 1 per hour.
No direct A–C connection.
Three identical-priority shipments from A to C, all released at hour 8.
With these conditions and no disruptions, the earliest feasible arrival times are hours 10, 11, and 12.
Create an automated test verifying that the scheduler produces these arrival times without violating capacity constraints.
Add additional deterministic tests for closures, disconnected terminals, tight deadlines, and scenario isolation.
Benchmark requirements
Prioritize correctness over appearance or development speed.
Do not substitute hardcoded results for scheduling calculations.
Implement the complete Test Lab so its inputs and results can be independently inspected.
Provide a documented JSON import schema that supports reproducible test scenarios.
Do not claim that a successful production build proves the scheduling algorithm is correct.
Clearly disclose any incomplete requirements or failed tests.

