import { describe, it, expect, beforeEach } from 'vitest';
import { persistState, loadPersisted, clearPersisted } from '../schema.js';

// Minimal localStorage stub for the node test environment.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

describe('persistence (spec §7/§8)', () => {
  beforeEach(() => store.clear());
  it('changes persist correctly after application reload', () => {
    const state = { scenario: { name: 'Edited', terminals: [{ id: 'A' }], connections: [], shipments: [{ id: 'S1' }] }, disruptions: [{ id: 'D1', type: 'closure' }] };
    persistState(state);
    // Simulate reload: read back fresh.
    expect(loadPersisted()).toEqual(state);
    clearPersisted();
    expect(loadPersisted()).toBeNull();
  });
  it('handles corrupted stored data gracefully', () => {
    store.set('railDispatch.v1', '{broken');
    expect(loadPersisted()).toBeNull();
  });
});
