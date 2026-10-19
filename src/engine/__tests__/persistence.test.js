import { describe, it, expect, beforeEach } from 'vitest';
import { persistState, loadPersisted, clearPersisted, isValidPersistedState } from '../schema.js';
import { generateDefaultDataset } from '../seed.js';

// Minimal localStorage stub for the node test environment.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

describe('persistence (spec §7/§8)', () => {
  beforeEach(() => store.clear());
  it('storage helpers round-trip a value unchanged', () => {
    const state = { scenario: { name: 'Edited', terminals: [{ id: 'A' }], connections: [], shipments: [{ id: 'S1' }] }, disruptions: [{ id: 'D1', type: 'closure' }] };
    persistState(state);
    expect(loadPersisted()).toEqual(state);
    clearPersisted();
    expect(loadPersisted()).toBeNull();
  });
  it('the real App state shape persists and validates after a simulated reload', () => {
    const d = generateDefaultDataset();
    const state = {
      baseline: { scenario: { name: 'Baseline', ...JSON.parse(JSON.stringify(d)) }, disruptions: [] },
      working: { name: 'Edited working', ...JSON.parse(JSON.stringify(d)) },
      disruptions: [{ id: 'D1', type: 'closure', connectionId: d.connections[0].id, start: 2, end: 5 }],
    };
    state.working.shipments[0].deadline = 12; // a user edit that must survive
    persistState(state);
    const reloaded = loadPersisted(); // what App reads on mount after reload
    expect(reloaded).toEqual(state);
    expect(isValidPersistedState(reloaded)).toBe(true);
    expect(reloaded.working.shipments[0].deadline).toBe(12);
  });
  it('handles corrupted stored data gracefully', () => {
    store.set('railDispatch.v1', '{broken');
    expect(loadPersisted()).toBeNull();
  });
});
