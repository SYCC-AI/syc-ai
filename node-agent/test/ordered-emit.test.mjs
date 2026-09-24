// Events of one process must reach the panel in the order they happened: the
// exit must never overtake the output (found on Windows 2026-09-24, where
// "codex --version" answered 0 with its output lost and the panel showed
// "device not answering").
import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderedEmitter } from '../syc-node.mjs';

test('one process: every event is delivered after the one before it', async () => {
  const delivered = [];
  // The first send is the slowest, as a stdout POST can be.
  const delays = { stdout: 40, exit: 1 };
  const emit = createOrderedEmitter(async (event) => {
    await new Promise((r) => setTimeout(r, delays[event.type] ?? 5));
    delivered.push(`${event.procId}:${event.type}`);
  });
  emit({ procId: 'a', type: 'spawned' });
  emit({ procId: 'a', type: 'stdout', data: 'codex-cli 0.156.1' });
  await emit({ procId: 'a', type: 'exit', code: 0 });
  assert.deepEqual(delivered, ['a:spawned', 'a:stdout', 'a:exit']);
});

test('different processes do not wait for each other, and a failed send does not block the rest', async () => {
  const delivered = [];
  const emit = createOrderedEmitter(async (event) => {
    if (event.type === 'boom') throw new Error('network');
    await new Promise((r) => setTimeout(r, event.procId === 'slow' ? 50 : 1));
    delivered.push(`${event.procId}:${event.type}`);
  });
  const slow = emit({ procId: 'slow', type: 'stdout' });
  emit({ procId: 'fast', type: 'boom' });
  await emit({ procId: 'fast', type: 'exit' });
  assert.deepEqual(delivered, ['fast:exit']);
  await slow;
  assert.deepEqual(delivered, ['fast:exit', 'slow:stdout']);
});

test('output that waits behind a slow send is merged into one event, in order', async () => {
  const delivered = [];
  const emit = createOrderedEmitter(async (event) => {
    await new Promise((r) => setTimeout(r, event.type === 'spawned' ? 30 : 1));
    delivered.push([event.type, event.data ?? '']);
  });
  emit({ procId: 'p', type: 'spawned' });
  emit({ procId: 'p', type: 'stdout', data: 'a' });
  emit({ procId: 'p', type: 'stdout', data: 'b' });
  emit({ procId: 'p', type: 'stderr', data: 'x' });
  await emit({ procId: 'p', type: 'exit' });
  assert.deepEqual(delivered, [['spawned', ''], ['stdout', 'ab'], ['stderr', 'x'], ['exit', '']]);
});
