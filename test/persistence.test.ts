import { test } from 'node:test';
import assert from 'node:assert/strict';

// Node's built-in localStorage is inert without a backing file, so install a
// small in-memory shim before loading the persistence module.
const mem = new Map<string, string>();
const shim = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true, writable: true });

const { saveGame, loadGame, clearGame } = await import('../src/state/persistence.ts');

function rec(over: Record<string, unknown> = {}) {
  const state = { submitted: false, elapsed: 5, ceoReplyTimes: [], logFeed: [], terminal: [], fileContents: {}, ...over };
  return { v: 1, scenarioId: 'payment-outage', playerName: 'Tester', state } as never;
}

test('a save round-trips through storage', () => {
  saveGame(rec());
  const loaded = loadGame();
  assert.equal(loaded?.scenarioId, 'payment-outage');
  assert.equal(loaded?.playerName, 'Tester');
  assert.equal(loaded?.state.elapsed, 5);
});

test('a submitted run is not offered for resume', () => {
  saveGame(rec({ submitted: true }));
  assert.equal(loadGame(), null);
});

test('clear removes the save', () => {
  saveGame(rec());
  assert.ok(loadGame() !== null);
  clearGame();
  assert.equal(loadGame(), null);
});
